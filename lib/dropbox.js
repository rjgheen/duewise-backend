// lib/dropbox.js
import { safeCompany } from './util.js';

async function dropboxAccessToken() {
  const { DROPBOX_REFRESH_TOKEN, DROPBOX_CLIENT_ID, DROPBOX_CLIENT_SECRET } = process.env;
  if (!DROPBOX_REFRESH_TOKEN || !DROPBOX_CLIENT_ID || !DROPBOX_CLIENT_SECRET) {
    throw new Error('Dropbox env missing');
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: DROPBOX_REFRESH_TOKEN,
    client_id: DROPBOX_CLIENT_ID,
    client_secret: DROPBOX_CLIENT_SECRET
  });
  const r = await fetch('https://api.dropbox.com/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(`dropbox token ${r.status}: ${JSON.stringify(j)}`);
  return j.access_token;
}

async function dbxPost(path, token, json) {
  const r = await fetch(`https://api.dropboxapi.com/2${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(json)
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`dropbox ${path} ${r.status}: ${JSON.stringify(j)}`);
  return j;
}

async function ensureFolder(path, token) {
  try {
    await dbxPost('/files/create_folder_v2', token, { path: path.startsWith('/') ? path : `/${path}`, autorename: false });
  } catch (e) {
    if (!String(e.message || '').includes('path/conflict')) throw e;
  }
}

export async function createDropboxIntake({ company, jobId }) {
  const tok = await dropboxAccessToken();
  const base = `/Clients/${safeCompany(company)}/${jobId}`;
  await ensureFolder(base, tok);
  await ensureFolder(`${base}/intake`, tok);
  await ensureFolder(`${base}/working`, tok);
  await ensureFolder(`${base}/output`, tok);
  await ensureFolder(`${base}/logs`, tok);
  const fr = await dbxPost('/file_requests/create', tok, {
    title: `DueWise Upload — ${jobId}`,
    destination: `${base}/intake`,
    open: true,
    description: `Please upload your documents for Job ${jobId}.`
  });
  if (!fr?.url) throw new Error('no dropbox uploadUrl');
  return { uploadUrl: fr.url, baseFolder: base };
}
