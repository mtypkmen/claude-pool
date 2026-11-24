const http = require('http'), fs = require('fs'), { Readable } = require('stream');
const PORT = process.env.PORT || 8787, UP = process.env.UP || 'https://api.anthropic.com';
const CLIENT_ID = '9d1c250a-e61b-47e8-bb04-3be3bc1f2a99';
const STATS = __dirname + '/stats.json';
let saved = {}; try { saved = JSON.parse(fs.readFileSync(STATS)); } catch {}
const accts = JSON.parse(fs.readFileSync(__dirname + '/accounts.json'))
  .map(a => ({ ...a, creds: a.creds.replace(/^~/, require('os').homedir()), reqs: 0, limited: 0, last: 0, until: 0, off: false, status: '-', rl: {}, inTok: 0, outTok: 0, cacheTok: 0, ...saved[a.name] }));
let saveT;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => fs.writeFile(STATS, JSON.stringify(Object.fromEntries(accts.map(a => [a.name, { reqs: a.reqs, limited: a.limited, inTok: a.inTok, outTok: a.outTok, cacheTok: a.cacheTok }]))), () => {}), 2000); };
const log = [];

async function token(a) {
  const f = JSON.parse(fs.readFileSync(a.creds)), o = f.claudeAiOauth;
  if (o.expiresAt - 60000 > Date.now()) return o.accessToken;
  const r = await fetch('https://console.anthropic.com/v1/oauth/token', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: o.refreshToken, client_id: CLIENT_ID }) });
  if (!r.ok) throw new Error('refresh ' + r.status);
  const j = await r.json();
  Object.assign(o, { accessToken: j.access_token, refreshToken: j.refresh_token || o.refreshToken, expiresAt: Date.now() + j.expires_in * 1000 });
  fs.writeFileSync(a.creds, JSON.stringify(f));
  return o.accessToken;
}

