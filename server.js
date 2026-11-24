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

const pick = tried => accts.filter(x => !x.off && x.until < Date.now() && !tried.has(x)).sort((p, q) => p.last - q.last)[0];

const json = (res, o) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(o));

http.createServer(async (req, res) => {
  if (req.url.split('?')[0] === '/') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page());
  const st = req.url.match(/^\/(app\.js|v\/[\w-]+(?:\.[\w-]+)*\.js|assets\/[\w-]+\.png)$/);
  if (st) return res.writeHead(200, { 'content-type': st[1].endsWith('.png') ? 'image/png' : 'text/javascript', 'cache-control': 'no-cache' }).end(fs.readFileSync(__dirname + '/' + st[1].replace(/^v\//, 'vendor/')));
  if (req.url === '/_s') return json(res, accts.map(({ creds, ...x }) => x));
  if (req.url === '/_l') return json(res, log);
  if (req.url.startsWith('/_t/')) { const a = accts.find(x => x.name === decodeURIComponent(req.url.slice(4))); if (a) a.off = !a.off; return res.end('ok'); }

  const chunks = []; for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks), tried = new Set();
  let j; try { j = JSON.parse(body); } catch {}
  const payload = body;
  for (;;) {
    const a = pick(tried);
    if (!a) return res.writeHead(429, { 'content-type': 'application/json' }).end('{"error":"all accounts are rate-limited or disabled"}');
    tried.add(a); a.last = Date.now(); a.reqs++;
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
    up.on('data', c => {
      const s = c.toString();
      const i = grab(s, /"input_tokens":(\d+)/g), o = grab(s, /"output_tokens":(\d+)/g), cr = grab(s, /"cache_read_input_tokens":(\d+)/g);
      if (i !== undefined) info.in = i; if (o !== undefined) info.out = o; if (cr !== undefined) info.cache = cr;
    });
    up.on('end', () => { a.inTok += info.in; a.outTok += info.out; a.cacheTok += info.cache; save(); });
    return up.pipe(res);
  }
}).listen(PORT, '127.0.0.1', () => console.log('Panel: http://127.0.0.1:' + PORT));
