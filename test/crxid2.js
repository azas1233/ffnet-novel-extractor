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
function findField(buf, start, end, targetField, expectWire, subField) {
  let off = start;
  while (off < end) {
    const [tag, o1] = getVarint(buf, off); off = o1;
    const fieldNo = tag >>> 3;
    const wire = tag & 0x7;
    if (wire === 0) { [, off] = getVarint(buf, off); }
    else if (wire === 1) off += 8;
    else if (wire === 2) {
      const [len, o2] = getVarint(buf, off); off = o2;
      const data = buf.slice(off, off + len); off += len;
      if (fieldNo === targetField && (expectWire == null || expectWire === 2)) {
        if (subField == null) return data;
        // recursive
        const v = findField(data, 0, data.length, subField, 2);
        if (v) return v;
      }
    } else if (wire === 5) off += 4;
  }
  return null;
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
const headerSize = buf.readUInt32LE(8);
const headerBuf = buf.slice(12, 12 + headerSize);
const pubKey = findField(headerBuf, 0, headerBuf.length, 2, 2, 1);
console.log(idFromPubKey(pubKey));
