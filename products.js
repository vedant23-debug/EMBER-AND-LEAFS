/* EMBER & LEAF — products.js
   Loaded BEFORE app.js. Exposes one global, window.EL:
     EL.CATALOGUE  frozen default product records (admin edits are stored separately as overrides)
     EL.IMAGES     the single source of truth for image paths (plus an inline fallback)
     EL.PLANS      curated plans A–J
     EL.priceFor(product, packLabel)   the ONLY pack-price function; cart, builder and plans use it
     EL.planSubtotal(plan) / EL.planPerDelivery(plan)
     EL.validateData()  returns a list of problems (empty list = data is consistent)

   PRODUCT SCHEMA (every record has all of these):
     id, name, type ("coffee"|"tea"), category, origin,
     roastLevel (coffee) | teaStyle (tea), process + grindOptions (coffee only),
     caffeineLevel ("none"|"low"|"medium"|"high"),
     tastingNotes [3 strings], flavourProfile {body, acidity, sweetness} each 1–5,
     shortDescription, longDescription, brewGuide,
     basePrice (₹ for defaultPack), defaultPack, packSizes [{label, grams, price}],
     badge ("" for none), rating, stockStatus ("in-stock"|"low-stock"|"out-of-stock"),
     imageKey, visible (boolean)

   HONESTY NOTES: product names, origins and descriptions are PROPOSED catalogue content,
   not sourcing claims. rating and stockStatus are DEMO DATA, not verified records.
   No certifications, awards or estate relationships are claimed anywhere. */

