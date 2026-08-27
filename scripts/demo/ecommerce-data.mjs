/**
 * Deterministic row generator for the neoboard_demo_public e-commerce tables.
 *
 * Uses a seeded mulberry32 PRNG + fixed corpora so every run produces
 * byte-identical data. No external dependencies. Idempotency matters because
 * `neoboard demo seed` is expected to produce the same state twice in a row.
 */

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) — fast, small, deterministic
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(seed) {
  const r = mulberry32(seed);
  return {
    next: r,
    int: (min, max) => Math.floor(r() * (max - min + 1)) + min,
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    chance: (p) => r() < p,
  };
}

// ---------------------------------------------------------------------------
// Corpora
// ---------------------------------------------------------------------------
const FIRST_NAMES = [
  "Alice", "Ben", "Clara", "Diego", "Elena", "Farid", "Grace", "Hiro",
  "Irene", "Jorge", "Kira", "Luca", "Maya", "Noah", "Olga", "Priya",
  "Quincy", "Rosa", "Sami", "Tess", "Umar", "Vera", "Wei", "Xiomara",
  "Yusuf", "Zoe",
];

const LAST_NAMES = [
  "Alvarez", "Brown", "Cho", "Davis", "Eriksen", "Fernandez", "Gupta",
  "Hernandez", "Ito", "Johnson", "Khan", "Lopez", "Martinez", "Nakamura",
  "Okafor", "Patel", "Quinn", "Rossi", "Singh", "Tanaka", "Umeh", "Vasquez",
  "Wong", "Xu", "Yamamoto", "Zhang",
];

const REGIONS = [
  { id: 1, name: "Northeast US",  country: "USA",    continent: "North America" },
  { id: 2, name: "West Coast US", country: "USA",    continent: "North America" },
  { id: 3, name: "Midwest US",    country: "USA",    continent: "North America" },
  { id: 4, name: "Western EU",    country: "France", continent: "Europe" },
  { id: 5, name: "Central EU",    country: "Germany", continent: "Europe" },
  { id: 6, name: "Southern EU",   country: "Italy",  continent: "Europe" },
  { id: 7, name: "East Asia",     country: "Japan",  continent: "Asia" },
  { id: 8, name: "Southeast Asia", country: "Singapore", continent: "Asia" },
  { id: 9, name: "South America", country: "Brazil", continent: "South America" },
  { id: 10, name: "Oceania",      country: "Australia", continent: "Oceania" },
];

const CITIES_BY_REGION = {
  1: [
    { name: "New York",    lat: 40.7128, lng: -74.006 },
    { name: "Boston",      lat: 42.3601, lng: -71.0589 },
    { name: "Philadelphia", lat: 39.9526, lng: -75.1652 },
  ],
  2: [
    { name: "San Francisco", lat: 37.7749, lng: -122.4194 },
    { name: "Los Angeles",   lat: 34.0522, lng: -118.2437 },
    { name: "Seattle",       lat: 47.6062, lng: -122.3321 },
  ],
  3: [
    { name: "Chicago",  lat: 41.8781, lng: -87.6298 },
    { name: "Detroit",  lat: 42.3314, lng: -83.0458 },
    { name: "Minneapolis", lat: 44.9778, lng: -93.2650 },
  ],
  4: [
    { name: "Paris",     lat: 48.8566, lng: 2.3522 },
    { name: "Lyon",      lat: 45.7640, lng: 4.8357 },
    { name: "Marseille", lat: 43.2965, lng: 5.3698 },
  ],
  5: [
    { name: "Berlin",   lat: 52.5200, lng: 13.4050 },
    { name: "Munich",   lat: 48.1351, lng: 11.582 },
    { name: "Hamburg",  lat: 53.5511, lng: 9.9937 },
  ],
  6: [
    { name: "Rome",    lat: 41.9028, lng: 12.4964 },
    { name: "Milan",   lat: 45.4642, lng: 9.19 },
    { name: "Naples",  lat: 40.8518, lng: 14.2681 },
  ],
  7: [
    { name: "Tokyo",   lat: 35.6762, lng: 139.6503 },
    { name: "Osaka",   lat: 34.6937, lng: 135.5023 },
    { name: "Kyoto",   lat: 35.0116, lng: 135.7681 },
  ],
  8: [
    { name: "Singapore", lat: 1.3521,  lng: 103.8198 },
    { name: "Bangkok",   lat: 13.7563, lng: 100.5018 },
    { name: "Jakarta",   lat: -6.2088, lng: 106.8456 },
  ],
  9: [
    { name: "São Paulo",       lat: -23.5505, lng: -46.6333 },
    { name: "Rio de Janeiro",  lat: -22.9068, lng: -43.1729 },
    { name: "Buenos Aires",    lat: -34.6037, lng: -58.3816 },
  ],
  10: [
    { name: "Sydney",    lat: -33.8688, lng: 151.2093 },
    { name: "Melbourne", lat: -37.8136, lng: 144.9631 },
    { name: "Auckland",  lat: -36.8485, lng: 174.7633 },
  ],
};

