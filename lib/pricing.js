// lib/pricing.js
const TIERS = {
  essentials: { base: 2500, includedPages: 30, extraPerPage: 8, label: 'Essentials', addons: [] },
  assurance:  { base: 3000, includedPages: 30, extraPerPage: 10, label: 'Assurance',  addons: ['legal', 'model'] },
  comprehensive: { base: 5000, includedPages: 60, extraPerPage: 10, label: 'Comprehensive', addons: ['legal', 'model'] }
};

export function calcPrice({ planKey, totalPages = 0, years = 1, addonLegal = false, addonModel = false }) {
  const tier = TIERS[planKey];
  if (!tier) throw new Error('Invalid planKey');
  const pages = Math.max(0, Number(totalPages || 0));
  const yearsNum = Math.max(1, Number(years || 1));
  const extraPages = Math.max(0, pages - tier.includedPages);
  let total = tier.base + extraPages * tier.extraPerPage;

  let addons = [];
  if (planKey !== 'essentials') {
    if (addonLegal) {
      const legal = 1500 + Math.max(0, pages - 30) * 25;
      total += legal; addons.push('Legal Deep-Dive');
    }
    if (addonModel) {
      const model = 1000 + Math.max(0, yearsNum - 1) * 250;
      total += model; addons.push('Financial Modeling');
    }
  }
  return {
    planKey,
    planLabel: tier.label,
    includedPages: tier.includedPages,
    extraPages,
    totalPages: pages,
    years: yearsNum,
    addons,
    total
  };
}

export function lineItemsUSD(calc) {
  // One line is fine for Stripe Checkout; addons can be represented via metadata/description if you prefer.
  return [{
    price_data: {
      currency: 'usd',
      product_data: {
        name: `DueWise — ${calc.planLabel}`,
        description: `Pages: ${calc.totalPages} (incl ${calc.includedPages}, +${calc.extraPages}). Add-ons: ${calc.addons.join(', ') || 'None'}. Years: ${calc.years}.`
      },
      unit_amount: Math.round(calc.total * 100)
    },
    quantity: 1
  }];
}
