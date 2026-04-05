// board-lock.mjs v3 — uses Netlify API to store lock in env var
// Correct API endpoint: PATCH /api/v1/accounts/{account_id}/env/{key}

const ADMIN_PIN     = process.env.ADMIN_PIN     || "2826";
const MASTER_PIN    = process.env.MASTER_PIN    || "0614";
const NETLIFY_TOKEN = process.env.NETLIFY_TOKEN || "";
const SITE_ID       = process.env.SITE_ID       || "";
const ACCOUNT_ID    = "65a6a5817e858d0760c7753b"; // your team ID

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

async function writeLockState(data) {
  const value = JSON.stringify(data);
  // Use site-level env var API
  const url = `https://api.netlify.com/api/v1/sites/${SITE_ID}/env`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${NETLIFY_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      key: "BOARD_LOCK_STATE",
      scopes: ["functions", "runtime"],
      values: [{ value, context: "all" }]
    })
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Netlify API ${res.status}: ${txt}`);
  }
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response("", { status: 204, headers });

  if (req.method === "GET") {
    const raw = process.env.BOARD_LOCK_STATE;
    try {
      return new Response(raw || '{"locked":false}', { status: 200, headers });
    } catch {
      return new Response('{"locked":false}', { status: 200, headers });
    }
  }

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers });
    }

    const { pin, action, sport, date, gameId, label } = body || {};

    if (pin !== ADMIN_PIN && pin !== MASTER_PIN) {
      return new Response(JSON.stringify({ error: "Wrong PIN" }), { status: 401, headers });
    }

    const lockData = action === "unlock"
      ? { locked: false }
      : { locked: true, sport, date, gameId, label, lockedAt: Date.now() };

    try {
      await writeLockState(lockData);
      return new Response(JSON.stringify({ ok: true, ...lockData }), { status: 200, headers });
    } catch(e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
    }
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
}

export const config = { path: "/api/board-lock" };
