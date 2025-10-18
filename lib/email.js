// lib/email.js
import { OAuth2Client } from 'google-auth-library';

function b64url(str) {
  return Buffer.from(str, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'');
}

async function gmailAccessToken() {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
    throw new Error('Gmail env missing');
  }
  const c = new OAuth2Client(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET);
  c.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
  const { token } = await c.getAccessToken();
  if (!token) throw new Error('gmail access token missing');
  return token;
}

export async function sendMail({ to, subject, html, text, fromName }) {
  const from = process.env.GMAIL_SENDER || 'no-reply@duewiseai.com';
  const brand = fromName || process.env.BRAND_NAME || 'DueWise';

  const lines = [
    `From: ${brand} <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: ${html ? 'text/html' : 'text/plain'}; charset=UTF-8`,
    '',
    html || text || ''
  ];
  const raw = b64url(lines.join('\r\n'));
  const access = await gmailAccessToken();

  const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw })
  });
  const out = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`gmail ${resp.status}: ${JSON.stringify(out)}`);
  return out.id || null;
}
