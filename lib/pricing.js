// lib/pricing.js
export const PLANS = {
  essentials: { label: 'Essentials', base: 250000, includedPages: 30, extraPerPage: 800 },
  assurance:  { label: 'Assurance',  base: 300000, includedPages: 30, extraPerPage: 1000 },
  comprehensive: { label: 'Comprehensive', base: 500000, includedPages: 60, extraPerPage: 1000 }
};

// Add-ons (cents). Note: Legal & Modeling available for Assurance/Comprehensive only.
export function addonLegal(pages) {
  const pagesOver30 = Math.max(0, Number(pages || 0) - 30);
  return 150000 + (pagesOver30 * 2500);
}
export function addonModel(years) {
  const y = Math.max(1, Number(years || 1));
  return 100000 + ((y - 1) * 25000);
}

export function calcQuote({ planKey, pages, years, addonLegalOn, addonModelOn }) {
  const plan = PLANS[planKey];
  if (!plan) throw new Error('Invalid planKey');

  const p = Number(pages || 0);
  const y = Math.max(1, Number(years || 1));

  const extraPages = Math.max(0, p - plan.includedPages);
  const base = plan.base;
  const extra = extraPages * plan.extraPerPage;

  let addonsTotal = 0;
  const addons = [];
  if (planKey !== 'essentials') {
    if (addonLegalOn) { addonsTotal += addonLegal(p); addons.push('Legal Deep-Dive'); }
    if (addonModelOn) { addonsTotal += addonModel(y); addons.push('Financial Modeling'); }
  }

  const totalCents = base + extra + addonsTotal;

  return {
    planLabel: plan.label,
    includedPages: plan.includedPages,
    extraPages,
    lineItems: {
      base, extra, addons: addonsTotal
    },
    addonsList: addons,
    totalCents
  };
}

export function asStripeLineItems({ planKey, pages, years, addonLegalOn, addonModelOn }) {
  const q = calcQuote({ planKey, pages, years, addonLegalOn, addonModelOn });
  const items = [];

  items.push({
    quantity: 1,
    price_data: {
      currency: 'usd',
      unit_amount: q.lineItems.base,
      product_data: { name: `${q.planLabel} — Base` }
    }
  });

  if (q.lineItems.extra > 0) {
    items.push({
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: q.lineItems.extra,
        product_data: { name: `${q.planLabel} — Extra Pages (${q.extraPages})` }
      }
    });
  }

  if (addonLegalOn && (planKey !== 'essentials')) {
    items.push({
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: addonLegal(pages),
        product_data: { name: 'Add-on: Legal Deep-Dive' }
      }
    });
  }

  if (addonModelOn && (planKey !== 'essentials')) {
    items.push({
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: addonModel(years),
        product_data: { name: 'Add-on: Financial Modeling' }
      }
    });
  }

  return { items, quote: q };
}
