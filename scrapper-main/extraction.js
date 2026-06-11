// Roost listing extraction — runs inside the extension, no Python needed.
// Parses captured FB posts into rows matching the importer schema
// (v1/backend/importer/import_inventory.py COLS), so the exported CSV
// doubles as the founder's review sheet AND the future DB import file.

// ---- Gazetteer (mirror of gazetteer.csv — edit both together) ----
const GAZETTEER = [
  // name, kind, corridor, lat, lng, aliases[]
  ["Gachibowli", "locality", "Gachibowli", 17.4401, 78.3489, ["gachbowli"]],
  ["Nanakramguda", "locality", "Gachibowli", 17.4180, 78.3370, ["nanakram guda"]],
  ["Kokapet", "locality", "Gachibowli", 17.4097, 78.3262, ["neopolis"]],
  ["Financial District", "locality", "Gachibowli", 17.4156, 78.3414, ["fin district", "financial dist"]],
  ["Manikonda", "locality", "Gachibowli", 17.4057, 78.3815, []],
  ["Madhapur", "locality", "Madhapur", 17.4486, 78.3908, ["madapur"]],
  ["HITEC City", "locality", "Madhapur", 17.4480, 78.3760, ["hitech city", "hi-tec", "cyber city", "hitec"]],
  ["Kondapur", "locality", "Kondapur", 17.4647, 78.3620, []],
  ["Nallagandla", "locality", "Kondapur", 17.4565, 78.3290, ["nallaganda"]],
  ["Microsoft", "landmark", "Gachibowli", 17.4435, 78.3540, ["microsoft idc"]],
  ["Amazon", "landmark", "Gachibowli", 17.4180, 78.3370, []],
  ["Google", "landmark", "Gachibowli", 17.4230, 78.3470, []],
  ["Wipro", "landmark", "Gachibowli", 17.4300, 78.3450, ["wipro circle"]],
  ["Infosys", "landmark", "Gachibowli", 17.4390, 78.3360, []],
  ["Deloitte", "landmark", "Gachibowli", 17.4196, 78.3357, ["deloitte usi"]],
  ["IIIT Hyderabad", "landmark", "Gachibowli", 17.4454, 78.3494, ["iiit-h", "iiit"]],
  ["ISB", "landmark", "Gachibowli", 17.4350, 78.3380, ["isb hyderabad"]],
  ["DLF", "landmark", "Gachibowli", 17.4435, 78.3772, ["dlf cyber city"]],
  ["Mindspace", "landmark", "Madhapur", 17.4350, 78.3830, ["mind space"]],
  ["Salesforce", "landmark", "Madhapur", 17.4320, 78.3820, []],
  ["Inorbit Mall", "landmark", "Madhapur", 17.4346, 78.3870, ["inorbit"]],
  ["Cyber Towers", "landmark", "Madhapur", 17.4504, 78.3812, []],
  ["Durgam Cheruvu", "landmark", "Madhapur", 17.4300, 78.3930, ["durgam cheruvu lake"]],
  ["Botanical Garden", "landmark", "Madhapur", 17.4180, 78.3760, ["botanical"]],
  ["Forum Sujana Mall", "landmark", "Kondapur", 17.4570, 78.3240, ["forum mall", "sujana mall"]]
];

// ---- Field patterns (ported from patterns.py) ----
const BHK_PATTERNS = [
  [/\b4\s*\+?\s*bhk\b/i, "4+"],
  [/\b3\s*bhk\b/i, "3"],
  [/\b2\s*bhk\b/i, "2"],
  [/\b1\s*bhk\b/i, "1"],
  [/\bstudio\b/i, "studio"],
  [/\b1\s*rk\b/i, "rk"],
  [/\bsingle\s+room|\broom\s+(?:for|available)\b/i, "room"]
];

const FURNISHING_PATTERNS = [
  [/\bfully?[\s-]*furnish/i, "full"],
  [/\bsemi[\s-]*furnish/i, "semi"],
  [/\bunfurnish|bare\s+shell/i, "none"]
];

