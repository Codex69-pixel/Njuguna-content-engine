// Thin wrapper around the official WhatsApp Cloud API (messages go to YOUR number only).
const fs = require('fs');
const cfg = require('./config');

class WAError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

const base = () => `https://graph.facebook.com/${cfg.wa.apiVersion}`;

async function call(pathname, init) {
  const r = await fetch(`${base()}/${pathname}`, {
    ...init,
    headers: { Authorization: `Bearer ${cfg.wa.token}`, ...(init.headers || {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = j.error || {};
    throw new WAError(`WhatsApp API: ${e.message || r.status}`, e.code);
  }
  return j;
}

const post = (body) =>
  call(`${cfg.wa.phoneId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: cfg.wa.owner, ...body }),
  });

const sendText = (text) => post({ type: 'text', text: { body: String(text).slice(0, 4000), preview_url: false } });

const sendTemplate = () =>
  post({ type: 'template', template: { name: cfg.wa.templateName, language: { code: cfg.wa.templateLang } } });

async function uploadVideo(file) {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', 'video/mp4');
  form.append('file', new Blob([fs.readFileSync(file)], { type: 'video/mp4' }), 'video.mp4');
  const j = await call(`${cfg.wa.phoneId}/media`, { method: 'POST', body: form });
  return j.id;
}

const sendVideo = (mediaId) => post({ type: 'video', video: { id: mediaId } });

/** One message: the video on top, text underneath, three tap buttons. */
const sendReview = (mediaId, bodyText, jobId) =>
  post({
    type: 'interactive',
    interactive: {
      type: 'button',
      header: { type: 'video', video: { id: mediaId } },
      body: { text: bodyText },
      action: {
        buttons: [
          { type: 'reply', reply: { id: `approve:${jobId}`, title: '✅ Approve' } },
          { type: 'reply', reply: { id: `changes:${jobId}`, title: '✏️ Changes' } },
          { type: 'reply', reply: { id: `reject:${jobId}`, title: '🗑️ Reject' } },
        ],
      },
    },
  });

module.exports = { WAError, sendText, sendTemplate, uploadVideo, sendVideo, sendReview, call };
