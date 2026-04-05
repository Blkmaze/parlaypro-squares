// board-lock.mjs — uses EXACT same blob pattern as api.mjs
// Same SITE_ID, same STORE, same raw fetch approach — no imports
const SITE_ID    = "658f40e1-9d0f-4072-80a5-d6d0eb35d77e";
const STORE      = "sq3";
const LOCK_KEY   = "__board_lock__";
const ADMIN_PIN  = process.env.ADMIN_PIN  || "2826";
const MASTER_PIN = process.env.MASTER_PIN || "0614";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

async function blobGet(token, key) {
  var r = await fetch("https://api.netlify.com/api/v1/blobs/"+SITE_ID+"/"+STORE+"/"+encodeURIComponent(key), {headers:{Authorization:"Bearer "+token}});
  if(!r.ok) return null;
  var t = await r.text();
  try{return JSON.parse(t);}catch(e){return null;}
}

async function blobSet(token, key, value) {
  var r = await fetch("https://api.netlify.com/api/v1/blobs/"+SITE_ID+"/"+STORE+"/"+encodeURIComponent(key), {method:"PUT",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(value)});
  if(!r.ok) throw new Error("Blob write failed: "+r.status);
}

export default async function handler(req) {
  if(req.method === "OPTIONS") return new Response("", {status:204, headers});

  var token = process.env.NETLIFY_TOKEN;
  if(!token) return new Response(JSON.stringify({error:"No token"}), {status:500, headers});

  if(req.method === "GET") {
    try {
      var data = await blobGet(token, LOCK_KEY);
      return new Response(JSON.stringify(data || {locked:false}), {status:200, headers});
    } catch(e) {
      return new Response(JSON.stringify({locked:false}), {status:200, headers});
    }
  }

  if(req.method === "POST") {
    var body;
    try { body = await req.json(); } catch { return new Response(JSON.stringify({error:"Invalid JSON"}), {status:400, headers}); }

    var pin = typeof body.pin === "string" ? body.pin : "";
    if(pin !== ADMIN_PIN && pin !== MASTER_PIN) {
      return new Response(JSON.stringify({error:"Wrong PIN"}), {status:401, headers});
    }

    try {
      if(body.action === "unlock") {
        await blobSet(token, LOCK_KEY, {locked:false});
        return new Response(JSON.stringify({ok:true, locked:false}), {status:200, headers});
      }
      var ldata = {
        locked: true,
        sport:  String(body.sport  || "").slice(0,20),
        date:   String(body.date   || "").slice(0,10),
        gameId: String(body.gameId || "").slice(0,64),
        label:  String(body.label  || "").slice(0,80),
        lockedAt: Date.now()
      };
      await blobSet(token, LOCK_KEY, ldata);
      return new Response(JSON.stringify({ok:true, ...ldata}), {status:200, headers});
    } catch(e) {
      return new Response(JSON.stringify({error:e.message}), {status:500, headers});
    }
  }

  return new Response(JSON.stringify({error:"Method not allowed"}), {status:405, headers});
}

export const config = { path: "/api/board-lock" };
