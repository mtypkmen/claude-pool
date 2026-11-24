const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process'), assert = require('assert');
const [serverJs, agentMd] = process.argv.slice(2);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'corr-')), seen = [];
fs.copyFileSync(serverJs, path.join(dir, 'server.js')); fs.copyFileSync(agentMd, path.join(dir, 'agent.md'));
fs.writeFileSync(path.join(dir, 'panel.html'), '<html></html>');
const creds = n => { const f = path.join(dir, n + '.json'); fs.writeFileSync(f, JSON.stringify({ claudeAiOauth: { accessToken: 'fake-' + n, refreshToken: 'x', expiresAt: Date.now() + 3600e3 } })); return f.replace(/\\/g, '/'); };
fs.writeFileSync(path.join(dir, 'accounts.json'), JSON.stringify([{ name: 'A', creds: creds('a') }, { name: 'B', creds: creds('b') }]));

const OLD = 'Compile with npm run build', FIXED = 'Compile with make; the project has no npm build script';
let reviseReply = '';
const SSE = ['{"type":"message_start","message":{"usage":{"input_tokens":5}}}',
  '{"type":"content_block_delta","delta":{"type":"text_delta","text":"Run npm run build to compile the project, it works fine."}}',
  '{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":20}}'].map(d => 'data: ' + d + '\n\n').join('');

const up = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c).on('end', () => {
    const body = JSON.parse(b || '{}'), text = typeof body.messages?.[0]?.content === 'string' ? body.messages[0].content : '';
    const kind = text === 'hi' ? 'hi' : text.includes('Current notes:') ? 'revise' : text.includes('ONE short lesson') ? 'lesson' : 'main';
    seen.push({ kind, sys: body.system, text });
    if (kind === 'main') { res.writeHead(200, { 'content-type': 'text/event-stream' }); return res.end(SSE); }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(kind === 'lesson' ? { content: [{ type: 'text', text: OLD }] } : kind === 'revise' ? { content: [{ type: 'text', text: reviseReply }] } : { usage: { input_tokens: 1, output_tokens: 1 } }));
  });
}).listen(9431, async () => {
  const p = spawn(process.execPath, [path.join(dir, 'server.js')], { env: { ...process.env, PORT: '9432', UP: 'http://127.0.0.1:9431' }, stdio: 'ignore' });
  const wait = ms => new Promise(r => setTimeout(r, ms)), P = 'http://127.0.0.1:9432';
  const send = messages => fetch(P + '/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-opus', stream: true, system: [{ type: 'text', text: 'ORIGINAL SYSTEM' }], tools: [{ name: 'Bash' }], messages }) }).then(r => r.text());
  const turn = async q => { await send([{ role: 'user', content: [{ type: 'text', text: '<system-reminder>not relevant, fix nothing</system-reminder>' }, { type: 'text', text: q }] }]); await wait(500); };
  const notes = async () => (await (await fetch(P + '/_m')).json()).notes;
  const count = k => seen.filter(s => s.kind === k).length;
  try {
    await wait(800);
    await turn('How do I build this project?');
    assert.deepEqual((await notes()).map(n => n.text), [OLD]);
    await turn('Now add a unit test for the parser');
    assert.equal(count('revise'), 0, 'revise must not run for a non-correction request');
    reviseReply = 'Sure: {"correction":true,"bad":[0],"lesson":"' + FIXED + '"}';
    await turn("That's wrong, npm run build doesn't exist, use make");
    assert.equal(count('revise'), 1);
    const rv = seen.find(s => s.kind === 'revise');
    assert.ok(rv.text.includes('Fixing a wrong note') && rv.text.includes('You share one memory'), 'agent.md rules must be part of the revise request');
    assert.ok(rv.text.includes('Previous result: Run npm run build') && rv.text.includes("That's wrong") && rv.text.includes('0. ' + OLD));
    const n3 = await notes();
    assert.deepEqual(n3.map(n => n.text), [FIXED]); assert.equal(n3[0].fixed, true, 'the corrected note must be marked');
    const mainC = seen.filter(s => s.kind === 'main').at(-1), inj = mainC.sys[1].text;
    assert.ok(inj.includes(FIXED) && !inj.includes(OLD), 'the request must only see the corrected note');
    assert.ok(inj.includes('You share one memory'), 'the agent.md usage section must be injected');
    assert.ok(!inj.includes('Writing a lesson'), 'the writing and fixing sections must not be injected into every request');
    reviseReply = '{"correction":false,"bad":[],"lesson":""}';
    await turn('No rush, still thinking about the next feature');
    assert.equal(count('revise'), 2); assert.deepEqual((await notes()).map(n => n.text), [FIXED]);
    await send([{ role: 'user', content: 'q' }, { role: 'assistant', content: [{ type: 'tool_use', id: 'x', name: 'Bash', input: {} }] }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'wrong output, not found' }] }]);
    await wait(300);
    assert.equal(count('revise'), 2, 'a tool_result request must not count as a correction');
    await fetch(P + '/_m/toggle'); reviseReply = '{"correction":true,"bad":[0],"lesson":"x"}';
    await turn("That's wrong, do it again");
    assert.equal(count('revise'), 2); await fetch(P + '/_m/toggle');
    console.log('CORRECTION_TESTS_OK');
  } catch (e) { console.log('FAIL:', e.message); process.exitCode = 1; }
  finally { p.kill(); up.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
