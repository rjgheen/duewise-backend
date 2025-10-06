export const config = { api: { bodyParser: false } };

async function read(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(Buffer.isBuffer(c)?c:Buffer.from(c));
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(raw); } catch { return { raw }; }
}

export default async function handler(req, res) {
  const body = await read(req);
  res.status(200).json({
    method: req.method,
    contentType: req.headers['content-type'] || null,
    body
  });
}
