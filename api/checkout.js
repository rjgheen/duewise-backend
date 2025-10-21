// api/checkout.js
import Stripe from 'stripe';
import { calcPrice, lineItemsUSD } from '../lib/pricing.js';
import { upsertOrder } from '../lib/wix.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
    const body = req.body || (await readJson(req));
    const {
      planKey, totalPages, years, addonLegal, addonModel,
      customerName, customerEmail, customerCompany, dealContext
    } = body || {};

    const calc = calcPrice({ planKey, totalPages, years, addonLegal, addonModel });

    const stripe = new Stripe(process.env.STRIPE_SECRET, { apiVersion: '2024-06-20' });
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      success_url: process.env.SUCCESS_URL || 'https://duewiseai.com/success',
      cancel_url: process.env.CANCEL_URL || 'https://duewiseai.com/cancel',
      line_items: lineItemsUSD(calc),
      metadata: {
        planKey: calc.planKey,
        planLabel: calc.planLabel,
        totalPages: String(calc.totalPages),
        years: String(calc.years),
        addons: calc.addons.join(', '),
        customerName: customerName || '',
        customerEmail: customerEmail || '',
        customerCompany: customerCompany || '',
        dealContext: dealContext || ''
      },
      customer_email: customerEmail || undefined
    });

    // upsert draft in Wix (status=created)
    await upsertOrder({
      stripeSessionId: session.id,
      sessionId: session.id,
      planKey: calc.planKey,
      planLabel: calc.planLabel,
      totalPages: calc.totalPages,
      years: calc.years,
      addons: calc.addons.join(', '),
      total: calc.total,
      status: 'created',
      customerName: customerName || '',
      customerEmail: customerEmail || '',
      customerCompany: customerCompany || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return res.status(201).json({ ok: true, url: session.url, sessionId: session.id });
  } catch (e) {
    console.error('[checkout]', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}
