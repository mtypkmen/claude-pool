const assert = require('assert'), fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const code = src.slice(src.indexOf('const util ='), src.indexOf('const CC ='));
const mk = (name, h, d = 0) => ({ name, off: false, until: 0, last: 0, rl: { 'unified-5h-utilization': h, 'unified-7d-utilization': d } });
const accts = [mk('1', 0.36, 0.12), mk('2', 0.01, 0.8), mk('3', 0.61, 0.2)];
const env = new Function('accts', 'let cur = null;' + code + 'return { go() { const a = pick(new Set()); if (a !== cur) a.base = undefined; cur = a; return a.name; } };')(accts);
const set = (i, h) => accts[i].rl['unified-5h-utilization'] = h;

assert.equal(env.go(), '2');               // most 5h left, despite 80% weekly
assert.equal(env.go(), '2');
set(1, 0.10); assert.equal(env.go(), '2'); // +9 points: stay
set(1, 0.11); assert.equal(env.go(), '1'); // +10: move to the next lowest
env.go(); set(0, 0.46); assert.equal(env.go(), '2');
accts[1].rl['unified-7d-utilization'] = 0.99; assert.equal(env.go(), '1'); // full is skipped
accts[0].until = Date.now() + 1e6; assert.equal(env.go(), '3');            // cooldown is skipped
accts[2].rl = {}; assert.equal(env.go(), '3'); set(2, 0.5); assert.equal(env.go(), '3'); // no data: no instant switch
set(2, 0.02); env.go(); set(2, 0.11); assert.equal(env.go(), '3');         // window reset lowers base
console.log('ROTATION_TESTS_OK');
