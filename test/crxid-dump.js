const fs = require('fs');
function getVarint(buf, offset) {
  let r = 0, shift = 0, b;
  do {
    b = buf[offset++];
    r |= (b & 0x7f) << shift;
    shift += 7;
  } while (b & 0x80);
  return [r, offset];
}
function dumpPb(buf, start, end, depth = 0) {
  const pad = '  '.repeat(depth);
  let off = start;
  while (off < end) {
    const [tag, o1] = getVarint(buf, off); off = o1;
    const fieldNo = tag >>> 3;
    const wire = tag & 0x7;
    let v, len;
    if (wire === 0) { [v, off] = getVarint(buf, off); console.log(pad + `field ${fieldNo} varint=${v}`); }
    else if (wire === 2) { [len, off] = getVarint(buf, off); v = buf.slice(off, off + len); off += len;
      // 判断是否可递归
      let subOk = true;
      try {
        let o = 0;
        while (o < v.length) {
          const [tag2, o2] = getVarint(v, o); const w = tag2 & 0x7; const fn = tag2 >>> 3;
          if (fn === 0 || fn > 100 || w > 5) { subOk = false; break; }
          if (w === 2) { const [ll, o3] = getVarint(v, o2); if (ll < 0 || o3 + ll > v.length) { subOk = false; break; } o = o3 + ll; }
          else if (w === 0 || w === 5) o = o2 + (w === 5 ? 4 : 0);
          else if (w === 1) o = o2 + 8;
          else { subOk = false; break; }
        }
      } catch { subOk = false; }
      if (subOk && v.length > 0) {
        console.log(pad + `field ${fieldNo} (sub len=${v.length}):`);
        dumpPb(v, 0, v.length, depth + 1);
      } else {
        console.log(pad + `field ${fieldNo} bytes[${v.length}] head hex=${v.slice(0, 24).toString('hex')}`);
      }
    }
    else if (wire === 1) { v = buf.slice(off, off + 8); off += 8; console.log(pad + `field ${fieldNo} 64bit=${v.toString('hex')}`); }
    else if (wire === 5) { v = buf.slice(off, off + 4); off += 4; console.log(pad + `field ${fieldNo} 32bit=${v.toString('hex')}`); }
    else { console.log(pad + `field ${fieldNo} wire=${wire}??`); return; }
  }
}
const buf = fs.readFileSync(process.argv[2]);
console.log('magic:', buf.toString('ascii', 0, 4));
console.log('version:', buf.readUInt32LE(4));
const headerSize = buf.readUInt32LE(8);
console.log('header size:', headerSize);
const header = buf.slice(12, 12 + headerSize);
dumpPb(header, 0, header.length);
