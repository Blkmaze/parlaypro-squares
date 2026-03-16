// Zero imports - uses Netlify Blobs REST API with the token injected at runtime
const SITE_ID = "658f40e1-9d0f-4072-80a5-d6d0eb35d77e";
const STORE = "sq3";
const ADMIN_PIN = process.env.ADMIN_PIN || "1234";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

async function blobGet(token, key) {
  const r = await fetch(`https://api.netlify.com/api/v1/blobs/${SITE_ID}/${STORE}/${key}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (r.status === 404) return null;
  if (!r.ok) return null;
  return r.json();
}

async function blobSet(token, key, value) {
  const r = await fetch(`https://api.netlify.com/api/v1/blobs/${SITE_ID}/${STORE}/${key}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(value)
  });
  if (!r.ok) throw new Error(`Blob write failed: ${r.status}`);
}

// ── ROUTE HANDLER ─────────────────────────────────────────────
export default async (req, context) => {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method.toUpperCase();
  let body = {};
  if (method === "POST") { try { body = await req.json(); } catch {} }

  const token = process.env.NETLIFY_TOKEN;
  const emptyBoard = { owners: {}, rowNums: null, colNums: null, numbersLocked: false };

  // ── GET /api/squares ──────────────────────────────────────
  if (path === "/api/squares" && method === "GET") {
    const gameId = url.searchParams.get("gameId");
    if (!gameId) return json({ error: "Missing gameId" }, 400);
    if (!token) return json(emptyBoard);
    try {
      const data = await blobGet(token, gameId) || emptyBoard;
      return json(data);
    } catch (err) {
      return json({ owners: {}, error: err.message });
    }
  }

  // ── POST /api/claim-square ────────────────────────────────
  if (path === "/api/claim-square" && method === "POST") {
    if (!token) return json({ error: "Server not configured (missing NETLIFY_TOKEN)" }, 500);

    const { gameId, indices, initials } = body;
    if (!gameId || !Array.isArray(indices) || !initials) {
      return json({ error: "Missing gameId, indices, or initials" }, 400);
    }
    if (initials.length < 2 || initials.length > 6) {
      return json({ error: "Initials must be 2-6 characters" }, 400);
    }

    try {
      const data = await blobGet(token, gameId) || emptyBoard;
      const owners = data.owners || {};

      // Check for conflicts
      const conflicts = indices.filter(i => owners[i] !== undefined);
      if (conflicts.length > 0) {
        return json({ error: `Squares already taken: ${conflicts.join(", ")}` }, 409);
      }

      // Claim squares
      indices.forEach(i => { owners[i] = initials.toUpperCase(); });
      data.owners = owners;
      await blobSet(token, gameId, data);

      return json({ ok: true, claimed: indices, initials: initials.toUpperCase() });
    } catch (err) {
      return json({ error: err.message }, 500);
    }
  }

  // ── POST /api/lock-numbers ────────────────────────────────
  if (path === "/api/lock-numbers" && method === "POST") {
    if (!token) return json({ error: "Server not configured (missing NETLIFY_TOKEN)" }, 500);

    const { gameId, pin, rowNums, colNums } = body;
    if (!gameId || !pin || !rowNums || !colNums) {
      return json({ error: "Missing required fields" }, 400);
    }
    if (pin !== ADMIN_PIN) return json({ error: "Invalid PIN" }, 403);
    if (!Array.isArray(rowNums) || rowNums.length !== 10 || !Array.isArray(colNums) || colNums.length !== 10) {
      return json({ error: "rowNums and colNums must each be arrays of 10" }, 400);
    }

    try {
      const data = await blobGet(token, gameId) || emptyBoard;
      data.rowNums = rowNums;
      data.colNums = colNums;
      data.numbersLocked = true;
      await blobSet(token, gameId, data);
      return json({ ok: true });
    } catch (err) {
      return json({ error: err.message }, 500);
    }
  }

  // ── POST /api/reset-squares ───────────────────────────────
  if (path === "/api/reset-squares" && method === "POST") {
    if (!token) return json({ error: "Server not configured (missing NETLIFY_TOKEN)" }, 500);

    const { gameId, pin } = body;
    if (!gameId || !pin) return json({ error: "Missing gameId or pin" }, 400);
    if (pin !== ADMIN_PIN) return json({ error: "Invalid PIN" }, 403);

    try {
      await blobSet(token, gameId, emptyBoard);
      return json({ ok: true });
    } catch (err) {
      return json({ error: err.message }, 500);
    }
  }

  // ── GET /api/scores ────────────────────────────────────────
  if (method === "GET" && path === "/api/scores") {
    const SPORTS = {
      ncaam: "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard",
      ncaaw: "https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/scoreboard",
      nba: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard",
      wnba: "https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard",
      nhl: "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard",
      mlb: "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard",
      nfl: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",
      mls: "https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/scoreboard",
    };
    const sport = url.searchParams.get("sport") || "ncaam";
    const espnUrl = SPORTS[sport] || SPORTS.ncaam;
    try {
      const res = await fetch(espnUrl);
      const data = await res.json();
      const games = (data.events || []).map(e => {
        const c = e.competitions?.[0];
        const home = c?.competitors?.find(t => t.homeAway === "home");
        const away = c?.competitors?.find(t => t.homeAway === "away");
        const s = c?.status?.type;
        return {
          id: e.id, name: e.name,
          home: home?.team?.abbreviation, homeFull: home?.team?.displayName, homeLogo: home?.team?.logo, homeScore: home?.score || "0",
          away: away?.team?.abbreviation, awayFull: away?.team?.displayName, awayLogo: away?.team?.logo, awayScore: away?.score || "0",
          status: s?.completed ? "FINAL" : s?.inProgress ? "LIVE" : "SCHEDULED",
          clock: c?.status?.displayClock || "", period: c?.status?.period || 0,
          time: e.date ? new Date(e.date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET" : "",
          date: e.date ? new Date(e.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" }) : ""
        };
      });
      return json({ sport, games, today: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) });
    } catch (err) {
      return json({ error: err.message }, 500);
    }
  }
  // ── GET /api/props ─────────────────────────────────────────
  if (method === "GET" && path === "/api/props") {
    const gameId = url.searchParams.get("gameId");
    if (!gameId) return json({ error: "Missing gameId" }, 400);
    try {
      const home = await blobGet(token, `props:${gameId}:home`) || null;
      const away = await blobGet(token, `props:${gameId}:away`) || null;
      return json({ home, away });
    } catch (err) { return json({ error: err.message }, 500); }
  }

  // ── POST /api/props/setup ───────────────────────────────────
  if (method === "POST" && path === "/api/props/setup") {
    const { gameId, homePlayer, homeName, awayPlayer, awayName, price, pin } = body;
    if (!gameId || !pin) return json({ error: "Missing gameId or pin" }, 400);
    if (pin !== ADMIN_PIN) return json({ error: "Invalid PIN" }, 403);
    const ranges = ["0-9","10-19","20-29","30-39","40+"];
    const mkBoard = (id, name, team) => ({ id, name, team, price: price || 5, squares: ranges.map(r => ({ range: r, owner: null })) });
    try {
      await blobSet(token, `props:${gameId}:home`, mkBoard(homePlayer, homeName, "home"));
      await blobSet(token, `props:${gameId}:away`, mkBoard(awayPlayer, awayName, "away"));
      return json({ ok: true });
    } catch (err) { return json({ error: err.message }, 500); }
  }

  // ── POST /api/props/claim ───────────────────────────────────
  if (method === "POST" && path === "/api/props/claim") {
    const { gameId, side, rangeIdx, owner } = body;
    if (!gameId || side === undefined || rangeIdx === undefined || !owner) return json({ error: "Missing fields" }, 400);
    try {
      const data = await blobGet(token, `props:${gameId}:${side}`);
      if (!data) return json({ error: "Props board not found" }, 404);
      if (data.squares[rangeIdx].owner) return json({ error: "Already claimed" }, 409);
      data.squares[rangeIdx].owner = owner.toUpperCase().slice(0, 6);
      data.squares[rangeIdx].pending = body.pending === true;
      await blobSet(token, `props:${gameId}:${side}`, data);
      return json({ ok: true, squares: data.squares });
    } catch (err) { return json({ error: err.message }, 500); }
  }

  // ── POST /api/props/reset ───────────────────────────────────
  if (method === "POST" && path === "/api/props/reset", "/api/props/confirm") {
    const { gameId, side, pin } = body;
    if (!gameId || !pin) return json({ error: "Missing fields" }, 400);
    if (pin !== ADMIN_PIN) return json({ error: "Invalid PIN" }, 403);
    try {
      const data = await blobGet(token, `props:${gameId}:${side}`);
      if (!data) return json({ error: "Not found" }, 404);
      data.squares = data.squares.map(s => ({ ...s, owner: null }));
      await blobSet(token, `props:${gameId}:${side}`, data);
      return json({ ok: true });
    } catch (err) { return json({ error: err.message }, 500); }
  }
  // -- POST /api/props/confirm (admin confirms payment)
  if (method === "POST" && path === "/api/props/confirm") {
    const { gameId, side, rangeIdx, pin } = body;
    if (!gameId || !pin) return json({ error: "Missing fields" }, 400);
    if (pin !== ADMIN_PIN) return json({ error: "Invalid PIN" }, 403);
    try {
      const data = await blobGet(token, `props:${gameId}:${side}`);
      if (!data) return json({ error: "Board not found" }, 404);
      if (!data.squares[rangeIdx].owner) return json({ error: "Square not claimed" }, 400);
      data.squares[rangeIdx].pending = false;
      await blobSet(token, `props:${gameId}:${side}`, data);
      return json({ ok: true });
    } catch (err) { return json({ error: err.message }, 500); }
  }
  // ── 404 fallback ──────────────────────────────────────────
  return json({ error: `No handler for ${method} ${path}` }, 404);
};

export const config = {
  path: ["/api/scores", "/api/props", "/api/props/setup", "/api/props/claim", "/api/props/reset", "/api/props/confirm", "/api/squares", "/api/claim-square", "/api/lock-numbers", "/api/reset-squares"]
};






