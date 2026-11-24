const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process'), assert = require('assert');
const src = process.argv[2];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'know-')), home = path.join(dir, 'home'), work = path.join(dir, 'work'), app = path.join(dir, 'app'), seen = [];
const w = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
for (const f of ['server.js', 'import.js', 'agent.md']) w(path.join(app, f), fs.readFileSync(path.join(src, f)));
w(path.join(app, 'panel.html'), '<html></html>');
const creds = n => { const f = path.join(app, n + '.json'); w(f, JSON.stringify({ claudeAiOauth: { accessToken: 'fake-' + n, refreshToken: 'x', expiresAt: Date.now() + 3600e3 } })); return f.replace(/\\/g, '/'); };
w(path.join(app, 'accounts.json'), JSON.stringify([{ name: 'A', creds: creds('a') }, { name: 'B', creds: creds('b') }]));
w(path.join(app, 'import.json'), JSON.stringify({ roots: [work.replace(/\\/g, '/')] }));

const GLOBAL = 'Always answer the user in Turkish unless asked otherwise please.';
w(path.join(home, '.claude/CLAUDE.md'), '# Global rules\n' + GLOBAL + '\n');
w(path.join(home, '.claude/projects/p1/memory/user-style.md'), '---\nname: user-communication-style\ndescription: how the user likes answers\nmetadata:\n  type: user\n---\nThe user writes short messages and wants direct action without questions.\n');
w(path.join(home, '.claude/projects/p1/memory/MEMORY.md'), '- [index only](user-style.md) this index must not be imported itself\n');
w(path.join(home, '.claude/agent-memory/manager/feedback.md'), '---\nname: deploy-feedback\ndescription: deploy lessons\nmetadata:\n  type: feedback\n---\nDeploy with the helper script. Key was sk-ant-api03-ABCDEFGHIJKLMNOPQRS and password: hunter2hunter2 ok.\n');
w(path.join(home, '.claude/agents/manager.md'), '---\nname: manager\ndescription: Manager agent for big projects\n---\nFull rules live here and stay on disk.\n');
w(path.join(work, 'CLAUDE.md'), '# Project\nProject rules: use the staging database only for experiments.\n');
w(path.join(work, 'vault/01-SEO/a.md'), '# a'); w(path.join(work, 'vault/01-SEO/b.md'), '# b'); w(path.join(work, 'vault/02-UI/c.md'), '# c');

const up = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c).on('end', () => {
    const body = JSON.parse(b || '{}'), text = typeof body.messages?.[0]?.content === 'string' ? body.messages[0].content : JSON.stringify(body.messages?.[0]?.content || '');
    seen.push({ text, sys: body.system });
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ usage: { input_tokens: 1, output_tokens: 1 } }));
  });
}).listen(9441, async () => {
  const p = spawn(process.execPath, [path.join(app, 'server.js')], { env: { ...process.env, HOME: home, USERPROFILE: home, PORT: '9442', UP: 'http://127.0.0.1:9441' }, stdio: 'ignore' });
  const wait = ms => new Promise(r => setTimeout(r, ms)), P = 'http://127.0.0.1:9442';
  const ask = async content => { await fetch(P + '/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'm', system: [{ type: 'text', text: 'ORIGINAL' }], tools: [{ name: 'Bash' }], messages: [{ role: 'user', content }] }) }); await wait(300); return seen.filter(s => s.text.includes('PROBE')).at(-1); };
  try {
    await wait(1200);
    assert.ok(fs.existsSync(path.join(app, 'knowledge.json')), 'knowledge.json must be created automatically');
    let k = await (await fetch(P + '/_k')).json();
    assert.ok(k.stats.files >= 5, 'expected two CLAUDE.md files + user + feedback + roster, got: ' + k.stats.files);
    assert.equal(k.stats.indexed, 3, 'vault notes must be indexed');
    const r1 = await ask('PROBE one'), inj = r1.sys.at(-1).text;
    assert.equal(r1.sys[0].text, 'ORIGINAL', 'the original system text must be kept');
    for (const s of ['Always answer the user in Turkish', 'direct action without questions', 'manager: Manager agent for big projects', 'staging database only', '01-SEO', 'Read them with the Read tool', 'You share one memory']) assert.ok(inj.includes(s), 'missing: ' + s);
    assert.ok(!inj.includes('sk-ant-api03') && !inj.includes('hunter2') && inj.includes('[redacted]'), 'secrets must be redacted');
    assert.ok(!inj.includes('this index must not be imported'), 'the MEMORY.md index file must not be imported');
    const r2 = await ask([{ type: 'text', text: 'Contents of x/CLAUDE.md:\n# Global rules\n' + GLOBAL }, { type: 'text', text: 'PROBE two' }]), inj2 = r2.sys.at(-1).text;
    assert.ok(!inj2.includes('### ~/.claude/CLAUDE.md') && !inj2.includes(GLOBAL), 'a file Claude Code already loaded must not be added again');
    assert.ok(inj2.includes('direct action without questions'), 'files that were not loaded must still be added');
    w(path.join(work, 'vault/03-NEW/d.md'), '# d');
    await fetch(P + '/_k/refresh'); k = await (await fetch(P + '/_k')).json();
    assert.equal(k.stats.indexed, 4, 're-scan must pick up the new note');
    await fetch(P + '/_m/toggle');
    const r3 = await ask('PROBE three'); assert.equal(r3.sys.length, 1, 'nothing may be injected while paused');
    console.log('KNOWLEDGE_TESTS_OK');
  } catch (e) { console.log('FAIL:', e.message); process.exitCode = 1; }
  finally { p.kill(); up.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
