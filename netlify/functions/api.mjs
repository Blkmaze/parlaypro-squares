// ParlayPro Squares API - pure ASCII
const SITE_ID   = "658f40e1-9d0f-4072-80a5-d6d0eb35d77e";
const STORE     = "sq3";
const ADMIN_PIN  = process.env.ADMIN_PIN  || "2826";
const MASTER_PIN = process.env.MASTER_PIN || "0614";

function validPin(p) { return p === ADMIN_PIN || p === MASTER_PIN; }

function json(data, status) {
  status = status || 200;
  return new Response(JSON.stringify(data), {
    status: status,
    headers: { "Content-Type": "application/json" }
  });
}

async function blobGet(token, key) {
  var r = await fetch(
    "https://api.netlify.com/api/v1/blobs/" + SITE_ID + "/" + STORE + "/" + encodeURIComponent(key),
    { headers: { Authorization: "Bearer " + token } }
  );
  if (r.status === 404) return null;
  if (!r.ok) return null;
  return r.json();
}

async function blobSet(token, key, value) {
  var r = await fetch(
    "https://api.netlify.com/api/v1/blobs/" + SITE_ID + "/" + STORE + "/" + encodeURIComponent(key),
    {
      method: "PUT",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(value)
    }
  );
  if (!r.ok) throw new Error("Blob write failed: " + r.status);
}

