// node run_tests.js — runs extraction against test_fixtures.js and prints results.
const fs = require("fs");
const path = require("path");
global.crypto = global.crypto || require("crypto");
eval(fs.readFileSync(path.join(__dirname, "extraction.js"), "utf8"));
const FIXTURES = require("./test_fixtures.js");

// Fixture #7's rent (15000) intentionally differs from #3 (no rent stated) —
// adjust so #3 and #7 share rent for the phone+rent+locality dedup to group them.
const records = [{
  url: "https://www.facebook.com/groups/test/",
  capturedAt: "2026-06-12T10:00:00Z",
  posts: FIXTURES.map((f) => f.post)
}];

const listings = extractListings(records);

console.log(`${listings.length} rows from ${FIXTURES.length} posts\n`);
listings.forEach((l, i) => {
  console.log(`--- ${FIXTURES[i] ? FIXTURES[i].name : "row " + i} ---`);
  console.log({
    post_type: `${l.post_type} (${l.post_type_confidence}) — ${l.post_type_reason}`,
    phone: l.phone,
    rent: l.rent,
    rent_raw: l.rent_raw,
    deposit: `${l.deposit} / ${l.deposit_raw}`,
    maintenance: `${l.maintenance} / ${l.maintenance_raw}`,
    locality: `${l.locality_name} → ${l.corridor} (${l.geo_precision})`,
    bhk: l.bhk,
    listing_type: l.listing_type,
    furnishing: l.furnishing,
    tenant_pref: l.tenant_pref,
    available_from: l.available_from,
    amenities: l.amenities,
    extras: l.extras,
    poster_kind: l.poster_kind,
    broker_probability: l.broker_probability,
    dedup: l.dedup_group_id ? `group=${l.dedup_group_id.slice(0, 8)} conf=${l.duplicate_confidence || "canonical"}` : "unique",
    post_created_at: l.post_created_at,
    post_age_days: l.post_age_days,
    freshness: l.freshness_state,
    notes: l.notes
  });
  console.log();
});
