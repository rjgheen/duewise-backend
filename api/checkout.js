// api/checkout.js
import Stripe from 'stripe';
import { asStripeLineItems } from '../lib/pricing.js';
const stripe = new Stripe(process.env.STRIPE_SECRET, { apiVersion: '2024-06-20' });

import { upsertWixOrder } from '../lib/wix.js';
import { nowIso } from '../lib/util.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
    const body = req.body || (await readJson(req));
    const {
      planKey, totalPages, years,
      addonLegal: addonLegalOn, addonModel: addonModelOn,
      customerName, customerEmail, customerCompany, dealContext
    } = body || {};

    if (!planKey) return res.status(400).json({ ok: false, error: 'planKey required' });

    const pages = Number(totalPages || 0);
    const yrs = Math.max(1, Number(years || 1));

    const { items, quote } = asStripeLineItems({
      planKey, pages, years: yrs, addonLegalOn, addonModelOn
    });

    const success_url = process.env.SUCCESS_URL || 'https://duewiseai.com/success';
    const cancel_url  = process.env.CANCEL_URL  || 'https://duewiseai.com/cancel';

    const metadata = {
      planKey,
      planLabel: quote.planLabel,
      totalPages: String(pages),
      years: String(yrs),
      addons: quote.addonsList.join(', '),
      customerName: customerName || '',
      customerEmail: customerEmail || '',
      customerCompany: customerCompany || '',
      dealContext: dealContext || ''
    };

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: items,
      success_url,
      cancel_url,
      metadata,
      allow_promotion_codes: true,
      customer_email: customerEmail || undefined
    });

    // OPTIONAL: create draft order in Wix (status=created)
    const now = nowIso();
    const draft = {
      stripeSessionId: session.id,
      sessionId: session.id,
      uploadUrl: '',
      jobId: '',

      planLabel: quote.planLabel,
      planKey,
      totalPages: pages,
      years: yrs,
      addons: metadata.addons,
      total: (session.amount_total ?? quote.totalCents) / 100,

      status: 'created',
      customerName: customerName || '',
      customerEmail: (customerEmail || session.customer_email || ''),
      customerCompany: customerCompany || '',
      createdAt: now,
      updatedAt: now
    };
    try { await upsertWixOrder(draft); } catch(e){ /* don’t block checkout on Wix write */ }

    return res.status(201).json({
      ok: true,
      url: session.url,
      sessionId: session.id
    });
  } catch (e) {
    console.error('[checkout] error', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}

async function readJson(req) {
  const chunks = []; for await (const c of req) chunks.push(Buffer.isBuffer(c)?c:Buffer.from(c));
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}
