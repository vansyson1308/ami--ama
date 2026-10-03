// Report precache size (from the generated service worker manifest) and per-group totals.
import { readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const dist = 'dist';
const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
const urls = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]);
const groups = {};
let total = 0;
let gz = 0;
for (const u of urls) {
  const p = join(dist, u);
  const size = statSync(p).size;
  const g = u.includes('/') ? u.split('/')[0] : 'root';
  groups[g] = (groups[g] ?? 0) + size;
  total += size;
  gz += gzipSync(readFileSync(p)).length;
}
const mb = (b) => (b / 1e6).toFixed(2) + ' MB';
console.log(JSON.stringify({ entries: urls.length, precache: mb(total), precache_gzip_transfer_estimate: mb(gz),
  groups: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, mb(v)])) }, null, 1));
