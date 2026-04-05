import { getStore } from '@netlify/blobs';

const ADMIN_PIN  = process.env.ADMIN_PIN  || '2826';
const MASTER_PIN = process.env.MASTER_PIN || '0614';

export default async function handler(req) {
  const store = getStore('board-lock');
  const method = req.method;

  // GET — fetch current lock state (anyone can read)
  if (method === 'GET') {
    try {
      const data = await store.get('lock', { type: 'json' });
      return Response.json(data || { locked: false });
    } catch {
      return Response.json({ locked: false });
    }
  }

  // POST — set or clear lock (PIN required)
  if (method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

    const { pin, action, sport, date, gameId, label } = body;

    if (pin !== ADMIN_PIN && pin !== MASTER_PIN) {
      return Response.json({ error: 'Wrong PIN' }, { status: 401 });
    }

    if (action === 'unlock') {
      await store.set('lock', JSON.stringify({ locked: false }));
      return Response.json({ ok: true, locked: false });
    }

    // Lock
    const lockData = { locked: true, sport, date, gameId, label, lockedAt: Date.now() };
    await store.set('lock', JSON.stringify(lockData));
    return Response.json({ ok: true, ...lockData });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}

export const config = { path: '/api/board-lock' };
