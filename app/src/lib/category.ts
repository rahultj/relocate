// Item categories — a fixed, canonical set so the buyer feed groups cleanly
// (no "Kitchen" vs "kitchen" vs "Kitchenware" fragmentation). Pure + tested.
//
// Two jobs:
//   1. normalizeCategory — map free CSV text / synonyms onto the canonical set
//   2. suggestCategory   — guess a category from an item name (keyword match),
//                          used to pre-fill blanks at import (seller corrects)
//
// "Suggest, don't decide": auto-categorization is fuzzy by nature, so blanks
// get a best-effort guess the seller can override on /manage.

// Canonical categories, in the order they render in the buyer feed.
// "Other" always sorts last (handled in the feed, not here).
export const CATEGORIES = [
  "Furniture",
  "Kitchen",
  "Electronics",
  "Lighting",
  "Bedding",
  "Decor",
  "Plants",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

// Synonyms / loose spellings the seller might type in the CSV, mapped onto the
// canonical label. Keys are lowercased.
const SYNONYMS: Record<string, Category> = {
  furniture: "Furniture",
  furnishings: "Furniture",
  kitchen: "Kitchen",
  kitchenware: "Kitchen",
  dining: "Kitchen",
  cookware: "Kitchen",
  electronics: "Electronics",
  electronic: "Electronics",
  appliance: "Electronics",
  appliances: "Electronics",
  tech: "Electronics",
  lighting: "Lighting",
  lights: "Lighting",
  light: "Lighting",
  lamps: "Lighting",
  bedding: "Bedding",
  linens: "Bedding",
  "soft goods": "Bedding",
  softgoods: "Bedding",
  decor: "Decor",
  decoration: "Decor",
  decorations: "Decor",
  misc: "Decor",
  miscellaneous: "Decor",
  plants: "Plants",
  plant: "Plants",
  "indoor gardening": "Plants",
  gardening: "Plants",
  garden: "Plants",
  other: "Other",
};

/**
 * Map an arbitrary CSV cell onto a canonical category, or null if it doesn't
 * match anything (caller decides whether to fall back to a suggestion).
 * Exact canonical names match case-insensitively; known synonyms also map.
 */
export function normalizeCategory(raw: string | null | undefined): Category | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (key === "") return null;
  const canonical = CATEGORIES.find((c) => c.toLowerCase() === key);
  if (canonical) return canonical;
  return SYNONYMS[key] ?? null;
}

// Keyword → category. Checked in array order, so the FIRST match wins. Order is
// deliberate: specific appliance/lighting words are tested before the broad
// furniture words ("table", "shelf", "rack") that would otherwise swallow
// "table fan" or "table lamp".
const KEYWORDS: { category: Category; words: string[] }[] = [
  // Plants first: specific botanical words should win over the broad furniture
  // words ("shelf", "rack") and the general "plant" that would otherwise land in
  // Decor — e.g. "plant shelf" or "spider plant" is a plant, not furniture/decor.
  {
    category: "Plants",
    words: [
      "plant", "succulent", "philodendron", "pothos", "sansevieria", "cactus",
      "cacti", "fern", "ivy", "orchid", "lily", "lilly", "violet", "jade",
      "croton", "monstera", "aloe", "zebra plant",
    ],
  },
  {
    category: "Lighting",
    words: ["lamp", "lantern", "sconce", "bulb", "light"],
  },
  {
    category: "Kitchen",
    words: [
      "plate", "instant pot", "air fr", "fryer", "frier", "toaster",
      "blender", "pitcher", "brita", "dutch oven", "oven", "baking",
      "tray", "kettle", "dish", "cutlery", "mug", "compost", "dustbin",
      "trash", "bin",
    ],
  },
  {
    category: "Electronics",
    words: [
      "monitor", "screen", "television", " tv", "tv ", "turntable", "vinyl turntable",
      "humidifier", "fan", "vacuum", "iron", "scale", "thermometer",
      "massage gun", "white noise", "powerstrip", "power strip", "adapter",
      "charger", "speaker", "router", "machine",
    ],
  },
  {
    category: "Bedding",
    words: ["blanket", "pillow", "comforter", "duvet", "cushion", "sheet", "throw", "carpet", "rug"],
  },
  {
    category: "Decor",
    words: [
      "frame", "picture", "bookend", "vase", "mirror", "ukulele",
      "boardgame", "board game", "curtain", "basket", "laptop stand", "art",
    ],
  },
  {
    category: "Furniture",
    words: [
      "sofa", "couch", "loveseat", "love seat", "ottoman", "chair", "dresser",
      "table", "desk", "shelf", "shelves", "bookshelf", "bookcase", "cabinet",
      "nightstand", "bedside", "bed frame", "mattress", "console", "rack",
      "stool", "drawer", "bed",
    ],
  },
];

/**
 * Best-effort category guess from an item name, or null if nothing matches.
 * Used to pre-fill blank category cells at import; never overrides an explicit
 * category the seller provided.
 */
export function suggestCategory(name: string | null | undefined): Category | null {
  if (!name) return null;
  const n = name.toLowerCase();
  for (const { category, words } of KEYWORDS) {
    if (words.some((w) => n.includes(w))) return category;
  }
  return null;
}

/**
 * Resolve a category for import: an explicit (normalized) CSV value wins;
 * otherwise fall back to a name-based suggestion; otherwise null (uncategorized,
 * renders under "Other" in the feed).
 */
export function resolveCategory(
  rawCategory: string | null | undefined,
  name: string | null | undefined,
): Category | null {
  return normalizeCategory(rawCategory) ?? suggestCategory(name);
}
