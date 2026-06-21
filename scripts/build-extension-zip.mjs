// Build public/clearline-extension.zip from the extension/ folder.
//
// Runs automatically before every `npm run build` (via the "prebuild" script),
// so the "Download .zip" button on the dashboard always serves the *current*
// extension — locally and on Vercel. Zero dependencies (pure Node + zlib) so it
// works the same on Windows and on the Linux build runner.

import { deflateRawSync } from 'node:zlib';
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'extension');
const outFile = join(root, 'public', 'clearline-extension.zip');

// ── CRC32 ──────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── Collect files (recursively), zip paths use forward slashes ──────────────
function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

// DOS date/time (fixed, deterministic — keeps the zip byte-stable across builds)
const DOS_TIME = 0;
const DOS_DATE = (1980 - 1980) << 9 | 1 << 5 | 1; // 1980-01-01

const files = listFiles(srcDir).sort();
const locals = [];
const centrals = [];
let offset = 0;

for (const full of files) {
  const name = relative(srcDir, full).split('\\').join('/');
  const nameBuf = Buffer.from(name, 'utf8');
  const content = readFileSync(full);
  const crc = crc32(content);
  const compressed = deflateRawSync(content);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);            // version needed
  local.writeUInt16LE(0, 6);             // flags
  local.writeUInt16LE(8, 8);             // method: deflate
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);            // extra len
  locals.push(local, nameBuf, compressed);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);          // version made by
  central.writeUInt16LE(20, 6);          // version needed
  central.writeUInt16LE(0, 8);           // flags
  central.writeUInt16LE(8, 10);          // method
  central.writeUInt16LE(DOS_TIME, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt16LE(0, 30);          // extra field len
  central.writeUInt32LE(0, 38);          // external attrs
  central.writeUInt32LE(offset, 42);     // relative offset of local header
  centrals.push(central, nameBuf);

  offset += local.length + nameBuf.length + compressed.length;
}

const centralBuf = Buffer.concat(centrals);
const localBuf = Buffer.concat(locals);

const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(files.length, 8);     // entries on this disk
eocd.writeUInt16LE(files.length, 10);    // total entries
eocd.writeUInt32LE(centralBuf.length, 12);
eocd.writeUInt32LE(localBuf.length, 16); // central dir offset
eocd.writeUInt16LE(0, 20);               // comment len

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, Buffer.concat([localBuf, centralBuf, eocd]));
console.log(`[build-extension-zip] packed ${files.length} files -> ${relative(root, outFile)}`);
