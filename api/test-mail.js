// api/test-mail.js
import { sendMail } from '../lib/email.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
    const body = req.body || (await readJson(req));
    const to = body.to;
    if (!to) return res.status(400).json({ ok: false, error: 'Missing to' });
    const subject = body.subject || 'DueWise test';
    const text = body.text || 'It works.';
    const html = body.html || `<p>${text}</p>`;
    const out = await sendMail({ to, subject, html, text });
    return res.status(200).json({ ok: true, id: out?.id || out?.threadId || 'sent' });
  } catch (e) {
    console.error('[test-mail]', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}
