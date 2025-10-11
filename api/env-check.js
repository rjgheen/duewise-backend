export default function handler(_req, res) {
  const keys = [
    'STRIPE_SECRET',
    'STRIPE_WEBHOOK_SECRET',
    'DROPBOX_CLIENT_ID',
    'DROPBOX_CLIENT_SECRET',
    'DROPBOX_REFRESH_TOKEN',
    'CHECKOUT_LINK_TOKEN',
    'ALLOW_TEST_AUTOGEN',
  ];
  res.status(200).json(Object.fromEntries(keys.map(k => [k, !!process.env[k]])));
}
