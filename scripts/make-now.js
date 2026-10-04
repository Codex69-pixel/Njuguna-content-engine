// Make ONE video right now, without WhatsApp, to test your setup.
//   npm run make -- "customers keep asking if you have a website"
const ideas = require('../src/ideas');
const pipeline = require('../src/pipeline');
const db = require('../src/db');
const path = require('path');

(async () => {
  const topic = process.argv.slice(2).join(' ').trim() || 'Customers keep asking if your business has a website';
  console.log(`Making a video about: "${topic}"\n(first run takes a few minutes: writing script, downloading clips, recording voice, stitching)\n`);
  const idea = ideas.add(topic, 'auto', true);
  const job = await pipeline.createFromIdea(idea, { deliver: false });
  if (job.status === 'failed') { console.error('\n❌ Failed:', job.error); process.exit(1); }
  const dir = pipeline.jobDir(job.id);
  console.log('\n✅ Done!');
  console.log('Video  :', path.join(dir, 'final.mp4'));
  console.log('Caption:', path.join(dir, 'caption.txt'));
  console.log('\n--- script ---');
  job.script.lines.forEach((l, i) => console.log(`${i + 1}. ${l.text}   [clip: ${l.search}]`));
  db.save();
})();
