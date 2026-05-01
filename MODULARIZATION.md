# SugarOakOS Codebase Modularization

## Overview

The SugarOakOS codebase has been refactored from a monolithic structure into isolated, reusable components and templates. This enables scalability, maintainability, and prevents cascading bugs across pages.

## Directory Structure

```
public/
├── css/
│   ├── main.css                    # Entry point - imports all CSS
│   ├── design-tokens.css           # Global design system (colors, typography, spacing)
│   ├── components/
│   │   ├── header.css              # Navigation & header styles
│   │   ├── footer.css              # Footer styles
│   │   ├── product-grid.css        # Product card grid component
│   │   └── sidebar.css             # Filters & sidebar component
│   └── templates/
│       ├── shop-template.css       # Browse & filter layout
│       ├── gallery-template.css    # Image portfolio layout
│       ├── landing-template.css    # Hero + sections + CTA
│       └── blog-template.css       # Article & blog post layout
├── js/
│   └── components.js               # Shared component logic (nav, filters, forms, etc.)
├── templates/
│   └── base.html                   # Base HTML template (header + footer)
└── [page files]                    # Individual page HTML files
```

## Design System: Design Tokens

All colors, spacing, typography, and transitions are defined in `css/design-tokens.css` as CSS variables:

```css
:root {
  --green: #3A5A40;
  --spacing-md: 1rem;
  --font-serif: 'Cormorant Garamond', serif;
  /* ... more tokens */
}
```

**Benefit:** Change a color once and it updates everywhere. No manual find-and-replace.

## Component Styles

Each component is isolated in its own CSS file:

### Header (`components/header.css`)
- Navigation styles
- Mobile hamburger menu
- Sticky header behavior

### Footer (`components/footer.css`)
- Footer grid layout
- Social links
- Link sections

### Product Grid (`components/product-grid.css`)
- Product card styling
- Grid responsive behavior
- Hover states
- Badges and pricing

### Sidebar (`components/sidebar.css`)
- Filter groups
- Range sliders
- Mobile toggle
- Sticky sidebar on scroll

## Template Styles

Each major page layout has a dedicated template CSS file:

### Shop Template (`templates/shop-template.css`)
- Breadcrumbs navigation
- Sidebar + product grid layout
- Sort & filter toolbar
- Pagination
- Responsive mobile layout (sidebar moves below grid)

**Use for:** Product browse pages, category pages, any filterable product list

### Gallery Template (`templates/gallery-template.css`)
- Hero header with title
- Responsive image grid
- Hover overlay effects
- Masonry layout option
- Image cards with actions

**Use for:** Wedding portfolio, farm photos, event galleries

### Landing Template (`templates/landing-template.css`)
- Hero section with CTA
- Feature/service cards
- Testimonials section
- Strong CTA section at bottom
- Responsive grid layouts

**Use for:** Homepage, service pages, promotional pages

### Blog Template (`templates/blog-template.css`)
- Article header with metadata
- Formatted article body (headings, lists, blockquotes, code)
- Related articles sidebar
- Blog listing page with excerpt cards

**Use for:** Blog posts, articles, guides

## Shared Component Logic

`js/components.js` provides reusable functions:

- `initMobileNav()` - Hamburger menu toggle
- `initStickyHeader()` - Header scroll behavior
- `initSidebarToggle()` - Mobile filter panel
- `initFilters()` - Filter input listeners
- `initRangeSlider()` - Price range sliders
- `initModal()` - Modal open/close
- `initPrices()` - Price formatting
- `initProductCards()` - Product card interactions
- `initForm()` - Form submission handling
- `initLazyLoading()` - Image lazy loading
- `initSmoothScroll()` - Anchor link scrolling

**How to use:**
```html
<script src="/js/components.js"></script>
```

The script auto-initializes all components on page load.

## Creating a New Page

### Step 1: Choose a Template

Identify which template your page should use:
- `landing-template` for hero-based pages
- `shop-template` for product listings
- `gallery-template` for image portfolios
- `blog-template` for articles
- `base.html` for custom pages

### Step 2: Import CSS

```html
<link rel="stylesheet" href="/css/main.css">
```

This imports all design tokens, components, and templates. Pick and use what you need.

### Step 3: Use Template HTML Structure

Example using shop template:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Our Seeds</title>
  <link rel="stylesheet" href="/css/main.css">