const LISTING_TYPE_PATTERNS = [
  [/\bflatmate|room\s*mate|sharing\s+(?:room|flat)|share\s+(?:room|flat)\b/i, "flatmate"],
  [/\bpg\b|\bpaying\s+guest\b/i, "pg"],
  [/\bhandover|lease\s+transfer\b/i, "handover"],
  [/\bsingle\s+room|\broom\s+for\s+rent\b/i, "room"],
  [/\bbhk\b|\bindependent|entire\s+flat|whole\s+flat|full\s+flat\b/i, "whole"]
];

const TENANT_PREF_PATTERNS = [
  [/\bfamily\s+only|only\s+famil|no\s+bachelors?|for\s+famil/i, "family"],
  [/\bgirls?\s+only|only\s+girls?|ladies\s+only|females?\s+only|for\s+(?:girls?|ladies|females?)\b/i, "girls"],
  [/\bboys?\s+only|only\s+boys?|males?\s+only|for\s+(?:boys?|males?)\b/i, "boys"],
  [/\bbachelors?\s+(?:only|allowed|welcome)|only\s+bachelors?|for\s+bachelors?\b/i, "bachelors"],
  [/\bveg(?:etarian)?s?\s+only\b/i, "veg"]
];

const BROKER_PATTERNS = [/\bbroker(?:age)?\b/i, /\bagent\b/i, /\breal\s+estate\b/i, /\bcommission\b/i];
const OWNER_PATTERNS = [/\bno\s+broker/i, /\bdirect\s+owner/i, /\bowner\s+post/i, /\bbrokers?\s+excuse/i];

// "Looking for" posts = renters seeking, not listings. Flag for review.
const FINDER_PATTERNS = [/\blooking\s+for\b/i, /\brequired?\s+(?:a\s+)?(?:flat|room|1bhk|2bhk|3bhk|pg)\b/i, /\bneed\s+(?:a\s+)?(?:flat|room|pg)\b/i, /\bwanted\b/i];

function matchFirst(text, patterns) {
  for (const [re, value] of patterns) {
    if (re.test(text)) return value;
  }
  return "";
}

function extractPhone(text) {
  const m = text.replace(/[\s-]/g, "").match(/(?:\+91|91|0)?([6-9]\d{9})/);
  return m ? m[1] : "";
}

function extractRent(text) {
  // Skip if explicitly "ask"
  // ₹45000, 45,000/-, 45000 per month, rent 45000, 45k
  const kMatch = text.match(/(?:rent|rs|₹|price)[^\d]{0,10}(\d{1,2}(?:\.\d)?)\s*k\b/i);
  if (kMatch) {
    const rent = Math.round(parseFloat(kMatch[1]) * 1000);
    return sane(rent) ? { rent, raw: kMatch[0].trim() } : null;
  }
  const m = text.match(/(?:rent|rs\.?|₹|inr|price)[^\d]{0,10}(\d{1,3}(?:,\d{2,3})+|\d{4,6})/i) ||
            text.match(/(\d{1,3}(?:,\d{2,3})+|\d{4,6})\s*(?:\/-|\/\s*month|per\s+month|pm\b|rs\b)/i);
  if (!m) return null;
  const rent = parseInt(m[1].replace(/,/g, ""), 10);
  return sane(rent) ? { rent, raw: m[0].trim() } : null;
}

function sane(rent) {
  return rent >= 2000 && rent <= 500000;
}

function rentIsAsk(text) {
  return /\b(?:negotiable|dm\s+for\s+(?:price|rent)|price\s+on\s+request|contact\s+for\s+(?:price|rent))\b/i.test(text);
}

function extractLocality(text) {
  const lower = text.toLowerCase();
  let best = null;
  let bestPos = Infinity;
  for (const [name, kind, corridor, lat, lng, aliases] of GAZETTEER) {
    for (const candidate of [name.toLowerCase(), ...aliases]) {
      const pos = lower.indexOf(candidate);
      if (pos !== -1 && pos < bestPos) {
        // Prefer localities over landmarks at equal position; first mention wins
        if (pos < bestPos || (best && best.kind === "landmark" && kind === "locality")) {
          best = { name, kind, corridor, lat, lng };
          bestPos = pos;
        }
      }
    }
  }
  return best;
}

