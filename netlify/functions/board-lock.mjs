// board-lock.mjs — stores lock state via Netlify API env vars
// Reads BOARD_LOCK_STATE env var, writes it via Netlify API
// This works on ALL Netlify plans

const ADMIN_PIN    = process.env.ADMIN_PIN    || "2826";
const MASTER_PIN   = process.env.MASTER_PIN   || "0614";
const NETLIFY_TOKEN = process.env.NETLIFY_TOKEN || "";
const SITE_ID      = process.env.SITE_ID      || "";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response("", { status: 204, headers });

  if (req.method === "GET") {
    // Read from env var (set at deploy time)
    const raw = process.env.BOARD_LOCK_STATE;
    try {
      const data = raw ? JSON.parse(raw) : { locked: false };
      return new Response(JSON.stringify(data), { status: 200, headers });
    } catch {
      return new Response(JSON.stringify({ locked: false }), { status: 200, headers });
    }
  }

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers }); }

    const { pin, action, sport, date, gameId, label } = body || {};

    if (pin !== ADMIN_PIN && pin !== MASTER_PIN) {
      return new Response(JSON.stringify({ error: "Wrong PIN" }), { status: 401, headers });
    }

    const lockData = action === "unlock"
      ? { locked: false }
      : { locked: true, sport, date, gameId, label, lockedAt: Date.now() };

    // Update env var via Netlify API
    try {
      const res = await fetch(
        `https://api.netlify.com/api/v1/sites/${SITE_ID}/env/BOARD_LOCK_STATE`,
        {
          method: "PUT",
          headers: { "Authorization": `Bearer ${NETLIFY_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ value: JSON.stringify(lockData) })
        }
      );
      if (!res.ok) {
        const err = await res.text();
        return new Response(JSON.stringify({ error: "Netlify API error: " + err }), { status: 500, headers });
      }
      return new Response(JSON.stringify({ ok: true, ...lockData }), { status: 200, headers });
    } catch(e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
    }
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
}

export const config = { path: "/api/board-lock" };
