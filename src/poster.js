// OPTIONAL auto-posting to Instagram Reels + a Facebook Page (needs README Part 8 setup).
const cfg = require('./config');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = () => `https://graph.facebook.com/${cfg.meta.apiVersion}`;

async function graph(pathname, body) {
  const r = await fetch(`${base()}/${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: cfg.meta.token }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `HTTP ${r.status}`);
  return j;
}

async function graphGet(pathname, params) {
  const url = new URL(`${base()}/${pathname}`);
  Object.entries({ ...params, access_token: cfg.meta.token }).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `HTTP ${r.status}`);
  return j;
}

const videoUrl = (job) => `${cfg.publicUrl}/media/${job.id}.mp4?key=${encodeURIComponent(cfg.mediaKey)}`;

async function instagram(job, caption) {
  const c = await graph(`${cfg.meta.igUserId}/media`, {
    media_type: 'REELS', video_url: videoUrl(job), caption, share_to_feed: true,
  });
  for (let i = 0; i < 40; i++) {
    const s = await graphGet(c.id, { fields: 'status_code' });
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error('Instagram could not process the video');
    await sleep(8000);
  }
  await graph(`${cfg.meta.igUserId}/media_publish`, { creation_id: c.id });
}

async function facebook(job, caption) {
  await graph(`${cfg.meta.fbPageId}/videos`, { file_url: videoUrl(job), description: caption });
}

module.exports = { instagram, facebook };
