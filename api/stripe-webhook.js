// api/stripe-webhook.js
import Stripe from 'stripe';

// Dropbox helpers (duplicated here for simplicity)
async function dbxToken() {
  const body = new URLSearchParams();
  body.set('grant_type', 'refresh_token');
  body.set('refresh_token', process.env.DROPBOX_REFRESH_TOKEN);
  body.set('client_id', process.env.DROPBOX_CLIENT_ID);
  body.set('client_secret', process.env.DROPBOX_CLIENT_SECRET);

  const r = await fetch('https://api.dropbox.com/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(`Dropbox token failed ${r.status}: ${JSON.stringify(j)}`);
  return j.access_token;
}
function ensureSlash(p){ return p.startsWith('/') ? p : `/${p}`; }
async function dbxPost(path, token, json){
  const r = await fetch(`https://api.dropboxapi.com/2${path}`, {
    method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' }, body: JSON.stringify(json)
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Dropbox ${path} ${r.status}: ${JSON.stringify(j)}`);
  return j;
}
async function createDropboxJob({ customerCompany, jobId }) {
  const token = await dbxToken();
  const company = String(customerCompany || 'Client').replace(/[\/\\:\*\?"<>\|]/g, '').trim() || 'Client';
  const basePath = `/Clients/${company}/${jobId}`;
  const intake   = `${basePath}/intake`;
  async function mkdir(p){
    try { await dbxPost('/files/create_folder_v2', token, { path: ensureSlash(p), autorename: false }); }
    catch(e){ if (!String(e.message||'').includes('path/conflict')) throw e; }
  }
  await mkdir(basePath); await mkdir(intake); await mkdir(`${basePath}/working`); await mkdir(`${basePath}/output`); await mkdir(`${basePath}/logs`);

  const fr = await dbxPost('/file_requests/create', token, {
    title: `DueWise Upload — ${jobId}`,
    destination: ensureSlash(intake),
    open: true,
    description: `Please upload your documents for Job ${jobId}.`
  });
  return { uploadUrl: fr?.url, fileRequestId: fr?.id, basePath };
}

// Stripe needs raw body
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const stripe = new Stripe(process.env.STRIPE_SECRET, { apiVersion: '2024-06-20' });

  // raw body
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    res.status(400).json({ received:false, error: String(err?.message || err) });
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;
        const jobId = session.metadata?.jobId || '';
        const customerCompany = session.metadata?.customerCompany || 'Client';
        if (jobId) {
          try {
            const { uploadUrl } = await createDropboxJob({ customerCompany, jobId });
            console.log('Dropbox ready:', jobId, uploadUrl);
          } catch (e) {
            console.error('Dropbox error', e);
          }
        }
        break;
      }
      default:
        // we log other events but no action required
        console.log('Stripe event:', event.type);
    }
    res.status(200).json({ received: true, type: event.type });
  } catch (e) {
    res.status(500).json({ received:false, error: String(e?.message || e) });
  }
}

