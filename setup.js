const fs = require('fs'), path = require('path');
const base = 'https://cdn.jsdelivr.net/npm/';
const files = {
  'gsap.min.js': base + 'gsap@3.12.5/dist/gsap.min.js',
  'ScrollTrigger.min.js': base + 'gsap@3.12.5/dist/ScrollTrigger.min.js',
  'lenis.min.js': base + 'lenis@1.1.9/dist/lenis.min.js',
};
(async () => {
  const dir = path.join(__dirname, 'vendor'); fs.mkdirSync(dir, { recursive: true });
  for (const [name, url] of Object.entries(files)) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
    fs.writeFileSync(path.join(dir, name), Buffer.from(await r.arrayBuffer()));
    console.log('downloaded', name);
  }
  console.log('\nNext: copy accounts.example.json to accounts.json and fill in your credential paths (see README).');
})().catch(e => { console.error('setup failed:', e.message); process.exit(1); });
