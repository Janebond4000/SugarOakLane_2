#!/usr/bin/env node
/**
 * Update all SOL HTML pages:
 * - Rename "Shop" nav item → "Seeds+Plants" (plain link, no dropdown)
 * - Mobile drawer section label "Shop" → "Seeds+Plants"
 */

const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '../public');

const files = fs.readdirSync(publicDir)
  .filter(f => f.startsWith('sol-') && f.endsWith('.html'))
  .map(f => path.join(publicDir, f));

// Also update index.html if it has the nav
const extraFiles = ['index.html'].map(f => path.join(publicDir, f));

let totalUpdated = 0;

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  // ── Desktop nav: replace the Shop nav-item block (with or without "active" class)
  // Pattern matches the entire <div class="nav-item"> wrapping the Shop link
  // The dropdown has 5 links. We need to match the full block.
  const shopNavPattern = /<div class="nav-item">\s*<a href="\/shop" class="nav-link(?:\s+active)?">Shop\s*<svg[\s\S]*?<\/div>\s*<\/div>/g;

  content = content.replace(shopNavPattern, (match) => {
    // Preserve "active" class if it was there
    const isActive = match.includes('class="nav-link active"') || match.includes("class='nav-link active'");
    const activeClass = isActive ? ' active' : '';
    return `<a href="/shop" class="nav-link${activeClass}">Seeds+Plants</a>`;
  });

  // ── Mobile drawer: "Shop" section label → "Seeds+Plants"
  content = content.replace(
    /<div class="drawer-section-label">Shop<\/div>/g,
    '<div class="drawer-section-label">Seeds+Plants</div>'
  );

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('✅ Updated:', path.basename(filePath));
    totalUpdated++;
    return true;
  } else {
    console.log('⏭  No change:', path.basename(filePath));
    return false;
  }
}

[...files, ...extraFiles].forEach(f => {
  if (fs.existsSync(f)) processFile(f);
});

console.log(`\nDone. Updated ${totalUpdated} files.`);
