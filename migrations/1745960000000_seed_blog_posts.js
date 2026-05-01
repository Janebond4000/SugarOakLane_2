/**
 * Sugar Oak Lane — Seed 3 foundational blog posts
 * welcome-to-sugar-oak-lane | growing-dahlias-beginners-guide | spring-2026-whats-in-bloom
 */
module.exports = {
  name: 'seed_blog_posts',
  up: async (client) => {
    const posts = [
      {
        title: 'Welcome to Sugar Oak Lane',
        slug: 'welcome-to-sugar-oak-lane',
        category: 'farm-stories',
        excerpt: 'Five generations of farming on this land. Here\'s who we are, why we grow flowers, and what Sugar Oak Lane means to our family.',
        meta_description: 'Meet the family behind Sugar Oak Lane — a fifth-generation Georgia flower farm in Loganville growing dahlias, zinnias, sunflowers, and more for local customers, weddings, and wholesale.',
        author: 'Sugar Oak Lane',
        is_published: true,
        published_at: '2026-01-15T10:00:00Z',
        content: `<h2>Five Generations on This Land</h2>
<p>Sugar Oak Lane has been in our family for over a century. Before it was a flower farm, it was a row-crop farm, a cattle operation, a peach orchard, and a place where five generations of our family learned what it means to work a piece of Georgia red clay until it gives you something beautiful.</p>
<p>The name comes from the lane that runs through the property — a dirt road lined with sugar maples and live oaks that has been there longer than anyone in the family can remember. In October, when the maples turn orange and the dahlias are still going strong, it's one of the most beautiful places on earth. We're not being sentimental. We've traveled. It really is.</p>

<h2>Why Flowers?</h2>
<p>The honest answer: we were looking for a crop that could generate meaningful income on a small acreage while keeping the land in active cultivation. Cut flowers check every box. Per-acre returns that rival vegetables, a product people genuinely love, a direct-to-consumer model that doesn't require middlemen, and something beautiful growing outside the window every single day.</p>
<p>We started with a half-acre trial of dahlias and zinnias in 2019. By the end of that first season, we'd sold out of everything at the local farmers market and had a waiting list for fall dahlia bouquets. The decision to expand wasn't difficult.</p>
<p>Today we grow over <strong>50 dahlia varieties</strong>, plus zinnias, sunflowers, cosmos, sweet peas, ranunculus, lisianthus, and a rotating cast of specialty flowers that we trial every season. We farm about 3 acres in active flower production, with expansion plans underway for a fourth.</p>

<h2>What We Grow and Why It Matters</h2>
<p>Every variety we grow has to earn its spot. Our criteria are simple: it has to grow well in Georgia's Zone 7b/8a climate, it has to harvest well (good vase life, strong stems), and people have to love it. If it fails any of those tests, it's out.</p>
<p>That's why we don't grow roses for retail. Roses are beautiful, but the economics of growing them at the quality level people expect are brutal for small farms. We focus on what we can grow exceptionally well — and dahlias, in Georgia soil and heat, are something we can grow exceptionally well.</p>
<blockquote>We don't try to grow everything. We try to grow a few things better than anyone else in our region.</blockquote>

<h2>Who We Sell To</h2>
<p>We sell through several channels, depending on the season:</p>
<ul>
  <li><strong>Our online shop</strong> — Fresh bouquets, dahlia tubers, seeds, and farm goods available year-round</li>
  <li><strong>Farmers markets</strong> — Saturday mornings in Loganville and surrounding areas, spring through fall</li>
  <li><strong>Weddings and events</strong> — We work with a limited number of couples each season who want locally-grown, farm-direct flowers for their celebrations</li>
  <li><strong>Wholesale accounts</strong> — Local florists and event designers who want Georgia-grown stems without the import premium</li>
</ul>
<p>Everything we sell is grown here, on this land, by our family. No re-selling wholesale imports. No outsourcing. If it has our name on it, we grew it.</p>

<h2>Come Visit</h2>
<p>We offer farm tours, u-pick events (when blooms allow), and workshops throughout the season. Check our <a href="/workshops">workshops page</a> for upcoming events, or follow along as we post updates from the field.</p>
<p>And if you have questions — about a flower, about ordering, about growing dahlias in your own yard — reach out. We love talking about this stuff. It's what we do.</p>
<p><strong>— The Sugar Oak Lane Family</strong></p>`
      },
      {
        title: "Growing Dahlias: A Beginner's Guide",
        slug: 'growing-dahlias-beginners-guide',
        category: 'growing-guides',
        excerpt: 'New to dahlias? Here\'s everything you need to know to grow them successfully in your own garden — from tuber selection to first bloom.',
        meta_description: 'A complete beginner\'s guide to growing dahlias at home. Learn when to plant, how deep to plant, whether to water at planting, pinching for more blooms, and how to dig and store tubers — from a Georgia dahlia farm.',
        author: 'Sugar Oak Lane',
        is_published: true,
        published_at: '2026-02-10T10:00:00Z',
        content: `<h2>Why Dahlias?</h2>
<p>If you're going to grow one flower in your garden this year, grow dahlias. No other flower gives you this return: months of continuous bloom, dozens of flowers per plant, every color imaginable (except true blue), and an almost theatrical range of forms — from tiny pompoms to dinner-plate blooms the size of your face.</p>
<p>We grow over 50 varieties on the farm. First-time growers always ask us which ones to start with. Our answer: any of them. Dahlias are more forgiving than their reputation suggests. The rules are simple. Follow them and you'll have flowers.</p>

<h2>What You Need to Know About Tubers</h2>
<p>Dahlias grow from tubers — fleshy, potato-like root structures that store energy for the plant. Each tuber needs at least one "eye" (a growth point, similar to a potato eye) to sprout. When you buy tubers from us, we've already divided them to ensure each one is viable.</p>
<p><strong>Store tubers properly before planting:</strong> Keep them in a cool (45–55°F), dark, slightly humid spot — a basement or root cellar is ideal. Do not freeze them. Do not let them dry out completely. A cardboard box with slightly damp peat moss works perfectly.</p>

<h2>When to Plant</h2>
<p>In Georgia (Zone 7b–8a), plant after your last frost date and when soil temperatures are consistently above 60°F. For most of the Atlanta metro area, that means <strong>mid-April through early May</strong>.</p>
<p>A simple test: stand barefoot on the soil. If it feels comfortable, it's warm enough for dahlias. If it feels cold, wait.</p>
<p>Planting too early in cold, wet soil is the number one cause of tuber rot. Two weeks of patience now saves the whole planting.</p>

<h2>How to Plant</h2>
<ol>
  <li><strong>Choose a full-sun spot</strong> — 6–8 hours of direct sunlight minimum. Dahlias in partial shade produce weak stems and fewer flowers.</li>
  <li><strong>Amend the soil</strong> — Work 2–3 inches of compost into the top 12 inches. Add a balanced fertilizer (10-10-10) and a handful of bone meal per hole.</li>
  <li><strong>Dig a hole 6 inches deep</strong> — Lay the tuber horizontally with the eye facing up. Cover with soil.</li>
  <li><strong>Do not water at planting.</strong> This is the most counterintuitive instruction and the most important one. The tuber has stored moisture and energy to begin growing. Watering a dormant tuber in cool soil causes rot. Wait until you see green growth above the soil — usually 2–3 weeks — then begin regular watering.</li>
  <li><strong>Space plants 18–24 inches apart</strong> for standard varieties, 12–15 inches for smaller types.</li>
  <li><strong>Install stakes at planting time</strong> — not after the plant is 4 feet tall and falling over. A 5-foot bamboo stake or metal T-post driven in at planting prevents damage to tubers later.</li>
</ol>

<h2>The Pinching Secret</h2>
<p>When your dahlia reaches about 12 inches tall with 3–4 sets of leaves, pinch out the center growing tip. Remove the top 3–4 inches of the main stem.</p>
<p>This feels wrong. You're cutting a healthy plant. Do it anyway. Pinching causes the plant to branch, producing <strong>3–4× more flowering stems</strong> than an unpinched plant. Every commercial dahlia grower pinches. It's not optional — it's the difference between a plant and a flower factory.</p>

<h2>Watering and Feeding</h2>
<p>Once dahlias are actively growing, they want <strong>deep, infrequent watering</strong> — 1–2 inches per week, delivered slowly so it soaks in rather than running off. Drip irrigation is ideal. Overhead watering promotes powdery mildew; keep foliage dry when possible.</p>
<p>In July, switch from a balanced fertilizer to one higher in phosphorus and potassium (like 5-10-10). This shifts the plant's energy from leaf growth to flower production.</p>

<h2>When to Cut</h2>
<p>Cut dahlias when blooms are <strong>75% open</strong>. They don't continue opening after cutting, so timing matters. Harvest in the morning or evening (not midday heat), and immediately place stems in cool water.</p>
<p>The more you cut, the more dahlias bloom. Regular harvesting signals the plant to keep producing. Leave flowers on the plant past their peak and production slows down. Pick every 2–3 days during peak season.</p>

<h2>At the End of the Season</h2>
<p>After the first killing frost, the dahlia foliage will blacken. Wait a week, then dig the clumps before the ground freezes hard. Let them cure in a dry spot for a few days, then divide (each division needs at least one eye) and store for next spring.</p>
<p>Many gardeners in Zone 7b/8a successfully overwinter dahlias in the ground with heavy mulching. We recommend digging your first year until you know how your specific spot drains — wet winters kill more overwintered tubers than cold temperatures.</p>

<blockquote>Dahlias are the one flower that rewards you for being greedy. The more you pick, the more they give.</blockquote>

<p>We sell dahlia tubers from our own fields — the same varieties we grow for market and weddings. Browse the <a href="/shop?cat=seeds-bulbs">seed and tuber shop</a> for what's available this season. Questions? <a href="/contact">We're happy to help you pick the right varieties</a> for your garden and goals.</p>`
      },
      {
        title: "Spring 2026: What's in Bloom",
        slug: 'spring-2026-whats-in-bloom',
        category: 'seasonal',
        excerpt: 'April on the farm: sweet peas peaking, ranunculus wrapping up, dahlias just going in the ground. Here\'s what\'s blooming and what we\'re planting right now.',
        meta_description: 'April 2026 bloom update from Sugar Oak Lane flower farm in Georgia. Sweet peas, ranunculus, snapdragons, and anemones available now. Dahlia pre-orders open for July delivery.',
        author: 'Sugar Oak Lane',
        is_published: true,
        published_at: '2026-04-01T10:00:00Z',
        content: `<h2>April on the Farm</h2>
<p>April is one of the two best months to be at Sugar Oak Lane (October is the other). The spring flowers are peaking, the air is still cool enough to work comfortably, and everything smells incredible. If you've been waiting for a reason to visit, this is it.</p>
<p>Here's what's happening in the fields and what that means for what you can buy right now.</p>

<h2>What's Blooming Now</h2>

<h3>🌸 Sweet Peas — PEAK</h3>
<p>Sweet peas are at their absolute best right now. We grow a full-color mix of heirloom varieties in cream, blush, lavender, coral, and deep magenta. They have a fragrance that's impossible to describe accurately — the best we can do is "a spring garden distilled into a single flower."</p>
<p>Sweet peas have a short window. Once daytime temperatures consistently hit 80°F, they're done for the season. We have them now. Get them now.</p>
<p><a href="/shop/flower-shop"><strong>→ Order sweet pea bouquets</strong></a></p>

<h3>🌷 Ranunculus — FINAL WEEKS</h3>
<p>Our ranunculus are wrapping up their season. The blooms are still gorgeous, but they're winding down as temperatures warm. If ranunculus are on your list for a wedding or event this spring, reach out this week — we're booking the last of our available inventory.</p>
<p>We grow Persian ranunculus in a mix of soft pastels: champagne, white, peach, soft pink, and pale yellow. They're extraordinary in arrangements and have exceptional vase life (10–14 days with proper care).</p>

<h3>🌼 Anemones — LAST CALL</h3>
<p>Anemones follow ranunculus out the door as spring heats up. We have limited quantities of our deep purple, white, and bicolor varieties available for another week or two. These are a florist favorite and we never grow enough of them.</p>

<h3>💐 Snapdragons — FULL PRODUCTION</h3>
<p>Our butterfly snapdragons are in full production — the open, airy form that works so much better in loose arrangements than standard upright varieties. We grow these in a warm mix (peach, coral, gold, bronze) and a cool mix (cream, blush, pale lavender). Both are available for bouquets and by the bunch for wholesale accounts.</p>

<h2>Coming Soon</h2>

<h3>🌻 Zinnias — Early June</h3>
<p>We direct-sowed our first succession of zinnias last week. They'll be ready to cut in early June, which feels forever away right now but arrives faster than you expect. We grow 'Benary's Giant' in the saturated summer palette plus 'Queen Lime' series for those who want something more sophisticated.</p>

<h3>🌸 Dahlias — July</h3>
<p>We're planting dahlia tubers this week. They'll be in the ground by Tax Day, and our first blooms typically appear in late June or early July. Peak dahlia season runs July through frost (usually November).</p>
<p>If you want specific dahlia varieties for a wedding or event this summer, now is the time to reach out and reserve them. We grow 50+ varieties and most are not available anywhere else locally.</p>
<p><a href="/shop?cat=seeds-bulbs"><strong>→ Buy dahlia tubers to grow your own</strong></a> — our farm-grown tubers are available now for your own planting.</p>

<h2>Available This Weekend</h2>
<p>If you want the freshest pick of what's blooming, here's what we'll have available this week:</p>
<ul>
  <li><strong>Mixed spring bouquets</strong> — featuring sweet peas, snapdragons, ranunculus, and anemones while supplies last. <a href="/shop/flower-shop">Order online</a> for pickup or local delivery.</li>
  <li><strong>Sweet pea bunches</strong> — by the bunch for home arrangements or small events</li>
  <li><strong>Dahlia tubers</strong> — still have some great varieties available. Plant this month for July blooms.</li>
  <li><strong>Seed packets</strong> — zinnia, cosmos, sunflower, and more. Perfect to start now for summer color.</li>
</ul>

<h2>The WELCOME10 Offer</h2>
<p>First time ordering from us? Use code <strong>WELCOME10</strong> at checkout for 10% off your first order. Works on everything in the shop — flowers, tubers, seeds, and farm goods.</p>
<p><a href="/shop"><strong>→ Shop the full collection</strong></a></p>

<h2>Stay Connected</h2>
<p>The best way to know what's blooming is to be on our email list — we send harvest updates when something special comes in and give subscribers first access to limited seasonal products.</p>
<p>Subscribe at the bottom of this page. We email twice a month at most, and only when there's something worth saying.</p>`
      }
    ];

    for (const post of posts) {
      await client.query(
        `INSERT INTO blog_posts
           (title, slug, category, excerpt, content, meta_description, author, is_published, published_at, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (slug) DO NOTHING`,
        [
          post.title,
          post.slug,
          post.category,
          post.excerpt,
          post.content,
          post.meta_description,
          post.author,
          post.is_published,
          post.published_at,
          [post.category]
        ]
      );
    }
  },
  down: async (client) => {
    await client.query(`
      DELETE FROM blog_posts
      WHERE slug IN ('welcome-to-sugar-oak-lane', 'growing-dahlias-beginners-guide', 'spring-2026-whats-in-bloom')
    `);
  }
};
