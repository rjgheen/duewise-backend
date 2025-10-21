// lib/wix.js
export async function upsertOrder(record) {
  const endpoint = process.env.WIX_ORDERS_ENDPOINT; // e.g., https://duewiseai.com/_functions/upsertOrder
  const secret = process.env.WIX_SHARED_SECRET;
  if (!endpoint || !secret) return { ok: false, skipped: true };

  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-shared-secret': secret },
    body: JSON.stringify({ record })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) {
    return { ok: false, status: r.status, error: j.error || 'wix upsert failed' };
  }
  return { ok: true, id: j.id };
}
