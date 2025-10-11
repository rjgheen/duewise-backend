// api/checkout-link.js
import Stripe from 'stripe';

/** ---------- Pricing ---------- */
const PRICE = {
  essentials:     { base: 2500, included: 30, extraPer: 8 },
  assurance:      { base: 3000, included: 30, extraPer: 10 },
  comprehensive:  { base: 5000, included: 60, extraPer: 10 }
};

function planLabel(k) {
  return k === 'assurance' ? 'Assurance'
       : k === 'comprehensive' ? 'Comprehensive'
       : 'Essentials';
}

function priceCalc({ planKey, totalPages, years, addonLegal, addonModel }) {
  const cfg = PRICE[planKey];
  if (!cfg) throw new Error('Invalid planKey');
  const pages = Math.max(0, Number(totalPages || 0));
  const yrs   = Math.max(1, Number(years || 1));
  const extraPages = Math.max(0, pages - cfg.included);
  const extraCost  = extraPages * cfg.extraPer;

  let legalAdd = 0, modelAdd = 0;
  if (planKey !== 'essentials') {
    if (addonLegal) { const over30 = Math.max(0, pages - 30); legalAdd = 1500 + over30 * 25; }
    if (addonModel) { modelAdd = 1000 + Math.max(0, yrs - 1) * 250; }
  }
  return { total: cfg.base + extraCost + legalAdd + modelAdd };
}

const toCents = usd => Math.round(Number(usd) * 100);
const today = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`; };
const makeJobId = () => `DW-${today()}-${Math.floor(Math.random()*900+100)}`;

function toBool(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'y';
}

export default async function handler(req, res) {
  // Only GET (so it works as a simple link)
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ ok:false, error:'Method Not Allowed' }); return; }

  try {
    // Optional token gate for safety
    const requiredToken = (process.env.CHECKOUT_LINK_TOKEN || '').trim();
    const providedToken = String(req.query.t || '').trim();
    if (requiredToken && providedToken !== requiredToken) {
      res.status(403).json({ ok:false, error:'Forbidden' });
      return;
    }

    // Parse query params
    const planKey        = String((req.query.plan || 'assurance')).toLowerCase();
    const totalPages     = parseInt(req.query.pages ?? '48', 10);
    const years          = parseInt(req.query.years ?? '3', 10);
    const addonLegal     = toBool(req.query.legal);
    const addonModel     = toBool(req.query.model);
    const customerName   = String(req.query.name || 'Test Buyer');
    const customerEmail  = String(req.query.email || 'buyer@example.com');
    const customerCompany= String(req.query.company || 'Acme');
    const dealContext    = String(req.query.context || '');
    const successUrl     = String(req.query.success || 'https://duewiseai.com/success?session_id={CHECKOUT_SESSION_ID}');
    const cancelUrl      = String(req.query.cancel  || 'https://duewiseai.com/cancel');
    const format         = String(req.query.format || '').toLowerCase(); // 'json' to return JSON

    const { total } = priceCalc({ planKey, totalPages, years, addonLegal, addonModel });
    const stripe = new Stripe(process.env.STRIPE_SECRET, { apiVersion: '2024-06-20' });
    const jobId = makeJobId();

    const addons = [
      (addonLegal && planKey !== 'essentials') ? 'Legal Deep-Dive' : null,
      (addonModel && planKey !== 'essentials') ? 'Financial Modeling' : null,
    ].filter(Boolean).join(', ');

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: toCents(total),
          product_data: { name: `DueWise ${planLabel(planKey)} — ${jobId}` }
        }
      }],
      metadata: {
        jobId, planKey,
        pages: String(totalPages || 0),
        years: String(years || 1),
        addons,
        dealContext,
        customerName,
        customerEmail,
        customerCompany
      }
    });

    if (format === 'json') {
      res.status(201).json({ ok: true, url: session.url, sessionId: session.id, jobId });
      return;
    }

    // Default: redirect to Stripe Checkout
    res.statusCode = 302;
    res.setHeader('Location', session.url);
    res.end();
  } catch (e) {
    res.status(400).json({ ok:false, error: String(e?.message || e) });
  }
}
