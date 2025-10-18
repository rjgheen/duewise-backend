// lib/util.js
export function newJobId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const rand = Math.floor(Math.random() * 900) + 100;
  return `DW-${ymd}-${rand}`;
}

export function safeCompany(name) {
  return String(name || '')
    .replace(/[\/\\:*?"<>|]/g, '')
    .trim() || 'Client';
}

export function nowIso() {
  return new Date().toISOString();
}
