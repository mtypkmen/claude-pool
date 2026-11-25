const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process'), assert = require('assert');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warm-')), seen = [];
fs.copyFileSync(process.argv[2], path.join(dir, 'server.js'));
fs.writeFileSync(path.join(dir, 'panel.html'), '<html></html>');
const creds = n => { const f = path.join(dir, n + '.json'); fs.writeFileSync(f, JSON.stringify({ claudeAiOauth: { accessToken: 'fake-' + n, refreshToken: 'x', expiresAt: Date.now() + 3600e3 } })); return f.replace(/\\/g, '/'); };
fs.writeFileSync(path.join(dir, 'accounts.json'), JSON.stringify([{ name: 'A', creds: creds('a') }, { name: 'B', creds: creds('b') }]));

const up = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c).on('end', () => {
    const body = JSON.parse(b || '{}'), tok = req.headers.authorization;
    seen.push({ at: Date.now(), tok, msg: body.messages?.[0]?.content, sys: body.system?.[0]?.text, ver: req.headers['anthropic-version'], beta: req.headers['anthropic-beta'] });
    res.writeHead(200, { 'content-type': 'application/json', 'anthropic-ratelimit-unified-5h-utilization': tok.endsWith('a') ? '0.40' : '0.10', 'anthropic-ratelimit-unified-7d-utilization': '0.05', 'anthropic-ratelimit-unified-5h-reset': '9999999999' });
    res.end(JSON.stringify({ usage: { input_tokens: 8, output_tokens: 1, cache_read_input_tokens: 0 } }));
  });
}).listen(9411, async () => {
  const p = spawn(process.execPath, [path.join(dir, 'server.js')], { env: { ...process.env, PORT: '9412', GAP: '300', UP: 'http://127.0.0.1:9411' }, stdio: 'ignore' });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  try {
    await wait(800);
    await fetch('http://127.0.0.1:9412/_s');
    assert.equal(seen.length, 0, 'panel requests must not reach the upstream');
    const r = await fetch('http://127.0.0.1:9412/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer x' }, body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'real question' }] }) });
    assert.equal(r.status, 200);
    await wait(600);
    const hi = seen.filter(s => s.msg === 'hi'), real = seen.filter(s => s.msg === 'real question');
    assert.equal(hi.length, 2, 'hi must be sent to both accounts');
    assert.deepEqual(hi.map(s => s.tok).sort(), ['Bearer fake-a', 'Bearer fake-b']);
    assert.ok(Math.abs(hi[1].at - hi[0].at) >= 150, 'hi requests must be spaced by GAP, got ' + (hi[1].at - hi[0].at));
    assert.equal(real.length, 1);
    assert.ok(hi.every(s => s.sys.includes('Claude Code') && s.ver && s.beta.includes('oauth')));
    const st = await (await fetch('http://127.0.0.1:9412/_s')).json();
    assert.equal(st.find(a => a.name === 'A').rl['unified-5h-utilization'], '0.40');
    assert.equal(st.find(a => a.name === 'B').rl['unified-5h-utilization'], '0.10');
    const before = seen.length;
    await fetch('http://127.0.0.1:9412/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'second' }] }) });
    await wait(400);
    assert.equal(seen.length - before, 1, 'hi must not be repeated on the second request');
    const lg = await (await fetch('http://127.0.0.1:9412/_l')).json();
    assert.equal(lg.filter(e => e.prompt === 'hi (limit check)').length, 2);
    console.log('WARM_TESTS_OK');
  } catch (e) { console.log('FAIL:', e.message); process.exitCode = 1; }
  finally { p.kill(); up.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
