// Roost listing extraction v3 — runs inside the extension, no Python needed.
// Parses captured FB posts into rows. First 34 columns match the importer
// schema (v1/backend/importer/import_inventory.py COLS); v3 columns appended
// after (post_type, broker_probability, etc.) — importer ignores extras.

// ---- Gazetteer (mirror of gazetteer.csv — edit both together) ----
const GAZETTEER = [
  // name, kind, corridor, lat, lng, aliases[]
  ["Gachibowli", "locality", "Gachibowli", 17.4401, 78.3489, ["gachbowli"]],
  ["Nanakramguda", "locality", "Gachibowli", 17.4180, 78.3370, ["nanakram guda"]],
  ["Kokapet", "locality", "Gachibowli", 17.4097, 78.3262, ["neopolis"]],
  ["Financial District", "locality", "Gachibowli", 17.4156, 78.3414, ["fin district", "financial dist"]],
  ["Manikonda", "locality", "Gachibowli", 17.4057, 78.3815, []],
  ["Khajaguda", "locality", "Gachibowli", 17.4250, 78.3580, ["khaja guda"]],
  ["Madhapur", "locality", "Madhapur", 17.4486, 78.3908, ["madapur"]],
  ["HITEC City", "locality", "Madhapur", 17.4480, 78.3760, ["hitech city", "hi-tec", "cyber city", "hitec"]],
  ["Kavuri Hills", "locality", "Madhapur", 17.4530, 78.3850, ["kavuri"]],
  ["Kondapur", "locality", "Kondapur", 17.4647, 78.3620, []],
  ["Nallagandla", "locality", "Kondapur", 17.4565, 78.3290, ["nallaganda"]],
  ["Masjid Banda", "locality", "Kondapur", 17.4593, 78.3560, ["masjid banda"]],
  ["Serilingampally", "locality", "Kondapur", 17.4930, 78.3170, ["seri", "serilingampalli"]],
  // Off-corridor but common in feeds — corridor "Other" so rows aren't lost
  ["Tolichowki", "locality", "Other", 17.4010, 78.4100, ["toli chowki"]],
  ["Miyapur", "locality", "Other", 17.4970, 78.3720, []],
  ["Kukatpally", "locality", "Other", 17.4849, 78.4138, ["kphb"]],
  // Landmarks
  ["Microsoft", "landmark", "Gachibowli", 17.4435, 78.3540, ["microsoft idc"]],
  ["Amazon", "landmark", "Gachibowli", 17.4180, 78.3370, []],
  ["Google", "landmark", "Gachibowli", 17.4230, 78.3470, []],
  ["Wipro", "landmark", "Gachibowli", 17.4300, 78.3450, ["wipro circle"]],
  ["Infosys", "landmark", "Gachibowli", 17.4390, 78.3360, []],
  ["Deloitte", "landmark", "Gachibowli", 17.4196, 78.3357, ["deloitte usi"]],
  ["IIIT Hyderabad", "landmark", "Gachibowli", 17.4454, 78.3494, ["iiit-h", "iiit"]],
  ["ISB", "landmark", "Gachibowli", 17.4350, 78.3380, ["isb hyderabad", "isb road"]],
  ["DLF", "landmark", "Gachibowli", 17.4435, 78.3772, ["dlf cyber city"]],
  ["Hill Ridge Springs", "landmark", "Gachibowli", 17.4330, 78.3430, []],
  ["Mindspace", "landmark", "Madhapur", 17.4350, 78.3830, ["mind space"]],
  ["Salesforce", "landmark", "Madhapur", 17.4320, 78.3820, []],
  ["Inorbit Mall", "landmark", "Madhapur", 17.4346, 78.3870, ["inorbit"]],
  ["Cyber Towers", "landmark", "Madhapur", 17.4504, 78.3812, []],
  ["Durgam Cheruvu", "landmark", "Madhapur", 17.4300, 78.3930, ["durgam cheruvu lake"]],
  ["Botanical Garden", "landmark", "Madhapur", 17.4180, 78.3760, ["botanical"]],
  ["Forum Sujana Mall", "landmark", "Kondapur", 17.4570, 78.3240, ["forum mall", "sujana mall"]],
  ["Aparna Zenon", "landmark", "Kondapur", 17.4600, 78.3050, []],
  ["RTO Office Kondapur", "landmark", "Kondapur", 17.4620, 78.3570, ["rto office"]]
];