/**
 * Category tree:
 *   1 Electronics
 *     11 Phones
 *     12 Laptops
 *     13 Audio
 *   2 Home
 *     21 Furniture
 *     22 Kitchen
 *     23 Decor
 *   3 Apparel
 *     31 Mens
 *     32 Womens
 *     33 Kids
 *   4 Outdoors
 *     41 Camping
 *     42 Cycling
 *     43 Hiking
 */
const CATEGORIES = [
  { id: 1,  name: "Electronics", parent_id: null },
  { id: 11, name: "Phones",      parent_id: 1 },
  { id: 12, name: "Laptops",     parent_id: 1 },
  { id: 13, name: "Audio",       parent_id: 1 },
  { id: 2,  name: "Home",        parent_id: null },
  { id: 21, name: "Furniture",   parent_id: 2 },
  { id: 22, name: "Kitchen",     parent_id: 2 },
  { id: 23, name: "Decor",       parent_id: 2 },
  { id: 3,  name: "Apparel",     parent_id: null },
  { id: 31, name: "Mens",        parent_id: 3 },
  { id: 32, name: "Womens",      parent_id: 3 },
  { id: 33, name: "Kids",        parent_id: 3 },
  { id: 4,  name: "Outdoors",    parent_id: null },
  { id: 41, name: "Camping",     parent_id: 4 },
  { id: 42, name: "Cycling",     parent_id: 4 },
  { id: 43, name: "Hiking",      parent_id: 4 },
];

const LEAF_CATEGORY_IDS = CATEGORIES.filter((c) => c.parent_id !== null).map((c) => c.id);

const PRODUCT_ADJECTIVES = [
  "Classic", "Premium", "Eco", "Pro", "Lite", "Ultra", "Compact", "Deluxe",
  "Smart", "Vintage", "Urban", "Alpine",
];

const PRODUCT_NOUNS_BY_CAT = {
  11: ["Phone", "Smartphone", "Handset", "Mini"],
  12: ["Laptop", "Notebook", "Ultrabook", "Workstation"],
  13: ["Headphones", "Earbuds", "Speaker", "Soundbar"],
  21: ["Sofa", "Chair", "Table", "Bookshelf"],
  22: ["Mixer", "Kettle", "Toaster", "Blender"],
  23: ["Lamp", "Vase", "Rug", "Mirror"],
  31: ["T-Shirt", "Jacket", "Jeans", "Hoodie"],
  32: ["Dress", "Blouse", "Skirt", "Coat"],
  33: ["Onesie", "Romper", "Shorts", "Tee"],
  41: ["Tent", "Sleeping Bag", "Camp Stove", "Lantern"],
  42: ["Bike", "Helmet", "Lock", "Pump"],
  43: ["Backpack", "Boots", "Trekking Pole", "Compass"],
};

