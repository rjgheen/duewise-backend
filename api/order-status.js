// api/order-status.js
import Stripe from 'stripe';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok:false, error:'Method Not Allowed' });

  try {
    const sessionId = String(req.query.session_id || '').trim();
    if (!sessionId) return res.status(400).json({ ok:false, error:'Missing session_id' });

    const stripe = new Stripe(process.env.STRIPE_SECRET, { apiVersion: '2024-06-20' });
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session) return res.status(404).json({ ok:false, error:'Session not found' });

    let uploadUrl = null;
    let jobId = session?.metadata?.jobId || null;

    if (session.payment_intent) {
      const pi = await stripe.paymentIntents.retrieve(session.payment_intent);
      uploadUrl = pi?.metadata?.uploadUrl || null;
      jobId = jobId || pi?.metadata?.jobId || null;
    }

    const status = session.status || session.payment_status; // 'complete' / 'paid'
    return res.status(200).json({
      ok: true,
      status,
      jobId,
      uploadUrl,
      metadata: session.metadata || null
    });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
}
