#!/usr/bin/env node
/**
 * build-uplink.js
 * Downloads custom icons from R2 and embeds them as base64 in uplink.html.
 * Run during the Render build phase (has full internet access).
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const ICONS = {
  logo:    'https://pub-629428d185ca4960a0a73c850d32294b.r2.dev/company_52536/images/967c7c56-85dc-4d52-ba74-a5e10f7ddb3c.png',
  tv:      'https://pub-629428d185ca4960a0a73c850d32294b.r2.dev/company_52536/images/746a3bc9-ea82-4311-af54-fce8578065ce.png',
  voice:   'https://pub-629428d185ca4960a0a73c850d32294b.r2.dev/company_52536/images/203bf57c-a043-49be-92c6-9257cc3e754c.png',
  academy: 'https://pub-629428d185ca4960a0a73c850d32294b.r2.dev/company_52536/images/9c2a1722-4a4a-4d45-a006-75ddf2726aa5.png',
  reads:   'https://pub-629428d185ca4960a0a73c850d32294b.r2.dev/company_52536/images/6e684457-e618-4d84-a654-c074fec0c2d3.png',
  arcade:  'https://pub-629428d185ca4960a0a73c850d32294b.r2.dev/company_52536/images/0d83d33c-f5d6-4e9c-a76e-9ea07351dd38.png',
  radio:   'https://pub-629428d185ca4960a0a73c850d32294b.r2.dev/company_52536/images/a2cb9679-c4b4-49d3-9384-59dd81a0da58.png',
  kids:    'https://pub-629428d185ca4960a0a73c850d32294b.r2.dev/company_52536/images/813f0f32-7297-4257-9369-f0069252ab0d.png',
  pages:   'https://pub-629428d185ca4960a0a73c850d32294b.r2.dev/company_52536/images/82890733-23a0-4fc8-af93-45753190aed1.png',
};

function fetchBase64(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function buildHTML(b64) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Uplink — Community Hub</title>
  <style>
    *, *::before, *::after {
      margin: 0; padding: 0; box-sizing: border-box;
    }

    :root {
      --bg:        #090d18;
      --panel:     #0f1525;
      --card:      #141c2f;
      --card-hov:  #1a2440;
      --border:    #1e2d48;
      --border-hov:#f5a623;
      --amber:     #f5a623;
      --amber-dim: #c47d0e;
      --blue:      #4da6ff;
      --blue-dim:  #2176c7;
      --text:      #e4eaf7;
      --text-muted:#7a8ca8;
      --text-dim:  #4a5a72;
      --green:     #4ade80;
      --sidebar-w: 210px;
      --header-h:  110px;
    }

    html, body {
      height: 100%; width: 100%;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui,
                   'Helvetica Neue', Arial, sans-serif;
      overflow: hidden;
    }

    /* ── LAYOUT ─────────────────────────────────────────── */
    .shell {
      display: grid;
      grid-template-rows: var(--header-h) 1fr;
      grid-template-columns: var(--sidebar-w) 1fr;
      height: 100vh;
    }

    /* ── HEADER / LOGO ROW ──────────────────────────────── */
    header {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 14px;
      border-bottom: 1px solid var(--border);
      background: var(--panel);
      padding: 0 24px;
      position: relative;
    }

    .logo-wrap {
      display: flex;
      align-items: center;
      gap: 14px;
      user-select: none;
    }

    .logo-img {
      height: 70px;
      width: auto;
      object-fit: contain;
      flex-shrink: 0;
    }

    /* Clock top-right */
    .clock-block {
      position: absolute;
      right: 28px;
      top: 50%;
      transform: translateY(-50%);
      text-align: right;
    }
    .clock-time {
      font-size: 22px;
      font-weight: 700;
      color: var(--text);
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.02em;
    }
    .clock-date {
      font-size: 11px;
      color: var(--text-muted);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-top: 2px;
    }

    /* Status dot */
    .status-dot {
      position: absolute;
      left: 20px;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 11px;
      color: var(--text-muted);
      letter-spacing: 0.06em;
    }
    .dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: var(--green);
      box-shadow: 0 0 8px var(--green);
      animation: pulse 2.5s ease-in-out infinite;
    }
    @keyframes pulse {
      0%,100% { opacity: 1; box-shadow: 0 0 8px var(--green); }
      50%      { opacity: 0.6; box-shadow: 0 0 3px var(--green); }
    }

    /* ── SIDEBAR ────────────────────────────────────────── */
    .sidebar {
      background: var(--panel);
      border-right: 1px solid var(--border);
      padding: 28px 0 20px;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
    }

    .sidebar-label {
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: 0.18em;
      color: var(--text-dim);
      text-transform: uppercase;
      padding: 0 22px 10px;
    }

    .sidebar nav {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 0 10px;
    }

    .sidebar a {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 8px;
      text-decoration: none;
      color: var(--text-muted);
      font-size: 13.5px;
      font-weight: 500;
      letter-spacing: 0.02em;
      transition: background 0.15s, color 0.15s;
    }
    .sidebar a:hover {
      background: var(--card-hov);
      color: var(--text);
    }
    .sidebar a .nav-icon {
      width: 16px; height: 16px;
      flex-shrink: 0;
      opacity: 0.7;
    }
    .sidebar a:hover .nav-icon { opacity: 1; }

    .sidebar-divider {
      height: 1px;
      background: var(--border);
      margin: 14px 22px;
    }

    .sidebar-footer {
      margin-top: auto;
      padding: 0 22px;
      font-size: 10px;
      color: var(--text-dim);
      letter-spacing: 0.04em;
      line-height: 1.6;
    }

    /* ── MAIN CONTENT ───────────────────────────────────── */
    .main {
      padding: 32px 36px;
      overflow-y: auto;
      background: var(--bg);
    }

    .main-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 28px;
    }
    .main-title {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--text-dim);
    }
    .main-sub {
      font-size: 11px;
      color: var(--text-dim);
      letter-spacing: 0.06em;
    }

    /* ── TILE GRID ──────────────────────────────────────── */
    .tiles {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 18px;
    }

    .tile {
      display: flex;
      align-items: center;
      justify-content: center;
      aspect-ratio: 1;
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 10%;
      text-decoration: none;
      color: var(--text);
      cursor: pointer;
      transition: background 0.2s ease, border-color 0.2s ease,
                  transform 0.2s ease, box-shadow 0.2s ease;
      position: relative;
      overflow: hidden;
    }
    .tile::before {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at 50% 0%, rgba(245,166,35,0.07) 0%, transparent 70%);
      opacity: 0;
      transition: opacity 0.2s ease;
      pointer-events: none;
    }
    .tile:hover {
      background: #f5f5f5;
      border-color: var(--amber);
      transform: translateY(-3px);
      box-shadow: 0 10px 30px rgba(245,166,35,0.18), 0 2px 8px rgba(0,0,0,0.4);
    }
    .tile:hover::before { opacity: 1; }

    .tile-icon {
      width: 100%;
      height: 100%;
      flex-shrink: 0;
      object-fit: contain;
    }

    /* Tile accent colours per category */
    .tile-tv:hover     { border-color: #4da6ff; box-shadow: 0 10px 30px rgba(77,166,255,0.18), 0 2px 8px rgba(0,0,0,0.4); }
    .tile-voice:hover  { border-color: #a78bfa; box-shadow: 0 10px 30px rgba(167,139,250,0.18), 0 2px 8px rgba(0,0,0,0.4); }
    .tile-academy:hover{ border-color: #fb923c; box-shadow: 0 10px 30px rgba(251,146,60,0.18), 0 2px 8px rgba(0,0,0,0.4); }
    .tile-reads:hover  { border-color: #34d399; box-shadow: 0 10px 30px rgba(52,211,153,0.18), 0 2px 8px rgba(0,0,0,0.4); }
    .tile-arcade:hover { border-color: #f43f5e; box-shadow: 0 10px 30px rgba(244,63,94,0.18), 0 2px 8px rgba(0,0,0,0.4); }
    .tile-radio:hover  { border-color: #f59e0b; box-shadow: 0 10px 30px rgba(245,158,11,0.18), 0 2px 8px rgba(0,0,0,0.4); }
    .tile-kids:hover   { border-color: #ec4899; box-shadow: 0 10px 30px rgba(236,72,153,0.18), 0 2px 8px rgba(0,0,0,0.4); }
    .tile-pages:hover  { border-color: #22d3ee; box-shadow: 0 10px 30px rgba(34,211,238,0.18), 0 2px 8px rgba(0,0,0,0.4); }

    .tile-tv::before     { background: radial-gradient(circle at 50% 0%, rgba(77,166,255,0.08) 0%, transparent 70%); }
    .tile-voice::before  { background: radial-gradient(circle at 50% 0%, rgba(167,139,250,0.08) 0%, transparent 70%); }
    .tile-academy::before{ background: radial-gradient(circle at 50% 0%, rgba(251,146,60,0.08) 0%, transparent 70%); }
    .tile-reads::before  { background: radial-gradient(circle at 50% 0%, rgba(52,211,153,0.08) 0%, transparent 70%); }
    .tile-arcade::before { background: radial-gradient(circle at 50% 0%, rgba(244,63,94,0.08) 0%, transparent 70%); }
    .tile-radio::before  { background: radial-gradient(circle at 50% 0%, rgba(245,158,11,0.08) 0%, transparent 70%); }
    .tile-kids::before   { background: radial-gradient(circle at 50% 0%, rgba(236,72,153,0.08) 0%, transparent 70%); }
    .tile-pages::before  { background: radial-gradient(circle at 50% 0%, rgba(34,211,238,0.08) 0%, transparent 70%); }

    /* ── RESPONSIVE ─────────────────────────────────────── */
    @media (max-width: 1000px) {
      :root { --sidebar-w: 180px; --header-h: 90px; }
      .tiles { grid-template-columns: repeat(3, 1fr); }
      .logo-img { height: 56px; }
    }
    @media (max-width: 720px) {
      :root { --sidebar-w: 56px; --header-h: 70px; }
      .sidebar a span { display: none; }
      .sidebar-label { display: none; }
      .sidebar-footer { display: none; }
      .tiles { grid-template-columns: repeat(2, 1fr); }
      .clock-time { font-size: 16px; }
      .logo-img { height: 44px; }
    }
  </style>
</head>
<body>

<div class="shell">

  <!-- ═══ HEADER ══════════════════════════════════════════ -->
  <header>
    <!-- Status indicator -->
    <div class="status-dot">
      <div class="dot"></div>
      <span>ONLINE</span>
    </div>

    <!-- Centered logo -->
    <div class="logo-wrap">
      <img class="logo-img" src="data:image/png;base64,${b64.logo}" alt="Uplink" />
    </div>

    <!-- Live clock -->
    <div class="clock-block">
      <div class="clock-time" id="clock-time">--:-- --</div>
      <div class="clock-date" id="clock-date">---</div>
    </div>
  </header>

  <!-- ═══ SIDEBAR ═════════════════════════════════════════ -->
  <aside class="sidebar">
    <div class="sidebar-label">Navigation</div>
    <nav>

      <a href="/tvguide.html">
        <svg class="nav-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="1" y="4" width="14" height="10" rx="1.5" stroke="#f5a623" stroke-width="1.3"/>
          <path d="M5 1.5L8 4M11 1.5L8 4" stroke="#f5a623" stroke-width="1.2" stroke-linecap="round"/>
          <circle cx="8" cy="9" r="2" stroke="#f5a623" stroke-width="1.2"/>
        </svg>
        <span>TV Guide</span>
      </a>

      <a href="/community.html">
        <svg class="nav-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="1.5" y="2" width="13" height="12" rx="1.5" stroke="#4da6ff" stroke-width="1.3"/>
          <line x1="4" y1="6" x2="12" y2="6" stroke="#4da6ff" stroke-width="1.2" stroke-linecap="round"/>
          <line x1="4" y1="9" x2="12" y2="9" stroke="#4da6ff" stroke-width="1.2" stroke-linecap="round"/>
          <line x1="4" y1="12" x2="8" y2="12" stroke="#4da6ff" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
        <span>Community Board</span>
      </a>

      <a href="/recsports.html">
        <svg class="nav-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="8" cy="8" r="6" stroke="#34d399" stroke-width="1.3"/>
          <path d="M8 2C8 2 10 5 10 8C10 11 8 14 8 14" stroke="#34d399" stroke-width="1.2" stroke-linecap="round"/>
          <path d="M2 8H14" stroke="#34d399" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
        <span>Rec Sports Club</span>
      </a>

      <a href="/library.html">
        <svg class="nav-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="3" width="3.5" height="10" rx="1" stroke="#a78bfa" stroke-width="1.2"/>
          <rect x="6.5" y="3" width="3.5" height="10" rx="1" stroke="#a78bfa" stroke-width="1.2"/>
          <rect x="11" y="3" width="3" height="10" rx="1" stroke="#a78bfa" stroke-width="1.2"/>
        </svg>
        <span>Library</span>
      </a>

      <a href="/directory.html">
        <svg class="nav-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="6" cy="5" r="2.5" stroke="#fb923c" stroke-width="1.2"/>
          <path d="M1.5 13.5C1.5 11 3.5 9 6 9C8.5 9 10.5 11 10.5 13.5" stroke="#fb923c" stroke-width="1.2" stroke-linecap="round"/>
          <circle cx="12" cy="5" r="2" stroke="#fb923c" stroke-width="1.2"/>
          <path d="M10.5 9C11 9 12.5 9.5 14.5 12" stroke="#fb923c" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
        <span>Town Directory</span>
      </a>

      <div class="sidebar-divider"></div>

      <a href="/about.html">
        <svg class="nav-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="8" cy="8" r="6.5" stroke="#7a8ca8" stroke-width="1.2"/>
          <line x1="8" y1="7" x2="8" y2="11.5" stroke="#7a8ca8" stroke-width="1.4" stroke-linecap="round"/>
          <circle cx="8" cy="5" r="0.8" fill="#7a8ca8"/>
        </svg>
        <span>About</span>
      </a>

    </nav>

    <div class="sidebar-footer">
      uplink.local<br/>
      Off-grid community network
    </div>
  </aside>

  <!-- ═══ MAIN ══════════════════════════════════════════════ -->
  <main class="main">
    <div class="main-header">
      <span class="main-title">Apps &amp; Services</span>
      <span class="main-sub">8 services available</span>
    </div>

    <div class="tiles">

      <!-- ROW 1: TV, Voice, Academy, Pages -->

      <!-- 1. UplinkTV → Jellyfin -->
      <a class="tile tile-tv" href="http://uplink.local:8096" title="Jellyfin media server">
        <img class="tile-icon" src="data:image/png;base64,${b64.tv}" alt="UplinkTV" />
      </a>

      <!-- 2. Voice → PBX -->
      <a class="tile tile-voice" href="http://uplink.local:8001" title="PBX phone system">
        <img class="tile-icon" src="data:image/png;base64,${b64.voice}" alt="Voice" />
      </a>

      <!-- 3. Academy → Kolibri -->
      <a class="tile tile-academy" href="http://uplink.local:8080" title="Kolibri learning platform">
        <img class="tile-icon" src="data:image/png;base64,${b64.academy}" alt="Academy" />
      </a>

      <!-- 4. Pages (replaces Bulletin) -->
      <a class="tile tile-pages" href="/community.html" title="Community pages &amp; announcements">
        <img class="tile-icon" src="data:image/png;base64,${b64.pages}" alt="Pages" />
      </a>

      <!-- ROW 2: Kids, Reads, Arcade, Radio -->

      <!-- 5. Kids → kids universe page -->
      <a class="tile tile-kids" href="/kids.html" title="Kids zone">
        <img class="tile-icon" src="data:image/png;base64,${b64.kids}" alt="Kids" />
      </a>

      <!-- 6. Reads → local ebooks page -->
      <a class="tile tile-reads" href="/reads.html" title="Ebooks &amp; reading">
        <img class="tile-icon" src="data:image/png;base64,${b64.reads}" alt="Reads" />
      </a>

      <!-- 7. Arcade → games page -->
      <a class="tile tile-arcade" href="/arcade.html" title="Games &amp; arcade">
        <img class="tile-icon" src="data:image/png;base64,${b64.arcade}" alt="Arcade" />
      </a>

      <!-- 8. Radio → jukebox page -->
      <a class="tile tile-radio" href="/jukebox.html" title="Music &amp; radio">
        <img class="tile-icon" src="data:image/png;base64,${b64.radio}" alt="Radio" />
      </a>

    </div><!-- /tiles -->
  </main>

</div><!-- /shell -->

<script>
  // ── Live clock ───────────────────────────────────────────
  function updateClock() {
    var now  = new Date();
    var h    = now.getHours();
    var m    = now.getMinutes();
    var s    = now.getSeconds();
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    var hStr = h < 10 ? '0' + h : '' + h;
    var mStr = m < 10 ? '0' + m : '' + m;
    var sStr = s < 10 ? '0' + s : '' + s;

    var days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var dayName = days[now.getDay()];
    var month   = months[now.getMonth()];
    var date    = now.getDate();
    var year    = now.getFullYear();

    document.getElementById('clock-time').textContent = hStr + ':' + mStr + ':' + sStr + ' ' + ampm;
    document.getElementById('clock-date').textContent = dayName + ', ' + month + ' ' + date + ' ' + year;
  }

  updateClock();
  setInterval(updateClock, 1000);
</script>

</body>
</html>`;
}

async function main() {
  console.log('[build-uplink] Fetching custom icons...');

  const b64 = {};
  for (const [key, url] of Object.entries(ICONS)) {
    process.stdout.write(`  downloading ${key}... `);
    try {
      b64[key] = await fetchBase64(url);
      console.log(`OK (${Math.round(b64[key].length / 1024)}KB)`);
    } catch (err) {
      console.error(`FAILED: ${err.message}`);
      process.exit(1);
    }
  }

  const html = buildHTML(b64);
  const outPath = path.join(__dirname, '..', 'public', 'uplink.html');
  fs.writeFileSync(outPath, html, 'utf8');
  console.log(`[build-uplink] Written ${Math.round(html.length / 1024)}KB to ${outPath}`);
}

main().catch(err => {
  console.error('[build-uplink] Fatal:', err);
  process.exit(1);
});
