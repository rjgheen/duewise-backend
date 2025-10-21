// lib/util.js
export function assertEnv(keys = []) {
  const miss = keys.filter(k => !process.env[k]);
  if (miss.length) throw new Error(`Missing env: ${miss.join(', ')}`);
}

export function safeCompany(name) {
  return String(name || 'Client').replace(/[\/\\:*?"<>|]/g, '').trim() || 'Client';
}

export function base64Url(str) {
  return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function todayYMD() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

export async function readRawBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}

export function moneyCents(n) {
  return Math.round(Number(n || 0) * 100);
}