// ---- Field patterns ----
const BHK_PATTERNS = [
  [/\b4\s*\+?\s*bhk\b/i, "4+"],
  [/\b3\s*bhk\b/i, "3"],
  [/\b2\s*bhk\b/i, "2"],
  [/\b1\s*bhk\b/i, "1"],
  [/\bstudio\b/i, "studio"],
  [/\b1\s*rk\b/i, "rk"],
  [/\bsingle\s+room|\broom\s+(?:for|available)\b/i, "room"]
];

// Order matters: "semi furnished" and "unfurnished" must win over plain "furnished"
const FURNISHING_PATTERNS = [
  [/\bsemi[\s-]*furnish/i, "semi"],
  [/\bunfurnish|bare\s+shell/i, "none"],
  [/\bfully?[\s-]*furnish|\bfurnished\b/i, "full"]
];

const LISTING_TYPE_PATTERNS = [
  [/\bflatmate|room\s*mate|sharing\s+(?:room|flat)|share\s+(?:room|flat)|double\s+occupancy\b/i, "flatmate"],
  [/\bpg\b|\bpaying\s+guest\b/i, "pg"],
  [/\bhandover|lease\s+transfer\b/i, "handover"],
  [/\bsingle\s+room|\broom\s+for\s+rent\b/i, "room"],
  [/\bbhk\b|\bindependent|entire\s+flat|whole\s+flat|full\s+flat\b/i, "whole"]
];

const TENANT_PREF_PATTERNS = [
  [/\bfamily\s+only|only\s+famil|no\s+bachelors?|for\s+famil/i, "family"],
  [/\bgirls?\s+only|only\s+girls?|ladies\s+only|females?\s+only|for\s+(?:girls?|ladies)|female\s+flatmate|hey\s+girls|hi\s+girls/i, "girls"],
  [/\bboys?\s+only|only\s+boys?|males?\s+only|for\s+boys?|male\s+flatmate/i, "boys"],
  [/\bbachelors?\s+(?:only|allowed|welcome)|only\s+bachelors?|for\s+bachelors?\b/i, "bachelors"],
  [/\bveg(?:etarian)?s?\s+only\b/i, "veg"]
];

const BROKER_KEYWORDS = [/\bbroker(?:age)?\b/i, /\bagent\b/i, /\breal\s+estate\b/i, /\bcommission\b/i, /\brentals\b/i];
const OWNER_KEYWORDS = [/\bno\s+broker/i, /\bdirect\s+owner/i, /\bowner\s+post/i, /\bbrokers?\s+excuse/i];

const AMENITY_KEYWORDS = [
  ["gym", /\bgym\b/i],
  ["swimming_pool", /\bswimming\s+pool|\bpool\b/i],
  ["parking", /\bparking\b/i],
  ["lift", /\blift\b|\belevator\b/i],
  ["ac", /\ba\.?c\.?\b|air\s+condition/i],
  ["wifi", /\bwi-?fi\b|\binternet\b/i],
  ["washing_machine", /\bwashing\s+machine\b/i],
  ["fridge", /\bfridge\b|\brefrigerator\b/i],
  ["geyser", /\bgeyser\b/i],
  ["power_backup", /\bpower\s*backup|\bgenerator\b/i],
  ["security", /\bsecurity\b|\bcctv\b|24x7|24\/7/i],
  ["balcony", /\bbalcon(?:y|ies)\b/i],
  ["modular_kitchen", /\bmodular\s+kitchen\b/i],
  ["gated_community", /\bgated\s+(?:community|society)\b/i],
  ["attached_washroom", /\battached\s+(?:washroom|bathroom|toilet)\b/i],
  ["wardrobe", /\bwardrobe\b/i],
  ["bed_included", /\bbed\b.{0,30}\bincluded|\bmattress/i],
  ["clubhouse", /\bclub\s*house\b/i],
  ["play_area", /\bplay\s+area\b/i],
  ["maid", /\bmaid\b/i]
];

