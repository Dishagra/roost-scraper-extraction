# Roost Collector

Chrome extension that collects FB rental posts while you scroll and exports a review-ready CSV for Excel. No terminal, no Python.

**Full guide:** [USER_MANUAL.md](USER_MANUAL.md)

## How it works

1. **Start** in the extension popup
2. Scroll a FB group feed normally — each post is captured + parsed as you go (phone, rent, BHK, furnishing, locality, owner/broker)
3. **Pause & Export CSV** — `roost_listings_<date>.csv` lands in Downloads
4. Double-click → opens in Excel → review rows → this sheet is your inventory DB

Safe by design: passive reading of what's already on your screen. No auto-scroll, no bot clicks, no requests to FB. You browse, it takes notes.

## Files

- **scrapper-main/** — the extension (load unpacked via `chrome://extensions`)
  - `content.js` — splits the feed into individual posts as you scroll
  - `extraction.js` — parses listing fields + dedups reposts
  - `background.js` — stores posts, builds the CSV
  - `popup.html/js` — Start / Pause & Export buttons
- **gazetteer.csv** — locality reference (Gachibowli, Madhapur, Kondapur corridors).
  Mirrored inside `extraction.js` — if you edit one, update the other.

## CSV output

34 columns matching the Roost importer schema exactly (`v1/backend/importer/import_inventory.py`), so the same file you review in Excel imports straight into Supabase later. Key columns: phone, rent, locality_name, bhk, furnishing, tenant_pref, poster_kind, lat/lng, geo_precision, validation_status, notes (flags "looking for" posts and suspected reposts for review).
