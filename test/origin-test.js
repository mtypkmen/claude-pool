const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process'), assert = require('assert');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'origin-'));
fs.copyFileSync(process.argv[2], path.join(dir, 'server.js'));
fs.writeFileSync(path.join(dir, 'panel.html'), '<html></html>');
fs.writeFileSync(path.join(dir, 'accounts.json'), JSON.stringify([{ name: 'A', creds: path.join(dir, 'a.json') }]));
fs.writeFileSync(path.join(dir, 'knowledge.json'), '{}');

const call = (url, headers = {}, method = 'GET') => new Promise((ok, no) =>
  http.request({ host: '127.0.0.1', port: 9462, path: url, method, headers }, r => { let b = ''; r.on('data', c => b += c).on('end', () => ok({ code: r.statusCode, b })); }).on('error', no).end());

(async () => {
  const p = spawn(process.execPath, [path.join(dir, 'server.js')], { env: { ...process.env, PORT: '9462', UP: 'http://127.0.0.1:9' }, stdio: 'ignore' });
  try {
    await new Promise(r => setTimeout(r, 900));
    const evil = { origin: 'https://evil.example' };
    assert.equal((await call('/_rm/A', evil, 'POST')).code, 403);
    assert.equal((await call('/_add', evil, 'POST')).code, 403);
    assert.equal((await call('/v1/messages', evil, 'POST')).code, 403);
    assert.equal((await call('/_rm/A', { origin: 'null' }, 'POST')).code, 403);
    assert.equal((await call('/_t/A', { 'sec-fetch-site': 'cross-site' })).code, 403);
    assert.equal((await call('/_t/A', { 'sec-fetch-site': 'same-site' })).code, 403);
    assert.equal((await call('/_s', { host: 'evil.example:9462' })).code, 403);
    const s = JSON.parse((await call('/_s')).b);
    assert.equal(s.length, 1, 'account must survive');
    assert.equal(s[0].off, false);
    assert.equal((await call('/', { 'sec-fetch-site': 'cross-site' })).code, 200);
    assert.equal((await call('/_s', { host: 'localhost:9462', origin: 'http://localhost:9462', 'sec-fetch-site': 'same-origin' })).code, 200);
    assert.equal((await call('/_t/A', { origin: 'http://127.0.0.1:9462' }, 'POST')).code, 200);
    console.log('ORIGIN_TESTS_OK');
  } catch (e) { console.log('FAIL:', e.message); process.exitCode = 1; }
  finally { p.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
})();