const ORDER_STATUSES = ["pending", "shipped", "delivered", "cancelled", "refunded"];

// ---------------------------------------------------------------------------
// Row counts (kept small enough to seed in <1s)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Feedback (#1510)
//
// The table seeded empty because it is the Form widget's write target, so both
// "Recent feedback" demo tables rendered "No results" and read as broken to a
// prospect browsing the demo. A handful of rows fixes the first impression
// without weakening the submit-then-appear demo: `hoursAgo` is a fixed offset
// applied against NOW() at insert time, so seeded rows are always in the
// recent past and a live submission (stamped NOW()) always sorts above them.
//
// Fixed literals rather than rng output so `generateAll` stays byte-identical
// per seed — the determinism test hashes the whole payload.
// ---------------------------------------------------------------------------
const FEEDBACK = [
  { rating: 5, category: "ui",       comment: "The new dashboard editor is a joy — drag, drop, done.", hoursAgo: 3 },
  { rating: 4, category: "shipping", comment: "Order tracking page loads much faster than last month.", hoursAgo: 9 },
  { rating: 5, category: "support",  comment: "Ticket answered in under an hour. Impressive.",          hoursAgo: 26 },
  { rating: 3, category: "ui",       comment: "Dark mode is great, but the export dialog is cramped.",  hoursAgo: 50 },
  { rating: 2, category: "shipping", comment: "Delivery estimate slipped twice on my last order.",      hoursAgo: 74 },
  { rating: 4, category: "pricing",  comment: "Bulk discount tiers are finally clear on the invoice.",  hoursAgo: 120 },
];

export function generateFeedback() {
  return FEEDBACK.map((f) => ({ ...f }));
}

export const COUNTS = {
  regions:   REGIONS.length,
  categories: CATEGORIES.length,
  customers: 200,
  products:  100,
  orders:    2000,
  feedback:  FEEDBACK.length,
};

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------
export function generateRegions() {
  return REGIONS.map((r) => ({ ...r }));
}

export function generateCategories() {
  return CATEGORIES.map((c) => ({ ...c }));
}

