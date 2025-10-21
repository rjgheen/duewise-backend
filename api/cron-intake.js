// api/cron-intake.js
import { getJobIds, getJobMeta, getCursor, setCursor, markSeen, unseenOnly } from '../lib/jobs.js';
import { listIntake, moveEntriesToWorking } from '../lib/dropbox.js';
import { sendMail } from '../lib/email.js';

export default async function handler(req, res) {
  try {
    const token = req.query.token || '';
    if (process.env.CRON_TOKEN && token !== process.env.CRON_TOKEN) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    const jobIds = await getJobIds();
    let totalNew = 0, movedAll = 0;
    const details = [];

    for (const jobId of jobIds) {
      const meta = await getJobMeta(jobId);
      if (!meta?.intakePath || !meta?.baseFolder) continue;

      let cursor = await getCursor(jobId);
      const first = await listIntake({ path: meta.intakePath, cursor });
      cursor = first.cursor || cursor;
      let entries = (first.entries || []).filter(e => e['.tag'] === 'file');

      let hasMore = first.has_more;
      while (hasMore) {
        const cont = await listIntake({ path: meta.intakePath, cursor });
        cursor = cont.cursor || cursor;
        const more = (cont.entries || []).filter(e => e['.tag'] === 'file');
        entries.push(...more);
        hasMore = cont.has_more;
      }

      const newOnes = await unseenOnly(jobId, entries);
      if (newOnes.length) {
        const moved = await moveEntriesToWorking({ token: first.token, baseFolder: meta.baseFolder, entries: newOnes });
        await markSeen(jobId, newOnes.map(e => e.id));
        movedAll += moved.moved;
        totalNew += newOnes.length;

        const ops = process.env.OPS_EMAIL || 'ops@duewiseai.com';
        const listHtml = newOnes.map(e => `<li>${e.name} (${Math.round((e.size || 0) / 1024)} KB)</li>`).join('');
        const html = `
          <p>Ingested <b>${newOnes.length}</b> new file(s) for <b>${jobId}</b>.</p>
          <p>Moved from <code>${meta.intakePath}</code> → <code>${meta.baseFolder}/working</code></p>
          <ul>${listHtml}</ul>
        `;
        await sendMail({ to: ops, subject: `Intake → working: ${jobId} (${newOnes.length})`, html });
      }

      if (cursor) await setCursor(jobId, cursor);
      details.push({ jobId, new: newOnes.length });
    }

    return res.status(200).json({ ok: true, totalNew, movedAll, details });
  } catch (e) {
    console.error('[cron-intake]', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
