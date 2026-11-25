const { gsap, ScrollTrigger, Lenis } = window;
gsap.registerPlugin(ScrollTrigger);
const $ = id => document.getElementById(id);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
const DEMO = location.search.includes('demo');
history.scrollRestoration = 'manual';
const PAL = [
  { body: '#3d6bff', ring: '#9fb0ff', glow: '#66e8ff', css: ['#3d4bff', '#66e8ff'] },
  { body: '#dd7b59', ring: '#ffb08a', glow: '#ff8a5c', css: ['#ff5a3c', '#ffb36b'] },
  { body: '#a77bff', ring: '#d0b8ff', glow: '#b08cff', css: ['#8a5cff', '#d0b8ff'] },
  { body: '#2fcf8a', ring: '#9af0c8', glow: '#46e0a0', css: ['#17b17a', '#7be8b8'] },
  { body: '#ff5fa8', ring: '#ffb3d6', glow: '#ff7fbc', css: ['#e83d8e', '#ffb3d6'] },
  { body: '#f2b632', ring: '#ffe08a', glow: '#ffcc55', css: ['#e5a100', '#ffe08a'] },
  { body: '#22c7e8', ring: '#9be9f7', glow: '#4fd8f2', css: ['#0fb0d3', '#9be9f7'] },
  { body: '#ef4444', ring: '#ffa8a8', glow: '#ff6b6b', css: ['#d92d2d', '#ffa8a8'] },
  { body: '#8fd62b', ring: '#d3f59a', glow: '#a9e65a', css: ['#74b81a', '#d3f59a'] },
  { body: '#7a8ba8', ring: '#c2cde0', glow: '#9aabc6', css: ['#5f7191', '#c2cde0'] },
];

