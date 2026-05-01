/**
 * Pure Node.js ZIP file creator using built-in zlib module.
 * Implements ZIP 2.0 specification (DEFLATE compression).
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  const table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      t[i] = c;
    }
    return t;
  })();

  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function writeUInt16LE(buf, val, offset) {
  buf[offset] = val & 0xFF;
  buf[offset + 1] = (val >> 8) & 0xFF;
}

function writeUInt32LE(buf, val, offset) {
  buf[offset] = val & 0xFF;
  buf[offset + 1] = (val >> 8) & 0xFF;
  buf[offset + 2] = (val >> 16) & 0xFF;
  buf[offset + 3] = (val >> 24) & 0xFF;
}

/**
 * Create a ZIP buffer from an array of { name, data } objects.
 * @param {Array<{name: string, data: Buffer}>} files
 * @returns {Buffer}
 */
function createZip(files) {
  const localFileData = [];
  const centralDirEntries = [];
  let offset = 0;

  // DOS date/time for 2026-03-27
  const dosDate = ((2026 - 1980) << 9) | (3 << 5) | 27; // year, month, day
  const dosTime = (17 << 11) | (8 << 5) | 0; // 17:08:00

  for (const file of files) {
    const nameBuffer = Buffer.from(file.name, 'utf8');
    const fileData = file.data;

    // Compress with deflate
    const compressedData = zlib.deflateRawSync(fileData, { level: 6 });

    // Use compressed only if smaller
    const useCompressed = compressedData.length < fileData.length;
    const storedData = useCompressed ? compressedData : fileData;
    const compressionMethod = useCompressed ? 8 : 0; // DEFLATE or STORE

    const crc = crc32(fileData);
    const uncompressedSize = fileData.length;
    const compressedSize = storedData.length;

    // Local file header (30 bytes + name)
    const localHeader = Buffer.alloc(30 + nameBuffer.length);
    writeUInt32LE(localHeader, 0x04034b50, 0);  // signature
    writeUInt16LE(localHeader, 20, 4);           // version needed
    writeUInt16LE(localHeader, 0, 6);            // flags
    writeUInt16LE(localHeader, compressionMethod, 8);
    writeUInt16LE(localHeader, dosTime, 10);
    writeUInt16LE(localHeader, dosDate, 12);
    writeUInt32LE(localHeader, crc, 14);
    writeUInt32LE(localHeader, compressedSize, 18);
    writeUInt32LE(localHeader, uncompressedSize, 22);
    writeUInt16LE(localHeader, nameBuffer.length, 26);
    writeUInt16LE(localHeader, 0, 28);           // extra field length
    nameBuffer.copy(localHeader, 30);

    localFileData.push(localHeader, storedData);

    // Central directory entry (46 bytes + name)
    const centralEntry = Buffer.alloc(46 + nameBuffer.length);
    writeUInt32LE(centralEntry, 0x02014b50, 0);  // signature
    writeUInt16LE(centralEntry, 20, 4);           // version made by
    writeUInt16LE(centralEntry, 20, 6);           // version needed
    writeUInt16LE(centralEntry, 0, 8);            // flags
    writeUInt16LE(centralEntry, compressionMethod, 10);
    writeUInt16LE(centralEntry, dosTime, 12);
    writeUInt16LE(centralEntry, dosDate, 14);
    writeUInt32LE(centralEntry, crc, 18);
    writeUInt32LE(centralEntry, compressedSize, 22);
    writeUInt32LE(centralEntry, uncompressedSize, 26);
    writeUInt16LE(centralEntry, nameBuffer.length, 30);
    writeUInt16LE(centralEntry, 0, 32);           // extra field length
    writeUInt16LE(centralEntry, 0, 34);           // file comment length
    writeUInt16LE(centralEntry, 0, 36);           // disk number start
    writeUInt16LE(centralEntry, 0, 38);           // internal attributes
    writeUInt32LE(centralEntry, 0, 40);           // external attributes
    writeUInt32LE(centralEntry, offset, 42);      // local header offset
    nameBuffer.copy(centralEntry, 46);

    centralDirEntries.push(centralEntry);
    offset += localHeader.length + storedData.length;
  }

  const centralDir = Buffer.concat(centralDirEntries);
  const centralDirOffset = offset;
  const centralDirSize = centralDir.length;

  // End of central directory (22 bytes)
  const eocd = Buffer.alloc(22);
  writeUInt32LE(eocd, 0x06054b50, 0);           // signature
  writeUInt16LE(eocd, 0, 4);                     // disk number
  writeUInt16LE(eocd, 0, 6);                     // start disk
  writeUInt16LE(eocd, files.length, 8);          // entries on disk
  writeUInt16LE(eocd, files.length, 10);         // total entries
  writeUInt32LE(eocd, centralDirSize, 12);       // central dir size
  writeUInt32LE(eocd, centralDirOffset, 16);     // central dir offset
  writeUInt16LE(eocd, 0, 20);                    // comment length

  return Buffer.concat([...localFileData, centralDir, eocd]);
}

module.exports = { createZip };
