const fs = require('fs'), path = require('path'), os = require('os');
const HOME = os.homedir(), CLAUDE = path.join(HOME, '.claude'), OUT = path.join(__dirname, 'knowledge.json');
const SKIP = new Set(['node_modules', '.git', '.obsidian', 'vendor', 'dist', 'build']);
const SECRET = /sk-ant-[\w-]{10,}|gh[pousr]_[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._~+\/-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----|(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S{6,}/gi;
const clean = t => t.replace(SECRET, '[redacted]');
const tilde = p => p.startsWith(HOME) ? '~' + p.slice(HOME.length).replace(/\\/g, '/') : p.replace(/\\/g, '/');
const read = f => { try { const s = fs.statSync(f); return s.isFile() && s.size < 400e3 ? fs.readFileSync(f, 'utf8') : null; } catch { return null; } };
const ls = d => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch { return []; } };
const front = t => {
  const m = t.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/), fm = m ? m[1] : '';
  const g = k => (fm.match(new RegExp('^\\s*' + k + ':\\s*(.+)$', 'm')) || [])[1]?.trim();
  return { body: m ? t.slice(m[0].length) : t, name: g('name'), description: g('description'), type: g('type') };
};
function walk(dir, out = [], depth = 0) {
  if (depth > 6) return out;
  for (const e of ls(dir)) {
    if (SKIP.has(e.name) || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out, depth + 1); else if (/\.md$/i.test(e.name)) out.push(p);
  }
  return out;
}

function build(cfg = {}) {
  let conf = {}; try { conf = JSON.parse(fs.readFileSync(path.join(__dirname, 'import.json'), 'utf8')); } catch {}
  const roots = [...(conf.roots || []), ...(cfg.roots || [])].map(r => path.resolve(r.replace(/^~/, HOME)));
  const coreCap = conf.coreCap || 16000, perCap = 3500, chunks = [], used = new Set();
  const add = (pri, label, file, text) => {
    if (!text || !text.trim()) return;
    used.add(path.resolve(file));
    const t = clean(text.trim());
    chunks.push({ pri, label, text: t.slice(0, perCap) + (t.length > perCap ? '\n…(truncated, read the file for the rest)' : '') });
  };
  const g = path.join(CLAUDE, 'CLAUDE.md'); add(1, tilde(g), g, read(g));
  for (const r of roots) { const f = path.join(r, 'CLAUDE.md'); add(2, tilde(f), f, read(f)); }
  for (const pr of ls(path.join(CLAUDE, 'projects')).filter(e => e.isDirectory())) {
    const dir = path.join(CLAUDE, 'projects', pr.name, 'memory');
    for (const e of ls(dir).filter(e => /\.md$/i.test(e.name) && e.name !== 'MEMORY.md')) {
      const f = path.join(dir, e.name), t = read(f); if (!t) continue;
      const m = front(t);
      add(m.type === 'user' ? 3 : m.type === 'feedback' ? 4 : 6, `memory (${m.type || 'note'}): ${m.name || e.name}`, f, (m.description ? m.description + '\n' : '') + m.body);
    }
  }
  for (const ag of ls(path.join(CLAUDE, 'agent-memory')).filter(e => e.isDirectory())) {
    const dir = path.join(CLAUDE, 'agent-memory', ag.name);
    for (const e of ls(dir).filter(e => /\.md$/i.test(e.name) && e.name !== 'MEMORY.md')) {
      const f = path.join(dir, e.name), t = read(f); if (!t) continue;
      const m = front(t); add(5, `agent memory (${ag.name}): ${m.name || e.name}`, f, (m.description ? m.description + '\n' : '') + m.body);
    }
  }
  const roster = [];
  for (const e of ls(path.join(CLAUDE, 'agents')).filter(e => /\.md$/i.test(e.name))) {
    const f = path.join(CLAUDE, 'agents', e.name), t = read(f); if (!t) continue;
    const m = front(t); used.add(path.resolve(f));
    roster.push(`- ${m.name || e.name.replace(/\.md$/i, '')}: ${(m.description || '').slice(0, 200)} (${tilde(f)})`);
  }
  if (roster.length) chunks.push({ pri: 7, label: 'your agents', text: roster.join('\n') });

  chunks.sort((a, b) => a.pri - b.pri);
  let total = 0, dropped = 0; const keep = [];
  for (const c of chunks) { if (total + c.text.length > coreCap) { dropped++; continue; } total += c.text.length; keep.push(c); }

  const byDir = new Map(); let indexed = 0;
  for (const r of roots) for (const f of walk(r)) {
    if (used.has(path.resolve(f))) continue;
    const d = tilde(path.dirname(f)); (byDir.get(d) || byDir.set(d, []).get(d)).push(path.basename(f)); indexed++;
  }
  let index = '';
  for (const [d, names] of [...byDir].sort()) {
    const line = `- ${d}/ (${names.length}): ${names.slice(0, 6).join(', ')}${names.length > 6 ? ', …' : ''}\n`;
    if (index.length + line.length > 4500) { index += '- …(more folders, use Glob to explore)\n'; break; }
    index += line;
  }
  if (index) index = 'Notes and documents on disk. Read them with the Read tool when a task needs them:\n' + index.trim();
  return { built: new Date().toISOString(), roots: roots.length, chunks: keep, index, stats: { files: keep.length, dropped, indexed, chars: total } };
}

const write = (file = OUT, cfg) => { const k = build(cfg); fs.writeFileSync(file, JSON.stringify(k, null, 1)); return k.stats; };
module.exports = { build, write };

if (require.main === module) {
  const s = write(OUT, { roots: process.argv.slice(2) });
  console.log(`knowledge.json written: ${s.files} files in context (${s.chars} chars), ${s.indexed} more indexed${s.dropped ? `, ${s.dropped} skipped for size` : ''}`);
}