function lastPrompt(j) {
  const m = (j?.messages || []).filter(x => x.role === 'user').pop();
  if (!m) return '';
  const t = typeof m.content === 'string' ? m.content : (m.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ');
  return (t || '[tool_result]').slice(0, 400);
}
const grab = (s, re) => { let m, v; while ((m = re.exec(s))) v = +m[1]; return v; };

const page = () => fs.readFileSync(__dirname + '/panel.html');

let cur = null;
const used = x => Math.max(...['5h', '7d'].map(k => +x.rl['unified-' + k + '-reset'] * 1000 < Date.now() ? 0 : +x.rl['unified-' + k + '-utilization'] || 0));
function pick(tried) {
  const ok = accts.filter(x => !x.off && x.until < Date.now() && !tried.has(x)).sort((p, q) => used(p) - used(q) || p.last - q.last);
  return cur && ok.includes(cur) && used(cur) - used(ok[0]) < 0.03 ? cur : ok[0];
}

const CC = "You are Claude Code, Anthropic's official CLI for Claude.";
const api = async (a, payload) => fetch(UP + '/v1/messages', { method: 'POST', body: JSON.stringify(payload),
  headers: { authorization: 'Bearer ' + await token(a), 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'anthropic-beta': 'oauth-2025-04-20' } });

const MEM = __dirname + '/memory.json';
let mem = { on: true, notes: [] }; try { mem = { ...mem, ...JSON.parse(fs.readFileSync(MEM)) }; } catch {}
const saveMem = () => fs.writeFile(MEM, JSON.stringify(mem, null, 1), () => {});
const KN = __dirname + '/knowledge.json';
let know = null;
const loadKnow = () => { try { know = JSON.parse(fs.readFileSync(KN)); } catch { know = null; } };
if (!fs.existsSync(KN)) try { require('./import.js').write(KN); } catch (e) { console.log('knowledge import skipped:', e.message); }
loadKnow();
const probe = t => { const l = t.split('\n').find(x => x.trim().length > 25 && !/["\\]/.test(x)); return l ? l.trim().slice(0, 60) : null; };
const knowText = raw => {
  if (!know) return '';
  const keep = know.chunks.filter(c => { const p = probe(c.text); return !(p && raw.includes(p)); });
  if (!keep.length && !know.index) return '';
  return "Background about the user and their system, imported from their own files. These are hints and may be outdated; the user's latest message and the real files win.\n\n" + keep.map(c => `### ${c.label}\n${c.text}`).join('\n\n') + (know.index ? '\n\n' + know.index : '');
};
const withMemory = (j, raw) => {
  const k = knowText(raw), n = mem.notes.length ? 'Notes:\n' + mem.notes.slice(-30).map(x => '- ' + x.text).join('\n') : '';
  if (!k && !n) return null;
  const sys = typeof j.system === 'string' ? [{ type: 'text', text: j.system }] : [...(j.system || [])];
  sys.push({ type: 'text', text: [rules().use || 'Shared notes from earlier work. Treat them as hints, not facts.', k, n].filter(Boolean).join('\n\n') });
  return Buffer.from(JSON.stringify({ ...j, system: sys }));
};
const askOf = j => {
  for (const m of [...(j?.messages || [])].reverse()) {
    if (m.role !== 'user') continue;
    const bs = typeof m.content === 'string' ? [{ text: m.content }] : (m.content || []).filter(b => b.type === 'text' && b.text.trim());
    if (bs.length && bs.at(-1).text.trim()) return bs.at(-1).text;
  }
  return '';
};
const isNewPrompt = j => !!askOf({ messages: (j.messages || []).slice(-1) });

const AGENT = __dirname + '/agent.md';
const rules = () => {
  let t = ''; try { t = fs.readFileSync(AGENT, 'utf8'); } catch {}
  const [use, ...rest] = t.split(/^## /m), sec = Object.fromEntries(rest.map(p => [p.split(/[\s(]/)[0].toLowerCase(), '## ' + p.trim()]));
  return { use: use.replace(/^# .*\n/, '').trim(), write: sec.writing || '', fix: sec.fixing || '' };
};

const CORR = /\b(no|not|wrong|incorrect|doesn'?t|didn'?t|isn'?t|still|instead|actually|undo|revert|redo|again|broken|fix|mistake|bug)\b|yanl[ıi]ş|olmad[ıi]|olmuyor|hay[ıi]r|hata|düzelt|bozuk|yine|tekrar|değil|istemedim/i;
let prev = null;
async function revise(j) {
  const a = pick(new Set()), p = prev; prev = null;
  if (!a || !p) return;
  const r = rules(), list = mem.notes.slice(-30);
  try {
    const res = await api(a, { model: WARM_MODEL, max_tokens: 300, system: [{ type: 'text', text: CC }], messages: [{ role: 'user', content:
      `${r.use}\n\n${r.fix}\n\nPrevious request: ${p.ask.slice(0, 500)}\nPrevious result: ${p.said.slice(0, 1200)}\nUser's new message: ${askOf(j).slice(0, 600)}\n\nCurrent notes:\n${list.map((n, i) => `${i}. ${n.text}`).join('\n')}\n\nDoes the new message say the previous result was wrong, did not work, or must be redone? Reply with JSON only: {"correction":true|false,"bad":[numbers of notes that are wrong or misleading],"lesson":"one corrected lesson, or empty string"}` }] });
    const m = ((await res.json()).content?.[0]?.text || '').match(/\{[\s\S]*\}/);
    if (!m) return;
    const d = JSON.parse(m[0]);
    if (!d.correction) return;
    const drop = new Set((d.bad || []).filter(i => Number.isInteger(i) && list[i]).map(i => list[i].t));
    mem.notes = mem.notes.filter(n => !drop.has(n.t));
    const t = String(d.lesson || '').trim();
    if (t && t.length <= 300 && !mem.notes.some(n => n.text === t)) mem.notes.push({ t: Date.now(), acct: a.name, text: t, fixed: true });
    saveMem();
  } catch {}
}
let lastLearn = 0;
async function learn(a, ask, answer) {
  lastLearn = Date.now();
  try {
    const r = await api(a, { model: WARM_MODEL, max_tokens: 120, system: [{ type: 'text', text: CC }], messages: [{ role: 'user', content:
      `${rules().use}\n\n${rules().write}\n\nA coding assistant just finished a task.\nUser asked: ${ask.slice(0, 600)}\nAssistant's final reply: ${answer.slice(0, 1500)}\n\nWrite ONE short lesson following the rules above. If nothing is worth remembering, reply exactly NONE.` }] });
    const t = ((await r.json()).content?.[0]?.text || '').trim();
    if (!t || /^none\b/i.test(t) || t.length > 300 || mem.notes.some(n => n.text === t)) return;
    mem.notes.push({ t: Date.now(), acct: a.name, text: t }); mem.notes = mem.notes.slice(-100); saveMem();
  } catch {}
}

const WARM_MODEL = 'claude-haiku-5-5';
let warmed = false;
async function warm() {
  await Promise.all(accts.filter(a => !a.off).map(async a => {
    const info = { t: Date.now(), acct: a.name, path: '/v1/messages', model: WARM_MODEL, prompt: 'hi (limit check)', status: '...', in: 0, out: 0, cache: 0 };
    log.unshift(info); if (log.length > 100) log.pop();
    try {
      const r = await api(a, { model: WARM_MODEL, max_tokens: 1, system: [{ type: 'text', text: CC }], messages: [{ role: 'user', content: 'hi' }] });
      const j = await r.json().catch(() => ({})), u = j.usage || {};
      a.reqs++; a.status = info.status = r.status;
      for (const [k, v] of r.headers) if (k.startsWith('anthropic-ratelimit')) a.rl[k.slice(20)] = v;
      info.in = u.input_tokens || 0; info.out = u.output_tokens || 0; info.cache = u.cache_read_input_tokens || 0;
      a.inTok += info.in; a.outTok += info.out; a.cacheTok += info.cache; save();
      if (r.status >= 400) info.err = JSON.stringify(j).slice(0, 400);
    } catch (e) { a.status = info.status = e.message; }
  }));
}

const json = (res, o) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(o));

http.createServer(async (req, res) => {
  if (req.url.split('?')[0] === '/') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page());
  const st = req.url.match(/^\/(app\.js|v\/[\w-]+(?:\.[\w-]+)*\.js|assets\/[\w-]+\.png)$/);
  if (st) return res.writeHead(200, { 'content-type': st[1].endsWith('.png') ? 'image/png' : 'text/javascript', 'cache-control': 'no-cache' }).end(fs.readFileSync(__dirname + '/' + st[1].replace(/^v\//, 'vendor/')));
  if (req.url === '/_s') return json(res, accts.map(({ creds, ...x }) => x));
  if (req.url === '/_l') return json(res, log);
  if (req.url === '/_k') return json(res, know ? { built: know.built, stats: know.stats } : {});
  if (req.url === '/_k/refresh') { try { require('./import.js').write(KN); } catch {} loadKnow(); return res.end('ok'); }
  if (req.url === '/_m') return json(res, mem);
  if (req.url === '/_m/toggle') { mem.on = !mem.on; saveMem(); return res.end('ok'); }
  if (req.url.startsWith('/_m/del/')) { mem.notes = mem.notes.filter(n => String(n.t) !== req.url.slice(8)); saveMem(); return res.end('ok'); }
  if (req.url.startsWith('/_t/')) { const a = accts.find(x => x.name === decodeURIComponent(req.url.slice(4))); if (a) a.off = !a.off; return res.end('ok'); }

  if (!warmed && req.method === 'POST' && req.url.startsWith('/v1/messages')) { warmed = true; warm(); }
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks), tried = new Set();
  let j; try { j = JSON.parse(body); } catch {}
  const agent = j?.tools?.length && /^\/v1\/messages(\?|$)/.test(req.url);
  if (agent && mem.on && mem.notes.length && prev && isNewPrompt(j) && CORR.test(askOf(j))) await Promise.race([revise(j), new Promise(r => setTimeout(r, 4000))]);
  const payload = (agent && mem.on && withMemory(j, body.toString())) || body;
  const track = agent && mem.on && j.stream, learnable = track && Date.now() - lastLearn > 120000;
  for (;;) {
    const a = pick(tried);
    if (!a) return res.writeHead(429, { 'content-type': 'application/json' }).end('{"error":"all accounts are rate-limited or disabled"}');
    tried.add(a); a.last = Date.now(); a.reqs++; cur = a;
    const info = { t: Date.now(), acct: a.name, path: req.url, model: j?.model || '', prompt: lastPrompt(j), status: '...', in: 0, out: 0, cache: 0 };
    log.unshift(info); if (log.length > 100) log.pop();
    let r;
    try {
      const h = { ...req.headers };
      for (const k of ['host', 'x-api-key', 'content-length', 'accept-encoding']) delete h[k];
      h.authorization = 'Bearer ' + await token(a);
      h['anthropic-beta'] = [...new Set([...(h['anthropic-beta'] || '').split(','), 'oauth-2025-04-20'].filter(Boolean))].join(',');
      r = await fetch(UP + req.url, { method: req.method, headers: h, body: ['GET', 'HEAD'].includes(req.method) ? undefined : payload });
    } catch (e) { a.status = info.status = e.message; a.until = Date.now() + 30000; continue; }
    a.status = info.status = r.status;
    for (const [k, v] of r.headers) if (k.startsWith('anthropic-ratelimit')) a.rl[k.slice(20)] = v;
    if (r.status >= 400) info.err = (await r.clone().text()).slice(0, 400);
    const us = r.headers.get('anthropic-ratelimit-unified-status');
    const lim429 = r.status === 429 && (r.headers.has('retry-after') || (us && us !== 'allowed'));
    if (lim429 || r.status === 401) { a.limited += lim429 ? 1 : 0; a.until = Date.now() + (+r.headers.get('retry-after') || (r.status === 401 ? 60 : 300)) * 1000; continue; }
    const out = Object.fromEntries(r.headers);
    delete out['content-encoding']; delete out['content-length']; delete out['transfer-encoding'];
    res.writeHead(r.status, out);
    if (!r.body) return res.end();
    const up = Readable.fromWeb(r.body);
    let sse = '', said = '', done = false;
    up.on('data', c => {
      const s = c.toString();
      const i = grab(s, /"input_tokens":(\d+)/g), o = grab(s, /"output_tokens":(\d+)/g), cr = grab(s, /"cache_read_input_tokens":(\d+)/g);
      if (i !== undefined) info.in = i; if (o !== undefined) info.out = o; if (cr !== undefined) info.cache = cr;
      if (!track) return;
      sse += s; const ls = sse.split('\n'); sse = ls.pop();
      for (const l of ls) {
        if (!l.startsWith('data:') || !(l.includes('text_delta') || l.includes('end_turn'))) continue;
        try { const d = JSON.parse(l.slice(5)); if (d.delta?.type === 'text_delta') said += d.delta.text; if (d.delta?.stop_reason === 'end_turn') done = true; } catch {}
      }
    });
    up.on('end', () => {
      a.inTok += info.in; a.outTok += info.out; a.cacheTok += info.cache; save();
      if (track && done) {
        prev = { ask: askOf(j), said: said.slice(0, 1500) };
        if (learnable && said.length > 40 && Date.now() - lastLearn > 120000) learn(a, prev.ask, said);
      }
    });
    return up.pipe(res);
  }
}).listen(PORT, '127.0.0.1', () => console.log('Panel: http://127.0.0.1:' + PORT));