// Extras: info worth keeping that has no schema column yet (schema-evolution feed)
const EXTRA_SIGNALS = [
  ["pets", /\bpets?\s+(?:allowed|friendly|ok)|\bno\s+pets\b/i],
  ["non_veg", /\bnon[\s-]?veg\b/i],
  ["curfew", /\bcurfew\b|\bno\s+late\s+night/i],
  ["visitors", /\bvisitors?\s+(?:allowed|not|policy)|\bno\s+visitors\b/i],
  ["short_term_ok", /\bshort[\s-]?term|\btemporary\s+stay/i],
  ["working_professionals", /\bworking\s+professionals?\b/i],
  ["students_ok", /\bstudents?\b/i],
  ["couple", /\bcouples?\s+(?:allowed|friendly|only)\b/i],
  ["wfh", /\bwork\s+from\s+home|\bwfh\b/i],
  ["society_name", /\b(?:at|in)\s+((?:[A-Z][a-z]+\s+){1,3}(?:Springs|Towers?|Heights|Residency|Enclave|Apartments?|Zenon|County|Meadows|Greens|Estates?))\b/]
];

// ---- post_type: finder vs lister (first-class classification) ----
// KEY INSIGHT: "looking for a flatmate/tenant" = LISTER (offering space, seeking person).
//              "looking for a flat/room/PG"    = FINDER (seeking space).
const SEEKING_PERSON = /\b(?:looking\s+for|need(?:ed)?|require[ds]?|searching\s+for|want(?:ed)?)\b[^.\n]{0,40}\b(?:flat\s*mates?|room\s*mates?|female\s+flatmate|male\s+flatmate|tenants?|occupants?|a\s+(?:girl|boy|female|male)\s+to\s+(?:share|occupy))/i;
const SEEKING_PLACE = /(?<!anyone\s)(?<!someone\s)(?<!know\s)\b(?:looking\s+for|need(?:ed)?|require[ds]?|searching\s+for|want(?:ed)?)\b[^.\n]{0,40}\b(?:\d\s*bhk|flats?|rooms?|pg\b|accommodation|house|place\s+to\s+stay|apartment)/i;
const OFFERING = /\b(?:available\s+for\s+rent|for\s+rent\b|to[\s-]?let|rent(?:al)?\s+available|flat\s+available|room\s+available|available\s+from|is\s+available|coming\s+up\s+for\s+rent|ready\s+to\s+move|immediately\s+available)/i;

