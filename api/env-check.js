// api/env-check.js
export default function handler(_req, res) {
  const need = [
    'STRIPE_SECRET', 'STRIPE_WEBHOOK_SECRET',
    'DROPBOX_CLIENT_ID', 'DROPBOX_CLIENT_SECRET', 'DROPBOX_REFRESH_TOKEN',
    'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN',
    'GMAIL_SENDER',
    'KV_REST_API_URL', 'KV_REST_API_TOKEN'
  ];
  const out = {};
  for (const k of need) out[k] = !!process.env[k];
  out.SUCCESS_URL = !!process.env.SUCCESS_URL;
  out.CANCEL_URL = !!process.env.CANCEL_URL;
  out.OPS_EMAIL = !!process.env.OPS_EMAIL;
  out.WIX_ORDERS_ENDPOINT = !!process.env.WIX_ORDERS_ENDPOINT;
  out.WIX_SHARED_SECRET = !!process.env.WIX_SHARED_SECRET;
  out.CRON_TOKEN = !!process.env.CRON_TOKEN;
  out.ADMIN_TOKEN = !!process.env.ADMIN_TOKEN;
  res.status(200).json(out);
}
