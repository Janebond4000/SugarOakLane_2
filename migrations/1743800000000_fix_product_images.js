/**
 * Fix product image URLs — replace broken/wrong Unsplash links with verified Pexels CDN URLs.
 * QA Report #278797 found product cards showing irrelevant images (Taj Mahal, tomatoes, etc.)
 * and broken 404/403 Unsplash hotlinks.
 *
 * Pexels images are free for commercial use, no attribution required,
 * and served via a reliable CDN that doesn't break.
 */
module.exports = {
  name: 'fix_product_images',
  up: async (client) => {

    const imageMap = {
      // ── ROSES ─────────────────────────────────
      'classic-red-dozen-roses':        'https://images.pexels.com/photos/754273/pexels-photo-754273.jpeg?auto=compress&cs=tinysrgb&w=600',
      'pink-paradise-roses':            'https://images.pexels.com/photos/965731/pexels-photo-965731.jpeg?auto=compress&cs=tinysrgb&w=600',
      'white-elegance-roses':           'https://images.pexels.com/photos/3051573/pexels-photo-3051573.jpeg?auto=compress&cs=tinysrgb&w=600',
      'mixed-garden-roses':             'https://images.pexels.com/photos/931171/pexels-photo-931171.jpeg?auto=compress&cs=tinysrgb&w=600',
      'long-stem-red-roses-18':         'https://images.pexels.com/photos/11166470/pexels-photo-11166470.jpeg?auto=compress&cs=tinysrgb&w=600',
      'yellow-sunshine-roses':          'https://images.pexels.com/photos/1427855/pexels-photo-1427855.jpeg?auto=compress&cs=tinysrgb&w=600',
      'lavender-rose-dream':            'https://images.pexels.com/photos/193039/pexels-photo-193039.jpeg?auto=compress&cs=tinysrgb&w=600',

      // ── BIRTHDAY ──────────────────────────────
      'happy-birthday-burst':           'https://images.pexels.com/photos/931162/pexels-photo-931162.jpeg?auto=compress&cs=tinysrgb&w=600',
      'birthday-sunflower-celebration': 'https://images.pexels.com/photos/1562262/pexels-photo-1562262.jpeg?auto=compress&cs=tinysrgb&w=600',
      'rainbow-birthday-bouquet':       'https://images.pexels.com/photos/5996678/pexels-photo-5996678.jpeg?auto=compress&cs=tinysrgb&w=600',
      'birthday-orchid-delight':        'https://images.pexels.com/photos/4090814/pexels-photo-4090814.jpeg?auto=compress&cs=tinysrgb&w=600',
      'bright-birthday-garden-basket':  'https://images.pexels.com/photos/6366721/pexels-photo-6366721.jpeg?auto=compress&cs=tinysrgb&w=600',

      // ── SYMPATHY ──────────────────────────────
      'peaceful-white-lily-bouquet':    'https://images.pexels.com/photos/8789648/pexels-photo-8789648.jpeg?auto=compress&cs=tinysrgb&w=600',
      'comfort-garden-sympathy-basket': 'https://images.pexels.com/photos/273941/pexels-photo-273941.jpeg?auto=compress&cs=tinysrgb&w=600',
      'serene-white-arrangement':       'https://images.pexels.com/photos/1033141/pexels-photo-1033141.jpeg?auto=compress&cs=tinysrgb&w=600',
      'garden-of-grace-sympathy':       'https://images.pexels.com/photos/8865421/pexels-photo-8865421.jpeg?auto=compress&cs=tinysrgb&w=600',

      // ── ROMANCE ───────────────────────────────
      'red-passion-anniversary':        'https://images.pexels.com/photos/2300713/pexels-photo-2300713.jpeg?auto=compress&cs=tinysrgb&w=600',
      'romance-in-bloom':               'https://images.pexels.com/photos/1447367/pexels-photo-1447367.jpeg?auto=compress&cs=tinysrgb&w=600',
      'love-story-bouquet':             'https://images.pexels.com/photos/2879820/pexels-photo-2879820.jpeg?auto=compress&cs=tinysrgb&w=600',
      'anniversary-orchid-garden':      'https://images.pexels.com/photos/30349388/pexels-photo-30349388.jpeg?auto=compress&cs=tinysrgb&w=600',

      // ── GET WELL ──────────────────────────────
      'sunny-get-well-soon':            'https://images.pexels.com/photos/33972191/pexels-photo-33972191.jpeg?auto=compress&cs=tinysrgb&w=600',
      'healing-garden-basket':          'https://images.pexels.com/photos/20206456/pexels-photo-20206456.jpeg?auto=compress&cs=tinysrgb&w=600',
      'bright-daisy-cheer':             'https://images.pexels.com/photos/33961379/pexels-photo-33961379.jpeg?auto=compress&cs=tinysrgb&w=600',
      'uplifting-spring-mix':           'https://images.pexels.com/photos/1906446/pexels-photo-1906446.jpeg?auto=compress&cs=tinysrgb&w=600',

      // ── CONGRATULATIONS ───────────────────────
      'celebration-burst-bouquet':      'https://images.pexels.com/photos/931162/pexels-photo-931162.jpeg?auto=compress&cs=tinysrgb&w=640',
      'achievement-bouquet':            'https://images.pexels.com/photos/3051573/pexels-photo-3051573.jpeg?auto=compress&cs=tinysrgb&w=640',
      'new-baby-pink-bundle':           'https://images.pexels.com/photos/965731/pexels-photo-965731.jpeg?auto=compress&cs=tinysrgb&w=640',
      'new-baby-blue-bundle':           'https://images.pexels.com/photos/16037078/pexels-photo-16037078.jpeg?auto=compress&cs=tinysrgb&w=600',

      // ── JUST BECAUSE ──────────────────────────
      'garden-fresh-mix':               'https://images.pexels.com/photos/931171/pexels-photo-931171.jpeg?auto=compress&cs=tinysrgb&w=640',
      'wildflower-wonder':              'https://images.pexels.com/photos/17903880/pexels-photo-17903880.jpeg?auto=compress&cs=tinysrgb&w=600',
      'lavender-dreams':                'https://images.pexels.com/photos/16037078/pexels-photo-16037078.jpeg?auto=compress&cs=tinysrgb&w=640',
      'cottage-garden-charm':           'https://images.pexels.com/photos/9081262/pexels-photo-9081262.jpeg?auto=compress&cs=tinysrgb&w=600',

      // ── SEASONAL ──────────────────────────────
      'spring-awakening':               'https://images.pexels.com/photos/1906446/pexels-photo-1906446.jpeg?auto=compress&cs=tinysrgb&w=640',
      'summer-medley':                  'https://images.pexels.com/photos/1562262/pexels-photo-1562262.jpeg?auto=compress&cs=tinysrgb&w=640',
      'fall-harvest-arrangement':       'https://images.pexels.com/photos/1058771/pexels-photo-1058771.jpeg?auto=compress&cs=tinysrgb&w=600',
    };

    let updated = 0;
    for (const [slug, url] of Object.entries(imageMap)) {
      const res = await client.query(
        `UPDATE products SET image_url = $1, updated_at = NOW() WHERE slug = $2 AND image_url != $1`,
        [url, slug]
      );
      if (res.rowCount > 0) updated++;
    }

    console.log(`Updated ${updated} product images (${Object.keys(imageMap).length} mapped).`);
  }
};