function extractPosterKind(text) {
  const owner = OWNER_PATTERNS.some((re) => re.test(text));
  const broker = BROKER_PATTERNS.some((re) => re.test(text));
  if (owner && !broker) return "owner";
  if (broker && !owner) return "broker";
  if (owner && broker) return "owner"; // "no brokers" mentions both words
  return "unknown";
}

// Simple text hash for dedup across captures (same post seen twice while scrolling)
function textHash(text) {
  let hash = 0;
  const s = text.replace(/\s+/g, " ").slice(0, 400);
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

// One captured post → one CSV row (importer schema)
function postToListing(post, capture) {
  const text = post.text;
  const rentInfo = extractRent(text);
  const loc = extractLocality(text);
  const isFinder = FINDER_PATTERNS.some((re) => re.test(text)) && !/\bavailable\b/i.test(text);

  const notes = [];
  if (isFinder) notes.push("REVIEW: looks like a 'looking for' post, not a listing");
  if (!rentInfo && rentIsAsk(text)) notes.push("rent: ask/negotiable");

  return {
    id: crypto.randomUUID(),
    source: "fb_group",
    source_ref: post.permalink || capture.url,
    scraped_at: capture.capturedAt,
    photos: (post.images || []).slice(0, 5).join(" | "),
    raw_text: text,
    capture_method: "manual",
    phone: extractPhone(text),
    phone_confirmed: "",
    rent: rentInfo ? rentInfo.rent : "",
    rent_raw: rentInfo ? rentInfo.raw : (rentIsAsk(text) ? "ask" : ""),
    deposit: "",
    maintenance: "",
    locality_name: loc ? loc.name : "",
    bhk: matchFirst(text, BHK_PATTERNS),
    listing_type: matchFirst(text, LISTING_TYPE_PATTERNS),
    furnishing: matchFirst(text, FURNISHING_PATTERNS),
    tenant_pref: matchFirst(text, TENANT_PREF_PATTERNS),
    amenities: "",
    available_from: "",
    poster_kind: extractPosterKind(text),
    lat: loc ? loc.lat : "",
    lng: loc ? loc.lng : "",
    geo_precision: loc ? (loc.kind === "landmark" ? "landmark" : "locality_centroid") : "",
    corridor: loc ? loc.corridor : "",
    all_in_rent: rentInfo ? rentInfo.rent : "",
    freshness_state: "fresh",
    dedup_group_id: "",
    archived: "false",
    validation_status: "unvalidated",
    reject_reason: "",
    validated_at: "",
    contact_tap_count: "0",
    notes: notes.join("; "),
    _hash: textHash(text) // internal dedup key, stripped before export
  };
}

// All captures → deduped listing rows
function extractListings(records) {
  const seen = new Map(); // hash → listing
  for (const capture of records) {
    const posts = (capture.posts && capture.posts.length)
      ? capture.posts
      // Fallback for old captures without per-post split: whole page = one record
      : [{ text: capture.visibleText || "", images: (capture.imageUrls || []).map((i) => i.src), permalink: "" }];

    for (const post of posts) {
      if (!post.text || post.text.trim().length < 40) continue;
      const listing = postToListing(post, capture);
      const existing = seen.get(listing._hash);
      if (existing) {
        // Same post captured again — keep first, remember it's a repeat
        continue;
      }
      // Cross-post dedup: same phone + rent + locality = same home
      if (listing.phone && listing.rent && listing.locality_name) {
        const key = `${listing.phone}|${listing.rent}|${listing.locality_name}`;
        for (const other of seen.values()) {
          if (other.phone && `${other.phone}|${other.rent}|${other.locality_name}` === key) {
            const groupId = other.dedup_group_id || crypto.randomUUID();
            other.dedup_group_id = groupId;
            listing.dedup_group_id = groupId;
            listing.notes = [listing.notes, "REVIEW: possible repost (same phone+rent+locality)"].filter(Boolean).join("; ");
            break;
          }
        }
      }
      seen.set(listing._hash, listing);
    }
  }

  return [...seen.values()].map(({ _hash, ...row }) => row);
}