function classifyPostType(text) {
  const seeksPerson = SEEKING_PERSON.test(text);
  const seeksPlace = SEEKING_PLACE.test(text);
  const offers = OFFERING.test(text) || /₹|\brent\s*[-:]/i.test(text) && /\bdm\b|\bcontact\b|\bcall\b/i.test(text);

  if (seeksPerson) {
    // Seeking a flatmate = offering a room. Strongest signal.
    return { type: "lister", confidence: "high", reason: "seeks flatmate/tenant (offering space)" };
  }
  if (seeksPlace && !offers) {
    return { type: "finder", confidence: "high", reason: "seeks flat/room, no offering signals" };
  }
  if (seeksPlace && offers) {
    return { type: "mixed", confidence: "medium", reason: "both seeking-place and offering signals present" };
  }
  if (offers) {
    return { type: "lister", confidence: "high", reason: "offering signals (for rent / available)" };
  }
  // Weak fallback: rent + phone + property details usually = lister
  if (/₹|\brent\b/i.test(text) && /[6-9]\d{9}/.test(text.replace(/[\s-]/g, ""))) {
    return { type: "lister", confidence: "low", reason: "has rent + phone, no explicit verbs" };
  }
  return { type: "unknown", confidence: "low", reason: "no classification signals matched" };
}

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
  // "rent 13000/ month (per person)", "₹85,000 per month", "rent 12k", "Rent: ₹9,000/month"
  const perPerson = /per\s+person|each\s+person|\bpp\b/i.test(text);
  const kMatch = text.match(/\b(?:rent|rs|₹|price)\b[^\d]{0,12}(\d{1,2}(?:\.\d)?)\s*k\b/i);
  if (kMatch) {
    const rent = Math.round(parseFloat(kMatch[1]) * 1000);
    if (sane(rent)) return { rent, raw: kMatch[0].trim(), perPerson };
  }
  // Try every keyword-anchored match until one passes sanity ("rentals 93986..."
  // must not poison "rent 15000" later in the post). (?!\d) blocks phone prefixes.
  const patterns = [
    /(?:\brent\b|\brs\.?\b|₹|\binr\b|\bprice\b)\s*[-:]?[^\d]{0,10}(\d{1,3}(?:,\d{2,3})+|\d{4,6})(?!\d)/gi,
    /(\d{1,3}(?:,\d{2,3})+|\d{4,6})(?!\d)\s*(?:\/-|\/\s*month|per\s+month|pm\b|rs\b)/gi
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const rent = parseInt(m[1].replace(/,/g, ""), 10);
      if (sane(rent)) return { rent, raw: m[0].trim(), perPerson };
    }
  }
  return null;
}

function sane(rent) {
  return rent >= 2000 && rent <= 500000;
}

function rentIsAsk(text) {
  return /\b(?:negotiable|dm\s+for\s+(?:price|rent)|price\s+on\s+request|contact\s+for\s+(?:price|rent))\b/i.test(text);
}

function extractDeposit(text) {
  // numeric: "Deposit: ₹9,000" — or months: "Security Deposit - 2 months rent"
  let m = text.match(/deposit[^\d\n]{0,15}(\d{1,3}(?:,\d{2,3})+|\d{4,6})/i);
  if (m) return { value: parseInt(m[1].replace(/,/g, ""), 10), raw: m[0].trim() };
  m = text.match(/deposit[^\n]{0,15}?(\d+(?:\.\d)?)\s*month/i);
  if (m) return { value: "", raw: `${m[1]} months rent` };
  return null;
}

function extractMaintenance(text) {
  const m = text.match(/maintenance[^\d\n]{0,12}(\d{1,3}(?:,\d{2,3})+|\d{3,5})/i);
  if (m) return { value: parseInt(m[1].replace(/,/g, ""), 10), raw: m[0].trim() };
  if (/\+\s*maintenance|maintenance\s+extra|excluding\s+maintenance/i.test(text)) {
    return { value: "", raw: "extra (amount not stated)" };
  }
  if (/maintenance\s+included|including\s+maintenance/i.test(text)) {
    return { value: 0, raw: "included" };
  }
  return null;
}

function extractAvailableFrom(text) {
  const m = text.match(/(?:available|availability|move[\s-]?in)\s*(?:from|:|-)?\s*((?:\d{1,2}(?:st|nd|rd|th)?\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?:\s+\d{4})?|\d{1,2}(?:st|nd|rd|th)?\s+\w+\s*\d{0,4}|immediate(?:ly)?|now)/i);
  return m ? m[1].trim() : "";
}

function extractAmenities(text) {
  return AMENITY_KEYWORDS.filter(([, re]) => re.test(text)).map(([name]) => name).join("|");
}

function extractExtras(text, rentInfo) {
  const extras = [];
  for (const [name, re] of EXTRA_SIGNALS) {
    const m = text.match(re);
    if (m) extras.push(name === "society_name" && m[1] ? `society:${m[1]}` : name);
  }
  if (rentInfo && rentInfo.perPerson) extras.push("rent_per_person");
  if (/\bdm\b/i.test(text) && !extractPhone(text)) extras.push("contact_via_dm_only");
  if (/no\s+setup\s+cost|no\s+brokerage|zero\s+brokerage/i.test(text)) extras.push("no_fees_claimed");
  return extras.join("|");
}

