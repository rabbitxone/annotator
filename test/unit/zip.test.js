import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crc32, zip } from '../../src/shared/zip.js';

const encode = (text) => new TextEncoder().encode(text);

// Reads the archive back through its central directory, the way an unzip tool does
function entries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out = {};
  for (let i = 0; i < count; i++) {
    assert.equal(view.getUint32(at, true), 0x02014b50);
    const [crc, size, nameLength, offset] = [view.getUint32(at + 16, true), view.getUint32(at + 20, true), view.getUint16(at + 28, true), view.getUint32(at + 42, true)];
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    assert.equal(view.getUint32(offset, true), 0x04034b50);
    const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
    const data = bytes.subarray(start, start + size);
    assert.equal(crc32(data), crc, `${name} has the checksum it says`);
    out[name] = new TextDecoder().decode(data);
    at += 46 + nameLength;
  }
  return out;
}

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(encode('123456789')), 0xcbf43926);
});

test('a zip holds the files at their paths, names in UTF-8', () => {
  const files = [
    { path: 'papers/a.html', bytes: encode('<p>one</p>') },
    { path: 'papers/podsumowanie/łódź.html', bytes: encode('<p>dwa — „cytat"</p>') },
    { path: 'empty.html', bytes: new Uint8Array(0) },
  ];
  assert.deepEqual(entries(zip(files)), {
    'papers/a.html': '<p>one</p>',
    'papers/podsumowanie/łódź.html': '<p>dwa — „cytat"</p>',
    'empty.html': '',
  });
});
