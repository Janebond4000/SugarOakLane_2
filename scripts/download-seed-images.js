#!/usr/bin/env node
/**
 * Download all 70 Sugar Oak Lane seed product images and bundle into a zip file.
 * Then upload to R2 storage and output a public download link.
 * Uses only Node.js built-ins (no npm packages required).
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createZip } = require('./zip-utils');

// Output directory - use current directory since /tmp/claude may not exist
const OUTPUT_DIR = path.join(process.cwd(), 'tmp-output', 'seed-images');
const ZIP_PATH = path.join(process.cwd(), 'tmp-output', 'sugar-oak-lane-seed-images.zip');
const MANIFEST_PATH = path.join(OUTPUT_DIR, 'manifest.csv');

// R2 config
const POLSIA_R2_BASE_URL = process.env.POLSIA_R2_BASE_URL || 'https://polsia.com';
const POLSIA_API_KEY = process.env.POLSIA_API_KEY || process.env.OPENAI_API_KEY || '';

// All 70 products: [slug, display_name, image_url]
const PRODUCTS = [
  // Batch 1 (1-25)
  ['thyme-seeds',                    'Thyme Seeds',                      'https://thumbs.dreamstime.com/b/fresh-green-thyme-twigs-18681300.jpg'],
  ['stinging-nettle-seeds',          'Stinging Nettle Seeds',            'https://cdn.pixabay.com/photo/2019/10/24/10/05/stinging-nettle-4573932_640.jpg'],
  ['cilantro-seeds',                 'Cilantro Seeds',                   'https://thumbs.dreamstime.com/b/fresh-raw-organic-coriander-coriandrum-sativum-l-leaves-roots-white-backdrop-fresh-raw-organic-coriander-coriandrum-373083919.jpg'],
  ['basil-sweet-genovese-seeds',     'Basil Sweet Genovese Seeds',       'https://thumbs.dreamstime.com/b/sweet-basil-white-background-59198377.jpg'],
  ['fennel-seeds',                   'Fennel Seeds',                     'https://static.vecteezy.com/system/resources/thumbnails/049/375/419/small/fresh-fennel-seeds-and-leaves-on-a-rustic-table-chinese-herb-used-in-cooking-and-remedies-photo.jpg'],
  ['spearmint-seeds',                'Spearmint Seeds',                  'https://thumbs.dreamstime.com/b/different-varieties-mint-growing-garden-fresh-green-mint-growing-garden-145194729.jpg'],
  ['peppermint-seeds',               'Peppermint Seeds',                 'https://media.istockphoto.com/id/1272986977/photo/fresh-green-mint-plants.jpg?s=612x612&w=0&k=20&c=3MHzPbRHpMhZ-'],
  ['oregano-seeds',                  'Oregano Seeds',                    'https://cdn.pixabay.com/photo/2018/06/30/00/29/oregano-3506914_640.jpg'],
  ['rhubarb-seeds',                  'Rhubarb Seeds',                    'https://thumbs.dreamstime.com/b/rhubarb-plant-large-healthy-red-stemmed-45175045.jpg'],
  ['calendula-flower-seeds',         'Calendula Flower Seeds',           'https://static.vecteezy.com/system/resources/thumbnails/073/840/256/small/close-up-macro-of-a-vibrant-orange-calendula-flower-in-full-bloom-bathed-in-sunlight-free-photo.jpg'],
  ['bell-pepper-california-wonder',  'Bell Pepper California Wonder',    'https://media.gettyimages.com/id/1146280484/photo/fresh-yellow-and-orange-bell-pepper.jpg?s=612x612&w=0&k=20&c=3M'],
  ['agrostemma-purple-queen-seeds',  'Agrostemma Purple Queen Seeds',    'https://thumbs.dreamstime.com/b/flower-purple-bloomig-wooden-background-agrostemma-githago-cockle-97007635.jpg'],
  ['rutabaga-american-top-seeds',    'Rutabaga American Top Seeds',      'https://thumbs.dreamstime.com/b/fresh-rutabaga-vegetable-root-cutout-white-background-fresh-rutabaga-vegetable-root-cutout-168166809.jpg'],
  ['black-krim-tomato-seeds',        'Black Krim Tomato Seeds',          'https://thumbs.dreamstime.com/b/black-krim-tomato-front-white-background-32012658.jpg'],
  ['bloomsdale-spinach-seeds',       'Bloomsdale Spinach Seeds',         'https://thumbs.dreamstime.com/b/spinacia-oleracea-fresh-green-cut-spinach-leaves-spinacia-oleracea-fresh-cut-spinach-leaves-154394632.jpg'],
  ['cabbage-brunswick-seeds',        'Cabbage Brunswick Seeds',          'https://thumbs.dreamstime.com/b/green-cabbage-2541897.jpg'],
  ['kale-dwarf-siberian-seeds',      'Kale Dwarf Siberian Seeds',        'https://static.vecteezy.com/system/resources/thumbnails/002/686/888/small/fresh-green-leaves-of-kale-green-vegetable-leaves-plant-free-photo.jpg'],
  ['broccoli-purple-sprouting-seeds','Broccoli Early Purple Sprouting',  'https://thumbs.dreamstime.com/b/purple-sprouting-7929316.jpg'],
  ['strawberry-fresca-seeds',        'Strawberry Fresca Seeds',          'https://thumbs.dreamstime.com/b/ripe-red-strawberry-growing-plant-444425575.jpg'],
  ['collard-greens-georgia-southern','Collard Greens Georgia Southern',  'https://thumbs.dreamstime.com/b/collard-greens-4601275.jpg'],
  ['beet-golden-detroit-seeds',      'Beet Golden Detroit Seeds',        'https://thumbs.dreamstime.com/b/yellow-beets-white-background-32314135.jpg'],
  ['brussel-sprouts-long-island',    'Brussel Sprouts Long Island',      'https://thumbs.dreamstime.com/b/brussels-sprouts-grow-vegetable-garden-14819408.jpg'],
  ['green-bean-provider-seeds',      'Green Bean Provider Seeds',        'https://thumbs.dreamstime.com/b/green-bean-pods-19943929.jpg'],
  ['artichoke-purple-italian-globe', 'Artichoke Purple Italian Globe',   'https://cdn.pixabay.com/photo/2021/08/29/17/19/artichoke-6583811_640.jpg'],
  ['yellow-squash-seeds',            'Yellow Squash Seeds',              'https://media.gettyimages.com/id/137205608/photo/yellow-zucchini.jpg?s=612x612&w=0&k=20&c=3M'],

  // Batch 2 (26-50)
  ['dark-green-zucchini-seeds',      'Dark Green Zucchini Seeds',        'https://thumbs.dreamstime.com/b/green-zucchini-vegetables-isolated-white-background-tasty-natural-95764142.jpg'],
  ['kidney-beans-seeds',             'Kidney Beans Seeds',               'https://media.gettyimages.com/id/648721294/photo/dry-beans-collection.jpg?s=612x612&w=0&k=20&c=3M'],
  ['black-eyed-cowpea-seeds',        'Black Eyed Cowpea Seeds',          'https://thumbs.dreamstime.com/b/bowl-black-eyed-peas-bowl-black-eyed-peas-isolated-white-background-423136972.jpg'],
  ['celery-seeds',                   'Celery Seeds',                     'https://thumbs.dreamstime.com/b/fresh-celery-13730801.jpg'],
  ['california-bluebell-seeds',      'California Bluebell Seeds',        'https://cdn.pixabay.com/photo/2020/04/24/18/28/blue-bell-5088073_640.jpg'],
  ['scarlet-sage-seeds',             'Scarlet Sage Seeds',               'https://thumbs.dreamstime.com/b/red-scarlet-sage-flowering-plant-nice-colorful-flowers-scientific-name-salvia-splendens-native-brazil-mexico-family-402536447.jpg'],
  ['blue-sage-seeds',                'Blue Sage Seeds',                  'https://thumbs.dreamstime.com/b/blue-sage-true-flowers-46150385.jpg'],
  ['old-field-goldenrod-seeds',      'Old Field Goldenrod Seeds',        'https://cdn.pixabay.com/photo/2021/09/11/09/07/giant-goldenrod-6614984_640.jpg'],
  ['st-johns-wort-seeds',            'St Johns Wort Seeds',              'https://static.vecteezy.com/system/resources/thumbnails/049/507/631/small/st-johns-wort-hypericum-perforatum-is-known-for-its-bright-yellow-flowers-and-therapeutic-properties-commonly-used-to-improve-mood-and-aid-healing-in-traditional-and-alternative-medicine-photo.jpg'],
  ['salsify-mammoth-sandwich-island','Salsify Mammoth Sandwich Island',  'https://thumbs.dreamstime.com/b/salsify-vegetables-wood-wooden-table-53330626.jpg'],
  ['black-spanish-radish-seeds',     'Black Spanish Radish Seeds',       'https://thumbs.dreamstime.com/b/white-round-radishes-growing-garden-radish-soil-ripe-white-root-vegetable-green-leaves-organic-planting-greenhouses-175572007.jpg'],
  ['parsnip-hollow-crown-seeds',     'Parsnip Hollow Crown Seeds',       'https://thumbs.dreamstime.com/b/parsnips-white-background-10547249.jpg'],
  ['cippolini-onion-seeds',          'Cippolini Onion Seeds',            'https://media.istockphoto.com/id/1214289833/photo/background-of-a-pile-of-cipollini-onions.jpg?s=612x612&w=0&k=20&c=3M'],
  ['red-grano-onion-seeds',          'Red Grano Onion Seeds',            'https://media.gettyimages.com/id/1317842136/photo/fresh-red-and-green-vegetable-background.jpg?s=612x612&w=0&k=20&c=3M'],
  ['texas-early-grano-onion-seeds',  'Texas Early Grano Onion Seeds',    'https://www.nativeseeds.org/cdn/shop/products/TexasEarlyGrano_550x.jpg'],
  ['walla-walla-onion-seeds',        'Walla Walla Onion Seeds',          'https://thumbs.dreamstime.com/b/walla-walla-onions-1494-2607116.jpg'],
  ['clemson-spineless-okra-seeds',   'Clemson Spineless Okra Seeds',     'https://gardenerspath.com/wp-content/uploads/2019/04/Silver-Queen-Okra.jpg'],
  ['green-flesh-honeydew-melon',     'Green Flesh Honeydew Melon Seeds', 'https://static.vecteezy.com/system/resources/thumbnails/052/667/080/small/green-cantaloupe-melon-with-cut-slice-isolated-on-green-background-green-melon-free-photo.jpg'],
  ['minnesota-midget-melon-seeds',   'Minnesota Midget Melon Seeds',     'https://cdn.pixabay.com/photo/2012/10/03/22/42/cantaloupe-59168_640.jpg'],
  ['white-vienna-kohlrabi-seeds',    'White Vienna Kohlrabi Seeds',      'https://media.istockphoto.com/id/1096799442/photo/kohlrabi-vegetable-isolated-for-text.jpg?s=612x612&w=0&k=20&c=3M'],
  ['lacinato-kale-seeds',            'Lacinato Kale Seeds',              'https://media.istockphoto.com/id/523917331/photo/fresh-dark-green-kale-on-white-background.jpg?s=612x612&w=0&k=20&c=3M'],
  ['red-russian-kale-seeds',         'Red Russian Kale Seeds',           'https://thumbs.dreamstime.com/b/kale-red-russian-variety-kitchen-table-33273948.jpg'],
  ['german-chamomile-seeds',         'German Chamomile Seeds',           'https://hips.hearstapps.com/hmg-prod/images/chamomile-field-macro-white-flowers-background-royalty-free-image-1718230037.jpg'],
  ['lemon-balm-seeds',               'Lemon Balm Seeds',                 'https://thumbs.dreamstime.com/b/mint-22723354.jpg'],
  ['utah-tall-celery-seeds',         'Utah Tall Celery Seeds',           'https://thumbs.dreamstime.com/b/fresh-celery-13730801.jpg'],

  // Batch 3 (51-70)
  ['canton-pak-choi-seeds',          'Canton Pak Choi Seeds',            'https://www.everwilde.com/media//0800/resized/VCACPAC-A-Canton-Pak-Choi-Chinese-Cabbage-Seeds_medium.jpg'],
  ['golden-beauty-casaba-melon',     'Golden Beauty Casaba Melon Seeds', 'https://images.unsplash.com/photo-1567306226416-28f0efdc88ce?w=640&q=80'],
  ['lucullus-swiss-chard-seeds',     'Lucullus Swiss Chard Seeds',       'https://sarabackmo.com/wp-content/uploads/2018/09/sarabackmo_lucullus_fordhookgiant.jpg'],
  ['red-burgundy-okra-seeds',        'Red Burgundy Okra Seeds',          'https://sowtrueseed.com/cdn/shop/products/Burgundy-Pods-1024x768_cs.jpg'],
  ['cayenne-pepper-seeds',           'Cayenne Pepper Seeds',             'https://gardenerspath.com/wp-content/uploads/2024/03/Long-Red-Thin-Cayenne.jpg'],
  ['multi-color-cayenne-pepper',     'Multi Color Cayenne Pepper Seeds', 'https://seedvilleusa.com/cdn/shop/files/shutterstock_567865693.jpg'],
  ['habanero-pepper-seeds',          'Habanero Pepper Seeds',            'https://thumbs.dreamstime.com/b/habanero-orange-peppers-pile-stack-hot-bright-44043107.jpg'],
  ['banana-pepper-seeds',            'Banana Pepper Seeds',              'https://mygardyn.com/wp-content/uploads/2023/07/Banana_Pepper-500.jpg'],
  ['green-tomatillo-seeds',          'Green Tomatillo Seeds',            'https://extension.umn.edu/sites/extension.umn.edu/files/styles/crop_featured_image_crop/public/Tomatillo_UMHort1003.jpg'],
  ['purple-tomatillo-seeds',         'Purple Tomatillo Seeds',           'https://thumbs.dreamstime.com/b/heap-purple-tomatillo-husked-high-quality-photo-330408451.jpg'],
  ['tabasco-pepper-seeds',           'Tabasco Pepper Seeds',             'https://www.trailingpetunia.com/cdn/shop/articles/tabasco-pepper-seeds-red-yellow-chili-plant.png'],
  ['beefsteak-tomato-seeds',         'Beefsteak Tomato Seeds',           'https://almanacplanting.com/cdn/shop/files/Beefsteak-Tomato-2.jpg'],
  ['rainbow-carrot-seeds',           'Rainbow Carrot Seeds',             'https://cdn.pixabay.com/photo/2015/07/22/11/48/carrot-855593_640.jpg'],
  ['crimson-sweet-watermelon-seeds', 'Crimson Sweet Watermelon Seeds',   'https://www.epicgardening.com/wp-content/uploads/2025/04/Watermelon-Crimson-Sweet.jpg'],
  ['black-diamond-watermelon-seeds', 'Black Diamond Watermelon Seeds',   'https://minnetonkaorchards.com/wp-content/uploads/2022/11/Dark-Watermelon-in-Garden-SS-2160503189-1024x683.jpg'],
  ['howden-pumpkin-seeds',           'Howden Pumpkin Seeds',             'https://www.sandiaseed.com/cdn/shop/products/Organic-Pumpkin-Seeds-Howdens-Field_583607c2-735b-4163-b673-09efaca615fc.jpg'],
  ['pinto-bean-seeds',               'Pinto Bean Seeds',                 'https://davidsgardenseeds.com/cdn/shop/files/bean-dry-pinto_800x.jpg'],
  ['navy-bean-seeds',                'Navy Bean Seeds',                  'https://thumbs.dreamstime.com/b/white-navy-beans-wooden-bowl-over-white-also-haricot-pearl-haricot-boston-pea-bean-dried-seeds-phaseolus-vulgaris-91388437.jpg'],
  ['black-turtle-bean-seeds',        'Black Turtle Bean Seeds',          'https://cdn.shopify.com/s/files/1/2586/9918/t/5/assets/black-turtle-bush-dried-bean-100-days-vegetables-pinetree-garden-seeds-844_600x-1635184672719_500x.jpg'],
  ['red-kidney-bean-seeds',          'Red Kidney Bean Seeds',            'https://m.media-amazon.com/images/I/51fM+UxZVSL.jpg'],
];

// Helper: download a URL to a buffer with redirect support
function downloadToBuffer(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects === 0) {
      return reject(new Error('Too many redirects'));
    }

    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SugarOakLane/1.0)',
        'Accept': 'image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 30000,
    };

    const req = protocol.request(options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        const location = res.headers.location;
        if (!location) return reject(new Error('Redirect without Location header'));
        res.resume();
        // Make absolute if relative
        const redirectUrl = location.startsWith('http') ? location : `${urlObj.protocol}//${urlObj.host}${location}`;
        downloadToBuffer(redirectUrl, maxRedirects - 1).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (buf.length < 500) {
          return reject(new Error(`Response too small (${buf.length} bytes) - likely error page`));
        }
        resolve(buf);
      });
      res.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    req.end();
  });
}

// Upload buffer to R2 via Polsia proxy
function uploadToR2(buffer, r2Key, contentType = 'application/zip') {
  return new Promise((resolve, reject) => {
    const uploadUrl = `${POLSIA_R2_BASE_URL}/r2/${r2Key}`;
    const urlObj = new URL(uploadUrl);
    const protocol = urlObj.protocol === 'https:' ? https : http;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname,
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${POLSIA_API_KEY}`,
        'Content-Type': contentType,
        'Content-Length': buffer.length,
        'x-polsia-company': 'sugaroakos',
      },
      timeout: 120000,
    };

    const req = protocol.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, body });
        } else {
          reject(new Error(`R2 PUT failed: HTTP ${res.statusCode}: ${body.substring(0, 200)}`));
        }
      });
      res.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Upload timed out')); });
    req.write(buffer);
    req.end();
  });
}

async function main() {
  console.log('🌱 Sugar Oak Lane - Seed Image Downloader');
  console.log('==========================================');
  console.log(`Total products: ${PRODUCTS.length}`);
  console.log(`POLSIA_R2_BASE_URL: ${POLSIA_R2_BASE_URL}`);
  console.log(`API Key: ${POLSIA_API_KEY ? POLSIA_API_KEY.substring(0, 20) + '...' : 'NOT SET'}`);
  console.log('');

  // Create output directory
  fs.mkdirSync(path.dirname(OUTPUT_DIR), { recursive: true });
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true });
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const imageFiles = []; // { name, data } for zip
  const manifestRows = [['filename', 'product_name', 'image_url', 'status', 'file_size_kb', 'notes']];
  const failed = [];

  // Download all images
  for (let i = 0; i < PRODUCTS.length; i++) {
    const [slug, displayName, url] = PRODUCTS[i];
    const filename = `${slug}.jpg`;

    process.stdout.write(`[${String(i+1).padStart(2)}/${PRODUCTS.length}] ${slug.substring(0, 40).padEnd(42)}... `);

    try {
      const buf = await downloadToBuffer(url);

      // Save to disk for reference
      fs.writeFileSync(path.join(OUTPUT_DIR, filename), buf);

      // Add to zip collection
      imageFiles.push({ name: filename, data: buf });

      const kb = (buf.length / 1024).toFixed(1);
      console.log(`✅ ${kb}KB`);
      manifestRows.push([filename, displayName, url, 'success', kb, '']);
    } catch (err) {
      console.log(`❌ ${err.message}`);
      failed.push({ slug, displayName, url, error: err.message });
      manifestRows.push([filename, displayName, url, 'failed', '0', err.message]);
    }

    // Small delay to be polite to servers
    await new Promise(r => setTimeout(r, 100));
  }

  const successCount = imageFiles.length;
  console.log(`\n📊 Download Summary: ${successCount}/${PRODUCTS.length} downloaded`);

  if (failed.length > 0) {
    console.log(`\n❌ Failed (${failed.length}):`);
    failed.forEach(f => console.log(`  - ${f.slug}: ${f.error}`));
  }

  // Write manifest CSV
  const manifestContent = manifestRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  fs.writeFileSync(MANIFEST_PATH, manifestContent);
  console.log(`\n📝 Manifest written to: ${MANIFEST_PATH}`);

  // Add manifest to zip
  imageFiles.push({ name: 'manifest.csv', data: Buffer.from(manifestContent) });

  // Create README
  const readmeContent = `Sugar Oak Lane - Seed Product Images
=====================================
Generated: 2026-03-27
Total Images: ${successCount}
Failed Downloads: ${failed.length}

Files in this archive:
- manifest.csv - Complete listing of all products with image URLs
- *.jpg - Product images named by product slug

Naming Convention:
  {product-slug}.jpg
  Example: zinnia-california-giants.jpg

All images are royalty-free with commercial use licensing from:
- Dreamstime, Pixabay, iStockPhoto, Vecteezy, FreeImages, etc.

For Etsy/Vela upload: use these images as product photos.
`;
  imageFiles.push({ name: 'README.txt', data: Buffer.from(readmeContent) });

  // Create ZIP
  console.log(`\n📦 Creating ZIP file with ${imageFiles.length} files...`);
  const zipBuffer = createZip(imageFiles);
  fs.writeFileSync(ZIP_PATH, zipBuffer);
  const zipSizeMB = (zipBuffer.length / 1024 / 1024).toFixed(1);
  console.log(`✅ ZIP created: ${ZIP_PATH} (${zipSizeMB} MB)`);

  // Upload to R2
  const r2Key = `sugaroakos/seed-images/sugar-oak-lane-seed-images-2026-03-27.zip`;
  console.log(`\n☁️  Uploading to R2 (${zipSizeMB} MB)...`);

  try {
    const uploadResult = await uploadToR2(zipBuffer, r2Key);
    const downloadUrl = `${POLSIA_R2_BASE_URL}/r2/${r2Key}`;
    console.log(`✅ R2 Upload successful! (HTTP ${uploadResult.statusCode})`);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔗 PUBLIC DOWNLOAD URL:`);
    console.log(`   ${downloadUrl}`);
    console.log(`${'='.repeat(60)}`);

    // Save result
    const result = {
      success: true,
      downloadUrl,
      r2Key,
      zipSizeMB,
      totalImages: successCount,
      failedImages: failed.length,
      failed: failed.map(f => ({ slug: f.slug, error: f.error })),
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(process.cwd(), 'tmp-output', 'download-result.json'), JSON.stringify(result, null, 2));
    console.log('\n📋 Result saved to: /tmp/claude/download-result.json');

  } catch (err) {
    console.error(`\n❌ R2 upload failed: ${err.message}`);

    // Save partial result
    const result = {
      success: false,
      r2UploadError: err.message,
      zipPath: ZIP_PATH,
      zipSizeMB,
      totalImages: successCount,
      failedImages: failed.length,
      failed: failed.map(f => ({ slug: f.slug, error: f.error })),
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(process.cwd(), 'tmp-output', 'download-result.json'), JSON.stringify(result, null, 2));
    console.log('\nZip file is available at: ' + ZIP_PATH);
    console.log('Result saved to: /tmp/claude/download-result.json');
  }

  console.log(`\n✅ Done! ${successCount} images bundled.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
