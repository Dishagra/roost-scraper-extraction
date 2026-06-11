# User Manual — Roost Collector

Scroll FB → CSV in Downloads → review in Excel. That's the whole pipeline.

---

## Setup (one-time)

```
Chrome → chrome://extensions → Developer mode ON
Load unpacked → /Users/Dishagra/Documents/roost-scraper-extraction/scrapper-main/
```

Already loaded it before? Click the reload icon (circular arrow) on the extension card to pick up this version.

---

## Daily use

1. Open a FB rental group
2. Extension popup → **Start**
3. Scroll the feed at your normal pace. Watch "Posts captured" tick up in the popup.
4. Done? Popup → **Pause & Export CSV**
5. `roost_listings_<date>.csv` is in Downloads. Double-click → Excel.

Repeat per group. Each export contains everything captured since the last **Clear All** — so you can do 5 groups, then export once.

---

## Reviewing in Excel

Each row = one FB post, already parsed:

| Column | What to check |
|--------|---------------|
| phone | 10 digits, starts 6–9. Blank = post had no number. |
| rent | Number, or blank with rent_raw="ask". Sanity-check (₹2,500 Gachibowli 2BHK = parse error). |
| locality_name / corridor | Auto-matched. Blank = locality not in gazetteer. |
| bhk, furnishing, tenant_pref, poster_kind | Spot-check vs raw_text. |
| notes | **Read this first.** Flags "looking for" posts and suspected reposts. |
| validation_status | Set `validated` for good rows, `rejected` + reject_reason for bad. |

Keep the file — it's your inventory DB. When Supabase is up, the same file imports directly:

```bash
python /Users/Dishagra/Documents/Roost/v1/backend/importer/import_inventory.py roost_listings_<date>.csv
```

---

## Buttons

| Button | Does |
|--------|------|
| Start | Begin capturing on the current tab (and any FB page you open after) |
| Pause & Export CSV | Stop capturing + download the CSV in one click |
| Export CSV Now | Download CSV without stopping |
| Export JSON (backup) | Raw capture data, for debugging |
| Clear All | Wipe captured posts (do this after a successful export + review) |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Posts captured stays 0 | Reload extension at chrome://extensions, refresh the FB tab, Start again, scroll a bit. |
| CSV has weird ₹ symbols | Open via Excel File→Open (file has BOM, should be fine); avoid TextEdit. |
| Locality blank | Area not in gazetteer. Add to gazetteer.csv AND the GAZETTEER list in scrapper-main/extraction.js. |
| "looking for" rows | Renter posts, not listings. notes column flags them — reject. |
| Repost rows | notes says "possible repost"; both rows share dedup_group_id. Keep one. |

---

## Safety

- Captures only what renders on your screen while **you** scroll
- No auto-scroll, no clicking, no requests sent to FB
- Indistinguishable from normal browsing — keep scroll pace human and session lengths reasonable (10–15 min per group)

## Target

≥150 validated listings across Gachibowli / Madhapur / Kondapur ≈ 50 posts/day for ~2 weeks.
