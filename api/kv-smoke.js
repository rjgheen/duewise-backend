// api/kv-smoke.js
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const body = req.body || (await readJson(req));
      const key = String(body.key || 'dw:test');
      const value = body.value ?? `v-${Date.now()}`;
      const ttl = Number(body.ttl || 60);
      await kv.set(key, value, { ex: ttl });
      return res.status(200).json({ ok: true, set: { key, value, ttl } });
    }
    const key = String(req.query.key || 'dw:test');
    const value = await kv.get(key);
    return res.status(200).json({ ok: true, value });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}
