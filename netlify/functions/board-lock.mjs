import { getStore } from "@netlify/blobs";

const ADMIN_PIN  = process.env.ADMIN_PIN  || "2826";
const MASTER_PIN = process.env.MASTER_PIN || "0614";

export default async function handler(req, context) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers });
  }

  let store;
  try {
    store = getStore({ name: "board-lock", consistency: "strong" });
  } catch(e) {
    return new Response(JSON.stringify({ error: "Store init failed: " + e.message }), { status: 500, headers });
  }

  // GET — anyone can read lock state
  if (req.method === "GET") {
    try {
      const raw = await store.get("lock");
      if (!raw) return new Response(JSON.stringify({ locked: false }), { status: 200, headers });
      const data = JSON.parse(raw);
      return new Response(JSON.stringify(data || { locked: false }), { status: 200, headers });
    } catch(e) {
      return new Response(JSON.stringify({ locked: false }), { status: 200, headers });
    }
  }

  // POST — PIN required to lock or unlock
  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch(e) {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers });
    }

    const { pin, action, sport, date, gameId, label } = body || {};

    if (pin !== ADMIN_PIN && pin !== MASTER_PIN) {
      return new Response(JSON.stringify({ error: "Wrong PIN" }), { status: 401, headers });
    }

    try {
      if (action === "unlock") {
        await store.set("lock", JSON.stringify({ locked: false }));
        return new Response(JSON.stringify({ ok: true, locked: false }), { status: 200, headers });
      }

      // Lock
      const lockData = {
        locked: true,
        sport:  sport  || "NBA",
        date:   date   || "",
        gameId: gameId || "",
        label:  label  || "",
        lockedAt: Date.now()
      };
      await store.set("lock", JSON.stringify(lockData));
      return new Response(JSON.stringify({ ok: true, ...lockData }), { status: 200, headers });

    } catch(e) {
      return new Response(JSON.stringify({ error: e.message || "Store write failed" }), { status: 500, headers });
    }
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
}

export const config = { path: "/api/board-lock" };