let lenis = null;
if (!reduce) {
  lenis = new Lenis({ lerp: 0.085 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(t => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

const mouse = { x: innerWidth / 2, y: innerHeight / 2 };
addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
const RC = 2 * Math.PI * 46;
const LAYERS = 14;

function mascot(i) {
  const p = PAL[i % PAL.length];
  const root = document.createElement('div');
  root.className = 'mascot';
  root.style.setProperty('--c', p.body); root.style.setProperty('--ring', p.ring); root.style.setProperty('--glow', p.glow);
  root.innerHTML = `<div class="glow"></div>
    <svg class="ring" viewBox="0 0 100 100" aria-hidden="true"><circle class="tr" cx="50" cy="50" r="46"/>
      <circle class="pg" cx="50" cy="50" r="46" stroke-dasharray="${RC}" stroke-dashoffset="${RC}"/></svg>
    <div class="shadow"></div>
    <div class="float"><div class="hop"><div class="m3d">
      ${Array.from({ length: LAYERS }, (_, k) => `<i class="ly" style="--k:${k}"></i>`).join('')}<i class="ly sheen"></i>
    </div></div></div>`;
  const m = { root, p, rx: 0, ry: 0, pg: root.querySelector('.pg'), hop: root.querySelector('.hop'), m3d: root.querySelector('.m3d'), float: root.querySelector('.float') };
  new ResizeObserver(([e]) => m.m3d.style.setProperty('--u', e.contentRect.width / 100 + 'px')).observe(m.m3d);
  m.set = (frac, low, off) => {
    m.pg.style.strokeDashoffset = RC * (1 - frac);
    root.style.setProperty('--ring', low ? '#ff3d5a' : p.ring);
    root.classList.toggle('off', off);
  };
  m.pulse = () => {
    m.hop.classList.remove('go'); void m.hop.offsetWidth; m.hop.classList.add('go');
    root.classList.add('flash'); setTimeout(() => root.classList.remove('flash'), 600);
  };
  return m;
}

gsap.ticker.add(() => {
  for (const a of accs.values()) {
    const m = a.mascot;
    if (!m.root.isConnected) continue;
    const r = m.root.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) continue;
    const ty = clamp((mouse.x - (r.left + r.width / 2)) / (innerWidth / 2), -1, 1) * 34;
    const tx = -clamp((mouse.y - (r.top + r.height / 2)) / (innerHeight / 2), -1, 1) * 24;
    m.ry += (ty - m.ry) * .12; m.rx += (tx - m.rx) * .12;
    m.m3d.style.setProperty('--rx', m.rx.toFixed(2) + 'deg'); m.m3d.style.setProperty('--ry', m.ry.toFixed(2) + 'deg');
  }
});

const accs = new Map(), rows = new Map();
let first = true, feedCount = -1;
const T0 = Date.now();
let demoReqs = [41, 67];

function fake() {
  const now = Date.now();
  demoReqs = demoReqs.map(v => v + (Math.random() < .3 ? 1 : 0));
  const mk = (name, u5, u7, i, inT, outT, cacheT) => ({ name, reqs: demoReqs[i], limited: i ? 2 : 0, until: 0, off: false, status: 200, inTok: inT, outTok: outT, cacheTok: cacheT,
    rl: { 'unified-5h-utilization': String(u5), 'unified-5h-reset': String(Math.round(now / 1000) + 8400), 'unified-7d-utilization': String(u7), 'unified-7d-reset': String(Math.round(now / 1000) + 4 * 86400) } });
  const prompts = ['Make this function async and handle the error cases', 'Redesign the panel and build the mascot from the logo', 'Write the setup steps for the README', 'Why are the tests failing? Here is the log', 'Check the migration file'];
  const l = prompts.map((p, i) => ({ t: T0 - i * 47000, acct: i % 2 ? 'Account 2' : 'Account 1', model: 'claude-sonnet-4-5', prompt: p, status: 200, in: 2400 + i * 310, out: 380 + i * 90, cache: i ? 1800 : 0 }));
  return [[mk('Account 1', .34, .18, 0, 118e6, 34e6, 2.25e9), mk('Account 2', .88, .61, 1, 2.1e7, 6e6, 2.8e8)], l];
}

function left(sec) {
  if (sec <= 0) return 'now';
  const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}
const remPct = v => v === undefined ? null : clamp(Math.round((1 - +v) * 100), 0, 100);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };

const fmtTok = n => n >= 1e9 ? +(n / 1e9).toFixed(1) + 'b' : n >= 1e6 ? +(n / 1e6).toFixed(1) + 'm' : n >= 1e3 ? +(n / 1e3).toFixed(1) + 'k' : String(n);
const TOK = ['#c9ccd6', '#ddd2ff', '#b79cff', '#8b5cf6', '#5b21b6', '#3b0f7a'];
function tokColor(n) {
  const t = clamp((Math.log10(Math.max(n, 1)) - 5) / 6, 0, 1), s = t * (TOK.length - 1), i = Math.min(TOK.length - 2, Math.floor(s));
  return { bg: gsap.utils.interpolate(TOK[i], TOK[i + 1], s - i), dark: t > .5 };
}

function build(x, i) {
  const p = PAL[i % PAL.length], a = { i, num: { v: 0 }, numT: null, reqs: 0, bt: {}, bl: {}, bf: {}, bv: {}, br: {}, entered: false };
  const col = el('article', 'col');
  col.innerHTML = `<div class="slot"></div>
    <div class="nm"><h3></h3><span class="pill"></span></div>
    <div class="big"><span class="n">–</span><sup>%</sup></div>
    <p class="cap">session limit left</p><p class="rs"></p>
    <div class="chips"></div><div class="acts"><button class="btn stop"><span>Disable</span></button><button class="mgbtn" aria-label="Manage account" title="Remove / refresh auth">⋯</button></div>`;
  a.mascot = mascot(i); col.querySelector('.slot').append(a.mascot.root);
  col.querySelector('h3').textContent = x.name;
  $('cols').append(col);
  Object.assign(a, { col, n: col.querySelector('.n'), pill: col.querySelector('.pill'), rs: col.querySelector('.rs'), chips: col.querySelector('.chips'), btn: col.querySelector('.btn'), color: p.css[0] });
  a.btn.onclick = () => fetch('/_t/' + encodeURIComponent(x.name), { method: 'POST' }).then(poll);
  col.querySelector('.mgbtn').onclick = () => { manage = x.name; $('mngt').textContent = x.name; $('mng').showModal(); };
  const row = el('div', 'wrow');
  row.style.setProperty('--c1', p.css[0]); row.style.setProperty('--c2', p.css[1]);
  const who = el('div', 'wl'), nm = el('div', 'wname'); nm.append(el('i'), x.name);
  a.tok = el('span', 'tok', 'Total Token = 0'); who.append(nm, a.tok);
  const bars = el('div');
  for (const [k, t] of [['5h', 'Session · 5 hours'], ['7d', 'Weekly limit']]) {
    const b = el('div', 'bar'); b.dataset.k = k;
    const bl = el('div', 'bl'); bl.append(el('span', '', t)); a.bv[k] = el('b', '', '–'); bl.append(a.bv[k]);
    const bt = el('div', 'bt'); a.bf[k] = el('i', 'bf'); bt.append(a.bf[k]);
    a.br[k] = el('small');
    b.append(bl, bt, a.br[k]); bars.append(b);
  }
  row.append(who, bars); $('wrows').append(row);
  a.row = row;
  ScrollTrigger.create({ trigger: row, start: 'top 85%', once: true, onEnter: () => gate.then(() => { a.entered = true; applyBars(a); }) });
  accs.set(x.name, a);
  return a;
}

function applyBars(a) {
  for (const k of ['5h', '7d']) {
    const t = a.bt[k];
    if (t !== a.bl[k]) { a.bl[k] = t; gsap.to(a.bf[k], { width: (t ?? 0) + '%', duration: 1.6, ease: 'power3.out' }); }
  }
}

function update(a, x) {
  const now = Date.now() / 1000, rl = x.rl;
  const r5 = remPct(rl['unified-5h-utilization']), r7 = remPct(rl['unified-7d-utilization']);
  if (r5 !== a.numT) {
    a.numT = r5;
    if (r5 === null) a.n.textContent = '–';
    else gsap.to(a.num, { v: r5, duration: 1.6, ease: 'power3.out', onUpdate: () => { a.n.textContent = Math.round(a.num.v); } });
  }
  const t5 = rl['unified-5h-reset'], t7 = rl['unified-7d-reset'];
  a.rs.textContent = r5 === null ? 'Limit info appears after the first successful request.' : t5 ? `Resets in ${left(Math.round(t5 - now))}` : '';
  a.bt['5h'] = r5; a.bt['7d'] = r7;
  a.bv['5h'].textContent = r5 === null ? '–' : `${r5}% left`; a.bv['7d'].textContent = r7 === null ? '–' : `${r7}% left`;
  a.br['5h'].textContent = t5 ? `Resets in ${left(Math.round(t5 - now))}` : '';
  a.br['7d'].textContent = t7 ? `Resets in ${left(Math.round(t7 - now))}` : '';
  if (a.entered) applyBars(a);
  const total = x.inTok + x.outTok + x.cacheTok, tc = tokColor(total);
  a.tok.textContent = 'Total Token = ' + fmtTok(total);
  a.tok.style.background = tc.bg; a.tok.style.color = tc.dark ? '#fff' : '#1b1730';
  const limited = x.until > Date.now();
  a.pill.textContent = x.off ? 'Disabled' : limited ? `Rate limited · ${Math.ceil((x.until - Date.now()) / 1000)}s` : 'Active';
  a.pill.className = 'pill' + (x.off || limited ? ' bad' : '');
  a.chips.replaceChildren(...[['Requests', x.reqs], ['429', x.limited]].map(([k, v]) => {
    const c = el('span', 'chip', k); c.append(el('b', '', v.toLocaleString('en-US'))); return c; }));
  a.btn.className = 'btn ' + (x.off ? 'go' : 'stop'); a.btn.firstChild.textContent = x.off ? 'Enable' : 'Disable';
  a.mascot.set(r5 === null ? 0 : r5 / 100, r5 !== null && r5 <= 15, x.off);
  if (!first && x.reqs > a.reqs) a.mascot.pulse();
  a.reqs = x.reqs;
}

function feed(l) {
  const keys = new Set(l.map(e => e.t + '|' + e.acct));
  for (const [k, r] of rows) if (!keys.has(k)) { r.remove(); rows.delete(k); }
  const fresh = [];
  for (const e of [...l].reverse()) {
    const k = e.t + '|' + e.acct;
    let r = rows.get(k);
    if (!r) {
      r = el('div', 'fr'); r._c = {};
      for (const [n, cls] of [['t', 't'], ['a', 'a'], ['m', 'm'], ['s', 's'], ['k', 'k'], ['p', 'p']]) { r._c[n] = el('span', cls); r.append(r._c[n]); }
      rows.set(k, r); $('f').prepend(r); fresh.push(r);
    }
    const q = r._c;
    q.t.textContent = new Date(e.t).toLocaleTimeString('en-US');
    q.a.textContent = e.acct; q.a.style.setProperty('--c', accs.get(e.acct)?.color || '#9aa0c8');
    q.m.textContent = e.model || '–';
    q.s.textContent = e.status === '...' ? 'pending' : e.status; q.s.className = 's ' + (e.status === '...' ? 'wait' : e.status == 200 ? 'ok' : 'bad');
    q.k.textContent = `${e.in} / ${e.out}` + (e.cache ? ` · cache ${e.cache}` : '');
    q.p.textContent = e.err ? 'Error: ' + e.err : (e.prompt || '–');
  }
  $('empty').hidden = l.length > 0;
  if (!first && fresh.length) gsap.from(fresh, { y: -30, opacity: 0, duration: .8, ease: 'expo.out', stagger: .06 });
  if (l.length !== feedCount) { feedCount = l.length; clearTimeout(feed.t); feed.t = setTimeout(() => ScrollTrigger.refresh(), 500); }
}

const fakeMem = () => ({ on: true, notes: [
  { t: T0 - 5 * 3600e3, acct: 'Account 1', text: 'Restart the proxy after editing server.js, it only reads the file at startup.' },
  { t: T0 - 2 * 3600e3, acct: 'Account 2', text: 'Compile with make; the project has no npm build script.', fixed: true },
  { t: T0 - 20 * 60e3, acct: 'Account 1', text: 'Run node --check on app.js before reloading the panel.' }] });

const noteEls = new Map();
function memory(m) {
  const keys = new Set(m.notes.map(n => n.t));
  for (const [k, e] of noteEls) if (!keys.has(k)) { e.remove(); noteEls.delete(k); }
  for (const n of m.notes) {
    if (noteEls.has(n.t)) continue;
    const e = el('div', 'note'), d = el('button', '', '×');
    d.setAttribute('aria-label', 'Delete note'); d.onclick = () => fetch('/_m/del/' + n.t, { method: 'POST' }).then(poll);
    e.append(el('span', '', n.text), el('small', '', `${n.acct} · ${new Date(n.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${n.fixed ? ' · corrected' : ''}`), d);
    noteEls.set(n.t, e); $('notes').prepend(e);
    if (!first) gsap.from(e, { y: -20, opacity: 0, duration: .7, ease: 'expo.out' });
  }
  $('nonotes').hidden = m.notes.length > 0;
  const b = $('memtoggle'); b.className = 'btn ' + (m.on ? 'stop' : 'go'); b.firstChild.textContent = m.on ? 'Pause memory' : 'Resume memory';
  document.querySelector('.memsec').classList.toggle('off', !m.on);
}
$('memtoggle').onclick = () => fetch('/_m/toggle', { method: 'POST' }).then(poll);
function know(k) {
  $('knowinfo').textContent = k.stats
    ? `Imported from your files: ${k.stats.files} documents in context, ${k.stats.indexed} more indexed. Last scan ${new Date(k.built).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}.`
    : 'No files imported yet. Add folders to import.json and re-scan.';
}
$('rescan').onclick = () => fetch('/_k/refresh', { method: 'POST' }).then(poll);

let manage = '';
const act = p => () => { $('mng').close(); if (!DEMO) fetch(p + encodeURIComponent(manage), { method: 'POST' }).then(poll); };
$('mrm').onclick = act('/_rm/'); $('mre').onclick = act('/_re/'); $('mcx').onclick = () => $('mng').close();

let addN = 0;
$('add').onclick = () => { $('add').disabled = true; $('add').textContent = 'Sign in via browser…'; fetch('/_add', { method: 'POST' }); };

async function poll() {
  try {
    const [s, l] = DEMO ? fake() : await Promise.all([fetch('/_s').then(r => r.json()), fetch('/_l').then(r => r.json())]);
    const m = DEMO ? fakeMem() : await fetch('/_m').then(r => r.json());
    const kn = DEMO ? { built: new Date(T0).toISOString(), stats: { files: 10, indexed: 240 } } : await fetch('/_k').then(r => r.json());
    for (const [n, a] of accs) if (!s.some(x => x.name === n)) { a.col.remove(); a.row.remove(); accs.delete(n); addN = s.length; }
    s.forEach((x, i) => update(accs.get(x.name) || build(x, i), x));
    $('cols').style.setProperty('--n', Math.min(s.length, 4)); $('wrows').style.setProperty('--n', s.length);
    if (s.length > addN) { addN = s.length; $('add').disabled = false; $('add').textContent = '+ Acc'; }
    const active = s.filter(x => !x.off && x.until < Date.now()).length;
    $('live').textContent = `${active} active`;
    feed(l);
    memory(m); know(kn);
    $('toast').hidden = true;
  } catch (e) { console.warn(e); $('toast').hidden = false; }
  first = false;
}

function split(h) {
  const lines = h.textContent.split('|');
  h.setAttribute('aria-label', lines.join(' ')); h.textContent = '';
  for (const ln of lines) {
    const L = el('span', 'ln'); L.setAttribute('aria-hidden', 'true');
    for (const w of ln.trim().split(' ')) { const m = el('span', 'w'); m.append(el('span', '', w)); L.append(m, ' '); }
    h.append(L);
  }
  return $$('.w>span', h);
}

let openGate;
const gate = new Promise(r => { openGate = r; });
const onSee = (trigger, start, fn) => ScrollTrigger.create({ trigger, start, once: true, onEnter: () => gate.then(fn) });

function initScroll() {
  $$('h2[data-split]').forEach(h => {
    const w = split(h); gsap.set(w, { yPercent: 115 });
    onSee(h, 'top 92%', () => gsap.to(w, { yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: .08 }));
  });
  gsap.set('.col', { y: 90, opacity: 0 }); gsap.set('.col .hop', { scale: 0 });
  onSee('#cols', 'top 95%', () => {
    gsap.to('.col', { y: 0, opacity: 1, duration: 1, ease: 'expo.out', stagger: .12 });
    gsap.to('.col .hop', { scale: 1, duration: 1.4, ease: 'elastic.out(1,.55)', stagger: .12, delay: .15 });
  });
  gsap.fromTo('.mark', { xPercent: 10 }, { xPercent: -14, ease: 'none', scrollTrigger: { trigger: 'footer', start: 'top bottom', end: 'bottom bottom', scrub: true } });
  gsap.set('.fr', { y: 50, opacity: 0 });
  onSee('#f', 'top 85%', () => gsap.to('.fr', { y: 0, opacity: 1, duration: 1, ease: 'expo.out', stagger: .07 }));
}

function cursor() {
  if (matchMedia('(pointer:coarse)').matches) return;
  const c = $('cur'), qx = gsap.quickTo(c, 'x', { duration: .25, ease: 'power3' }), qy = gsap.quickTo(c, 'y', { duration: .25, ease: 'power3' });
  addEventListener('pointermove', e => { c.classList.add('on'); qx(e.clientX); qy(e.clientY); });
  document.addEventListener('pointerover', e => c.classList.toggle('big', !!e.target.closest('button,.fr .p')));
}

const finish = tl => new Promise(r => tl.eventCallback('onComplete', r));

function sunlight() {
  const wrap = el('div', 'sun'), bloom = el('i', 'bloom'), core = el('i', 'core'), wave = el('i', 'wave');
  const beams = alpha => {
    const st = []; let a = 0;
    while (a < 360) {
      const gap = 3 + Math.random() * 9, w = .5 + Math.random() * 2.3, al = alpha * (.35 + Math.random() * .65), g = 120 + Math.floor(Math.random() * 70);
      st.push(`transparent ${a}deg ${a + gap}deg`, `rgba(255,${g},60,${al.toFixed(2)}) ${a + gap}deg ${a + gap + w}deg`); a += gap + w;
    }
    const b = el('i', 'beams'); b.style.background = `conic-gradient(from ${Math.random() * 360}deg,${st.join(',')},transparent ${a}deg 720deg)`; return b;
  };
  const b1 = beams(.95), b2 = beams(.6);
  wrap.append(bloom, b1, b2, core, wave);
  const halo = (blur, scale, z, bg) => {
    const h = el('div', 'halo'), s = el('i', 'hs'); s.style.background = bg;
    h.style.cssText = `filter:blur(${blur}px);transform:translateZ(calc(var(--u) * ${z})) scale(${scale})`; h.append(s); return h;
  };
  const halos = [halo(10, 1.1, -10, 'radial-gradient(ellipse at 50% 45%,#fff0c4 0,#ffb257 55%,#ff7a33 100%)'), halo(34, 1.3, -16, '#ff8a3d')];
  return { wrap, beams: [b1, b2], core, wave, halos };
}

async function preloader(ready) {
  const pre = $('pre');
  if (reduce) { await ready; pre.remove(); return { open: () => gsap.timeline() }; }
  const stage = $('pstage');
  const mk = i => { const w = el('div', 'pm'), m = mascot(i); m.root.classList.add('bare'); w.append(m.root); stage.append(w); return { w, m }; };
  const blue = mk(0), orange = mk(1), sun = sunlight();
  orange.m.root.prepend(sun.wrap);
  sun.halos.forEach(h => orange.m.m3d.prepend(h));
  const gap = Math.min(innerWidth * .34, 360) * .8, cnt = $('cnt'), bar = pre.querySelector('.pre-line i'), cv = { v: 0 };
  gsap.set(blue.w, { x: -innerWidth * .75 }); gsap.set(orange.w, { x: innerWidth * .75 });
  gsap.set(blue.m.hop, { rotationY: 24 }); gsap.set(orange.m.hop, { rotationY: -24 });
  const bobs = [blue, orange].map((c, i) => gsap.to(c.m.hop, { y: -16, rotation: i ? -3 : 3, duration: .2, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
  const walk = gsap.timeline()
    .to(blue.w, { x: -gap / 2, duration: 1.5, ease: 'power2.out' }, 0)
    .to(orange.w, { x: gap / 2, duration: 1.5, ease: 'power2.out' }, 0)
    .to(cv, { v: 100, duration: 1.5, ease: 'power2.inOut', onUpdate() { cnt.textContent = String(Math.round(cv.v)).padStart(3, '0'); bar.style.width = cv.v + '%'; } }, 0);
  await Promise.all([finish(walk), ready]);

  bobs.forEach(b => b.kill());
  const mix = gsap.utils.interpolate(PAL[0].body, PAL[1].body), ct = { t: 0 };
  const merge = gsap.timeline()
    .to([blue.m.hop, orange.m.hop], { y: 0, rotation: 0, rotationY: 0, duration: .4, ease: 'power2.in' }, 0)
    .to(blue.w, { x: 0, duration: .4, ease: 'power4.in' }, 0)
    .to(orange.w, { x: 0, duration: .4, ease: 'power4.in' }, 0)
    .to(ct, { t: 1, duration: .15, onUpdate: () => blue.m.root.style.setProperty('--c', mix(ct.t)) }, .4)
    .set(blue.w, { autoAlpha: 0 }, .55)
    .fromTo(orange.w, { scale: 1 }, { scale: 1.25, duration: .1, ease: 'power2.out' }, .4)
    .to(orange.w, { scale: 1, duration: .35, ease: 'back.out(2)' }, .5)
    .fromTo(sun.wrap, { opacity: 0, scale: .55 }, { opacity: 1, scale: 1, duration: .55, ease: 'power3.out' }, .4)
    .fromTo(sun.core, { scale: .3 }, { scale: 1.2, duration: .5, ease: 'power2.out' }, .4)
    .fromTo(sun.wave, { scale: .5, opacity: .9 }, { scale: 2.4, opacity: 0, duration: .7, ease: 'power2.out' }, .4)
    .fromTo(sun.halos, { opacity: 0 }, { opacity: i => i ? .55 : .9, duration: .2 }, .4)
    .to(sun.beams[0], { rotation: 35, duration: 3, ease: 'none' }, .4)
    .to(sun.beams[1], { rotation: -28, duration: 3, ease: 'none' }, .4)
    .call(() => gsap.to(sun.beams, { opacity: 'random(.6,1)', duration: .16, repeat: -1, repeatRefresh: true, ease: 'none' }), [], .55);
  await new Promise(r => merge.call(r, [], .8));
  return { open: () => gsap.timeline()
    .to([cnt, '.pre-top', '.pre-line'], { opacity: 0, duration: .25, ease: 'power2.in' }, 0)
    .to(orange.w, { scale: 1.5, opacity: 0, duration: .35, ease: 'power2.in' }, 0)
    .to('.pre-bg.l', { xPercent: -101, duration: .8, ease: 'expo.inOut' }, .1)
    .to('.pre-bg.r', { xPercent: 101, duration: .8, ease: 'expo.inOut' }, .1) };
}

async function boot() {
  scrollTo(0, 0); lenis?.stop(); cursor();
  const slow = new URLSearchParams(location.search).get('slow');
  if (DEMO && slow) gsap.globalTimeline.timeScale(+slow || .25);
  const ready = Promise.all([document.fonts.ready.catch(() => {}), poll()]);
  const pre = await preloader(ready);
  initScroll();
  ScrollTrigger.refresh();
  gsap.timeline()
    .add(pre.open())
    .add(() => openGate(), '<.15')
    .add(() => { $('pre')?.remove(); lenis?.start(); });
  setInterval(poll, 2000);
}
boot();
