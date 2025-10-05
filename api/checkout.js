import Stripe from 'stripe';

const PRICE = {
  essentials:     { base: 2500, included: 30, extraPer: 8 },
  assurance:      { base: 3000, included: 30, extraPer: 10 },
  comprehensive:  { base: 5000, included: 60, extraPer: 10 },
};

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

  const total = cfg.base + extraCost + legalAdd + modelAdd;
  return { ...cfg, extraPages, extraCost, legalAdd, modelAdd, total };
}
const toCents = usd => Math.round(Number(usd) * 100);
const planLabel = k => k==='assurance' ? 'Assurance' : k==='comprehensive' ? 'Comprehensive' : 'Essentials';
function today(){ const d=new Date(); return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`; }
const makeJobId = () => `DW-${today()}-${Math.floor(Math.random()*900+100)}`;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'Method Not Allowed' });

    const {
      planKey, totalPages, years, addonLegal, addonModel,
      customerName, customerEmail, customerCompany, dealContext,
      successUrl = 'https://duewiseai.com/success?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl  = 'https://duewiseai.com/cancel'
    } = req.body || {};

    const jobId = makeJobId();
    const calc  = priceCalc({ planKey, totalPages, years, addonLegal, addonModel });
    const addons = [
      (addonLegal && planKey!=='essentials') ? 'Legal Deep-Dive' : null,
      (addonModel && planKey!=='essentials') ? 'Financial Modeling' : null,
    ].filter(Boolean).join(', ');

    const stripe = new Stripe(process.env.STRIPE_SECRET, { apiVersion: '2024-06-20' });
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: toCents(calc.total),
          product_data: { name: `DueWise ${planLabel(planKey)} — ${jobId}` }
        }
      }],
      metadata: {
        jobId, planKey,
        pages: String(totalPages || 0),
        years: String(years || 1),
        addons,
        dealContext: dealContext || '',
        customerName: customerName || '',
        customerEmail: customerEmail || '',
        customerCompany: customerCompany || ''
      }
    });

    res.status(201).json({ ok: true, url: session.url, sessionId: session.id, jobId });
  } catch (e) {
    res.status(400).json({ ok:false, error: String(e?.message || e) });
  }
}
