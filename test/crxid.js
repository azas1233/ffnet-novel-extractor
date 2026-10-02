/**
 * 从 crx3 文件里取出公钥计算扩展 ID，并生成 Edge 信任注册表文件。
 *
 * CRX3 结构：
 *   0x00   4B magic "Cr24"
 *   0x04   4B version = 3 (LE)
 *   0x08   4B header_size (LE)
 *   0x0C   header_size bytes: SignedHeaderData (CrxFileHeader.pb)
 *   0x0C + header_size   rest: ZIP payload
 *
 * Protobuf 中 CrxFileHeader 里有 repeated CrxFileIdInfo.sha256_with_rsa = 1，
 * 每条含 public_key = 1 (bytes)。
 */
const fs = require('fs');
const crypto = require('crypto');

function getVarint(buf, offset) {
  let r = 0, shift = 0, b;
  do {
    b = buf[offset++];
    r |= (b & 0x7f) << shift;
    shift += 7;
  } while (b & 0x80);
  return [r, offset];
}

function parsePbMessage(buf, start, end) {
  // 返回 { field => [values...] }（bytes 字段用 Buffer，varint 用 number）
  const res = {};
  let off = start;
  while (off < end) {
    const [tag, o1] = getVarint(buf, off); off = o1;
    const fieldNo = tag >>> 3;
    const wire = tag & 0x7;
    let v;
    if (wire === 0) {
      [v, off] = getVarint(buf, off);
    } else if (wire === 1) {
      v = buf.slice(off, off + 8); off += 8;
    } else if (wire === 2) {
      const [len, o1] = getVarint(buf, off); off = o1;
      v = buf.slice(off, off + len); off += len;
    } else if (wire === 5) {
      v = buf.slice(off, off + 4); off += 4;
    } else {
      throw new Error('bad wire ' + wire);
    }
    (res[fieldNo] = res[fieldNo] || []).push(v);
  }
  return res;
}

function idFromPubKey(pubKeyBytes) {
  const digest = crypto.createHash('sha256').update(pubKeyBytes).digest();
  const alphabet = 'abcdefghijklmnop';
  let id = '';
  for (let i = 0; i < 16; i++) {
    const b = digest[i];
    id += alphabet[b >> 4] + alphabet[b & 0x0f];
  }
  return id;
}

const buf = fs.readFileSync(process.argv[2]);
const magic = buf.toString('ascii', 0, 4);
if (magic !== 'Cr24') { console.error('bad crx magic:', magic); process.exit(1); }
const version = buf.readUInt32LE(4);
const headerSize = buf.readUInt32LE(8);
if (version !== 3) { console.error('crx version != 3, got', version); process.exit(1); }
const headerBuf = buf.slice(12, 12 + headerSize);
const header = parsePbMessage(headerBuf, 0, headerBuf.length);

// 字段 sha256_with_rsa = 1，里面每条的 public_key = 1
let pubKey = null;
if (header[1]) {
  for (const sub of header[1]) {
    const subMsg = parsePbMessage(sub, 0, sub.length);
    if (subMsg[1]) { pubKey = subMsg[1][0]; break; }
  }
}
if (!pubKey) {
  console.error('pub key not found in crx header');
  process.exit(1);
}
const id = idFromPubKey(pubKey);
console.log(id);