(function () {
  "use strict";

  const SUBSCRIBE_DISCOUNT = 0.10; // one rule for the builder AND every plan
  const DEMO_NOTE = "Ratings and stock status are demo data, not verified records.";

  /* Pack ladder. basePrice is the price of the default pack; other packs = basePrice × multiplier,
     rounded to whole rupees. Coffee base = 250 g, tea base = 100 g. */
  const PACKS = {
    coffee: { base: "250 g", sizes: [["250 g", 250, 1], ["500 g", 500, 1.85], ["1 kg", 1000, 3.5]] },
    tea: { base: "100 g", sizes: [["50 g", 50, 0.55], ["100 g", 100, 1], ["200 g", 200, 1.85]] }
  };

  /* Roast level is how dark the beans are; grind is a separate choice made per order. */
  const GRINDS = ["Whole bean", "Espresso", "Moka pot", "Filter", "French press"];
  const COLD_GRINDS = ["Whole bean", "Coarse (cold brew)"];

  const BREW = {
    coffee: {
      "single-origin": "Pour-over or French press: 15 g coffee to 250 ml water at about 93 °C, 3–4 minutes.",
      blend: "Moka pot, French press or filter: 15 g to 250 ml water at about 93 °C, 4 minutes.",
      espresso: "Espresso grind: 18 g in, about 36 g out in 27–32 seconds with water near 93 °C.",
      decaf: "Filter or French press: 15 g to 250 ml water at about 92 °C, 4 minutes.",
      filter: "Medium filter grind: 15 g to 250 ml water at 92–96 °C, 3 to 3½ minutes.",
      "cold-brew": "Coarse grind: 100 g to 1 L cold water, steep 12–16 hours in the fridge, strain and serve over ice.",
      seasonal: "Best as pour-over: 15 g to 250 ml water at about 93 °C, 3–4 minutes."
    },
    tea: {
      black: "2 g per 200 ml water at 95–100 °C, steep 3–4 minutes.",
      green: "2 g per 200 ml water at 75–80 °C, steep 2–3 minutes.",
      white: "2–3 g per 200 ml water at about 80 °C, steep 3–4 minutes.",
      oolong: "3 g per 200 ml water at 90–95 °C, steep 3 minutes; leaves can be re-steeped.",
      herbal: "2 g per 200 ml water at 100 °C, steep 5–7 minutes.",
      chai: "Simmer 2 g per cup with milk and water for 4–5 minutes, or steep 4 minutes in hot water.",
      rooibos: "2–3 g per 200 ml water at 100 °C, steep 5–7 minutes.",
      floral: "2 g per 200 ml water at about 90 °C, steep 3–4 minutes."
    }
  };

  /* Compact rows. Coffee: [id, name, category, origin, roast, process, "n1|n2|n3", "body,acidity,sweetness", short, price, rating, badge]
                    Tea: [id, name, category, origin, teaStyle, caffeine, "n1|n2|n3", "body,acidity,sweetness", short, price, rating, badge] */
  const COFFEE_ROWS = [
    ["coorg-estate", "Coorg Estate", "single-origin", "Coorg, Karnataka", "Medium", "washed", "milk chocolate|hazelnut|orange peel", "3,3,4", "Round and sweet with a gentle citrus lift.", 460, 4.7, ""],
    ["chikmagalur-gold", "Chikmagalur Gold", "single-origin", "Chikmagalur, Karnataka", "Medium-light", "washed", "stone fruit|honey|almond", "3,4,4", "Clean, fruity and easy to drink.", 480, 4.6, ""],
    ["baba-budan", "Baba Budan Hills", "single-origin", "Baba Budangiri, Karnataka", "Medium", "natural", "dark cherry|cocoa|brown sugar", "4,3,4", "Fruit-forward with a cocoa finish.", 490, 4.5, ""],
    ["araku-valley", "Araku Valley", "single-origin", "Araku Valley, Andhra Pradesh", "Medium", "honey", "caramel|red apple|toasted almond", "3,3,5", "Honey-processed and notably sweet.", 520, 4.6, ""],
    ["nilgiri-mist", "Nilgiri Mist", "single-origin", "Nilgiris, Tamil Nadu", "Medium-light", "washed", "floral|lemon zest|honey", "2,4,3", "Light-bodied and aromatic.", 470, 4.4, ""],
    ["wayanad-robusta", "Wayanad Robusta", "single-origin", "Wayanad, Kerala", "Dark", "washed", "dark chocolate|toasted nut|spice", "5,1,2", "A bold robusta with a thick body.", 400, 4.3, ""],
    ["monsoon-malabar", "Monsoon Malabar", "single-origin", "Malabar coast, Karnataka", "Medium-dark", "monsooned", "dark chocolate|spice|toasted nuts", "5,1,3", "Full-bodied, low acidity, deeply spiced.", 420, 4.8, "House favourite"],
    ["morning-ritual", "Morning Ritual", "blend", "Blend of Indian arabicas", "Medium", "washed", "caramel|cocoa|almond", "4,2,4", "A balanced daily cup that suits milk or black.", 440, 4.6, "Daily favourite"],
    ["plantation-blend", "Plantation Blend", "blend", "Karnataka arabica and robusta", "Medium-dark", "washed and natural", "dark chocolate|molasses|roasted nuts", "5,2,3", "Strong and smooth for a big mug.", 410, 4.4, ""],
    ["kaapi-blend", "South Indian Kaapi Blend", "blend", "Karnataka arabica and robusta", "Dark", "washed", "bold roast|chocolate|toasted sugar", "5,1,3", "Built for strong, milky filter kaapi.", 380, 4.5, ""],
    ["sunday-slow", "Sunday Slow Blend", "blend", "Blend of Indian and Brazilian coffees", "Medium", "natural and washed", "peanut brittle|milk chocolate|stewed fruit", "4,2,4", "Soft, sweet and unhurried.", 450, 4.3, ""],
    ["sunrise-espresso", "Sunrise Espresso", "espresso", "Karnataka", "Medium", "washed", "caramel|hazelnut|cocoa", "4,2,4", "A rounded everyday espresso.", 460, 4.7, "Smooth & balanced"],
    ["midnight-shot", "Midnight Espresso", "espresso", "Karnataka and Kerala", "Dark", "washed", "bittersweet chocolate|burnt sugar|walnut", "5,1,2", "Dark, intense and thick in the cup.", 470, 4.4, ""],
    ["crema-reserve", "Crema Reserve", "espresso", "Baba Budangiri, Karnataka", "Medium-dark", "washed", "brown butter|cocoa nib|dried fig", "4,2,3", "Heavy crema and a lingering finish.", 540, 4.6, ""],
    ["flat-white-blend", "Flat White Blend", "espresso", "Karnataka", "Medium", "washed", "milk chocolate|toffee|vanilla", "4,2,4", "Cuts through milk without bitterness.", 480, 4.5, ""],
    ["midnight-decaf", "Midnight Decaf", "decaf", "Karnataka", "Medium", "washed, decaffeinated", "milk chocolate|almond|caramel", "3,2,4", "Comforting sweetness with very little caffeine.", 480, 4.3, "Anytime cup"],
    ["evening-decaf-filter", "Evening Decaf Filter", "decaf", "Coorg, Karnataka", "Medium-light", "washed, decaffeinated", "honey|baked apple|cocoa", "3,3,4", "A gentle filter cup for after dinner.", 490, 4.2, ""],
    ["highland-filter", "Highland Filter", "filter", "Chikmagalur, Karnataka", "Light", "washed", "citrus|brown sugar|florals", "2,5,3", "Clean and expressive for pour-over.", 490, 4.6, "Bright & lively"],
    ["pour-over-no-1", "Pour-over No. 1", "filter", "Sakleshpur, Karnataka", "Medium-light", "washed", "red grape|toffee|lemon", "3,4,3", "Juicy acidity with a sweet middle.", 500, 4.5, ""],
    ["pulney-hills", "Pulney Hills Filter", "filter", "Pulney Hills, Tamil Nadu", "Medium", "washed", "plum|malt|cocoa", "3,3,3", "Smooth and malty, good for daily filters.", 460, 4.3, ""],
    ["shevaroy-washed", "Shevaroy Washed", "filter", "Yercaud, Tamil Nadu", "Medium-light", "washed", "peach|almond|honey", "3,4,4", "Soft stone fruit and a honeyed finish.", 480, 4.4, ""],
    ["cold-brew-classic", "Cold Brew Classic", "cold-brew", "Karnataka", "Medium-dark", "washed", "dark chocolate|molasses|vanilla", "4,1,4", "Coarse-ground for a smooth, low-acid cold brew.", 450, 4.5, ""],
    ["cold-brew-bright", "Cold Brew Bright", "cold-brew", "Chikmagalur, Karnataka", "Medium", "washed", "orange|caramel|cocoa", "3,3,4", "A livelier cold brew with citrus sweetness.", 470, 4.3, ""],
    ["winter-natural", "Winter Natural Lot", "seasonal", "Baba Budangiri, Karnataka", "Medium-light", "natural", "blueberry|cocoa|raisin", "3,3,5", "A small seasonal lot, jammy and sweet.", 580, 4.7, "Seasonal"],
    ["harvest-reserve", "Harvest Season Reserve", "seasonal", "Coorg, Karnataka", "Medium", "honey", "toffee|red berry|spice", "3,3,4", "Seasonal and rich, with warm spice.", 600, 4.6, "Seasonal"]
  ];

  const TEA_ROWS = [
    ["darjeeling-autumn", "Darjeeling Autumn", "black", "Darjeeling, West Bengal", "Whole leaf", "medium", "muscatel|dried fruit|toasted nut", "2,3,2", "Light and amber with a grape-like finish.", 380, 4.6, ""],
    ["assam-breakfast", "Assam Breakfast", "black", "Assam", "Whole leaf", "high", "malt|honey|cocoa", "5,2,3", "A brisk, malty cup that stands up to milk.", 340, 4.7, "Classic"],
    ["nilgiri-frost", "Nilgiri Frost Black", "black", "Nilgiris, Tamil Nadu", "Whole leaf", "medium", "brisk|orange peel|honey", "3,3,3", "Bright and fragrant, good iced.", 320, 4.4, ""],
    ["kangra-black", "Kangra Black", "black", "Kangra, Himachal Pradesh", "Whole leaf", "medium", "roasted nut|apricot|malt", "3,2,3", "Smooth, nutty and gently sweet.", 360, 4.3, ""],
    ["himalayan-black", "Himalayan Black", "black", "Sikkim", "Whole leaf", "medium", "dried apricot|spice|honey", "3,3,3", "Warm and rounded with a fruity edge.", 420, 4.5, ""],
    ["darjeeling-green", "Darjeeling Green", "green", "Darjeeling, West Bengal", "Whole leaf", "low", "fresh grass|chestnut|lemon", "2,3,2", "Crisp and refreshing with a clean finish.", 400, 4.5, ""],
    ["nilgiri-green", "Nilgiri Green", "green", "Nilgiris, Tamil Nadu", "Whole leaf", "low", "green apple|fresh grass|sweet pea", "2,3,2", "Light, sweet and easy to drink.", 350, 4.3, ""],
    ["kangra-green", "Kangra Green", "green", "Kangra, Himachal Pradesh", "Whole leaf", "low", "toasted rice|chestnut|fresh grass", "2,2,3", "Mellow and toasty with no bitterness.", 370, 4.4, ""],
    ["silver-needle", "Silver Needle", "white", "Nilgiris, Tamil Nadu", "Whole leaf", "low", "melon|honey|hay", "1,2,4", "Delicate buds with a silky, sweet cup.", 620, 4.8, "Premium"],
    ["white-peony", "White Peony", "white", "Darjeeling, West Bengal", "Whole leaf", "low", "apricot|dried flowers|honey", "2,2,3", "Soft and floral with a rounded body.", 480, 4.5, ""],
    ["assam-white", "Assam White", "white", "Assam", "Whole leaf", "low", "sweet hay|peach|malt", "2,2,3", "A gentle white tea with a hint of malt.", 450, 4.2, ""],
    ["nilgiri-oolong", "Nilgiri Oolong", "oolong", "Nilgiris, Tamil Nadu", "Whole leaf", "medium", "orchid|cream|stone fruit", "3,3,3", "Floral and creamy, with several good steeps.", 520, 4.6, ""],
    ["roasted-oolong", "Roasted Oolong", "oolong", "Darjeeling, West Bengal", "Whole leaf", "medium", "roasted nut|caramel|dried fruit", "4,2,4", "Toasty and warming, rich without bitterness.", 540, 4.5, ""],
    ["tulsi-ginger", "Tulsi Ginger", "herbal", "India (herbal blend)", "Infusion", "none", "holy basil|ginger|sweet herb", "2,1,2", "A soothing, peppery herbal cup.", 300, 4.2, "Caffeine-free"],
    ["garden-mint", "Garden Mint", "herbal", "India (herbal blend)", "Infusion", "none", "peppermint|spearmint|cooling", "2,1,2", "A refreshing infusion for a slower evening.", 340, 4.4, "Caffeine-free"],
    ["chamomile-calm", "Chamomile Calm", "herbal", "Herbal infusion", "Infusion", "none", "apple|hay|floral", "2,1,3", "Soft, floral and easy before bed.", 360, 4.3, "Caffeine-free"],
    ["lemongrass-ginger", "Lemongrass Ginger", "herbal", "India (herbal blend)", "Infusion", "none", "lemongrass|ginger|citrus", "2,3,2", "Zesty and warming, good hot or iced.", 310, 4.3, "Caffeine-free"],
    ["masala-chai", "Warming Masala Chai", "chai", "Assam black tea with spices", "Spiced", "medium", "cardamom|ginger|cinnamon", "5,2,3", "Robust black tea with warming spices.", 320, 4.8, "A cosy classic"],
    ["kashmiri-kahwa", "Kashmiri Kahwa", "chai", "Green tea with spices", "Spiced", "low", "saffron|cardamom|cinnamon", "2,2,3", "A fragrant green tea in the kahwa style.", 480, 4.5, ""],
    ["cardamom-chai", "Cardamom Chai", "chai", "Assam black tea with cardamom", "Spiced", "medium", "cardamom|malt|sweet spice", "4,2,3", "Strong Assam with a perfumed cardamom note.", 330, 4.4, ""],
    ["rooibos-vanilla", "Rooibos Vanilla", "rooibos", "Rooibos from South Africa", "Infusion", "none", "vanilla|honey|woody", "3,1,4", "Naturally sweet and caffeine-free.", 400, 4.4, "Caffeine-free"],
    ["rooibos-orange-spice", "Rooibos Orange Spice", "rooibos", "Rooibos from South Africa", "Infusion", "none", "orange|cinnamon|woody", "3,2,3", "A cosy caffeine-free cup with citrus and spice.", 410, 4.3, "Caffeine-free"],
    ["citrus-earl-grey", "Citrus Earl Grey", "floral", "Black tea with bergamot", "Blended", "medium", "bergamot|orange peel|malt", "3,3,2", "Black tea with bright bergamot and citrus.", 350, 4.6, "Classic, lifted"],
    ["jasmine-green", "Jasmine Green", "floral", "Green tea scented with jasmine", "Blended", "low", "jasmine|green tea|soft sweetness", "2,2,3", "Delicate green tea with a gentle floral lift.", 390, 4.6, "Soft & fragrant"],
    ["rose-black", "Rose Black", "floral", "Black tea with rose petals", "Blended", "medium", "rose|malt|honey", "3,2,3", "Smooth black tea with a soft rose aroma.", 380, 4.2, ""]
  ];

  /* Demo stock flags (not verified records). */
  const LOW_STOCK = ["winter-natural", "harvest-reserve", "silver-needle"];
  const OUT_OF_STOCK = ["rose-black"];

  function deepFreeze(obj) {
    Object.values(obj).forEach(v => { if (v && typeof v === "object") deepFreeze(v); });
    return Object.freeze(obj);
  }

  function buildProduct(type, row) {
    const [id, name, category, origin, style, extra, notes, prof, short, base, rating, badge] = row;
    const isCoffee = type === "coffee";
    const n = notes.split("|");
    const [body, acidity, sweetness] = prof.split(",").map(Number);
    const ladder = PACKS[type];
    const description = isCoffee
      ? `${name} is a ${style.toLowerCase()} roast ${category} coffee (${extra}) from ${origin}.`
      : `${name} is a ${style.toLowerCase()} ${category} tea from ${origin}.`;
    const record = {
      id, name, type, category, origin,
      caffeineLevel: isCoffee ? (category === "decaf" ? "low" : "high") : extra,
      tastingNotes: n,
      flavourProfile: { body, acidity, sweetness },
      shortDescription: short,
      longDescription: `${description} ${short} Expect ${n[0]}, ${n[1]} and ${n[2]} in the cup. Origin and product details are proposed catalogue content for this demo.`,
      brewGuide: BREW[type][category],
      basePrice: base,
      defaultPack: ladder.base,
      packSizes: ladder.sizes.map(([label, grams, mult]) => ({ label, grams, price: Math.round(base * mult) })),
      badge,
      rating,
      stockStatus: OUT_OF_STOCK.includes(id) ? "out-of-stock" : LOW_STOCK.includes(id) ? "low-stock" : "in-stock",
      imageKey: `${type}-${id}`,
      visible: true
    };
    if (isCoffee) {
      record.roastLevel = style;
      record.process = extra;
      record.grindOptions = category === "cold-brew" ? COLD_GRINDS : GRINDS;
    } else {
      record.teaStyle = style;
    }
    return record;
  }

  const CATALOGUE = deepFreeze([
    ...COFFEE_ROWS.map(r => buildProduct("coffee", r)),
    ...TEA_ROWS.map(r => buildProduct("tea", r))
  ]);

  /* THE image map. Local paths only. Add your real photographs with exactly these filenames. */
  const IMAGES = {
    hero: "images/editorial/hero.jpg",
    story: "images/editorial/story.jpg",
    placeholder: "data:image/svg+xml," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 480"><rect width="400" height="480" fill="#dfe5d7"/>' +
      '<circle cx="200" cy="220" r="46" fill="none" stroke="#c29a5b" stroke-width="2"/>' +
      '<text x="200" y="230" text-anchor="middle" font-family="Georgia,serif" font-size="28" fill="#17271f">E&amp;L</text>' +
      '<text x="200" y="320" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" fill="#5f685d">Photo coming soon</text></svg>')
  };
  CATALOGUE.forEach(p => { IMAGES[p.imageKey] = `images/${p.type}/${p.imageKey}.jpg`; });
  "abcdefghij".split("").forEach(l => { IMAGES[`plan-${l}`] = `images/plans/plan-${l}.jpg`; });
  Object.freeze(IMAGES);

  /* STAND-IN PHOTOS. Used only when a local file in /images is missing. These are generic category
     photos (from the original site's code), not your actual packaging. Add your own file with the
     exact filename from IMAGES and it automatically takes priority. */
  const unsplash = (id, w) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=85`;
  const STAND_IN = {
    coffee: ["photo-1559525839-b184a4d698c7", "photo-1447933601403-0c6688de566e", "photo-1511537190424-bbbab87ac5eb", "photo-1497515114629-f71d768fd07c"].map(id => unsplash(id, 800)),
    tea: ["photo-1594631252845-29fc4cc8cde9", "photo-1556679343-c7306c1976bc", "photo-1571934811356-5cc061b6821f", "photo-1563911892437-1feda0179e1b"].map(id => unsplash(id, 800)),
    hero: unsplash("photo-1442512595331-e89e73853f31", 1400),
    story: unsplash("photo-1495474472287-4d71bcdd2085", 1300)
  };
  const STAND_IN_BY_KEY = { hero: STAND_IN.hero, story: STAND_IN.story };
  const counters = { coffee: 0, tea: 0 };
  CATALOGUE.forEach(p => { STAND_IN_BY_KEY[p.imageKey] = STAND_IN[p.type][counters[p.type]++ % STAND_IN[p.type].length]; }); // even rotation
  const planPool = [...STAND_IN.coffee, ...STAND_IN.tea];
  "abcdefghij".split("").forEach((l, i) => { STAND_IN_BY_KEY[`plan-${l}`] = planPool[i % planPool.length]; });
  const fallbackFor = key => STAND_IN_BY_KEY[key] || null;

  const BY_ID = new Map(CATALOGUE.map(p => [p.id, p]));

  /* The single pricing function. Returns whole rupees, or null for an unknown product or pack. */
  function priceFor(product, packLabel) {
    const pack = product && product.packSizes.find(s => s.label === packLabel);
    return pack ? pack.price : null;
  }

  /* CURATED PLANS A–J. items: [productId, packLabel, quantity per delivery].
     Plan prices are never typed in: they come from priceFor() and SUBSCRIBE_DISCOUNT. */
  function plan(letter, name, description, items, frequency, durations, type, caffeine, gift, customisation, audience, badge) {
    return {
      id: `plan-${letter.toLowerCase()}`, letter, name, description,
      items: items.map(([productId, pack, quantity]) => ({ productId, pack, quantity })),
      frequency, durations, type, caffeine, gift, customisation, audience, badge,
      imageKey: `plan-${letter.toLowerCase()}`,
      savings: "10% subscriber saving on the products"
    };
  }

  const PLANS = deepFreeze([
    plan("A", "Morning Starter", "Two balanced coffees for weekday mornings.", [["coorg-estate", "250 g", 1], ["morning-ritual", "250 g", 1]], "monthly", [3, 6, 12], "coffee", "Caffeinated", false, "Change grind per coffee", "Daily coffee drinkers", "Most popular"),
    plan("B", "Tea Explorer", "Four whole-leaf teas to learn what you like.", [["darjeeling-autumn", "50 g", 1], ["nilgiri-green", "50 g", 1], ["white-peony", "50 g", 1], ["nilgiri-oolong", "50 g", 1]], "monthly", [1, 3, 6], "tea", "Low to medium", false, "Swap any tea", "Curious tea drinkers", ""),
    plan("C", "Decaf Evenings", "Low-caffeine and caffeine-free cups for after dinner.", [["midnight-decaf", "250 g", 1], ["chamomile-calm", "100 g", 1], ["rooibos-vanilla", "100 g", 1]], "monthly", [3, 6, 12], "mixed", "Low or none", false, "Change grind per coffee", "Evening drinkers", ""),
    plan("D", "Gifting Set", "A coffee and three teas, ready to give.", [["coorg-estate", "250 g", 1], ["kashmiri-kahwa", "100 g", 1], ["jasmine-green", "100 g", 1], ["citrus-earl-grey", "100 g", 1]], "monthly", [1, 3, 6], "mixed", "Mixed", true, "Add a gift message", "Gift givers", "Gift idea"),
    plan("E", "Espresso Ritual", "Two espresso blends for a home machine.", [["sunrise-espresso", "500 g", 1], ["flat-white-blend", "250 g", 1]], "monthly", [3, 6, 12], "coffee", "Caffeinated", false, "Espresso or moka grind", "Home espresso fans", ""),
    plan("F", "Indian Origins", "Two Indian coffees and two Indian teas.", [["coorg-estate", "250 g", 1], ["chikmagalur-gold", "250 g", 1], ["assam-breakfast", "100 g", 1], ["darjeeling-autumn", "100 g", 1]], "monthly", [3, 6, 12], "mixed", "Mixed", true, "Change grind per coffee", "Origin enthusiasts", ""),
    plan("G", "Premium Reserve", "Seasonal and premium lots for special occasions.", [["winter-natural", "250 g", 1], ["harvest-reserve", "250 g", 1], ["silver-needle", "100 g", 1], ["roasted-oolong", "100 g", 1]], "monthly", [1, 3, 6], "mixed", "Mixed", true, "Swap any item", "Connoisseurs", "Limited lots"),
    plan("H", "Mixed Ritual Box", "One coffee and two teas for a varied week.", [["sunday-slow", "250 g", 1], ["masala-chai", "100 g", 1], ["citrus-earl-grey", "100 g", 1]], "monthly", [3, 6, 12], "mixed", "Mixed", true, "Swap any item", "Households with mixed tastes", ""),
    plan("I", "Office & Team Box", "Larger packs for a shared pantry, delivered weekly.", [["morning-ritual", "500 g", 1], ["assam-breakfast", "200 g", 1], ["garden-mint", "100 g", 1]], "weekly", [1, 3, 6], "mixed", "Mixed", false, "Change quantities", "Teams and small offices", "Teams"),
    plan("J", "Seasonal Discovery", "A seasonal coffee, a cold brew and two teas.", [["winter-natural", "250 g", 1], ["cold-brew-bright", "250 g", 1], ["nilgiri-oolong", "50 g", 1], ["kangra-green", "50 g", 1]], "monthly", [3, 6, 12], "mixed", "Mixed", false, "Swap any item", "Adventurous drinkers", "New")
  ]);

  function planSubtotal(p) {
    return p.items.reduce((sum, i) => sum + (priceFor(BY_ID.get(i.productId), i.pack) || 0) * i.quantity, 0);
  }
  function planPerDelivery(p) {
    return Math.round(planSubtotal(p) * (1 - SUBSCRIBE_DISCOUNT));
  }

  /* Self-check run by app.js at start-up. An empty array means the data is consistent. */
  function validateData() {
    const problems = [];
    const ids = new Set();
    CATALOGUE.forEach(p => {
      if (ids.has(p.id)) problems.push(`Duplicate product id: ${p.id}`);
      ids.add(p.id);
      if (p.tastingNotes.length !== 3) problems.push(`${p.id}: needs exactly 3 tasting notes`);
      if (!IMAGES[p.imageKey]) problems.push(`${p.id}: image key missing from IMAGES`);
      if (!p.packSizes.some(s => s.label === p.defaultPack)) problems.push(`${p.id}: default pack not in packSizes`);
    });
    if (CATALOGUE.filter(p => p.type === "coffee").length < 25) problems.push("Fewer than 25 coffees");
    if (CATALOGUE.filter(p => p.type === "tea").length < 25) problems.push("Fewer than 25 teas");
    PLANS.forEach(pl => pl.items.forEach(i => {
      const prod = BY_ID.get(i.productId);
      if (!prod) problems.push(`Plan ${pl.letter}: unknown product ${i.productId}`);
      else if (priceFor(prod, i.pack) === null) problems.push(`Plan ${pl.letter}: ${i.productId} has no ${i.pack} pack`);
    }));
    return problems;
  }

  window.EL = Object.freeze({
    CATALOGUE, IMAGES, PLANS, PACKS, GRINDS, SUBSCRIBE_DISCOUNT, DEMO_NOTE,
    priceFor, planSubtotal, planPerDelivery, validateData, fallbackFor
  });
})();