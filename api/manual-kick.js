// api/manual-kick.js
export default async function handler(req, res) {
  const admin = req.query.token || '';
  if (process.env.ADMIN_TOKEN && admin !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }
  const url = new URL(`${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/cron-intake`);
  if (process.env.CRON_TOKEN) url.searchParams.set('token', process.env.CRON_TOKEN);
  const r = await fetch(url.toString());
  const j = await r.json().catch(() => ({}));
  return res.status(r.status).json(j);
}
