// lib/email.js
import { OAuth2Client } from 'google-auth-library';
import { assertEnv, base64Url } from './util.js';

async function gmailAccessToken() {
  assertEnv(['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN']);
  const o = new OAuth2Client(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );
  o.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  const { token } = await o.getAccessToken();
  if (!token) throw new Error('Gmail access token failed');
  return token;
}

function buildRaw({ from, to, subject, text, html, replyTo }) {
  const lines = [];
  lines.push(`From: ${from}`);
  lines.push(`To: ${Array.isArray(to) ? to.join(', ') : to}`);
  if (replyTo) lines.push(`Reply-To: ${replyTo}`);
  lines.push('MIME-Version: 1.0');
  lines.push('Content-Type: text/html; charset="UTF-8"');
  lines.push(`Subject: ${subject}`);
  lines.push('');
  lines.push(html || `<pre>${text || ''}</pre>`);
  return base64Url(lines.join('\r\n'));
}

export async function sendMail({ to, subject, text, html }) {
  const sender = process.env.GMAIL_SENDER || 'no-reply@duewiseai.com';
  const token = await gmailAccessToken();
  const raw = buildRaw({ from: `DueWise <${sender}>`, to, subject, text, html });

  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`gmail send ${r.status}: ${JSON.stringify(j)}`);
  return j;
}
