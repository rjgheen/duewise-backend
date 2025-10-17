import { OAuth2Client } from 'google-auth-library';

function b64url(str) {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function buildMime({ from, to, subject, text, html }) {
  const headers = [
    `From: DueWise <${from}>`,
    `To: ${to}`,
    `Subject: ${subject || 'DueWise Mailer Test'}`,
    'MIME-Version: 1.0'
  ];
  if (html) {
    headers.push('Content-Type: text/html; charset=UTF-8', '', html);
  } else {
    headers.push('Content-Type: text/plain; charset=UTF-8', '', text || 'Hello from DueWise mailer.');
  }
  return headers.join('\r\n');
}

async function getAccessToken() {
  const client = new OAuth2Client(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );
  client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('Failed to obtain Gmail access token');
  return token;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });

    let body = {};
    for await (const c of req) body = { ...body, ...(c ? JSON.parse(c) : {}) };

    const to = body.to || process.env.GMAIL_SENDER;
    const subject = body.subject || 'Mailer OK';
    const text = body.text || 'Sent by no-reply@duewiseai.com via Gmail API';
    const html = body.html;

    const mime = buildMime({
      from: process.env.GMAIL_SENDER,
      to,
      subject,
      text,
      html
    });

    const accessToken = await getAccessToken();
    const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw: b64url(mime) })
    });

    const data = await resp.json();
    if (!resp.ok) {
      return res.status(resp.status).json({ ok: false, error: data.error?.message || 'gmail-send-failed', details: data });
    }
    res.status(200).json({ ok: true, id: data.id });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
