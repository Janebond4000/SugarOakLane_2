# Sugar Oak Lane / SugarOakOS — Architecture & Spec Handoff

> **Generated:** 2025-05-01
> **Purpose:** Comprehensive technical reference for any developer rebuilding or extending this codebase from scratch.
> **Scope:** Full-stack flower farm e-commerce + farm shop platform running at sugaroaklane.com

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technology Stack & Dependencies](#2-technology-stack--dependencies)
3. [Project File Structure](#3-project-file-structure)
4. [Complete Database Schema](#4-complete-database-schema)
5. [Migration History](#5-migration-history)
6. [API Route Map](#6-api-route-map)
7. [Checkout Flows (End-to-End)](#7-checkout-flows-end-to-end)
8. [Delivery Zone System](#8-delivery-zone-system)
9. [Order Tracker System](#9-order-tracker-system)
10. [Admin Authentication](#10-admin-authentication)
11. [CMS / Page Block System](#11-cms--page-block-system)
12. [Image Storage System](#12-image-storage-system)
13. [Email System](#13-email-system)
14. [Frontend Architecture](#14-frontend-architecture)
15. [Brand & Design System](#15-brand--design-system)
16. [Environment Variables](#16-environment-variables)
17. [Deployment Configuration](#17-deployment-configuration)
18. [Policy Text Summary](#18-policy-text-summary)
19. [External Services & Integrations](#19-external-services--integrations)

---

## 1. System Overview

Sugar Oak Lane is a dual-brand platform:

- **Loganville Flowers** — original storefront with Stripe-proxied checkout, delivery zone system, and order tracker. Routes at the root of the domain (`/`, `/product.html`, `/order-tracker.html`). The backend is branded "Loganville Flowers" in delivery policy but fulfillment is noted as "lovingly crafted by Sugar Oak Lane."
- **Sugar Oak Lane (SOL)** — full-featured farm shop with its own product catalog (`sol_products`), separate checkout flow (`/sol-checkout.html`), blog, CMS pages, events, wholesale inquiries, and wedding/workshop pages.

Both storefronts run on a **single Express.js server** (`server.js`, ~3929 lines) with a **single PostgreSQL database** (Neon). There is no React or Vue — all frontend is static HTML + vanilla JS with server-rendered content for blog and tracker pages.

### Core Architecture Pattern

```
Browser → Static HTML files (public/)
          ↕ Fetch API calls
Express.js (server.js) → PostgreSQL (Neon via pg Pool)
          ↕
Polsia Payment Proxy → Stripe
Polsia Email Proxy → Email delivery
Cloudflare R2 → Image storage (with DB fallback)
```

---

## 2. Technology Stack & Dependencies

### Runtime

| Dependency | Version | Purpose |
|---|---|---|
| `express` | ^4.18.2 | HTTP server, routing, middleware |
| `pg` | ^8.11.3 | PostgreSQL client (connection pool) |
| `multer` | ^1.4.5-lts.1 | Multipart file upload handling |
| `openai` | ^4.77.0 | (Available; not actively used in main routes) |
| `node` | Current LTS | Runtime |

### No Build Step for Server

The server (`server.js`) runs directly with `node server.js`. No TypeScript, no transpilation. CommonJS modules only.

### Scripts (`package.json`)

```json
{
  "scripts": {
    "start": "node server.js",
    "dev":   "node server.js",
    "build": "npm run migrate && node scripts/build-uplink.js",
    "migrate": "node migrate.js"
  }
}
```

---

## 3. Project File Structure

```
sugaroakos/
├── server.js                    # ALL server logic — 3929 lines, single file
├── migrate.js                   # Migration runner (reads migrations/ dir)
├── package.json
├── render.yaml                  # Render deployment configuration
├── migrations/                  # Database schema migrations (JS files)
│   └── *.js                     # Timestamped migration files
├── scripts/
│   └── build-uplink.js          # Uplink TV build script
├── public/                      # Static files served directly
│   ├── index.html               # Loganville Flowers storefront
│   ├── product.html             # Product detail page (LF)
│   ├── order-tracker.html       # Order tracker UI (LF)
│   ├── order-success.html       # Post-checkout success (LF)
│   ├── admin.html               # Admin dashboard
│   ├── admin-login.html         # Admin login page
│   ├── sol-home.html            # SOL homepage
│   ├── sol-shop.html            # SOL main shop
│   ├── sol-shop-flowers.html    # SOL flower shop
│   ├── sol-shop-seeds.html      # SOL seed shop
│   ├── sol-shop-nursery.html    # SOL nursery shop
│   ├── sol-shop-goods.html      # SOL farm goods shop
│   ├── sol-product.html         # SOL product detail
│   ├── sol-cart.html            # SOL cart page
│   ├── sol-checkout.html        # SOL checkout page
│   ├── sol-order-confirmed.html # SOL post-order confirmation
│   ├── sol-blog.html            # SOL blog listing
│   ├── sol-blog-post.html       # SOL blog post (SSR via /blog/:slug)
│   ├── sol-about.html           # SOL about page
│   ├── sol-contact.html         # SOL contact page
│   ├── sol-delivery.html        # SOL delivery info
│   ├── sol-events.html          # SOL events page
│   ├── sol-faq.html             # SOL FAQ
│   ├── sol-coming-soon.html     # Coming soon page
│   ├── sol-weddings.html        # SOL weddings
│   ├── sol-weddings-diy.html    # SOL DIY weddings
│   ├── sol-workshops.html       # SOL workshops
│   ├── sol-wholesale.html       # SOL wholesale inquiries
│   ├── delivery-policy.html     # Delivery policy (Loganville Flowers branded)
│   ├── refund-policy.html       # Refund policy (Sugar Oak Lane branded)
│   ├── substitution-policy.html # Substitution policy (Sugar Oak Lane branded)
│   ├── uplink.html              # Uplink TV interface
│   ├── uplink-tv.html           # Uplink TV display
│   ├── romance-book-club/       # Romance book club subsite
│   ├── logos/                   # Logo assets
│   ├── templates/               # HTML templates
│   ├── css/
│   │   ├── design-tokens.css    # Global CSS custom properties + resets
│   │   ├── sol.css              # Sugar Oak Lane primary stylesheet
│   │   └── main.css             # Additional styles
│   └── js/
│       ├── sol-cart.js          # Shopping cart (localStorage)
│       ├── components.js        # Shared UI utilities
│       └── tracking.js          # Analytics/event tracking
```

---

## 4. Complete Database Schema

### 4.1 Migration Runner Tables

#### `_migrations`
Tracks which migration files have been applied.

| Column | Type | Notes |
|---|---|---|
| `name` | VARCHAR | Migration name identifier, PRIMARY KEY |
| `applied_at` | TIMESTAMP | When migration was applied |

#### `users`
Created directly in `migrate.js` (not a migration file). Used for Polsia platform integration.

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL | PRIMARY KEY |
| `email` | VARCHAR(255) | UNIQUE NOT NULL |
| `stripe_subscription_id` | VARCHAR | Subscription ID |
| `subscription_status` | VARCHAR | active/inactive/etc. |
| `subscription_plan` | VARCHAR | Plan tier |
| `subscription_expires_at` | TIMESTAMP | Expiry |
| `subscription_updated_at` | TIMESTAMP | Last update |
| `created_at` | TIMESTAMP | DEFAULT NOW() |

---

### 4.2 Core E-Commerce Tables

#### `categories`
Product categories with hierarchical structure.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | SERIAL | PRIMARY KEY | |
| `name` | VARCHAR(100) | NOT NULL | Display name |
| `slug` | VARCHAR(100) | UNIQUE NOT NULL | URL identifier |
| `description` | TEXT | | |
| `icon` | VARCHAR(10) | | Emoji icon |
| `sort_order` | INTEGER | DEFAULT 0 | Display ordering |
| `is_active` | BOOLEAN | DEFAULT TRUE | |
| `sidebar_visible` | BOOLEAN | DEFAULT TRUE | Show in shop sidebar filter |
| `parent_id` | INTEGER | REFERENCES categories(id) ON DELETE CASCADE | NULL = root category |
| `level` | INTEGER | DEFAULT 0 | 0=root, 1=child, 2=grandchild |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Indexes:**
- `idx_categories_parent_id` on `parent_id`
- `categories_slug_idx` on `slug`

**Current Seed Data (SOL Categories):**

Root (level 0):
- `flower-shop` — 🌸 "Fresh cut flowers and arrangements"
- `seeds-bulbs` — 🌱 "Seeds, bulbs, and bare roots"
- `plant-nursery` — 🪴 "Live plants and plug starts"
- `farm-goods` — 🏡 "Farm-fresh produce and goods"

Level 1 (children of seeds-bulbs):
- `annuals` — Annual seeds/bulbs
- `perennials` — Perennial seeds/bulbs
- `herbs` — Herb seeds

Level 2 (children of annuals):
- `focal-flowers` — Primary focal flower types
- `filler-flowers` — Filler/accent flowers

Level 1 (children of farm-goods):
- `dried-herbs`
- `dried-teas`
- `dried-flowers`

---

#### `products`
Legacy product catalog for the original Loganville Flowers storefront.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | SERIAL | PRIMARY KEY | |
| `name` | VARCHAR(255) | NOT NULL | |
| `slug` | VARCHAR(255) | UNIQUE NOT NULL | |
| `category_id` | INTEGER | REFERENCES categories(id) | NULL allowed |
| `description` | TEXT | | |
| `short_description` | VARCHAR(400) | | |
| `price_standard` | DECIMAL(10,2) | | Standard tier price |
| `price_deluxe` | DECIMAL(10,2) | | Deluxe tier price |
| `price_premium` | DECIMAL(10,2) | | Premium tier price |
| `image_url` | TEXT | | Primary product image |
| `occasion_tags` | TEXT[] | DEFAULT '{}' | Array of occasion keywords |
| `is_active` | BOOLEAN | DEFAULT TRUE | |
| `is_featured` | BOOLEAN | DEFAULT FALSE | |
| `sort_order` | INTEGER | DEFAULT 0 | |
| `seo_title` | VARCHAR(255) | | |
| `seo_description` | TEXT | | |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Indexes:**
- `products_category_id_idx` on `category_id` WHERE `is_active = true`
- `products_slug_idx` on `slug`

**Price Tiers:** Standard, Deluxe, Premium — each a separate column. UI shows three "stems" or arrangement sizes.

---

#### `sol_products`
Primary product table for Sugar Oak Lane farm shop. Supersedes `products`.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | SERIAL | PRIMARY KEY | |
| `name` | VARCHAR(255) | NOT NULL | |
| `slug` | VARCHAR(255) | UNIQUE NOT NULL | |
| `sol_category` | VARCHAR(100) | DEFAULT 'flower-shop' | Primary category slug |
| `subcategory` | VARCHAR(100) | | Sub-category label |
| `categories` | JSONB | | Array of category slugs for multi-category |
| `description` | TEXT | | Long description |
| `short_description` | VARCHAR(400) | | Short blurb |
| `price` | DECIMAL(10,2) | | Single price (no tiers) |
| `price_label` | VARCHAR(60) | | e.g., "per packet", "each" |
| `images` | JSONB | DEFAULT '[]' | Array of image URL strings |
| `availability` | VARCHAR(50) | DEFAULT 'in_stock' | in_stock/out_of_stock/pre_order/seasonal |
| `inventory_count` | INTEGER | | Optional quantity tracking |
| `season_tags` | TEXT[] | | e.g., ['spring', 'summer'] |
| `type_tags` | TEXT[] | | e.g., ['annual', 'perennial'] |
| `is_featured` | BOOLEAN | DEFAULT FALSE | |
| `is_active` | BOOLEAN | DEFAULT TRUE | |
| `sort_order` | INTEGER | DEFAULT 0 | |
| `seo_title` | VARCHAR(255) | | |
| `seo_description` | TEXT | | |
| `flower_name` | VARCHAR(100) | | Botanical/common flower name |
| `flower_type` | VARCHAR(100) | | Type classification (Annual, Perennial, etc.) |
| `dahlia_type` | VARCHAR(100) | | Dahlia-specific classification |
| `packet_quantity` | INTEGER | | Seed count per packet |
| `seed_details` | JSONB | | Rich growing data (see below) |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**`seed_details` JSONB Schema:**
```json
{
  "growing_instructions": "string",
  "days_to_maturity": "string",
  "plant_height": "string",
  "plant_spread": "string",
  "sun_requirements": "string",
  "soil_preferences": "string",
  "spacing": "string",
  "sow_method": "string",
  "hardiness_zones": "string",
  "best_uses": "string",
  "harvest_tips": "string",
  "vase_life": "string",
  "special_notes": "string"
}
```

**Indexes:**
- `sol_products_category_idx` on `sol_category` WHERE `is_active = true`
- `sol_products_slug_idx` on `slug`

**Categories used in `sol_category`:** `flower-shop`, `seeds-bulbs`, `plant-nursery`, `farm-goods`

---

#### `orders`
Legacy order table for Loganville Flowers Stripe checkout.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | SERIAL | PRIMARY KEY | |
| `order_number` | VARCHAR(30) | UNIQUE (WHERE NOT NULL) | Format: `LF-YYYYMMDD-NNNN` |
| `product_slug` | VARCHAR(255) | | |
| `product_name` | VARCHAR(255) | | |
| `tier` | VARCHAR(50) | | standard/deluxe/premium |
| `arrangement` | VARCHAR(255) | | |
| `price_product` | DECIMAL(10,2) | | Product price |
| `delivery_fee` | DECIMAL(10,2) | DEFAULT 14.99 | Delivery fee |
| `express_fee` | DECIMAL(10,2) | DEFAULT 0 | Express upcharge |
| `total_price` | DECIMAL(10,2) | | Total charged |
| `delivery_type` | VARCHAR(20) | DEFAULT 'standard' | standard/express |
| `delivery_date` | DATE | | Requested delivery date |
| `delivery_window` | VARCHAR(20) | | e.g., "9am-7pm" |
| `service_date` | DATE | | Scheduled service date |
| `payment_session_id` | VARCHAR(255) | | Stripe session ID |
| `payment_status` | VARCHAR(50) | DEFAULT 'unpaid' | unpaid/paid/refunded |
| `sender_name` | VARCHAR(255) | NOT NULL | |
| `sender_email` | VARCHAR(255) | | |
| `sender_phone` | VARCHAR(50) | | |
| `recipient_name` | VARCHAR(255) | | |
| `delivery_address` | TEXT | NOT NULL | |
| `delivery_city` | VARCHAR(100) | | |
| `delivery_state` | VARCHAR(20) | DEFAULT 'GA' | |
| `delivery_zip` | VARCHAR(20) | | |
| `card_message` | TEXT | | |
| `status` | VARCHAR(50) | DEFAULT 'pending' | pending/confirmed/delivered/cancelled |
| `tracker_stage` | VARCHAR(50) | DEFAULT 'order_received' | See tracker stages |
| `order_status` | VARCHAR(30) | DEFAULT 'new' | new/processing/shipped/delivered |
| `forwarding_address` | TEXT | | For rerouting |
| `notes` | TEXT | | Internal notes |
| `metadata` | JSONB | | Flexible extra data |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Indexes:**
- `sol_orders_sender_email_idx` on `sender_email`
- `sol_orders_sender_phone_idx` on `sender_phone`
- `sol_orders_delivery_zip_idx` on `delivery_zip`
- `sol_orders_status_idx` on `status`
- `sol_orders_created_at_idx` on `created_at`
- `sol_orders_order_number_idx` UNIQUE on `order_number` WHERE `order_number IS NOT NULL`
- `sol_orders_tracker_stage_idx` on `tracker_stage`
- `sol_orders_order_status_idx` on `order_status`

---

#### `sol_orders`
Primary order table for Sugar Oak Lane SOL checkout flow.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | SERIAL | PRIMARY KEY | |
| `order_number` | VARCHAR(40) | UNIQUE | Format: `SOL-YYYYMMDD-NNNN` |
| `status` | VARCHAR(50) | DEFAULT 'pending_payment' | pending_payment/confirmed/delivered/cancelled |
| `fulfillment_type` | VARCHAR(30) | DEFAULT 'pickup' | pickup/delivery/ship |
| `customer_name` | VARCHAR(255) | NOT NULL | |
| `customer_email` | VARCHAR(255) | | |
| `customer_phone` | VARCHAR(50) | | |
| `shipping_address` | TEXT | | Street address |
| `shipping_city` | VARCHAR(100) | | |
| `shipping_state` | VARCHAR(20) | | |
| `shipping_zip` | VARCHAR(20) | | |
| `delivery_zip` | VARCHAR(20) | | ZIP for delivery zone lookup |
| `subtotal` | DECIMAL(10,2) | | Cart subtotal |
| `shipping_fee` | DECIMAL(10,2) | DEFAULT 0 | Flat shipping fee |
| `delivery_fee` | DECIMAL(10,2) | DEFAULT 0 | Local delivery fee |
| `total_price` | DECIMAL(10,2) | | Final total |
| `items` | JSONB | DEFAULT '[]' | Array of cart items (see below) |
| `notes` | TEXT | | Customer notes |
| `stripe_session_id` | VARCHAR(255) | | Stripe checkout session ID |
| `metadata` | JSONB | | Flexible extra data |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**`items` JSONB Schema:**
```json
[
  {
    "slug": "string",
    "name": "string",
    "price": 3.95,
    "quantity": 2,
    "image": "https://...",
    "category": "seeds-bulbs"
  }
]
```

**Indexes:**
- `sol_orders_email_idx` on `customer_email`
- `sol_orders_number_idx` on `order_number`

---

### 4.3 Content Tables

#### `waitlist`
Newsletter/delivery area waitlist signups.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | SERIAL | PRIMARY KEY | |
| `email` | VARCHAR(255) | UNIQUE NOT NULL | |
| `zip_code` | VARCHAR(20) | | |
| `city` | VARCHAR(100) | | |
| `state` | VARCHAR(20) | | |
| `source` | VARCHAR(50) | DEFAULT 'storefront' | Where they signed up |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Indexes:** `waitlist_zip_idx` on `zip_code`, `waitlist_created_idx` on `created_at`

---

#### `storefront_events`
Analytics event tracking for storefront interactions.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | BIGSERIAL | PRIMARY KEY | |
| `event_type` | VARCHAR(50) | NOT NULL | e.g., 'product_view', 'add_to_cart' |
| `session_id` | VARCHAR(100) | | Browser session identifier |
| `product_id` | INTEGER | | |
| `product_slug` | VARCHAR(255) | | |
| `utm_params` | JSONB | DEFAULT '{}' | UTM tracking data |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

**Indexes:**
- `storefront_events_type_idx` on `event_type`
- `storefront_events_created_idx` on `created_at DESC`
- `storefront_events_session_idx` on `session_id`
- `storefront_events_utm_source_idx` on `(utm_params->>'utm_source')` WHERE `utm_params->>'utm_source' IS NOT NULL`

---

#### `site_settings`
Key-value store for site configuration.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `key` | VARCHAR(100) | PRIMARY KEY | Setting identifier |
| `value` | TEXT | NOT NULL DEFAULT '' | Setting value |
| `updated_at` | TIMESTAMPTZ | | Last update time |

**Known Settings:**
| Key | Default Value | Notes |
|---|---|---|
| `message_bar_enabled` | `'true'` | Show/hide announcement bar |
| `message_bar_text` | `'🌸 Same-day delivery available — order by 2PM! Free delivery on orders over $75'` | Bar copy |
| `message_bar_link` | `''` | Optional link URL |
| `theme_colors` | (varies) | JSON object with theme overrides |

**Dynamic Theme CSS:**
`GET /api/theme.css` reads `theme_colors` from `site_settings` and returns CSS custom property overrides. Falls back to design-token defaults if not set.

---

#### `pages`
CMS-managed pages with block-based content.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | SERIAL | PRIMARY KEY | |
| `slug` | VARCHAR(100) | UNIQUE NOT NULL | URL path segment |
| `title` | VARCHAR(255) | NOT NULL | |
| `description` | TEXT | DEFAULT '' | Page summary |
| `is_published` | BOOLEAN | DEFAULT false | Public visibility |
| `seo_title` | VARCHAR(255) | | |
| `seo_desc` | VARCHAR(500) | | |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | |

---

#### `page_blocks`
Content blocks for each CMS page.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | SERIAL | PRIMARY KEY | |
| `page_id` | INTEGER | REFERENCES pages(id) ON DELETE CASCADE | |
| `block_type` | VARCHAR(50) | NOT NULL | Block type identifier |
| `config` | JSONB | NOT NULL DEFAULT '{}' | Block configuration (schema varies by type) |
| `display_order` | INTEGER | NOT NULL DEFAULT 0 | Ordering within page |
| `is_visible` | BOOLEAN | DEFAULT true | |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Indexes:**
- `idx_page_blocks_page_id` on `page_id`
- `idx_page_blocks_order` on `(page_id, display_order)`

---

#### `blog_posts`
Database-backed blog posts (falls back to hardcoded array if DB is empty).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | SERIAL | PRIMARY KEY | |
| `title` | VARCHAR(255) | NOT NULL | |
| `slug` | VARCHAR(255) | UNIQUE NOT NULL | URL identifier |
| `excerpt` | TEXT | | Short preview |
| `content` | TEXT | | Full HTML/markdown content |
| `image_url` | TEXT | | Hero image |
| `author` | VARCHAR(120) | DEFAULT 'Sugar Oak Lane' | |
| `tags` | TEXT[] | DEFAULT '{}' | Categorization tags |
| `is_published` | BOOLEAN | DEFAULT FALSE | |
| `published_at` | TIMESTAMPTZ | | Publication date |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Indexes:**
- `blog_posts_slug_idx` on `slug`
- `blog_posts_published_idx` on `(is_published, published_at DESC)`

---

#### `media_uploads`
Uploaded media files with optional R2 or DB-backed storage.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | SERIAL | PRIMARY KEY | |
| `filename` | VARCHAR(512) | NOT NULL | Server-generated filename |
| `original_name` | VARCHAR(512) | NOT NULL | Original uploaded filename |
| `url` | TEXT | NOT NULL | R2 URL or `/api/media/:id` fallback URL |
| `mime_type` | VARCHAR(100) | | e.g., `image/jpeg` |
| `file_size` | INTEGER | | Bytes |
| `alt_text` | TEXT | | SEO alt text |
| `data_base64` | TEXT | | Base64 image data (DB fallback when R2 fails) |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Indexes:**
- `media_uploads_created_idx` on `created_at DESC`

---

## 5. Migration History

All migrations are in `/migrations/*.js` with format `module.exports = { name, up(client), down(client) }`.
The migration runner (`migrate.js`) also creates `users` and `_migrations` tables directly.

| Timestamp | Migration Name | What It Does |
|---|---|---|
| `1743300000000` | `create_products_tables` | Creates `categories` + `products` tables with full indexes |
| `1743300001000` | `seed_flower_products` | Seeds 8 legacy categories (roses, birthday, sympathy, romance, get-well, congratulations, just-because, seasonal) and 35 flower arrangement products for Loganville Flowers storefront |
| `1743300002000` | `create_orders_waitlist` | Creates `orders` table (with 3-tier pricing, delivery fields) and `waitlist` table |
| `1743300004000` | `update_orders_schema` | Adds delivery_date, delivery_window, service_date, payment_session_id, payment_status to orders |
| `1743500000000` | `create_storefront_events` | Creates analytics `storefront_events` table with JSONB UTM tracking |
| `1743600000000` | `add_order_number_tracker` | Adds order_number (format: LF-YYYYMMDD-NNNN, backfilled), tracker_stage, forwarding_address to orders |
| `1743700000000` | `add_site_settings` | Creates `site_settings` key-value table; seeds 3 announcement bar settings |
| `1743800000000` | `fix_product_images` | Replaces all Unsplash image URLs on legacy products with reliable Pexels CDN URLs |
| `1743900000000` | `create_sol_products` | Creates `sol_products` and `sol_orders` tables — the SOL farm shop schema |
| `1743900001000` | `seed_sol_products` | Seeds 15 initial SOL products across 4 categories (flower-shop, seeds-bulbs, plant-nursery, farm-goods) |
| `1744100000000` | `add_sol_product_filter_fields` | Adds flower_name, flower_type, dahlia_type to sol_products; backfills known values |
| `1744200000000` | `create_page_blocks` | Creates `pages` + `page_blocks` tables for CMS |
| `1744300000000` | `create_blog_posts` | Creates `blog_posts` table |
| `1744400000000` | `create_media_uploads` | Creates `media_uploads` table for image library |
| `1744500000000` | `add_seed_product_fields` | Adds packet_quantity + seed_details JSONB to sol_products |
| `1744600000000` | `seed_products_catalog` | Seeds 7 sunflower varieties + 6 Benary Giant zinnia colors into seeds-bulbs (all at $3.95/packet with full seed_details) |
| `1744601000000` | `seed_products_catalog_2` | Seeds more zinnias (Benary Orange/Yellow/Wine/Coral/Unicorn, Queen Lime series, Luminosa), poppies, cosmos, celosia, amaranth |
| `1744900100000` | `add_media_data_column` | Adds data_base64 TEXT column to media_uploads (DB fallback for R2 failures) |
| `1745000000000` | `categories_sidebar_settings` | Adds sidebar_visible BOOLEAN to categories; re-seeds root SOL categories with sidebar_visible=TRUE |
| `1745100000000` | `add_order_status` | Adds order_status VARCHAR(30) DEFAULT 'new' to orders; backfills; adds index |
| `1745200000000` | `fix_seed_product_images` | Assigns Pexels CDN image URLs to all 66 seed products that had empty images arrays; fixes unreliable Unsplash URLs on 13 original products |
| `1745300000000` | `category_hierarchy_and_cleanup` | Adds parent_id + level to categories; deletes old florist categories (IDs 1-8) and their products; establishes SOL category hierarchy (root → child → grandchild) |

---

## 6. API Route Map

All routes are defined in `server.js`. No separate route files.

### 6.1 Public Routes

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check — returns `{status:'ok', timestamp}` |
| `GET` | `/robots.txt` | SEO robots file |
| `GET` | `/sitemap.xml` | XML sitemap |
| `GET` | `/api/theme.css` | Dynamic CSS custom properties from site_settings.theme_colors |
| `GET` | `/api/categories` | All categories (hierarchical, active only) |
| `GET` | `/api/categories/:slug` | Single category + descendant slugs (recursive CTE) |
| `GET` | `/api/products` | Legacy products list (optional `?category=`, `?featured=`) |
| `GET` | `/api/products/:slug` | Single legacy product |
| `POST` | `/api/check-zip` | Check ZIP code → returns zone, fee, options |
| `POST` | `/api/create-checkout-session` | Loganville Flowers Stripe checkout |
| `POST` | `/api/orders` | Direct order creation (non-payment confirmation) |
| `POST` | `/api/waitlist` | Add email to waitlist |
| `POST` | `/api/events` | Track storefront events |
| `GET` | `/api/events/count` | Get event count (optional `?event_type=`, `?days=`) |
| `GET` | `/api/track/:orderNumber` | Order tracker data (public) |
| `GET` | `/api/sol/products` | SOL product list (optional filters) |
| `GET` | `/api/sol/products/:slug` | Single SOL product |
| `POST` | `/api/sol/checkout` | SOL checkout — creates sol_order, calls Polsia payment proxy |
| `GET` | `/api/sol/order-confirmed` | SOL order confirmation redirect handler |
| `GET` | `/api/settings/public` | Public site settings (message bar) |
| `GET` | `/api/blog` | Blog post list (DB first, fallback to hardcoded) |
| `GET` | `/api/blog/:slug` | Single blog post |
| `GET` | `/api/media/:id` | Serve DB-backed image by media_upload ID |
| `GET` | `/blog/:slug` | Server-rendered blog post HTML page |
| `GET` | `/pages/:slug` | Server-rendered CMS page |
| `GET` | `/romance-book-club*` | Romance book club subsite |

---

### 6.2 Admin Routes (Require Auth)

All admin routes require either HMAC cookie OR API key. See Section 10.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/admin/login` | Admin login — validates password, sets signed cookie |
| `POST` | `/api/admin/logout` | Clear admin session cookie |
| `GET` | `/api/admin/orders` | All orders (paginated, filterable) |
| `GET` | `/api/admin/orders/:id` | Single order detail |
| `PATCH` | `/api/admin/orders/:id` | Update order (status, tracker_stage, notes, etc.) |
| `DELETE` | `/api/admin/orders/:id` | Delete order |
| `GET` | `/api/admin/sol-orders` | SOL orders list |
| `PATCH` | `/api/admin/sol-orders/:id` | Update SOL order |
| `GET` | `/api/admin/waitlist` | Waitlist signups |
| `GET` | `/api/admin/analytics` | Analytics summary (order counts, revenue, zones) |
| `GET` | `/api/admin/subscribers` | Email subscribers list |
| `GET` | `/api/admin/customers` | Unique customers from orders |
| `GET` | `/api/admin/categories` | All categories (admin view) |
| `POST` | `/api/admin/categories` | Create category |
| `PUT` | `/api/admin/categories/:id` | Update category + recursively update child levels |
| `DELETE` | `/api/admin/categories/:id` | Delete category |
| `GET` | `/api/admin/products` | All legacy products |
| `POST` | `/api/admin/products` | Create legacy product |
| `PUT` | `/api/admin/products/:id` | Update legacy product |
| `DELETE` | `/api/admin/products/:id` | Delete legacy product |
| `GET` | `/api/admin/sol-products` | All SOL products |
| `POST` | `/api/admin/sol-products` | Create SOL product |
| `PUT` | `/api/admin/sol-products/:id` | Update SOL product |
| `DELETE` | `/api/admin/sol-products/:id` | Delete SOL product |
| `GET` | `/api/admin/pages` | All CMS pages |
| `POST` | `/api/admin/pages` | Create page |
| `PUT` | `/api/admin/pages/:id` | Update page metadata |
| `DELETE` | `/api/admin/pages/:id` | Delete page |
| `GET` | `/api/admin/pages/:id/blocks` | Get all blocks for a page |
| `POST` | `/api/admin/pages/:id/blocks` | Add block to page |
| `PUT` | `/api/admin/pages/:pageId/blocks/:blockId` | Update block config |
| `DELETE` | `/api/admin/pages/:pageId/blocks/:blockId` | Delete block |
| `POST` | `/api/admin/pages/:id/blocks/reorder` | Reorder blocks |
| `PUT` | `/api/admin/pages/:id/publish-all` | Publish all blocks on a page |
| `POST` | `/api/admin/pages/:id/clone` | Clone page (duplicates all blocks) |
| `GET` | `/api/admin/blog` | All blog posts (admin) |
| `POST` | `/api/admin/blog` | Create blog post |
| `PUT` | `/api/admin/blog/:id` | Update blog post |
| `DELETE` | `/api/admin/blog/:id` | Delete blog post |
| `GET` | `/api/admin/settings` | Get all site settings |
| `POST` | `/api/admin/settings` | Create/update site setting |
| `POST` | `/api/admin/upload` | Upload image (multipart/form-data, `field: image`) |
| `GET` | `/api/admin/media` | Media library list |
| `DELETE` | `/api/admin/media/:id` | Delete media entry |
| `PUT` | `/api/admin/media/:id` | Update media alt text |
| `GET` | `/api/admin/seed-images/:productId` | Download/seed image for product |

---

### 6.3 Static File Catch-Alls

```
GET /uploads/*       → serve from media_uploads (data_base64 or R2 redirect)
GET /logos/*         → serve public/logos/
GET *                → serve public/<path> (static file fallback)
```

---

## 7. Checkout Flows (End-to-End)

### 7.1 Loganville Flowers Checkout (Legacy)

**Entry:** `public/index.html` product cards → tier selection → delivery form → `POST /api/create-checkout-session`

**Request Payload:**
```json
{
  "product_name": "Rose Garden Arrangement",
  "product_slug": "rose-garden",
  "tier": "deluxe",
  "price": 69.99,
  "delivery_fee": 14.99,
  "express_fee": 0,
  "total_price": 84.98,
  "delivery_type": "standard",
  "delivery_date": "2025-05-10",
  "delivery_window": "9am-7pm",
  "sender_name": "Jane Smith",
  "sender_email": "jane@example.com",
  "sender_phone": "678-555-0100",
  "recipient_name": "Mom",
  "delivery_address": "123 Main St",
  "delivery_city": "Loganville",
  "delivery_state": "GA",
  "delivery_zip": "30052",
  "card_message": "Happy Birthday!"
}
```

**Server Logic (`POST /api/create-checkout-session`):**
1. Validate required fields
2. Generate order number: `SOL-YYYYMMDD-NNNN` (4-digit sequential suffix based on today's order count)
3. Insert into `orders` table with `payment_status = 'unpaid'`, `status = 'pending'`
4. Call Polsia payment proxy:
   ```
   POST https://polsia.com/api/payments/checkout-session
   Authorization: Bearer <POLSIA_API_KEY>
   {
     "amount": <total_price * 100>,  // cents
     "currency": "usd",
     "productName": "<product_name> - <tier>",
     "successUrl": "https://<host>/order-success.html?order=<order_number>",
     "cancelUrl": "https://<host>/"
   }
   ```
5. Return `{ success: true, url: <stripe_redirect_url>, orderNumber: <order_number> }`
6. Client redirects to Stripe

**On Return (`GET /order-success.html`):**
- Reads `?order=` param, fetches `GET /api/track/:orderNumber`
- Updates payment status to 'paid' (via Stripe webhook OR order-success handler)
- Sends notification emails

---

### 7.2 SOL Farm Shop Checkout

**Entry:** Any SOL shop page → `SolCart.addItem()` → `sol-cart.html` → `sol-checkout.html` → `POST /api/sol/checkout`

**Cart System:**
- Stored in `localStorage` under key `sol_cart`
- Managed by `public/js/sol-cart.js`
- `SolCart` global API:
  ```js
  SolCart.getItems()         // Array of cart items
  SolCart.getCount()         // Total item count
  SolCart.getSubtotal()      // Sum of price * quantity
  SolCart.addItem(product)   // Add/merge by slug
  SolCart.updateQty(slug, n) // Change quantity
  SolCart.removeItem(slug)   // Remove from cart
  SolCart.clear()            // Empty cart
  ```
- Dispatches `sol:cart:change` custom DOM event on changes
- Auto-renders count badge on all `[data-sol-cart-btn]` elements

**Fulfillment Options (selected on checkout page):**
1. **Farm Pickup** — no fee, customer picks up at farm
2. **Ship to Me** — shipping fee $4.79 flat (free over $25 subtotal)
3. **Local Delivery** — ZIP check required, uses delivery zone fees

**ZIP Check on Checkout:**
```js
// POST /api/check-zip { zip: "30052" }
// Response: { zone: "loganville", fee: 12.99, available: true, label: "Loganville" }
```

**Checkout Request Payload (`POST /api/sol/checkout`):**
```json
{
  "customer_name": "Jane Smith",
  "customer_email": "jane@example.com",
  "customer_phone": "678-555-0100",
  "fulfillment_type": "ship",
  "shipping_address": "123 Main St",
  "shipping_city": "Loganville",
  "shipping_state": "GA",
  "shipping_zip": "30052",
  "delivery_zip": null,
  "items": [...],
  "subtotal": 11.85,
  "shipping_fee": 4.79,
  "delivery_fee": 0,
  "total_price": 16.64,
  "notes": "Please pack carefully"
}
```

**Server Logic (`POST /api/sol/checkout`):**
1. Validate required fields
2. Generate order number: `SOL-FARM-YYYYMMDD-NNNN`
3. Insert into `sol_orders` with `status = 'pending_payment'`
4. Call Polsia payment proxy (same endpoint as above)
5. Return:
   - `{ success: true, checkout_url: <stripe_url> }` for redirect
   - OR `{ success: true, order_number, redirect_url }` for free orders

**Handling Response (client `submitCheckout()`):**
```js
if (data.checkout_url) window.location.href = data.checkout_url;
else if (data.redirect_url) window.location.href = data.redirect_url;
else if (data.order_number) window.location.href = '/sol-order-confirmed.html?order=' + data.order_number;
```
Then `SolCart.clear()`.

---

### 7.3 Stripe Subscription Links

Hardcoded `STRIPE_LINKS` constant in server.js:

| Key | Type | Description |
|---|---|---|
| `weekly_bouquet` | Subscription | Weekly flower subscription |
| `biweekly_bouquet` | Subscription | Bi-weekly flower subscription |
| `monthly_bouquet` | Subscription | Monthly flower subscription |
| `gift_bouquet_sm` | One-time | Small gift bouquet |
| `gift_bouquet_lg` | One-time | Large gift bouquet |

---

## 8. Delivery Zone System

### Zone Definitions

Defined as constants in server.js (approximate lines 440-528):

#### Zone: `loganville`
```js
const ZONE_LOGANVILLE = ['30052'];
```
| Field | Value |
|---|---|
| ZIPs | `30052` |
| Fee | `$12.99` |
| Label | `"Loganville"` |

#### Zone: `standard`
```js
const ZONE_STANDARD = [
  '30039', // Snellville
  '30040', // Cumming area
  '30041', // Cumming area
  '30043', // Lawrenceville
  '30044', // Lawrenceville
  '30045', // Lawrenceville
  '30046', // Lawrenceville
  '30047', // Lilburn area
  '30078', // Snellville
];
```
| Field | Value |
|---|---|
| ZIPs | See above (~9 ZIPs in Snellville, Lawrenceville, Grayson vicinity) |
| Fee | `$14.99` |
| Label | `"Standard Delivery"` |

#### Zone: `metro` (Coming Soon)
```js
const METRO_ATLANTA_ZIPS = [/* large set of Atlanta area ZIPs */];
```
| Field | Value |
|---|---|
| Fee | `$24.99` |
| Label | `"Metro Atlanta"` |
| Status | Waitlist only — not available for checkout |

### Fee Constants
```js
const ZONE_FEES = {
  loganville: 12.99,
  standard:   14.99,
  metro:      24.99
};
const EXPRESS_UPCHARGE = 6.99;
```

### `getZoneForZip(zip)` → `string | null`
Returns `'loganville'`, `'standard'`, `'metro'`, or `null` if ZIP not in any zone.

### `getDeliveryOptions(zone)` → `Array`
Returns available delivery options for a zone:
```js
[
  { type: 'standard', label: 'Standard Delivery', fee: 14.99, window: '9am-7pm' },
  { type: 'express',  label: 'Express Delivery',  fee: 21.98, window: '4-Hour Window' }
]
```
Express fee = base fee + `EXPRESS_UPCHARGE` ($6.99).

### `POST /api/check-zip` Request/Response

**Request:**
```json
{ "zip": "30052" }
```

**Response (available zone):**
```json
{
  "available": true,
  "zone": "loganville",
  "fee": 12.99,
  "label": "Loganville",
  "options": [
    { "type": "standard", "label": "Standard Delivery", "fee": 12.99, "window": "9am-7pm" },
    { "type": "express",  "label": "Express (4-hour)",  "fee": 19.98, "window": "4-Hour Window" }
  ]
}
```

**Response (not available):**
```json
{
  "available": false,
  "message": "Delivery not currently available in this area."
}
```

### ZIP City Map
`ZIP_CITY_MAP` maps each served ZIP to its city name for display purposes (e.g., `30052 → "Loganville"`, `30039 → "Snellville"`).

### Delivery Hours
Monday–Saturday, 9 AM–7 PM ET. No Sunday delivery.

### Delivery Policy Summary
- Same-Day Standard: Order by 2 PM, delivered by 7 PM, $14.99
- Same-Day Express: Order by 12 PM, 4-hour window, $21.98
- Advance Standard: Up to 30 days out, by 7 PM, $14.99
- Advance Express: Up to 30 days out, 4-hour window, $21.98
- If no one home: leave at door or return to store
- Sympathy/funeral orders: recommend scheduling day before

---

## 9. Order Tracker System

### Tracker Stages

Defined in server.js as `TRACKER_STAGES` array:

```js
const TRACKER_STAGES = [
  'order_received',
  'in_design',
  'ready_to_deliver',
  'out_for_delivery',
  'delivery_completed'
];
```

### Stage Labels (`TRACKER_LABELS`)

| Stage | Label |
|---|---|
| `order_received` | "Order Received" |
| `in_design` | "In Design" |
| `ready_to_deliver` | "Ready to Deliver" |
| `out_for_delivery` | "Out for Delivery" |
| `delivery_completed` | "Delivered" |

### `GET /api/track/:orderNumber` Response

```json
{
  "success": true,
  "order": {
    "order_number": "LF-20250501-0001",
    "status": "confirmed",
    "tracker_stage": "in_design",
    "product_name": "Rose Garden Arrangement",
    "tier": "deluxe",
    "delivery_date": "2025-05-10",
    "delivery_window": "9am-7pm",
    "delivery_type": "standard",
    "recipient_name": "Mom",
    "delivery_city": "Loganville",
    "delivery_state": "GA",
    "created_at": "2025-05-01T14:30:00Z"
  },
  "stages": [
    { "key": "order_received",    "label": "Order Received",    "complete": true,  "active": false },
    { "key": "in_design",         "label": "In Design",         "complete": false, "active": true  },
    { "key": "ready_to_deliver",  "label": "Ready to Deliver",  "complete": false, "active": false },
    { "key": "out_for_delivery",  "label": "Out for Delivery",  "complete": false, "active": false },
    { "key": "delivery_completed","label": "Delivered",         "complete": false, "active": false }
  ]
}
```

**Stage completion logic:** All stages before the current `tracker_stage` index are `complete: true`, current stage is `active: true`, subsequent stages are incomplete and inactive.

### Tracker UI
Served from `public/order-tracker.html` — a standalone HTML page that fetches from `/api/track/:orderNumber`. Styled in a Domino's-style progress bar format.

### Updating Tracker Stage
Via admin API:
```
PATCH /api/admin/orders/:id
{ "tracker_stage": "out_for_delivery" }
```

---

## 10. Admin Authentication

### Authentication Methods (checked in priority order)

1. **HMAC Cookie** — `admin_session` cookie containing signed token
2. **API Key Header** — `x-api-key: <POLSIA_API_KEY>` or `x-api-key: <ADMIN_API_KEY>`
3. **Query Parameter** — `?key=<POLSIA_API_KEY>` or `?key=<ADMIN_API_KEY>`

### Cookie Format

```
admin_session = "admin-auth-v1.<base64url_encoded_hmac_sha256>"
```

**Signing secret:** `ADMIN_PASSWORD` env var (used as HMAC key). If `ADMIN_PASSWORD` is not set, `POLSIA_API_KEY` is used as fallback.

**Payload that is signed:** `"admin-auth-v1"` (static string, no user data embedded in signature payload).

**Expiry:** 7 days from issuance.

### Login Flow

```
POST /api/admin/login
{ "password": "<ADMIN_PASSWORD>" }
```

1. Compare submitted password with `ADMIN_PASSWORD` env var using timing-safe comparison (`crypto.timingSafeEqual`)
2. If valid: call `signAdminCookie()`, set `Set-Cookie: admin_session=...; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
3. Return `{ success: true }`

### Logout Flow

```
POST /api/admin/logout
```

Clears cookie with `Max-Age=0`.

### `isAdminRequest(req)` Function

```js
function isAdminRequest(req) {
  // 1. Check HMAC cookie
  const cookie = parseCookies(req)['admin_session'];
  if (cookie && isValidAdminCookie(cookie)) return true;

  // 2. Check API key header
  const headerKey = req.headers['x-api-key'];
  if (headerKey === process.env.POLSIA_API_KEY || headerKey === process.env.ADMIN_API_KEY) return true;

  // 3. Check query param
  const queryKey = req.query.key;
  if (queryKey === process.env.POLSIA_API_KEY || queryKey === process.env.ADMIN_API_KEY) return true;

  return false;
}
```

### `isValidAdminCookie(cookieValue)` Function

```js
function isValidAdminCookie(value) {
  const [prefix, sig] = value.split('.');
  if (prefix !== 'admin-auth-v1') return false;
  const expected = signAdminCookie();  // recompute fresh signature
  return crypto.timingSafeEqual(
    Buffer.from(expected.split('.')[1]),
    Buffer.from(sig)
  );
}
```

### Admin Pages

- `public/admin.html` — Main admin dashboard (orders, analytics, product management)
- `public/admin-login.html` — Login form that POSTs to `/api/admin/login`

---

## 11. CMS / Page Block System

### How It Works

1. Admin creates a `page` record with a slug, title, and publish flag
2. Admin adds `page_blocks` to the page, each with a `block_type` and `config` JSONB
3. Public request `GET /pages/:slug` triggers server-side rendering
4. Server fetches the page and its blocks, renders them via block-type template functions
5. Returns full HTML page

### Block Types (12 types)

| Block Type | Description | Key Config Fields |
|---|---|---|
| `hero` | Full-width hero section with headline, subtext, CTA button | `heading`, `subheading`, `cta_text`, `cta_url`, `background_image`, `overlay_opacity` |
| `text_image` | Two-column text + image layout | `heading`, `body`, `image_url`, `image_alt`, `image_side` (left/right), `cta_text`, `cta_url` |
| `gallery_grid` | Photo grid gallery | `heading`, `images` (array: `{url, alt, caption}`) |
| `cta_banner` | Full-width call-to-action banner | `heading`, `subheading`, `cta_text`, `cta_url`, `background_color` |
| `card_grid` | Grid of feature cards | `heading`, `cards` (array: `{title, body, icon, image_url, link_url, link_text}`) |
| `testimonial` | Customer testimonial(s) | `heading`, `testimonials` (array: `{quote, author, role}`) |
| `feature_icons` | Icon + text feature list | `heading`, `features` (array: `{icon, title, description}`) |
| `rich_text` | WYSIWYG-style rich text block | `content` (HTML string) |
| `contact_form` | Contact form with fields | `heading`, `subheading`, `submit_label` |
| `listing` | Product or item listing | `heading`, `category`, `limit` |
| `pricing_table` | Pricing tiers table | `heading`, `tiers` (array: `{name, price, features[], cta_text, cta_url, is_featured}`) |
| `sidebar_content` | Two-column layout with sidebar | `main_content`, `sidebar_content`, `sidebar_position` |

### Page Versioning

Each `page_block` `updated_at` timestamp tracks last modification. Admin clone API (`POST /api/admin/pages/:id/clone`) duplicates all blocks.

### Publish Flow

- `pages.is_published = false` → page returns 404 to public
- `pages.is_published = true` → page is live
- `POST /api/admin/pages/:id/publish-all` → sets all blocks' `is_visible = true`, sets `pages.is_published = true`
- Individual blocks can be hidden with `is_visible = false`

### Block Reordering

```
POST /api/admin/pages/:id/blocks/reorder
{ "order": [blockId1, blockId2, blockId3, ...] }
```

Updates `display_order` for each block ID based on array position.

---

## 12. Image Storage System

### Upload Flow (`POST /api/admin/upload`)

Accepts `multipart/form-data` with field name `image`.

**Step 1 — Process with multer:**
- Memory storage (no disk write)
- Limits: `fileSize: 10MB`, single file

**Step 2 — Try R2 upload:**
```
PUT ${POLSIA_R2_BASE_URL}/r2/${companyId}/${uuid}.${ext}
Content-Type: <mime_type>
Authorization: Bearer <POLSIA_API_KEY>
Body: <file buffer>
```

**Circuit Breaker:**
- If R2 returns 404, the circuit trips: `r2CircuitOpen = true`
- While circuit is open: skip R2 entirely, use DB fallback
- Circuit resets after `R2_CIRCUIT_RESET_MS` milliseconds (default: 300,000ms / 5 minutes)

**Step 3a — R2 success:**
- URL stored as `${POLSIA_R2_BASE_URL}/r2/${key}`
- Record inserted into `media_uploads` with `url = r2Url`, `data_base64 = null`

**Step 3b — R2 failure / circuit open:**
- Convert buffer to base64: `buffer.toString('base64')`
- Record inserted into `media_uploads` with:
  - `url = /api/media/${insertedId}` (served from DB)
  - `data_base64 = <base64string>`

### Serving DB-Backed Images (`GET /api/media/:id`)

```js
const row = await pool.query('SELECT data_base64, mime_type FROM media_uploads WHERE id = $1', [id]);
const buffer = Buffer.from(row.data_base64, 'base64');
res.set('Content-Type', row.mime_type || 'image/jpeg');
res.set('Cache-Control', 'public, max-age=86400');
res.send(buffer);
```

### `/uploads/*` Catch-All

Legacy path handler — attempts to find the media record by filename and redirect or serve from DB.

---

## 13. Email System

### Email Proxy

All emails sent via Polsia email proxy:
```
POST https://polsia.com/api/company-email/send
Authorization: Bearer <POLSIA_API_KEY>
Content-Type: application/json
{
  "to": "recipient@example.com",
  "subject": "Order Confirmed",
  "html": "<html>..."
}
```

### Admin Notification Email

**Recipient:** `nakita.hemingway@gmail.com` (hardcoded in server.js)
**Triggered by:** Every new order creation (both LF and SOL checkouts)
**Subject:** `New Order: #<order_number> — <product_name>`

**Template** (`buildAdminOrderEmailHtml(order)`):
- Order number, product, tier, total
- Delivery details (date, window, address, recipient)
- Sender contact info
- Card message

### Customer Confirmation Email

**Recipient:** `order.sender_email` or `order.customer_email`
**Triggered by:** Successful order creation
**Subject:** `Order Confirmed: #<order_number>`

**Template** (`buildCustomerConfirmationHtml(order)`):
- Confirmation message with order number
- Order summary (product, tier, total)
- Delivery info
- Policy reminders
- Contact: `hello@sugaroaklane.com`

### Email Contact for Customers

Policy pages list: `hello@sugaroaklane.com` for all refund, substitution, and general inquiries.

---

## 14. Frontend Architecture

### Pattern: Static HTML + Vanilla JS + Fetch API

No React, Vue, or Angular. Every page is a standalone `.html` file in `public/`. JavaScript is plain ES6+ with no bundler.

### Page Organization

| Prefix | Brand | Description |
|---|---|---|
| (none) | Loganville Flowers | Root storefront: `index.html`, `product.html`, `order-tracker.html` |
| `sol-` | Sugar Oak Lane | All SOL pages: `sol-home.html`, `sol-shop.html`, etc. |
| `admin` | Admin | `admin.html`, `admin-login.html` |

### Cart System (`public/js/sol-cart.js`)

Self-contained IIFE. Exposes `window.SolCart` global.

- **Storage:** `localStorage['sol_cart']` — array of `{slug, name, price, quantity, image, category}`
- **Events:** Fires `sol:cart:change` DOM custom event on every mutation
- **Badge rendering:** Auto-finds `[data-sol-cart-btn]` elements and overlays a count badge

```js
// Badge injection
const badge = document.createElement('span');
badge.className = 'sol-cart-badge';
badge.textContent = count;
// Injected CSS:
.sol-cart-badge {
  position: absolute;
  top: -8px;
  right: -8px;
  background: var(--green);
  color: white;
  border-radius: 50%;
  font-size: 11px;
  min-width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

### Shared Components (`public/js/components.js`)

| Function | Description |
|---|---|
| `initMobileNav()` | Hamburger toggle — adds `.active` to `.nav` |
| `initStickyHeader()` | Adds `.scrolled` to `.header` after 50px scroll |
| `initSidebarToggle()` | Toggle `.hidden`/`.visible` on `.sidebar` |
| `initFilters()` | Listens for `.filter-label` input changes |
| `initRangeSlider()` | Syncs range inputs to `[data-range-output]` |
| `initModal(modalId)` | Open/close modal, lock body scroll |

### Analytics Tracking (`public/js/tracking.js`)

Posts events to `POST /api/events` for storefront analytics.

### Server-Side Rendered Pages

Two pages rendered server-side:
- **`GET /blog/:slug`** — fetches blog post from DB (or BLOG_POSTS fallback), injects content into `public/sol-blog-post.html` template
- **`GET /pages/:slug`** — fetches page + blocks, renders block HTML, injects into page shell

---

## 15. Brand & Design System

### Color Palette (CSS Custom Properties)

```css
:root {
  --white:      #FFFFFF;
  --linen:      #FEFDF8;    /* Page background (warm off-white) */
  --linen-dk:   #F5F0E8;    /* Slightly darker linen */
  --linen-md:   #EDE7DC;    /* Medium linen */
  --green:      #3A5A40;    /* Primary brand green */
  --green-dk:   #2C4730;    /* Dark green (hover states) */
  --green-lt:   #4D7A55;    /* Light green (accents) */
  --green-bg:   #EDF3EE;    /* Green background tint */
  --text:       #1A1A1A;    /* Primary text */
  --text-md:    #6A6260;    /* Secondary text */
  --text-lt:    #9A9490;    /* Tertiary/placeholder text */
  --border:     #DDD8CC;    /* Primary border */
  --border-lt:  #EEEBE3;    /* Light border */
}
```

### Typography

| Variable | Value | Usage |
|---|---|---|
| `--font-serif` | `'Cormorant Garamond', serif` | All headings (h1-h6) |
| `--font-sans` | `'Inter', sans-serif` | Body text, UI |

**Heading scale:**
- `h1`: 3.5rem (2rem on mobile)
- `h2`: 2.5rem (1.5rem on mobile)
- `h3`: 1.75rem (1.25rem on mobile)
- `h4`: 1.35rem
- `h5`: 1.15rem

**Body:** font-size 16px, line-height 1.65, antialiased

### Shadows

```css
--shadow:    0 1px 10px rgba(26,26,26,0.05);   /* Subtle card shadow */
--shadow-md: 0 4px 20px rgba(26,26,26,0.08);   /* Elevated card shadow */
```

### Spacing Scale

```css
--spacing-xs:  0.25rem;   /* 4px  */
--spacing-sm:  0.5rem;    /* 8px  */
--spacing-md:  1rem;      /* 16px */
--spacing-lg:  2rem;      /* 32px */
--spacing-xl:  3rem;      /* 48px */
--spacing-2xl: 4rem;      /* 64px */
```

### Transitions

```css
--transition: all 0.3s ease;
```

### Buttons

Default button style (applied to `button, .btn`):
- Background: `--green`
- Color: white
- Border: 1px solid `--green`
- Border-radius: 2px (sharp, not rounded)
- Font-size: 0.95rem
- Text-transform: uppercase
- Letter-spacing: 0.05em

Variants:
- `.btn-secondary` — transparent bg, green text/border; hover: `--green-bg` bg
- `button:disabled` — opacity 0.5, cursor not-allowed

### Layout

- Max content width: `--max-w: 1280px`
- Container: `max-width: var(--max-w); margin: 0 auto; padding: 0 var(--spacing-md)`
- Grid classes: `.grid-2`, `.grid-3`, `.grid-4` (collapse to 2-col at 768px, 1-col at 640px)
- Section padding: `--spacing-2xl` (4rem) top/bottom

### Google Fonts

Both `Cormorant Garamond` and `Inter` loaded from Google Fonts CDN on each HTML page.

---

## 16. Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (Neon) |
| `ADMIN_PASSWORD` | ✅ | Admin login password + HMAC signing key |
| `POLSIA_API_KEY` | ✅ | Auth key for Polsia payment proxy + email proxy + R2 upload |
| `POLSIA_R2_BASE_URL` | ✅ | Base URL for R2 image storage (e.g., `https://polsia.com`) |
| `NODE_ENV` | ✅ | Set to `production` on Render |
| `ADMIN_API_KEY` | Optional | Secondary API key for admin auth (in addition to POLSIA_API_KEY) |
| `PORT` | Optional | HTTP port (defaults to 3000) |

### How Variables Are Used

| Variable | Used Where |
|---|---|
| `DATABASE_URL` | `pg.Pool` constructor in both `server.js` and `migrate.js` |
| `ADMIN_PASSWORD` | `isAdminRequest()`, `signAdminCookie()`, `POST /api/admin/login` |
| `POLSIA_API_KEY` | Polsia payment proxy calls, email proxy calls, R2 upload, admin auth fallback |
| `POLSIA_R2_BASE_URL` | Construct R2 upload URL and media URLs |
| `ADMIN_API_KEY` | Secondary admin auth option |
| `NODE_ENV` | Cookie `Secure` flag (only in production) |

---

## 17. Deployment Configuration

### Platform: Render (Web Service)

`render.yaml`:
```yaml
services:
  - type: web
    runtime: node
    name: app
    buildCommand: npm install && (node migrate.js || echo "migrate warning") && (node scripts/build-uplink.js || echo "uplink build warning")
    startCommand: npm start
    healthCheckPath: /health
    envVars:
      - key: NODE_ENV
        value: production
```

### Build Command Breakdown

```bash
npm install                          # Install dependencies
node migrate.js || echo "warning"    # Run migrations (non-fatal if fails)
node scripts/build-uplink.js || echo "warning"  # Build Uplink TV (non-fatal)
```

### Start Command

```bash
npm start → node server.js
```

### Health Check

`GET /health` returns:
```json
{ "status": "ok", "timestamp": "2025-05-01T14:30:00.000Z" }
```

### Database

- **Provider:** Neon (serverless PostgreSQL)
- **Connection:** Standard `pg.Pool` with `DATABASE_URL`
- **Pool config:** Default pg Pool settings (max 10 connections)
- **Migrations:** Run at build time via `node migrate.js`

### Static Files

All files in `public/` served directly by Express `express.static('public')`.

---

## 18. Policy Text Summary

### Delivery Policy (Loganville Flowers branded)

| Service | Order By | Delivery Window | Price |
|---|---|---|---|
| Same-Day Standard | 2 PM ET | By 7 PM | $14.99 |
| Same-Day 4-Hour Express | 12 PM ET | Within 4 hours | $21.98 |
| Advance Standard | Up to 30 days out | By 7 PM on selected date | $14.99 |
| Advance Express | Up to 30 days out | 4-hour window | $21.98 |

- Service area: Loganville, Grayson, Lawrenceville, Snellville GA (Gwinnett & Walton County)
- No Sunday delivery
- If no one home: leave at door or return to store

### Substitution Policy (Sugar Oak Lane)

- Substitutions may occur due to weather, crop timing, quality, or supply issues
- Substitution priority: color-first → stem-for-stem value → style integrity → size
- Customers may specify up to **2 "MUST HAVE" flowers** in order notes
- Common substitutions documented: Cafe au Lait dahlia → Japanese dinner plate; sweet peas → lisianthus or freesia; sunflowers → black-eyed Susans; eucalyptus → other greenery
- Contact `hello@sugaroaklane.com` at least 48 hours before order date for specific flower requests

### Refund Policy (Sugar Oak Lane)

**Qualifies for refund:**
- Non-delivery
- Significant damage (photo required within 2 hours of delivery)
- Wrong order received
- Sugar Oak Lane cancels the order

**Does NOT qualify:**
- Subjective dissatisfaction with arrangement style
- Improper post-delivery care
- Color variations within the same palette
- Substitutions made per substitution policy
- Missed pickups (customer no-show)

**Process:** Email `hello@sugaroaklane.com` within 2 hours with order number, photo, and description. Process time: 5–7 business days.

**Cancellation:** Cancel without penalty up to 48 hours before service date. Cancellations within 48 hours may incur a 50% fee.

---

## 19. External Services & Integrations

### Polsia Platform

The app is deployed on Polsia's infrastructure and integrates with several Polsia platform services:

| Service | Endpoint | Auth |
|---|---|---|
| **Payment Proxy** | `POST https://polsia.com/api/payments/checkout-session` | Bearer `POLSIA_API_KEY` |
| **Email Proxy** | `POST https://polsia.com/api/company-email/send` | Bearer `POLSIA_API_KEY` |
| **R2 Image Storage** | `PUT ${POLSIA_R2_BASE_URL}/r2/${companyId}/${filename}` | Bearer `POLSIA_API_KEY` |

### Payment Proxy Request Format

```json
{
  "amount": 8498,
  "currency": "usd",
  "productName": "Rose Garden Arrangement - deluxe",
  "successUrl": "https://sugaroaklane.com/order-success.html?order=LF-20250501-0001",
  "cancelUrl": "https://sugaroaklane.com/"
}
```

**Response:** `{ "url": "https://checkout.stripe.com/c/pay/..." }`

### Neon PostgreSQL

Serverless PostgreSQL database. Connection via `DATABASE_URL` environment variable. Used for all persistent data.

### Cloudflare R2 (via Polsia Proxy)

Object storage for uploaded images. Accessed through Polsia's R2 proxy service. Circuit breaker prevents cascading failures if R2 is unavailable (falls back to PostgreSQL BYTEA storage).

### Pexels CDN

Public CDN used for seeded product images. URL format:
```
https://images.pexels.com/photos/{photo_id}/pexels-photo-{photo_id}.jpeg?auto=compress&cs=tinysrgb&w=800
```

All Pexels images are free for commercial use.

### OpenAI (Available, not actively used)

`openai` npm package is installed but not used in any active server routes as of the current codebase. Available for future AI features.

---

## Appendix A: Seed Product Catalog Summary

### SOL Products by Category (15 initial products)

**flower-shop:**
- Farm Bouquet ($28.00) — fresh-cut seasonal bouquet
- Dahlia Feature ($18.00) — feature stem
- Wrapped Stem Bundle ($24.00) — mixed bunch
- Sweet Pea Collection ($16.00) — sweet pea stems
- Sunflower Arrangement ($22.00) — sunflower bundle

**seeds-bulbs:**
- Dahlia Tubers Mixed ($14.95) — dahlia tubers
- Sweet Pea Seeds ($3.95/packet)
- Zinnia Seeds Benary's Giant Mix ($3.95/packet)
- Ranunculus Corms Pastel ($12.95)
- Cosmos Seeds Double Click ($3.95/packet)

**plant-nursery:**
- Snapdragon Starts ($4.50/ea)
- Dahlia Plugs ($6.50/ea)
- Zinnia Starts 6-Pack ($8.95/pack)

**farm-goods:**
- Sugar Oak Lane Canvas Tote ($18.00)
- Farm Apron ($34.00)
- Flower Food Packets ($2.50/ea)
- Flower Frog Kenzan ($12.00)

### Seed Catalog (bulk seeded)

**Sunflowers** (7 varieties, all $3.95/packet):
ProCut Orange, ProCut White Nite, ProCut Red, ProCut Plum, Sunrich Gold, Sunrich Orange, Chocolate Cherry

**Zinnias** (15+ varieties, all $3.95/packet):
Benary Giant: Scarlet, Deep Red, Bright Pink, Salmon Rose, Lilac, Purple, Orange, Golden Yellow, Wine, Coral
Unicorn Zinnia, Queen Lime Peach, Queen Lime Blush, Queen Lime Orange, Queen Lime Red, Luminosa

**Other annuals** (seeded in `seed_products_catalog_2`):
Cosmos, Poppies, Celosia, Amaranth (multiple varieties each)

---

## Appendix B: Blog Posts Hardcoded Fallback

When `blog_posts` table is empty, server.js serves 6 hardcoded blog posts:

1. "From Seed to Bouquet: A Summer Growing Season Recap" — farm journal
2. "The Art of Flower Pairing: Creating Balanced Arrangements" — design guide
3. "Why We Grow Dahlias (And You Should Too)" — dahlia cultivation
4. "Caring for Your Cut Flowers: A Week-by-Week Guide" — care guide
5. "Behind the Scenes: Life on a Small Flower Farm" — farm life
6. "Planning Your Wedding Flowers: A Farm-to-Table Approach" — wedding guide

All authored by "Sugar Oak Lane", tagged with relevant keywords, marked `is_published: true`.

---

## Appendix C: Order Number Formats

| Format | Table | When Used |
|---|---|---|
| `LF-YYYYMMDD-NNNN` | `orders` | Original Loganville Flowers legacy (backfilled) |
| `SOL-YYYYMMDD-NNNN` | `orders` | Current Loganville Flowers checkout |
| `SOL-FARM-YYYYMMDD-NNNN` | `sol_orders` | SOL farm shop checkout |

**Generation:** Sequential number `NNNN` is calculated from count of existing orders with the same date prefix.

---

*End of Architecture Document. Last updated: 2025-05-01.*
