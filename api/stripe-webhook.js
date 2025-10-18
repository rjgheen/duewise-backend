// api/stripe-webhook.js
export const config = { api: { bodyParser: false } };

import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET, { apiVersion: '2024-06-20' });

import { kv } from '@vercel/kv';
const mem = new Set(); // fallback if KV not configured

import { newJobId, nowIso } from '../lib/util.js';
import { createDropboxIntake } from '../lib/dropbox.js';
import { sendMail } from '../lib/email.js';
import { upsertWixOrder } from '../lib/wix.js';

function hasKV() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}
async function alreadyProcessed(id) {
  if (!id) return false;
  if (hasKV()) return !!(await kv.get(`stripe_evt:${id}`));
  return mem.has(id);
}
async function markProcessed(id) {
  if (!id) return;
  if (hasKV()) await kv.set(`stripe_evt:${id}`, '1', { ex: 60 * 60 * 24 * 7 }); // 7 days
  else mem.add(id);
}

function resolveBuyerEmail(session) {
  return session?.customer_details?.email ||
         session?.customer_email ||
         session?.metadata?.customerEmail ||
         session?.metadata?.email || null;
}

export default async function handler(req, res) {
  try {
    const buf = await raw(req);
    const sig = req.headers['stripe-signature'];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!sig || !secret) return res.status(500).json({ ok:false, error:'webhook not configured' });

    let event;
    try {
      event = stripe.webhooks.constructEvent(buf, sig, secret);
    } catch (e) {
      return res.status(400).json({ ok:false, error:`signature verify failed: ${e.message}` });
    }

    if (await alreadyProcessed(event.id)) {
      return res.status(200).json({ ok:true, dedup:true });
    }

    if (event.type === 'checkout.session.completed' ||
        event.type === 'checkout.session.async_payment_succeeded') {
      const s = event.data.object;

      const planKey = s?.metadata?.planKey || 'assurance';
      const planLabel = s?.metadata?.planLabel || '';
      const totalPages = Number(s?.metadata?.totalPages || 0);
      const years = Number(s?.metadata?.years || 1);
      const addons = s?.metadata?.addons || '';
      const customerName = s?.metadata?.customerName || s?.customer_details?.name || 'Customer';
      const customerEmail = resolveBuyerEmail(s);
      const customerCompany = s?.metadata?.customerCompany || 'Client';
      const dealContext = s?.metadata?.dealContext || '';
      const amountTotal = (s.amount_total ?? 0) / 100;

      const jobId = newJobId();

      // Dropbox intake
      const { uploadUrl, baseFolder } = await createDropboxIntake({ company: customerCompany, jobId });

      // Buyer email (if we have email)
      if (customerEmail) {
        const buyerHtml = `
          <p>Hi ${customerName.split(' ')[0]},</p>
          <p>Thanks for your order. Your Job ID is <b>${jobId}</b>.</p>
          <p>Please upload your documents using this link:</p>
          <p><a href="${uploadUrl}">${uploadUrl}</a></p>
          <hr/>
          <p><b>Order Summary</b><br/>
          Plan: ${planLabel || planKey}<br/>
          Pages: ${totalPages} &nbsp;|&nbsp; Years: ${years}<br/>
          Add-ons: ${addons || 'None'}<br/>
          Context: ${dealContext || '—'}</p>
          <p>— DueWise</p>
        `;
        await sendMail({ to: customerEmail, subject: `DueWise — Upload Link for Job ${jobId}`, html: buyerHtml });
      }

      // Ops email
      const ops = process.env.OPS_EMAIL || 'ops@duewiseai.com';
      const opsHtml = `
        <p>New PAID order</p>
        <ul>
          <li><b>${jobId}</b></li>
          <li>Customer: ${customerName} (${customerEmail || 'no email'})</li>
          <li>Company: ${customerCompany}</li>
          <li>Plan: ${planLabel || planKey}</li>
          <li>Pages: ${totalPages} | Years: ${years}</li>
          <li>Add-ons: ${addons || 'None'}</li>
          <li>Context: ${dealContext || '—'}</li>
          <li>Dropbox: ${baseFolder}</li>
          <li>Upload URL: <a href="${uploadUrl}">${uploadUrl}</a></li>
          <li>Stripe session: ${s.id}</li>
        </ul>`;
      await sendMail({ to: ops, subject: `New Job ${jobId} — ${planLabel || planKey}`, html: opsHtml });

      // Upsert Wix order (matches your exact field keys & types)
      const now = nowIso();
      const wixDoc = {
        stripeSessionId: s.id,
        sessionId: s.id,
        uploadUrl,
        jobId,
        planLabel: planLabel || planKey,
        planKey,
        totalPages,
        years,
        addons,
        total: amountTotal,
        status: 'paid',
        customerName,
        customerEmail: customerEmail || '',
        customerCompany,
        createdAt: s.created ? new Date(s.created * 1000).toISOString() : now,
        updatedAt: now
      };
      try { await upsertWixOrder(wixDoc); } catch (e) { /* log-only */ console.warn('[wix upsert failed]', e.message); }

      await markProcessed(event.id);
      return res.status(200).json({ ok:true, jobId, uploadUrl });
    }

    // Other status events → update Wix + alert ops (optional to implement now)
    if ([
      'checkout.session.async_payment_failed',
      'checkout.session.expired',
      'payment_intent.payment_failed',
      'charge.refunded',
      'charge.dispute.created',
      'charge.dispute.closed'
    ].includes(event.type)) {
      // TODO: upsert Wix with appropriate status; email ops as needed.
      await markProcessed(event.id);
      return res.status(200).json({ ok:true, handled:event.type });
    }

    await markProcessed(event.id);
    return res.status(200).json({ ok:true, ignored:true, type:event.type });
  } catch (e) {
    console.error('[webhook] error', e);
    return res.status(500).json({ ok:false, error:String(e.message || e) });
  }
}

async function raw(req) {
  const chunks = []; for await (const c of req) chunks.push(Buffer.isBuffer(c)?c:Buffer.from(c));
  return Buffer.concat(chunks);
}
