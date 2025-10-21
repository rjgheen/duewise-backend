// api/stripe-webhook.js
export const config = { api: { bodyParser: false } };

import Stripe from 'stripe';
import { readRawBody, todayYMD } from '../lib/util.js';
import { createDropboxIntake } from '../lib/dropbox.js';
import { sendMail } from '../lib/email.js';
import { upsertOrder } from '../lib/wix.js';
import { kv } from '@vercel/kv';
import { indexJobMeta } from '../lib/jobs.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method not allowed');
    const stripe = new Stripe(process.env.STRIPE_SECRET, { apiVersion: '2024-06-20' });
    const sig = req.headers['stripe-signature'];
    const raw = await readRawBody(req);
    let evt;
    try {
      evt = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('[webhook] verify fail', err);
      return res.status(400).send('Bad signature');
    }

    // Idempotency across retries
    const evtKey = `dw:stripe_evt:${evt.id}`;
    if (await kv.get(evtKey)) {
      return res.status(200).json({ ok: true, dedupe: true });
    }

    switch (evt.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const s = evt.data.object;
        const sessionId = s.id;
        const customerEmail = s.customer_details?.email || s.customer_email || s.metadata?.customerEmail || '';
        const customerName = s.metadata?.customerName || '';
        const customerCompany = s.metadata?.customerCompany || 'Client';
        const planKey = s.metadata?.planKey || '';
        const planLabel = s.metadata?.planLabel || '';
        const totalPages = Number(s.metadata?.totalPages || 0);
        const years = Number(s.metadata?.years || 1);
        const addons = s.metadata?.addons || '';
        const total = (s.amount_total || 0) / 100;

        // generate jobId with KV-backed sequence per day
        const day = todayYMD();
        const seqKey = `dw:seq:${day}`;
        const seq = await kv.incr(seqKey);
        await kv.expire(seqKey, 86400 * 7);
        const jobId = `DW-${day}-${String(seq).padStart(3, '0')}`;

        // Dropbox intake
        const { uploadUrl, baseFolder, intakePath, workingPath } =
          await createDropboxIntake({ company: customerCompany, jobId });

        // index job for cron
        await indexJobMeta({
          jobId, baseFolder, intakePath, workingPath,
          customerEmail, customerCompany,
          createdAt: new Date().toISOString()
        });

        // email buyer
        const buyerHtml = `
          <p>Hi ${customerName || ''},</p>
          <p>Your DueWise job <b>${jobId}</b> is confirmed. Upload your files here:</p>
          <p><a href="${uploadUrl}">${uploadUrl}</a></p>
          <hr/>
          <p><b>Order summary</b><br/>
          Tier: ${planLabel} (${planKey})<br/>
          Pages: ${totalPages}; Years: ${years}; Add-ons: ${addons || 'None'}<br/>
          Paid: $${total.toFixed(2)}</p>
        `;
        if (customerEmail) {
          await sendMail({
            to: customerEmail,
            subject: `DueWise — Upload link for ${jobId}`,
            html: buyerHtml
          });
        }

        // email ops
        const ops = process.env.OPS_EMAIL || 'ops@duewiseai.com';
        const opsHtml = `
          <p><b>PAID</b> — ${jobId}</p>
          <ul>
            <li>Customer: ${customerName} — ${customerEmail}</li>
            <li>Company: ${customerCompany}</li>
            <li>Plan: ${planLabel} (${planKey})</li>
            <li>Pages: ${totalPages}; Years: ${years}; Add-ons: ${addons || 'None'}</li>
            <li>Total: $${total.toFixed(2)}</li>
            <li>Folder: ${baseFolder}</li>
            <li>Intake: ${intakePath}</li>
            <li>Working: ${workingPath}</li>
            <li>Upload URL: <a href="${uploadUrl}">${uploadUrl}</a></li>
          </ul>
        `;
        await sendMail({ to: ops, subject: `PAID — ${jobId}`, html: opsHtml });

        // upsert wix
        await upsertOrder({
          stripeSessionId: sessionId,
          sessionId,
          uploadUrl,
          jobId,
          planLabel,
          planKey,
          totalPages,
          years,
          addons,
          total,
          status: 'paid',
          customerName,
          customerEmail,
          customerCompany,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        await kv.set(evtKey, 1, { ex: 60 * 60 * 24 * 30 }); // 30 days
        return res.status(200).json({ ok: true, jobId, uploadUrl });
      }

      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired':
      case 'payment_intent.payment_failed':
      case 'charge.refunded':
      case 'charge.dispute.created':
      case 'charge.dispute.closed': {
        // soft-ack & mark event as processed (extend later if needed)
        await kv.set(evtKey, 1, { ex: 60 * 60 * 24 * 30 });
        return res.status(200).json({ ok: true, type: evt.type });
      }

      default:
        await kv.set(evtKey, 1, { ex: 60 * 60 * 24 * 30 });
        return res.status(200).json({ ok: true, passthrough: evt.type });
    }
  } catch (e) {
    console.error('[stripe-webhook]', e);
    return res.status(500).send('Webhook error');
  }
}
