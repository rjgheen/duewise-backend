// lib/jobs.js
import { kv } from '@vercel/kv';

const JOBS_INDEX = 'dw:jobs:index'; // JSON array of jobIds

export async function indexJobMeta(meta) {
  const { jobId } = meta;
  if (!jobId) return;
  await kv.set(`dw:jobmeta:${jobId}`, meta);
  const existing = (await kv.get(JOBS_INDEX)) || [];
  if (!existing.includes(jobId)) {
    await kv.set(JOBS_INDEX, [...existing, jobId]);
  }
}

export async function getJobIds() {
  const arr = (await kv.get(JOBS_INDEX)) || [];
  return Array.isArray(arr) ? arr : [];
}

export async function getJobMeta(jobId) {
  return await kv.get(`dw:jobmeta:${jobId}`);
}

export async function getCursor(jobId) {
  return await kv.get(`dw:cursor:${jobId}`);
}
export async function setCursor(jobId, cursor) {
  if (!jobId) return;
  await kv.set(`dw:cursor:${jobId}`, cursor);
}

export async function markSeen(jobId, ids) {
  if (!ids?.length) return;
  const key = `dw:seen:${jobId}`;
  const existing = (await kv.get(key)) || [];
  const set = new Set(existing);
  ids.forEach(id => set.add(id));
  await kv.set(key, Array.from(set));
}
export async function unseenOnly(jobId, entries) {
  const key = `dw:seen:${jobId}`;
  const existing = new Set((await kv.get(key)) || []);
  return entries.filter(e => !existing.has(e.id));
}