function extractLocality(text) {
  const lower = text.toLowerCase();
  let best = null;
  let bestPos = Infinity;
  let bestIsLocality = false;
  for (const [name, kind, corridor, lat, lng, aliases] of GAZETTEER) {
    for (const candidate of [name.toLowerCase(), ...aliases]) {
      const pos = lower.indexOf(candidate);
      if (pos === -1) continue;
      const isLocality = kind === "locality";
      // Localities beat landmarks; earlier mention beats later within same kind
      if ((isLocality && !bestIsLocality) || (isLocality === bestIsLocality && pos < bestPos)) {
        best = { name, kind, corridor, lat, lng };
        bestPos = pos;
        bestIsLocality = isLocality;
      }
    }
  }
  return best;
}

function extractPosterKind(text) {
  const owner = OWNER_KEYWORDS.some((re) => re.test(text));
  const broker = BROKER_KEYWORDS.some((re) => re.test(text));
  if (owner) return "owner"; // "no brokers" mentions the word broker — owner wins
  if (broker) return "broker";
  return "unknown";
}

function textHash(text) {
  let hash = 0;
  const s = text.replace(/\s+/g, " ").slice(0, 400);
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return hash.toString(36);
}

function ageDays(iso, now = Date.now()) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (isNaN(t)) return "";
  return Math.max(0, Math.round((now - t) / 86400e3 * 10) / 10);
}

// One captured post → one row
function postToListing(post, capture) {
  const text = post.text;
  const rentInfo = extractRent(text);
  const loc = extractLocality(text);
  const deposit = extractDeposit(text);
  const maintenance = extractMaintenance(text);
  const cls = classifyPostType(text);
  // Freshness from the POST date when we have it; scrape date is the fallback.
  const createdAt = post.postCreatedAt || "";
  const age = ageDays(createdAt);
  const freshness = age === "" ? "fresh" : age <= 2 ? "fresh" : age <= 7 ? "mid" : "stale";

  const notes = [];
  if (cls.type === "finder") notes.push("FINDER post — not inventory");
  if (cls.type === "mixed" || cls.type === "unknown") notes.push(`REVIEW post_type: ${cls.reason}`);
  if (!rentInfo && rentIsAsk(text)) notes.push("rent: ask/negotiable");
  if (!createdAt) notes.push("post date not captured — freshness from scrape time");

  return {
    // ---- importer columns (order matches import_inventory.py COLS) ----
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
    deposit: deposit ? deposit.value : "",
    maintenance: maintenance ? maintenance.value : "",
    locality_name: loc ? loc.name : "",
    bhk: matchFirst(text, BHK_PATTERNS),
    listing_type: matchFirst(text, LISTING_TYPE_PATTERNS),
    furnishing: matchFirst(text, FURNISHING_PATTERNS),
    tenant_pref: matchFirst(text, TENANT_PREF_PATTERNS),
    amenities: extractAmenities(text),
    available_from: extractAvailableFrom(text),
    poster_kind: extractPosterKind(text),
    lat: loc ? loc.lat : "",
    lng: loc ? loc.lng : "",
    geo_precision: loc ? (loc.kind === "landmark" ? "landmark" : "locality_centroid") : "",
    corridor: loc ? loc.corridor : "",
    all_in_rent: rentInfo && maintenance && maintenance.value ? rentInfo.rent + maintenance.value : (rentInfo ? rentInfo.rent : ""),
    freshness_state: freshness,
    dedup_group_id: "",
    archived: "false",
    validation_status: "unvalidated",
    reject_reason: "",
    validated_at: "",
    contact_tap_count: "0",
    notes: notes.join("; "),
    // ---- v3 columns (appended; importer-safe) ----
    post_type: cls.type,
    post_type_confidence: cls.confidence,
    post_type_reason: cls.reason,
    post_created_at: createdAt,
    post_age_days: age,
    author: post.author || "",
    deposit_raw: deposit ? deposit.raw : "",
    maintenance_raw: maintenance ? maintenance.raw : "",
    extras: extractExtras(text, rentInfo),
    duplicate_confidence: "",
    broker_probability: "",
    canonical_listing_id: "",
    _hash: textHash(text)
  };
}

