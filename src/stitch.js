// Turns clips + voice lines into one finished vertical video with burned-in subtitles.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const cfg = require('./config');
const run = promisify(execFile);

const ff = (args, cwd) =>
  run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { cwd, maxBuffer: 1e8 });

async function duration(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  return parseFloat(stdout);
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
function srtTime(t) {
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
}

function pickMusic() {
  if (!fs.existsSync(cfg.musicDir)) return null;
  const files = fs.readdirSync(cfg.musicDir).filter((f) => /\.(mp3|m4a|wav|aac)$/i.test(f));
  return files.length ? path.join(cfg.musicDir, files[Math.floor(Math.random() * files.length)]) : null;
}

const OUTRO_SECONDS = 1.8;
const STYLE = 'FontName=Arial,FontSize=12,Bold=1,Alignment=2,MarginV=60,Outline=2,Shadow=0';

/**
 * dir must already contain clip_0.mp4.. and voice_0.mp3.. (one per text line).
 * Produces final.mp4 (for posting) and review.mp4 (small, for WhatsApp).
 */
async function buildVideo(dir, texts) {
  let t = 0;
  const cues = [];
  const vlist = [];
  const alist = [];
  const temp = ['subs.srt', 'v.txt', 'a.txt', 'video.mp4', 'audio.wav', 'mixed.wav'];

  try {
    for (let i = 0; i < texts.length; i++) {
      const last = i === texts.length - 1;
      const voiceDur = await duration(path.join(dir, `voice_${i}.mp3`));
      const d = voiceDur + 0.35 + (last ? OUTRO_SECONDS : 0);

      await ff(['-stream_loop', '-1', '-i', `clip_${i}.mp4`, '-t', d.toFixed(2),
        '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30',
        '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', `seg_${i}.mp4`], dir);
      await ff(['-i', `voice_${i}.mp3`, '-af', 'apad', '-t', d.toFixed(2), '-ar', '44100', '-ac', '2', `pad_${i}.wav`], dir);

      if (last) {
        cues.push([t, t + voiceDur + 0.3, texts[i]]);
        cues.push([t + voiceDur + 0.35, t + d, cfg.brand.outro]);
      } else {
        cues.push([t, t + d, texts[i]]);
      }
      vlist.push(`file 'seg_${i}.mp4'`);
      alist.push(`file 'pad_${i}.wav'`);
      temp.push(`seg_${i}.mp4`, `pad_${i}.wav`);
      t += d;
    }

    fs.writeFileSync(path.join(dir, 'subs.srt'),
      cues.map(([a, b, txt], i) => `${i + 1}\n${srtTime(a)} --> ${srtTime(b)}\n${txt}\n`).join('\n'));
    fs.writeFileSync(path.join(dir, 'v.txt'), vlist.join('\n'));
    fs.writeFileSync(path.join(dir, 'a.txt'), alist.join('\n'));

    await ff(['-f', 'concat', '-safe', '0', '-i', 'v.txt', '-c', 'copy', 'video.mp4'], dir);
    await ff(['-f', 'concat', '-safe', '0', '-i', 'a.txt', '-c', 'copy', 'audio.wav'], dir);

    let audio = 'audio.wav';
    const music = pickMusic();
    if (music) {
      await ff(['-i', 'audio.wav', '-stream_loop', '-1', '-i', music, '-filter_complex',
        '[0:a]volume=1.0[a0];[1:a]volume=0.10[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=0,volume=2[aout]',
        '-map', '[aout]', '-ar', '44100', 'mixed.wav'], dir);
      audio = 'mixed.wav';
    }

    await ff(['-i', 'video.mp4', '-i', audio,
      '-vf', `subtitles=subs.srt:force_style='${STYLE}'`,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-shortest', 'final.mp4'], dir);

    // Smaller copy for WhatsApp (limit is 16MB)
    await ff(['-i', 'final.mp4', '-vf', 'scale=720:1280', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
      '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', 'review.mp4'], dir);
  } finally {
    for (const f of temp) { try { fs.unlinkSync(path.join(dir, f)); } catch { /* ignore */ } }
  }
}

module.exports = { buildVideo, duration };
