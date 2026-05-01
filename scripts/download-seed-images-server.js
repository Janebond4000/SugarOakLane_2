#!/usr/bin/env node
/**
 * Server-side image downloader for Sugar Oak Lane seed products.
 * Downloads 70 images, creates a zip, uploads to R2, returns the URL.
 * Designed to run on the Render deployment where internet access is available.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');

// ========================
// ZIP IMPLEMENTATION
// ========================
function crc32(buf) {
  const table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })();
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function wu16(b, v, o) { b[o] = v & 0xFF; b[o+1] = (v >> 8) & 0xFF; }
function wu32(b, v, o) { b[o] = v & 0xFF; b[o+1] = (v >> 8) & 0xFF; b[o+2] = (v >> 16) & 0xFF; b[o+3] = (v >> 24) & 0xFF; }

function createZip(files) {
  const localData = [];
  const central = [];
  let offset = 0;

  const dosDate = ((2026 - 1980) << 9) | (3 << 5) | 27;
  const dosTime = (17 << 11) | (8 << 5) | 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const compressed = zlib.deflateRawSync(file.data, { level: 6 });
    const useDeflate = compressed.length < file.data.length;
    const stored = useDeflate ? compressed : file.data;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(file.data);

    const lh = Buffer.alloc(30 + nameBuf.length);
    wu32(lh, 0x04034b50, 0); wu16(lh, 20, 4); wu16(lh, 0, 6); wu16(lh, method, 8);
    wu16(lh, dosTime, 10); wu16(lh, dosDate, 12); wu32(lh, crc, 14);
    wu32(lh, stored.length, 18); wu32(lh, file.data.length, 22);
    wu16(lh, nameBuf.length, 26); wu16(lh, 0, 28);
    nameBuf.copy(lh, 30);

    localData.push(lh, stored);

    const ce = Buffer.alloc(46 + nameBuf.length);
    wu32(ce, 0x02014b50, 0); wu16(ce, 20, 4); wu16(ce, 20, 6); wu16(ce, 0, 8);
    wu16(ce, method, 10); wu16(ce, dosTime, 12); wu16(ce, dosDate, 14); wu32(ce, crc, 18);
    wu32(ce, stored.length, 22); wu32(ce, file.data.length, 26);
    wu16(ce, nameBuf.length, 30); wu16(ce, 0, 32); wu16(ce, 0, 34); wu16(ce, 0, 36);
    wu16(ce, 0, 38); wu32(ce, 0, 40); wu32(ce, offset, 42);
    nameBuf.copy(ce, 46);

    central.push(ce);
    offset += lh.length + stored.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  wu32(eocd, 0x06054b50, 0); wu16(eocd, 0, 4); wu16(eocd, 0, 6);
  wu16(eocd, files.length, 8); wu16(eocd, files.length, 10);
  wu32(eocd, centralBuf.length, 12); wu32(eocd, offset, 16); wu16(eocd, 0, 20);

  return Buffer.concat([...localData, centralBuf, eocd]);
}

// ========================
// DOWNLOAD HELPER
// ========================
function downloadToBuffer(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects === 0) return reject(new Error('Too many redirects'));
    const urlObj = new URL(url);
    const proto = urlObj.protocol === 'https:' ? https : http;
    const opts = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*,*/*;q=0.8',
      },
      timeout: 30000,
    };
    const req = proto.request(opts, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode)) {
        res.resume();
        const loc = res.headers.location;
        if (!loc) return reject(new Error('Redirect without Location'));
        const redir = loc.startsWith('http') ? loc : `${urlObj.protocol}//${urlObj.host}${loc}`;
        return downloadToBuffer(redir, maxRedirects - 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (buf.length < 500) return reject(new Error(`Too small: ${buf.length}b`));
        resolve(buf);
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

// ========================
// R2 UPLOAD
// ========================
function uploadToR2(buffer, filename, apiKey, baseUrl) {
  // Try multiple endpoint patterns - Polsia R2 proxy format discovery
  const endpoints = [
    { method: 'PUT',  path: `/r2/upload/${filename}` },
    { method: 'POST', path: `/r2/upload`, formData: true },
    { method: 'PUT',  path: `/r2/${filename}` },
    { method: 'POST', path: `/api/r2/upload`, formData: true },
    { method: 'PUT',  path: `/api/r2/${filename}` },
  ];

  async function tryEndpoint({ method, path, formData }) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(baseUrl);
      const proto = urlObj.protocol === 'https:' ? https : http;

      let body;
      let contentType;

      if (formData) {
        const boundary = 'boundary' + Date.now();
        const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/zip\r\n\r\n`);
        const foot = Buffer.from(`\r\n--${boundary}--\r\n`);
        body = Buffer.concat([head, buffer, foot]);
        contentType = `multipart/form-data; boundary=${boundary}`;
      } else {
        body = buffer;
        contentType = 'application/zip';
      }

      const opts = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: path,
        method: method,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': contentType,
          'Content-Length': body.length,
        },
        timeout: 180000,
      };

      const req = proto.request(opts, (res) => {
        let resBody = '';
        res.on('data', c => resBody += c);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, body: resBody, path });
          } else {
            reject(new Error(`HTTP ${res.statusCode} at ${path}: ${resBody.substring(0, 100)}`));
          }
        });
        res.on('error', reject);
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Upload timeout')); });
      req.write(body);
      req.end();
    });
  }

  // Try endpoints in sequence
  return (async () => {
    const errors = [];
    for (const endpoint of endpoints) {
      try {
        const result = await tryEndpoint(endpoint);
        return { ...result, endpointUsed: endpoint.path };
      } catch (e) {
        errors.push(`${endpoint.method} ${endpoint.path}: ${e.message}`);
      }
    }
    throw new Error('All R2 endpoints failed:\n' + errors.join('\n'));
  })();
}

// ========================
// PRODUCT LIST
// ========================
const PRODUCTS = [
  ['thyme-seeds', 'Thyme Seeds', 'https://thumbs.dreamstime.com/b/fresh-green-thyme-twigs-18681300.jpg'],
  ['stinging-nettle-seeds', 'Stinging Nettle Seeds', 'https://cdn.pixabay.com/photo/2019/10/24/10/05/stinging-nettle-4573932_640.jpg'],
  ['cilantro-seeds', 'Cilantro Seeds', 'https://thumbs.dreamstime.com/b/fresh-raw-organic-coriander-coriandrum-sativum-l-leaves-roots-white-backdrop-fresh-raw-organic-coriander-coriandrum-373083919.jpg'],
  ['basil-sweet-genovese-seeds', 'Basil Sweet Genovese Seeds', 'https://thumbs.dreamstime.com/b/sweet-basil-white-background-59198377.jpg'],
  ['fennel-seeds', 'Fennel Seeds', 'https://static.vecteezy.com/system/resources/thumbnails/049/375/419/small/fresh-fennel-seeds-and-leaves-on-a-rustic-table-chinese-herb-used-in-cooking-and-remedies-photo.jpg'],
  ['spearmint-seeds', 'Spearmint Seeds', 'https://thumbs.dreamstime.com/b/different-varieties-mint-growing-garden-fresh-green-mint-growing-garden-145194729.jpg'],
  ['peppermint-seeds', 'Peppermint Seeds', 'https://images.unsplash.com/photo-1599420186946-7b6fb4e297f0?w=640&q=80'],
  ['oregano-seeds', 'Oregano Seeds', 'https://cdn.pixabay.com/photo/2018/06/30/00/29/oregano-3506914_640.jpg'],
  ['rhubarb-seeds', 'Rhubarb Seeds', 'https://thumbs.dreamstime.com/b/rhubarb-plant-large-healthy-red-stemmed-45175045.jpg'],
  ['calendula-flower-seeds', 'Calendula Flower Seeds', 'https://static.vecteezy.com/system/resources/thumbnails/073/840/256/small/close-up-macro-of-a-vibrant-orange-calendula-flower-in-full-bloom-bathed-in-sunlight-free-photo.jpg'],
  ['bell-pepper-california-wonder', 'Bell Pepper California Wonder Seeds', 'https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?w=640&q=80'],
  ['agrostemma-purple-queen-seeds', 'Agrostemma Purple Queen Seeds', 'https://thumbs.dreamstime.com/b/flower-purple-bloomig-wooden-background-agrostemma-githago-cockle-97007635.jpg'],
  ['rutabaga-american-top-seeds', 'Rutabaga American Top Seeds', 'https://thumbs.dreamstime.com/b/fresh-rutabaga-vegetable-root-cutout-white-background-fresh-rutabaga-vegetable-root-cutout-168166809.jpg'],
  ['black-krim-tomato-seeds', 'Black Krim Tomato Seeds', 'https://thumbs.dreamstime.com/b/black-krim-tomato-front-white-background-32012658.jpg'],
  ['bloomsdale-spinach-seeds', 'Bloomsdale Spinach Seeds', 'https://thumbs.dreamstime.com/b/spinacia-oleracea-fresh-green-cut-spinach-leaves-spinacia-oleracea-fresh-cut-spinach-leaves-154394632.jpg'],
  ['cabbage-brunswick-seeds', 'Cabbage Brunswick Seeds', 'https://thumbs.dreamstime.com/b/green-cabbage-2541897.jpg'],
  ['kale-dwarf-siberian-seeds', 'Kale Dwarf Siberian Seeds', 'https://static.vecteezy.com/system/resources/thumbnails/002/686/888/small/fresh-green-leaves-of-kale-green-vegetable-leaves-plant-free-photo.jpg'],
  ['broccoli-purple-sprouting-seeds', 'Broccoli Early Purple Sprouting Seeds', 'https://thumbs.dreamstime.com/b/purple-sprouting-7929316.jpg'],
  ['strawberry-fresca-seeds', 'Strawberry Fresca Seeds', 'https://thumbs.dreamstime.com/b/ripe-red-strawberry-growing-plant-444425575.jpg'],
  ['collard-greens-georgia-southern', 'Collard Greens Georgia Southern Seeds', 'https://thumbs.dreamstime.com/b/collard-greens-4601275.jpg'],
  ['beet-golden-detroit-seeds', 'Beet Golden Detroit Seeds', 'https://thumbs.dreamstime.com/b/yellow-beets-white-background-32314135.jpg'],
  ['brussel-sprouts-long-island', 'Brussel Sprouts Long Island Seeds', 'https://thumbs.dreamstime.com/b/brussels-sprouts-grow-vegetable-garden-14819408.jpg'],
  ['green-bean-provider-seeds', 'Green Bean Provider Seeds', 'https://thumbs.dreamstime.com/b/green-bean-pods-19943929.jpg'],
  ['artichoke-purple-italian-globe', 'Artichoke Purple Italian Globe Seeds', 'https://cdn.pixabay.com/photo/2021/08/29/17/19/artichoke-6583811_640.jpg'],
  ['yellow-squash-seeds', 'Yellow Squash Seeds', 'https://images.unsplash.com/photo-1589927986089-35812388d1f4?w=640&q=80'],
  ['dark-green-zucchini-seeds', 'Dark Green Zucchini Seeds', 'https://thumbs.dreamstime.com/b/green-zucchini-vegetables-isolated-white-background-tasty-natural-95764142.jpg'],
  ['kidney-beans-seeds', 'Kidney Beans Seeds', 'https://images.unsplash.com/photo-1478369402113-1fd53f17e8b4?w=640&q=80'],
  ['black-eyed-cowpea-seeds', 'Black Eyed Cowpea Seeds', 'https://thumbs.dreamstime.com/b/bowl-black-eyed-peas-bowl-black-eyed-peas-isolated-white-background-423136972.jpg'],
  ['celery-seeds', 'Celery Seeds', 'https://thumbs.dreamstime.com/b/fresh-celery-13730801.jpg'],
  ['california-bluebell-seeds', 'California Bluebell Seeds', 'https://cdn.pixabay.com/photo/2020/04/24/18/28/blue-bell-5088073_640.jpg'],
  ['scarlet-sage-seeds', 'Scarlet Sage Seeds', 'https://thumbs.dreamstime.com/b/red-scarlet-sage-flowering-plant-nice-colorful-flowers-scientific-name-salvia-splendens-native-brazil-mexico-family-402536447.jpg'],
  ['blue-sage-seeds', 'Blue Sage Seeds', 'https://thumbs.dreamstime.com/b/blue-sage-true-flowers-46150385.jpg'],
  ['old-field-goldenrod-seeds', 'Old Field Goldenrod Seeds', 'https://cdn.pixabay.com/photo/2021/09/11/09/07/giant-goldenrod-6614984_640.jpg'],
  ['st-johns-wort-seeds', 'St Johns Wort Seeds', 'https://static.vecteezy.com/system/resources/thumbnails/049/507/631/small/st-johns-wort-hypericum-perforatum-is-known-for-its-bright-yellow-flowers-and-therapeutic-properties-commonly-used-to-improve-mood-and-aid-healing-in-traditional-and-alternative-medicine-photo.jpg'],
  ['salsify-mammoth-sandwich-island', 'Salsify Mammoth Sandwich Island Seeds', 'https://thumbs.dreamstime.com/b/salsify-vegetables-wood-wooden-table-53330626.jpg'],
  ['black-spanish-radish-seeds', 'Black Spanish Radish Seeds', 'https://thumbs.dreamstime.com/b/white-round-radishes-growing-garden-radish-soil-ripe-white-root-vegetable-green-leaves-organic-planting-greenhouses-175572007.jpg'],
  ['parsnip-hollow-crown-seeds', 'Parsnip Hollow Crown Seeds', 'https://thumbs.dreamstime.com/b/parsnips-white-background-10547249.jpg'],
  ['cippolini-onion-seeds', 'Cippolini Onion Seeds', 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=640&q=80'],
  ['red-grano-onion-seeds', 'Red Grano Onion Seeds', 'https://images.unsplash.com/photo-1508615039623-a25605d2b022?w=640&q=80'],
  ['texas-early-grano-onion-seeds', 'Texas Early Grano Onion Seeds', 'https://www.nativeseeds.org/cdn/shop/products/TexasEarlyGrano_550x.jpg'],
  ['walla-walla-onion-seeds', 'Walla Walla Onion Seeds', 'https://thumbs.dreamstime.com/b/walla-walla-onions-1494-2607116.jpg'],
  ['clemson-spineless-okra-seeds', 'Clemson Spineless Okra Seeds', 'https://gardenerspath.com/wp-content/uploads/2019/04/Silver-Queen-Okra.jpg'],
  ['green-flesh-honeydew-melon', 'Green Flesh Honeydew Melon Seeds', 'https://static.vecteezy.com/system/resources/thumbnails/052/667/080/small/green-cantaloupe-melon-with-cut-slice-isolated-on-green-background-green-melon-free-photo.jpg'],
  ['minnesota-midget-melon-seeds', 'Minnesota Midget Melon Seeds', 'https://cdn.pixabay.com/photo/2012/10/03/22/42/cantaloupe-59168_640.jpg'],
  ['white-vienna-kohlrabi-seeds', 'White Vienna Kohlrabi Seeds', 'https://thumbs.dreamstime.com/b/kohlrabi-1580978.jpg'],
  ['lacinato-kale-seeds', 'Lacinato Kale Seeds', 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=640&q=80'],
  ['red-russian-kale-seeds', 'Red Russian Kale Seeds', 'https://thumbs.dreamstime.com/b/kale-red-russian-variety-kitchen-table-33273948.jpg'],
  ['german-chamomile-seeds', 'German Chamomile Seeds', 'https://images.unsplash.com/photo-1471193945509-9ad0617afabf?w=640&q=80'],
  ['lemon-balm-seeds', 'Lemon Balm Seeds', 'https://thumbs.dreamstime.com/b/mint-22723354.jpg'],
  ['utah-tall-celery-seeds', 'Utah Tall Celery Seeds', 'https://thumbs.dreamstime.com/b/fresh-celery-13730801.jpg'],
  ['canton-pak-choi-seeds', 'Canton Pak Choi Seeds', 'https://www.everwilde.com/media//0800/resized/VCACPAC-A-Canton-Pak-Choi-Chinese-Cabbage-Seeds_medium.jpg'],
  ['golden-beauty-casaba-melon', 'Golden Beauty Casaba Melon Seeds', 'https://images.unsplash.com/photo-1567306226416-28f0efdc88ce?w=640&q=80'],
  ['lucullus-swiss-chard-seeds', 'Lucullus Swiss Chard Seeds', 'https://sarabackmo.com/wp-content/uploads/2018/09/sarabackmo_lucullus_fordhookgiant.jpg'],
  ['red-burgundy-okra-seeds', 'Red Burgundy Okra Seeds', 'https://sowtrueseed.com/cdn/shop/products/Burgundy-Pods-1024x768_cs.jpg'],
  ['cayenne-pepper-seeds', 'Cayenne Pepper Seeds', 'https://gardenerspath.com/wp-content/uploads/2024/03/Long-Red-Thin-Cayenne.jpg'],
  ['multi-color-cayenne-pepper', 'Multi Color Cayenne Pepper Seeds', 'https://seedvilleusa.com/cdn/shop/files/shutterstock_567865693.jpg'],
  ['habanero-pepper-seeds', 'Habanero Pepper Seeds', 'https://thumbs.dreamstime.com/b/habanero-orange-peppers-pile-stack-hot-bright-44043107.jpg'],
  ['banana-pepper-seeds', 'Banana Pepper Seeds', 'https://mygardyn.com/wp-content/uploads/2023/07/Banana_Pepper-500.jpg'],
  ['green-tomatillo-seeds', 'Green Tomatillo Seeds', 'https://extension.umn.edu/sites/extension.umn.edu/files/styles/crop_featured_image_crop/public/Tomatillo_UMHort1003.jpg'],
  ['purple-tomatillo-seeds', 'Purple Tomatillo Seeds', 'https://thumbs.dreamstime.com/b/heap-purple-tomatillo-husked-high-quality-photo-330408451.jpg'],
  ['tabasco-pepper-seeds', 'Tabasco Pepper Seeds', 'https://www.trailingpetunia.com/cdn/shop/articles/tabasco-pepper-seeds-red-yellow-chili-plant.png'],
  ['beefsteak-tomato-seeds', 'Beefsteak Tomato Seeds', 'https://almanacplanting.com/cdn/shop/files/Beefsteak-Tomato-2.jpg'],
  ['rainbow-carrot-seeds', 'Rainbow Carrot Seeds', 'https://images.unsplash.com/photo-1447175008436-054170c2e979?w=640&q=80'],
  ['crimson-sweet-watermelon-seeds', 'Crimson Sweet Watermelon Seeds', 'https://www.epicgardening.com/wp-content/uploads/2025/04/Watermelon-Crimson-Sweet.jpg'],
  ['black-diamond-watermelon-seeds', 'Black Diamond Watermelon Seeds', 'https://minnetonkaorchards.com/wp-content/uploads/2022/11/Dark-Watermelon-in-Garden-SS-2160503189-1024x683.jpg'],
  ['howden-pumpkin-seeds', 'Howden Pumpkin Seeds', 'https://www.sandiaseed.com/cdn/shop/products/Organic-Pumpkin-Seeds-Howdens-Field_583607c2-735b-4163-b673-09efaca615fc.jpg'],
  ['pinto-bean-seeds', 'Pinto Bean Seeds', 'https://davidsgardenseeds.com/cdn/shop/files/bean-dry-pinto_800x.jpg'],
  ['navy-bean-seeds', 'Navy Bean Seeds', 'https://thumbs.dreamstime.com/b/white-navy-beans-wooden-bowl-over-white-also-haricot-pearl-haricot-boston-pea-bean-dried-seeds-phaseolus-vulgaris-91388437.jpg'],
  ['black-turtle-bean-seeds', 'Black Turtle Bean Seeds', 'https://cdn.shopify.com/s/files/1/2586/9918/t/5/assets/black-turtle-bush-dried-bean-100-days-vegetables-pinetree-garden-seeds-844_600x-1635184672719_500x.jpg'],
  ['red-kidney-bean-seeds', 'Red Kidney Bean Seeds', 'https://m.media-amazon.com/images/I/51fM+UxZVSL.jpg'],
];

// ========================
// MAIN EXECUTION
// ========================
async function runDownload(log) {
  const R2_BASE = process.env.POLSIA_R2_BASE_URL || 'https://polsia.com';
  const API_KEY = process.env.POLSIA_API_KEY || process.env.OPENAI_API_KEY || '';
  const tmpDir = os.tmpdir();
  const outDir = path.join(tmpDir, 'seed-images-' + Date.now());

  fs.mkdirSync(outDir, { recursive: true });
  log(`📁 Working dir: ${outDir}`);
  log(`📡 R2 Base: ${R2_BASE}`);
  log(`🔑 API Key: ${API_KEY ? API_KEY.substring(0, 15) + '...' : 'NOT SET'}`);

  const zipFiles = [];
  const failed = [];
  const manifestRows = [['filename', 'product_name', 'image_url', 'status', 'file_size_kb']];

  for (let i = 0; i < PRODUCTS.length; i++) {
    const [slug, name, url] = PRODUCTS[i];
    const filename = `${slug}.jpg`;
    log(`[${i+1}/${PRODUCTS.length}] ${slug}...`);

    try {
      const buf = await downloadToBuffer(url);
      const kb = (buf.length / 1024).toFixed(1);
      zipFiles.push({ name: filename, data: buf });
      manifestRows.push([filename, name, url, 'success', kb]);
      log(`  ✅ ${kb}KB`);
    } catch (err) {
      failed.push({ slug, url, error: err.message });
      manifestRows.push([filename, name, url, 'failed', '0']);
      log(`  ❌ ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 150));
  }

  const successCount = zipFiles.length;
  log(`\n📊 Downloaded: ${successCount}/${PRODUCTS.length}`);

  // Manifest
  const manifest = manifestRows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  zipFiles.push({ name: 'manifest.csv', data: Buffer.from(manifest) });

  // README
  const readme = `Sugar Oak Lane - Seed Product Images\nGenerated: 2026-03-27\nImages: ${successCount}/70\n\nAll images are royalty-free commercial-use licensed.\nFor Etsy/Vela upload as product photos.\n`;
  zipFiles.push({ name: 'README.txt', data: Buffer.from(readme) });

  // Create ZIP
  log(`\n📦 Creating ZIP...`);
  const zipBuf = createZip(zipFiles);
  const zipPath = path.join(tmpDir, 'sugar-oak-lane-seed-images.zip');
  fs.writeFileSync(zipPath, zipBuf);
  const zipSizeMB = (zipBuf.length / 1024 / 1024).toFixed(1);
  log(`✅ ZIP: ${zipSizeMB}MB`);

  // Also save to permanent app directory for serving via GET /downloads/seed-images.zip
  try {
    const downloadsDir = path.join(__dirname, '..', 'downloads');
    fs.mkdirSync(downloadsDir, { recursive: true });
    fs.writeFileSync(path.join(downloadsDir, 'sugar-oak-lane-seed-images.zip'), zipBuf);
    // Save manifest CSV too
    const manifestCsv = zipFiles.find(f => f.name === 'manifest.csv');
    if (manifestCsv) fs.writeFileSync(path.join(downloadsDir, 'manifest.csv'), manifestCsv.data);
    log(`✅ Saved to app downloads directory`);
  } catch(e) {
    log(`⚠️  Could not save to downloads dir: ${e.message}`);
  }

  // Upload to R2
  const zipFilename = `sugar-oak-lane-seed-images-2026-03-27.zip`;
  log(`\n☁️  Uploading to R2 (trying multiple endpoints)...`);

  try {
    const uploadResult = await uploadToR2(zipBuf, zipFilename, API_KEY, R2_BASE);
    log(`✅ R2 upload succeeded via: ${uploadResult.endpointUsed}`);

    // Construct download URL based on which endpoint worked
    const downloadUrl = uploadResult.body && uploadResult.body.includes('http')
      ? (JSON.parse(uploadResult.body).url || JSON.parse(uploadResult.body).downloadUrl || `${R2_BASE}${uploadResult.endpointUsed.replace('/upload', '')}/${zipFilename}`)
      : `${R2_BASE}${uploadResult.endpointUsed.replace('/upload', '')}/${zipFilename}`;
    log(`✅ Uploaded! URL: ${downloadUrl}`);

    // Cleanup
    try { fs.rmSync(outDir, { recursive: true }); } catch(e) {}
    try { fs.unlinkSync(zipPath); } catch(e) {}

    return {
      success: true,
      downloadUrl,
      totalImages: successCount,
      failedImages: failed.length,
      zipSizeMB: (zipBuf.length / 1024 / 1024).toFixed(1),
      failed: failed.map(f => ({ slug: f.slug, error: f.error })),
    };
  } catch (err) {
    log(`❌ R2 upload failed: ${err.message}`);
    return {
      success: false,
      error: err.message,
      totalImages: successCount,
      failedImages: failed.length,
      zipPath,
    };
  }
}

module.exports = { runDownload };