// ---- Dedup + broker scoring across the whole export ----
//
// Scenario A (two people post same flat):  phone+rent+locality match → same group.
// Scenario B (same person reposts):        author+rent+locality or exact text → same group.
// Scenario C (one person, many flats):     author matches but rent/locality differ → NOT merged.
// Scenario D (broker volume):              same phone/author across ≥2 distinct groups → broker score.
function extractListings(records) {
  const seen = new Map(); // exact-text hash → listing
  for (const capture of records) {
    const posts = (capture.posts && capture.posts.length)
      ? capture.posts
      : [{ text: capture.visibleText || "", images: (capture.imageUrls || []).map((i) => i.src), permalink: "", postCreatedAt: "", author: "" }];

    for (const post of posts) {
      if (!post.text || post.text.trim().length < 40) continue;
      const listing = postToListing(post, capture);
      if (seen.has(listing._hash)) continue; // exact repeat while scrolling
      seen.set(listing._hash, listing);
    }
  }

  const listings = [...seen.values()];

  // Near-duplicate grouping
  for (let i = 0; i < listings.length; i++) {
    const a = listings[i];
    for (let j = i + 1; j < listings.length; j++) {
      const b = listings[j];
      let confidence = "";
      const rentsCompatible = a.rent === b.rent || a.rent === "" || b.rent === "";
      const samePlace = a.locality_name && a.locality_name === b.locality_name;
      if (a.phone && a.phone === b.phone && samePlace && a.bhk === b.bhk && rentsCompatible) {
        // Scenario A/B via phone; high only when both rents stated and equal
        confidence = a.rent !== "" && a.rent === b.rent ? "high" : "medium";
      } else if (a.author && a.author === b.author && samePlace && a.rent !== "" && a.rent === b.rent) {
        confidence = "medium"; // Scenario B via author (no phone in post)
      }
      if (!confidence) continue;

      const groupId = a.dedup_group_id || b.dedup_group_id || crypto.randomUUID();
      a.dedup_group_id = groupId;
      b.dedup_group_id = groupId;
      b.duplicate_confidence = confidence;
      if (!a.canonical_listing_id) a.canonical_listing_id = a.id; // first seen = canonical
      b.canonical_listing_id = a.canonical_listing_id;
      b.notes = [b.notes, `REVIEW: duplicate of ${a.canonical_listing_id.slice(0, 8)} (${confidence})`].filter(Boolean).join("; ");
    }
  }

  // Broker probability: distinct listings (groups) per phone/author
  const byContact = new Map();
  for (const l of listings) {
    for (const key of [l.phone && `p:${l.phone}`, l.author && `a:${l.author}`]) {
      if (!key) continue;
      const groupKey = l.canonical_listing_id || l.id;
      if (!byContact.has(key)) byContact.set(key, new Set());
      byContact.get(key).add(groupKey);
    }
  }
  for (const l of listings) {
    const counts = [
      l.phone ? (byContact.get(`p:${l.phone}`)?.size || 0) : 0,
      l.author ? (byContact.get(`a:${l.author}`)?.size || 0) : 0
    ];
    const distinct = Math.max(...counts);
    let prob = 0;
    if (l.poster_kind === "broker") prob = 0.8;
    if (distinct >= 3) prob = Math.max(prob, 0.9);       // Scenario D
    else if (distinct === 2) prob = Math.max(prob, 0.6); // Scenario C/D boundary
    if (l.poster_kind === "owner") prob = Math.min(prob, 0.3);
    l.broker_probability = prob ? prob.toFixed(1) : "0";
  }

  return listings.map(({ _hash, ...row }) => row);
}
