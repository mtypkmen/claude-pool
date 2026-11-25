const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process'), assert = require('assert');
const src = process.argv[2], dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ten-')), seen = new Set();
for (const f of ['server.js', 'panel.html', 'app.js', 'agent.md']) fs.copyFileSync(path.join(src, f), path.join(dir, f));
const list = [];
for (let i = 1; i <= 12; i++) {
  const f = path.join(dir, 'c' + i + '.json');
  fs.writeFileSync(f, JSON.stringify({ claudeAiOauth: { accessToken: 't' + i, refreshToken: 'x', expiresAt: Date.now() + 36e5 } }));
  list.push({ name: 'Account ' + i, creds: f.replace(/\\/g, '/') });
}
fs.writeFileSync(path.join(dir, 'accounts.json'), JSON.stringify(list));
const up = http.createServer((q, r) => {
  seen.add(q.headers.authorization);
  q.resume().on('end', () => { r.writeHead(200, { 'content-type': 'application/json', 'anthropic-ratelimit-unified-5h-utilization': '0.1', 'anthropic-ratelimit-unified-5h-reset': '9999999999' }); r.end('{"usage":{}}'); });
}).listen(9451, async () => {
  const p = spawn(process.execPath, [path.join(dir, 'server.js')], { env: { ...process.env, PORT: '9452', GAP: '20', UP: 'http://127.0.0.1:9451' }, stdio: 'ignore' });
  const w = ms => new Promise(r => setTimeout(r, ms));
  try {
    await w(900);
    const s = await (await fetch('http://127.0.0.1:9452/_s')).json();
    assert.equal(s.length, 10, 'only 10 accounts must load');
    assert.equal(s[9].name, 'Account 10');
    await fetch('http://127.0.0.1:9452/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'x' }] }) });
    await w(900);
    assert.equal(seen.size, 10, 'all 10 accounts must be checked, got ' + seen.size);
    console.log('TEN_ACCOUNTS_OK (12 in file, 10 loaded, 10 checked)');
  } catch (e) { console.log('FAIL', e.message); process.exitCode = 1; }
  finally { p.kill(); up.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