</head>
<body>
  <!-- Header (from base.html template) -->
  <header class="header">
    <div class="header-container">
      <a href="/" class="logo">Sugar Oak Lane</a>
      <nav class="nav">
        <a href="/" class="nav-link">Home</a>
        <!-- ... nav items ... -->
      </nav>
    </div>
  </header>

  <!-- Shop Layout (from shop-template.css) -->
  <div class="shop-header">
    <div class="shop-header-content">
      <div class="shop-breadcrumbs">
        <a href="/">Home</a>
        <span class="breadcrumb-sep">/</span>
        <a href="/?category=seeds">Seeds</a>
      </div>
      <h1 class="shop-title">Heirloom Seeds</h1>
      <p class="shop-description">Carefully curated seeds for your garden...</p>
    </div>
  </div>

  <main class="shop-main">
    <div class="shop-container">
      <!-- Sidebar with filters -->
      <aside class="sidebar">
        <!-- filter content -->
      </aside>

      <!-- Products grid -->
      <div class="shop-products">
        <div class="shop-toolbar">
          <p class="shop-count">Showing 24 products</p>
          <div class="shop-sort">
            <label>Sort by:</label>
            <select>
              <option>Newest</option>
              <option>Price: Low to High</option>
              <option>Price: High to Low</option>
              <option>Best Sellers</option>
            </select>
          </div>
        </div>

        <div class="product-grid">
          <!-- Product cards (product-grid.css) -->
        </div>

        <div class="shop-pagination">
          <!-- Pagination -->
        </div>
      </div>
    </div>
  </main>

  <!-- Footer -->
  <footer class="footer">
    <!-- footer content -->
  </footer>

  <script src="/js/components.js"></script>
</body>
</html>
```

### Step 4: Use Component Classes

Apply component classes to your HTML:

```html
<!-- Header uses .header and .nav -->
<!-- Product cards use .product-card, .product-image, .product-title, etc. -->
<!-- Sidebar uses .sidebar, .filter-group, .filter-label -->
```

## CSS Class Naming Convention

- **Components** use descriptive class names: `.header`, `.product-card`, `.footer-link`
- **Templates** use layout class names: `.shop-layout`, `.gallery-grid`, `.blog-body`
- **Utilities** use functional class names: `.text-center`, `.mb-lg`, `.shadow-md`
- **States** use descriptive modifiers: `.active`, `.hovered`, `.scrolled`

## Responsive Breakpoints

All templates and components are responsive:

- **Desktop:** 1280px max-width
- **Tablet:** 768px breakpoint
- **Mobile:** 640px breakpoint
- **Small mobile:** 480px and below

Mobile-first approach: Start with mobile styles, add media queries for larger screens.

## Customization

### Change a Color Globally

Edit `css/design-tokens.css`:
```css
:root {
  --green: #3A5A40;  /* Change this */
}
```

All pages automatically update.

### Modify a Component

Edit the component file, e.g., `css/components/header.css`. Changes apply to all pages using that component.

### Add a New Component

1. Create `css/components/new-component.css`
2. Import in `css/main.css`: `@import url('./components/new-component.css');`
3. Use the component class in your HTML

## Migration Guide: Old Pages → New Structure

### Before (Monolithic)
Each HTML page had embedded `<style>` block with all CSS for that page.

### After (Modular)
1. Copy common HTML structure (header, footer, nav)
2. Add `<link rel="stylesheet" href="/css/main.css">`
3. Remove old embedded CSS
4. Apply component and template classes
5. Update image paths and content

## Benefits

✅ **No cascading bugs** - Changing one component doesn't affect others
✅ **Easy to scale** - Add new pages without duplicating code
✅ **Consistent design** - Single source of truth for colors, spacing, typography
✅ **Easier maintenance** - Find related code quickly
✅ **Faster development** - Reuse templates and components
✅ **Responsive by default** - Mobile-first CSS included in every component
✅ **Better performance** - Shared CSS file caches across pages

## Common Tasks

### Add a new page
1. Create `public/pages/new-page.html`
2. Choose a template (landing, shop, gallery, or blog)
3. Import `css/main.css`
4. Copy header/footer from `templates/base.html`
5. Add page-specific content

### Change the navigation
Edit `templates/base.html` (for header) or individual pages

### Add a new product category
1. Duplicate a shop page
2. Change category parameter in breadcrumbs
3. Update page title and description

### Update footer links
Edit `templates/base.html` or update footer on all pages that don't use the template

## Technical Notes

- All CSS is mobile-first (base styles apply to mobile, media queries for larger screens)
- Design tokens use CSS variables for easy customization
- Components are self-contained (can be used independently)
- Templates combine components into complete page layouts
- JavaScript is optional (CSS provides basic styling, JS adds interactivity)

## Next Steps

1. **Content Database** (Task 679071): Migrate hardcoded content to database
2. **Admin Panel** (Task 679072): Build UI to manage pages, products, content
3. **SEO Optimization**: Use modular structure to implement dynamic meta tags
4. **A/B Testing**: Test layout variations by swapping templates
