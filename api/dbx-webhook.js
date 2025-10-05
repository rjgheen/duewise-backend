export default async function handler(req, res) {
  // Dropbox verification: GET with ?challenge=...
  if (req.method === 'GET') {
    const { challenge = '' } = req.query || {};
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(String(challenge));
    return;
  }
  // We can add HMAC verification later if you want. For now, ack.
  if (req.method === 'POST') {
    res.status(200).json({ received: true });
    return;
  }
  res.status(405).json({ ok:false, error:'Method Not Allowed' });
}