export function generateCustomers(rng) {
  const customers = [];
  for (let i = 1; i <= COUNTS.customers; i++) {
    const first = rng.pick(FIRST_NAMES);
    const last = rng.pick(LAST_NAMES);
    const region = rng.pick(REGIONS);
    const city = rng.pick(CITIES_BY_REGION[region.id]);
    // Small jitter around city center so map markers don't fully overlap
    const lat = city.lat + (rng.next() - 0.5) * 0.2;
    const lng = city.lng + (rng.next() - 0.5) * 0.2;
    // Signup dates span Jan 2024 → Mar 2026 (~800 days)
    const base = new Date("2024-01-01T00:00:00Z").getTime();
    const signup = new Date(base + rng.int(0, 800) * 86400000);
    customers.push({
      id: i,
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.com`,
      region_id: region.id,
      city: city.name,
      lat,
      lng,
      signup_date: signup.toISOString().slice(0, 10),
    });
  }
  return customers;
}

export function generateProducts(rng) {
  const products = [];
  for (let i = 1; i <= COUNTS.products; i++) {
    const category_id = rng.pick(LEAF_CATEGORY_IDS);
    const adjective = rng.pick(PRODUCT_ADJECTIVES);
    const noun = rng.pick(PRODUCT_NOUNS_BY_CAT[category_id]);
    const cost = Math.round((rng.int(500, 30000) / 100) * 100) / 100;
    const margin = 1 + rng.next() * 0.8; // 1.0 → 1.8x markup
    const price = Math.round(cost * margin * 100) / 100;
    products.push({
      id: i,
      name: `${adjective} ${noun} ${i}`,
      category_id,
      price,
      cost,
    });
  }
  return products;
}

export function generateOrders(rng, customers, products) {
  const orders = [];
  const orderItems = [];
  for (let i = 1; i <= COUNTS.orders; i++) {
    const customer = rng.pick(customers);
    // Order date between customer signup and now
    const signupMs = new Date(customer.signup_date).getTime();
    const nowMs = new Date("2026-04-01T00:00:00Z").getTime();
    const createdAt = new Date(signupMs + rng.int(0, Math.max(1, nowMs - signupMs)));
    const status = rng.pick(ORDER_STATUSES);

    const lineCount = rng.int(1, 5);
    const picked = new Set();
    let total = 0;
    for (let k = 0; k < lineCount; k++) {
      let product;
      do {
        product = rng.pick(products);
      } while (picked.has(product.id));
      picked.add(product.id);
      const qty = rng.int(1, 4);
      total += qty * product.price;
      orderItems.push({
        order_id: i,
        product_id: product.id,
        qty,
        price: product.price,
      });
    }
    orders.push({
      id: i,
      customer_id: customer.id,
      created_at: createdAt.toISOString(),
      status,
      total: Math.round(total * 100) / 100,
    });
  }
  return { orders, orderItems };
}

/**
 * Generates the full data set deterministically.
 * Same `seed` input → byte-identical output.
 */
export function generateAll(seed = 570) {
  const rng = makeRng(seed);
  const regions = generateRegions();
  const categories = generateCategories();
  const customers = generateCustomers(rng);
  const products = generateProducts(rng);
  const { orders, orderItems } = generateOrders(rng, customers, products);
  const feedback = generateFeedback();
  return { regions, categories, customers, products, orders, orderItems, feedback };
}

/**
 * Inserts the full data set into Postgres via the given `postgres` client,
 * within the `neoboard_demo_public` schema. Assumes the schema is empty.
 */
export async function insertAll(sql, data) {
  await sql`SET search_path TO neoboard_demo_public`;

  for (const r of data.regions) {
    await sql`
      INSERT INTO regions (id, name, country, continent)
      VALUES (${r.id}, ${r.name}, ${r.country}, ${r.continent})
    `;
  }

  // Insert parent categories first so FK constraints are satisfied
  const parents = data.categories.filter((c) => c.parent_id === null);
  const children = data.categories.filter((c) => c.parent_id !== null);
  for (const c of [...parents, ...children]) {
    await sql`
      INSERT INTO categories (id, name, parent_id)
      VALUES (${c.id}, ${c.name}, ${c.parent_id})
    `;
  }

  for (const c of data.customers) {
    await sql`
      INSERT INTO customers (id, name, email, region_id, city, lat, lng, signup_date)
      VALUES (${c.id}, ${c.name}, ${c.email}, ${c.region_id}, ${c.city}, ${c.lat}, ${c.lng}, ${c.signup_date})
    `;
  }

  for (const p of data.products) {
    await sql`
      INSERT INTO products (id, name, category_id, price, cost)
      VALUES (${p.id}, ${p.name}, ${p.category_id}, ${p.price}, ${p.cost})
    `;
  }

  for (const o of data.orders) {
    await sql`
      INSERT INTO orders (id, customer_id, created_at, status, total)
      VALUES (${o.id}, ${o.customer_id}, ${o.created_at}, ${o.status}, ${o.total})
    `;
  }

  for (const oi of data.orderItems) {
    await sql`
      INSERT INTO order_items (order_id, product_id, qty, price)
      VALUES (${oi.order_id}, ${oi.product_id}, ${oi.qty}, ${oi.price})
    `;
  }

  for (const f of data.feedback) {
    // NOW() minus a fixed offset, computed at insert time: seeded feedback is
    // always recent, and a form submission (stamped NOW()) sorts above it.
    await sql`
      INSERT INTO feedback (rating, category, comment, submitted_at)
      VALUES (${f.rating}, ${f.category}, ${f.comment},
              NOW() - make_interval(hours => ${f.hoursAgo}))
    `;
  }

  // Restore default search_path so the caller's subsequent queries
  // (against "dashboard", "user", etc.) don't get misrouted into the
  // demo schema.
  await sql`SET search_path TO public`;
}
