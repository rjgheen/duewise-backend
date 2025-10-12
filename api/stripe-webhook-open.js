// TEMP ONLY — for debugging incoming webhook payloads
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  const chunks = [];
  for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  const raw = Buffer.concat(chunks).toString('utf8');

  console.log('[webhook-open] method:', req.method);
  console.log('[webhook-open] sig header present:', !!req.headers['stripe-signature']);
  console.log('[webhook-open] raw length:', raw.length);

  // You can uncomment for deeper debugging (may log PII, keep off in prod)
  // console.log('[webhook-open] headers:', req.headers);
  // console.log('[webhook-open] raw body:', raw);

  res.status(200).json({ ok: true });
}
