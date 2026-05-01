const https = require('https');
const fs = require('fs');
const path = require('path');

const dest = '/tmp/claude-0/-opt-polsia-workspaces-company-52536-agent-30-exec-870749-sugaroakos/competitor-screenshots';
fs.mkdirSync(dest, { recursive: true });

const files = [
  ['teleflora_top.jpg', 'https://pub-629428d185ca4960a0a73c850d32294b.r2.dev/company_52536/images/09e1f246-5cf9-436e-a6b0-af8ad9453b0f.jpg'],
  ['teleflora_bottom.jpg', 'https://pub-629428d185ca4960a0a73c850d32294b.r2.dev/company_52536/images/54d0f330-da33-4ef3-b58e-d40ba1438bbb.jpg'],
  ['ruths_roses.jpg', 'https://pub-629428d185ca4960a0a73c850d32294b.r2.dev/company_52536/images/a96cadff-881b-445e-ac6e-ce4bc671288c.jpg'],
  ['from_you_flowers_top.jpg', 'https://pub-629428d185ca4960a0a73c850d32294b.r2.dev/company_52536/images/e8b06ee9-30d3-4e08-b342-b02e14a474ea.jpg'],
  ['from_you_flowers_middle.jpg', 'https://pub-629428d185ca4960a0a73c850d32294b.r2.dev/company_52536/images/f6dd210c-ea15-4392-aa5c-6dfbd5c2571e.jpg'],
];

let pending = files.length;

files.forEach(function([name, url]) {
  const outPath = path.join(dest, name);
  const file = fs.createWriteStream(outPath);
  https.get(url, function(res) {
    res.pipe(file);
    file.on('finish', function() {
      file.close();
      console.log('Done: ' + name);
      pending--;
      if (pending === 0) {
        console.log('All downloads complete');
      }
    });
  }).on('error', function(e) {
    console.error('Error downloading ' + name + ': ' + e.message);
  });
});
