// lib/wix.js
export async function upsertWixOrder(doc) {
  const { WIX_ORDERS_ENDPOINT, WIX_SHARED_SECRET } = process.env;
  if (!WIX_ORDERS_ENDPOINT) return { ok: false, skipped: true };

  const resp = await fetch(WIX_ORDERS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-shared-secret': WIX_SHARED_SECRET || '' },
    body: JSON.stringify({ record: doc })
  });
  const j = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`wix ${resp.status}: ${JSON.stringify(j)}`);
  return j;
}