export default async function handler(req, context) {
  var url    = new URL(req.url);
  var path   = url.pathname;
  var method = req.method.toUpperCase();
  var body   = {};
  if (method === "POST") { try { body = await req.json(); } catch(e) {} }

  var token = process.env.NETLIFY_TOKEN;
  var empty = { owners: {}, pending: {}, rowNums: null, colNums: null, numbersLocked: false };

  // GET /api/squares
  if (path === "/api/squares" && method === "GET") {
    var gameId = url.searchParams.get("gameId");
    if (!gameId) return json({ error: "Missing gameId" }, 400);
    if (!token)  return json(empty);
    try {
      var data = await blobGet(token, gameId) || empty;
      return json(data);
    } catch(e) { return json({ owners: {}, pending: {}, error: e.message }); }
  }

  // POST /api/auto-assign
  if (path === "/api/auto-assign" && method === "POST") {
    if (!token) return json({ error: "Missing NETLIFY_TOKEN" }, 500);
    var gameId = body.gameId, qty = body.qty, initials = body.initials;
    var isPending = body.pending, payMethod = body.payMethod, amount = body.amount;
    if (!gameId || !qty || !initials) return json({ error: "Missing fields" }, 400);
    var upper = initials.toUpperCase().slice(0, 4);
    if (upper.length < 2) return json({ error: "Need 2+ initials" }, 400);
    try {
      var data    = await blobGet(token, gameId) || empty;
      var owners  = data.owners  || {};
      var pending = data.pending || {};
      var open = [];
      for (var i = 0; i < 100; i++) {
        if (owners[i] === undefined && pending[i] === undefined) open.push(i);
      }
      if (!open.length) return json({ error: "No open squares" }, 409);
      for (var i = open.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = open[i]; open[i] = open[j]; open[j] = tmp;
      }
      var assigned = open.slice(0, Math.min(qty, open.length));
      if (isPending) {
        assigned.forEach(function(idx) {
          pending[idx] = { initials: upper, payMethod: payMethod || "unknown", amount: amount || "?" };
        });
        data.pending = pending;
      } else {
        assigned.forEach(function(idx) { owners[idx] = upper; });
        data.owners = owners;
      }
      await blobSet(token, gameId, data);
      return json({ ok: true, indices: assigned, initials: upper });
    } catch(e) { return json({ error: e.message }, 500); }
  }

  // POST /api/claim-square
  if (path === "/api/claim-square" && method === "POST") {
    if (!token) return json({ error: "Missing NETLIFY_TOKEN" }, 500);
    var gameId = body.gameId, indices = body.indices, initials = body.initials;
    var isPending = body.pending, payMethod = body.payMethod, amount = body.amount;
    if (!gameId || !Array.isArray(indices) || !initials) return json({ error: "Missing fields" }, 400);
    var upper = initials.toUpperCase().slice(0, 4);
    try {
      var data    = await blobGet(token, gameId) || empty;
      var owners  = data.owners  || {};
      var pending = data.pending || {};
      var conflicts = indices.filter(function(i) { return owners[i] !== undefined || pending[i] !== undefined; });
      if (conflicts.length) return json({ error: "Already taken: " + conflicts.join(", ") }, 409);
      if (isPending) {
        indices.forEach(function(i) {
          pending[i] = { initials: upper, payMethod: payMethod || "unknown", amount: amount || "?" };
        });
        data.pending = pending;
      } else {
        indices.forEach(function(i) { owners[i] = upper; });
        data.owners = owners;
      }
      await blobSet(token, gameId, data);
      return json({ ok: true, claimed: indices, initials: upper });
    } catch(e) { return json({ error: e.message }, 500); }
  }

  // POST /api/init-numbers
  if (path === "/api/init-numbers" && method === "POST") {
    if (!token) return json({ error: "Missing NETLIFY_TOKEN" }, 500);
    var gameId = body.gameId, rowNums = body.rowNums, colNums = body.colNums;
    if (!gameId || !Array.isArray(rowNums) || !Array.isArray(colNums)) return json({ error: "Missing fields" }, 400);
    try {
      var data = await blobGet(token, gameId) || empty;
      if (!data.rowNums) {
        data.rowNums = rowNums; data.colNums = colNums;
        await blobSet(token, gameId, data);
        return json({ ok: true, stored: true, rowNums: rowNums, colNums: colNums });
      }
      return json({ ok: true, stored: false, rowNums: data.rowNums, colNums: data.colNums });
    } catch(e) { return json({ error: e.message }, 500); }
  }

  // POST /api/lock-numbers
  if (path === "/api/lock-numbers" && method === "POST") {
    if (!token) return json({ error: "Missing NETLIFY_TOKEN" }, 500);
    var gameId = body.gameId, pin = body.pin, rowNums = body.rowNums, colNums = body.colNums;
    if (!gameId || !pin) return json({ error: "Missing fields" }, 400);
    if (!validPin(pin)) return json({ error: "Invalid PIN" }, 403);
    try {
      var data = await blobGet(token, gameId) || empty;
      data.rowNums = rowNums; data.colNums = colNums; data.numbersLocked = true;
      await blobSet(token, gameId, data);
      return json({ ok: true });
    } catch(e) { return json({ error: e.message }, 500); }
  }

  // POST /api/reset-squares
  if (path === "/api/reset-squares" && method === "POST") {
    if (!token) return json({ error: "Missing NETLIFY_TOKEN" }, 500);
    var gameId = body.gameId, pin = body.pin;
    if (!gameId || !pin) return json({ error: "Missing fields" }, 400);
    if (!validPin(pin)) return json({ error: "Invalid PIN" }, 403);
    try {
      // resetAt timestamp lets all polling devices detect the reset immediately
      var resetBoard = { owners: {}, pending: {}, rowNums: null, colNums: null, numbersLocked: false, resetAt: Date.now() };
      await blobSet(token, gameId, resetBoard);
      return json({ ok: true });
    } catch(e) { return json({ error: e.message }, 500); }
  }

  // POST /api/confirm-pending
  if (path === "/api/confirm-pending" && method === "POST") {
    if (!token) return json({ error: "Missing NETLIFY_TOKEN" }, 500);
    var gameId = body.gameId, indices = body.indices;
    if (!gameId) return json({ error: "Missing gameId" }, 400);
    try {
      var data    = await blobGet(token, gameId) || empty;
      var owners  = data.owners  || {};
      var pending = data.pending || {};
      var confirmed = [];
      var toConfirm = indices || Object.keys(pending).map(Number);
      toConfirm.forEach(function(i) {
        var p = pending[i];
        if (p) { owners[i] = p.initials; delete pending[i]; confirmed.push(i); }
      });
      data.owners = owners; data.pending = pending;
      await blobSet(token, gameId, data);
      return json({ ok: true, confirmed: confirmed });
    } catch(e) { return json({ error: e.message }, 500); }
  }

  // POST /api/reject-pending
  if (path === "/api/reject-pending" && method === "POST") {
    if (!token) return json({ error: "Missing NETLIFY_TOKEN" }, 500);
    var gameId = body.gameId, indices = body.indices, pin = body.pin;
    if (!gameId || !pin) return json({ error: "Missing fields" }, 400);
    if (!validPin(pin)) return json({ error: "Invalid PIN" }, 403);
    try {
      var data    = await blobGet(token, gameId) || empty;
      var pending = data.pending || {};
      var toReject = indices || Object.keys(pending).map(Number);
      toReject.forEach(function(i) { delete pending[i]; });
      data.pending = pending;
      await blobSet(token, gameId, data);
      return json({ ok: true });
    } catch(e) { return json({ error: e.message }, 500); }
  }

  // GET /api/scores
  if (path === "/api/scores" && method === "GET") {
    var SPORTS = {
      ncaam: "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard",
      ncaaw: "https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/scoreboard",
      nba:   "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard",
      wnba:  "https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard",
      nhl:   "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard",
      mlb:   "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard",
      nfl:   "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",
      mls:   "https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/scoreboard"
    };
    var sport  = url.searchParams.get("sport") || "ncaam";
    var date   = url.searchParams.get("date")  || "";
    var base   = SPORTS[sport] || SPORTS.ncaam;
    var espnUrl = date ? base + "?dates=" + date : base;
    try {
      var res  = await fetch(espnUrl);
      var edata = await res.json();
      var games = (edata.events || []).map(function(e) {
        var c    = e.competitions && e.competitions[0];
        var home = c && c.competitors && c.competitors.find(function(t) { return t.homeAway === "home"; });
        var away = c && c.competitors && c.competitors.find(function(t) { return t.homeAway === "away"; });
        var s    = c && c.status && c.status.type;
        var odds = c && c.odds && c.odds[0];
        return {
          id:        e.id,
          name:      e.name,
          home:      home && home.team && home.team.abbreviation || "",
          homeFull:  home && home.team && home.team.displayName  || "",
          homeLogo:  home && home.team && home.team.logo         || "",
          homeScore: home && home.score || "0",
          away:      away && away.team && away.team.abbreviation || "",
          awayFull:  away && away.team && away.team.displayName  || "",
          awayLogo:  away && away.team && away.team.logo         || "",
          awayScore: away && away.score || "0",
          status:    s && s.completed ? "FINAL" : s && s.inProgress ? "LIVE" : "SCHEDULED",
          clock:     c && c.status && c.status.displayClock || "",
          period:    c && c.status && c.status.period || 0,
          time:      e.date ? new Date(e.date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET" : "",
          date:      e.date ? new Date(e.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" }) : "",
          spread:    odds && odds.spread    || null,
          total:     odds && odds.overUnder || null,
          awayML:    odds && odds.awayTeamOdds && odds.awayTeamOdds.moneyLine || null,
          homeML:    odds && odds.homeTeamOdds && odds.homeTeamOdds.moneyLine || null,
          spreadFav: odds && odds.homeTeamOdds && odds.homeTeamOdds.favorite ? "home" : "away"
        };
      });
      return json({ sport: sport, games: games });
    } catch(e) { return json({ error: e.message }, 500); }
  }

  return json({ error: "No handler for " + method + " " + path }, 404);
}

export const config = {
  path: [
    "/api/scores", "/api/squares", "/api/claim-square", "/api/auto-assign",
    "/api/init-numbers", "/api/lock-numbers", "/api/reset-squares",
    "/api/confirm-pending", "/api/reject-pending"
  ]
};
