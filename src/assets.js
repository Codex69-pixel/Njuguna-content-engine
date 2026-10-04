// Gets the raw material: stock/own clips and the AI voiceover.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const cfg = require('./config');
const run = promisify(execFile);

const FALLBACK_QUERIES = ['laptop typing', 'office meeting', 'city street'];
const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

function localMatch(query) {
  if (!fs.existsSync(cfg.myClipsDir)) return null;
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const files = fs.readdirSync(cfg.myClipsDir).filter((f) => /\.(mp4|mov|webm)$/i.test(f));
  const hits = files.filter((f) => words.some((w) => f.toLowerCase().includes(w)));
  return hits.length ? path.join(cfg.myClipsDir, shuffle(hits)[0]) : null;
}

// Prefer portrait files close to 1080px wide; landscape is OK (we crop to centre).
const score = (f) => Math.abs(Math.min(f.width, f.height) - 1080) + (f.height > f.width ? 0 : 500);

async function pexelsSearch(query, portrait, exclude) {
  const url = new URL('https://api.pexels.com/videos/search');
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', '15');
  if (portrait) url.searchParams.set('orientation', 'portrait');
  const r = await fetch(url, { headers: { Authorization: cfg.pexelsKey } });
  if (!r.ok) throw new Error(`Pexels ${r.status}`);
  const { videos = [] } = await r.json();
  for (const v of shuffle(videos)) {
    if (exclude.includes(String(v.id)) || (v.duration && v.duration < 3)) continue;
    const files = (v.video_files || []).filter((f) => f.file_type === 'video/mp4' && f.width && f.height);
    if (!files.length) continue;
    files.sort((a, b) => score(a) - score(b));
    return { id: String(v.id), url: files[0].link };
  }
  return null;
}

async function solidClip(dest) {
  await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
    'color=c=0x0f172a:s=1080x1920:r=30', '-t', '6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', dest]);
}

/** Returns { id, source }. Never throws: worst case you get a plain dark background. */
async function getClip(query, dest, exclude = []) {
  const local = localMatch(query);
  if (local) { fs.copyFileSync(local, dest); return { id: null, source: 'local' }; }
  if (cfg.pexelsKey) {
    const tries = [query, query.split(/\s+/).slice(0, 2).join(' '), ...FALLBACK_QUERIES];
    for (const q of tries) {
      for (const portrait of [true, false]) {
        try {
          const hit = await pexelsSearch(q, portrait, exclude);
          if (!hit) continue;
          const r = await fetch(hit.url);
          if (!r.ok) continue;
          fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
          return { id: hit.id, source: 'pexels' };
        } catch (e) {
          console.warn('clip search problem:', e.message);
        }
      }
    }
  }
  await solidClip(dest);
  return { id: null, source: 'solid' };
}

/** Free AI voice via the edge-tts command line tool (pip install edge-tts). */
async function tts(text, outFile) {
  const args = ['--voice', cfg.voice, `--rate=${cfg.voiceRate}`, '--text', text, '--write-media', outFile];
  const attempts = [
    ['edge-tts', args],
    ['python', ['-m', 'edge_tts', ...args]],
    ['py', ['-m', 'edge_tts', ...args]],
    ['python3', ['-m', 'edge_tts', ...args]],
  ];
  let lastErr;
  for (const [cmd, a] of attempts) {
    try {
      await run(cmd, a, { maxBuffer: 1e7 });
      if (fs.existsSync(outFile) && fs.statSync(outFile).size > 0) return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error('Voice generation failed. Did you run "pip install edge-tts"? ' + (lastErr?.message || '').slice(0, 150));
}

module.exports = { getClip, tts };
