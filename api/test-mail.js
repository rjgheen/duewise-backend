// api/test-mail.js
import { sendMail } from '../lib/email.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'POST only' });
  try {
    const b = req.body || (await readJson(req));
    const id = await sendMail({
      to: b.to, subject: b.subject || 'DueWise mailer test',
      text: b.text || 'It works.', html: b.html
    });
    return res.status(200).json({ ok:true, id });
  } catch (e) {
    console.error('[test-mail]', e);
    return res.status(500).json({ ok:false, error:String(e.message||e) });
  }
}
async function readJson(req){ const chunks=[]; for await(const c of req) chunks.push(Buffer.isBuffer(c)?c:Buffer.from(c)); try{ return JSON.parse(Buffer.concat(chunks).toString('utf8')); }catch{ return {}; } }
