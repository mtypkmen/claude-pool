const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process'), assert = require('assert');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-')), seen = [];
fs.copyFileSync(process.argv[2], path.join(dir, 'server.js'));
fs.writeFileSync(path.join(dir, 'panel.html'), '<html></html>');
const creds = n => { const f = path.join(dir, n + '.json'); fs.writeFileSync(f, JSON.stringify({ claudeAiOauth: { accessToken: 'fake-' + n, refreshToken: 'x', expiresAt: Date.now() + 3600e3 } })); return f.replace(/\\/g, '/'); };
fs.writeFileSync(path.join(dir, 'accounts.json'), JSON.stringify([{ name: 'A', creds: creds('a') }, { name: 'B', creds: creds('b') }]));

const LESSON = 'Run node --check after editing server.js';
const SSE = [
  'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":5}}}\n\n',
  'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Done. I split the parser into two functions and "}}\n\n',
  'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"added a test for the empty-input edge case."}}\n\n',
  'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":20}}\n\n',
].join('');

const up = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c).on('end', () => {
    const body = JSON.parse(b || '{}'), tok = req.headers.authorization;
    const text = typeof body.messages?.[0]?.content === 'string' ? body.messages[0].content : '';
    const kind = text === 'hi' ? 'hi' : text.includes('ONE short lesson') ? 'lesson' : 'main';
    seen.push({ kind, tok, sys: body.system, text });
    if (kind === 'main') { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write(SSE.slice(0, 120)); setTimeout(() => res.end(SSE.slice(120)), 20); return; }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(kind === 'lesson' ? { content: [{ type: 'text', text: LESSON }] } : { usage: { input_tokens: 1, output_tokens: 1 } }));
  });
}).listen(9421, async () => {
  const p = spawn(process.execPath, [path.join(dir, 'server.js')], { env: { ...process.env, PORT: '9422', UP: 'http://127.0.0.1:9421' }, stdio: 'ignore' });
  const wait = ms => new Promise(r => setTimeout(r, ms)), P = 'http://127.0.0.1:9422';
  const main = (content = 'Refactor the parser') => fetch(P + '/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-opus', stream: true, system: [{ type: 'text', text: 'ORIGINAL SYSTEM' }], tools: [{ name: 'Bash' }], messages: [{ role: 'user', content }] }) }).then(r => r.text());
  try {
    await wait(800);
    await main(); await wait(700);
    const m1 = seen.find(s => s.kind === 'main');
    assert.deepEqual(m1.sys, [{ type: 'text', text: 'ORIGINAL SYSTEM' }], 'nothing may be injected when memory is empty');
    assert.equal(seen.filter(s => s.kind === 'lesson').length, 1, 'exactly one lesson request must be sent');
    assert.ok(seen.find(s => s.kind === 'lesson').text.includes('Refactor the parser') && seen.find(s => s.kind === 'lesson').text.includes('empty-input'), 'the lesson request must contain the question and the answer');
    let mem = await (await fetch(P + '/_m')).json();
    assert.equal(mem.notes.length, 1); assert.equal(mem.notes[0].text, LESSON);
    const nLesson = seen.filter(s => s.kind === 'lesson').length;
    await main('Second task'); await wait(500);
    const m2 = seen.filter(s => s.kind === 'main')[1];
    assert.equal(m2.sys[0].text, 'ORIGINAL SYSTEM'); assert.equal(m2.sys.length, 2);
    assert.ok(m2.sys[1].text.includes(LESSON), 'the note must be injected');
    assert.equal(seen.filter(s => s.kind === 'lesson').length, nLesson, 'no new lesson within two minutes');
    await fetch(P + '/_m/toggle'); mem = await (await fetch(P + '/_m')).json(); assert.equal(mem.on, false);
    await main('Third task'); await wait(300);
    assert.equal(seen.filter(s => s.kind === 'main')[2].sys.length, 1, 'nothing may be injected while off');
    await fetch(P + '/_m/toggle');
    await fetch(P + '/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'haiku', system: [{ type: 'text', text: 'title' }], messages: [{ role: 'user', content: 'name this chat' }] }) });
    await wait(200);
    const small = seen.filter(s => s.text === 'name this chat')[0];
    assert.equal(small.sys.length, 1, 'a request without tools must not be injected');
    await fetch(P + '/_m/del/' + mem.notes[0].t); mem = await (await fetch(P + '/_m')).json(); assert.equal(mem.notes.length, 0);
    assert.ok(fs.existsSync(path.join(dir, 'memory.json')));
    console.log('MEMORY_TESTS_OK');
  } catch (e) { console.log('FAIL:', e.message); process.exitCode = 1; }
  finally { p.kill(); up.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
