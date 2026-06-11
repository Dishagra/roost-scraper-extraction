# Roost Scraper Tools

Chrome extension + CLI extraction tool for FB rental listings → Supabase.

**Full setup & workflow:** [USER_MANUAL.md](USER_MANUAL.md)

## Quick Start

### 1. Load Extension
```bash
# Chrome → chrome://extensions → Developer mode
# Load unpacked → /Users/Dishagra/Documents/roost-scraper-extraction/scrapper-main/
```

### 2. Capture & Extract
```bash
# Manual: open FB group, click "Start", scroll, click "Pause"
# Export JSON from extension popup

# Extract to CSV + open Excel
python extract.py ~/Downloads/session_*.json --open
```

### 3. Validate (Optional)
Review CSV in Excel, set `validation_status=rejected` for bad rows.

### 4. Import
```bash
python /Users/Dishagra/Documents/Roost/v1/backend/importer/import_inventory.py extracted.csv
```

---

## What's Inside

- **scrapper-main/** — Chrome extension (manual FB capture, human-safe)
- **extract.py** — FB JSON → CSV extraction (phone, rent, BHK, locality, etc.)
- **patterns.py** — Regex patterns (phone, rent, furnishing, listing type, etc.)
- **gazetteer.csv** — Locality reference (Gachibowli, Madhapur, Kondapur)
- **USER_MANUAL.md** — Complete documentation + troubleshooting

---

## Extract Command

```bash
# Open in Excel after extraction
python extract.py captures.json --open

# Save to custom path
python extract.py captures.json --output my_listings.csv --open
```

Input: JSON from extension (contains captures array with URL, text, images).
Output: CSV with Tier 1/2 fields (phone, rent, locality, BHK, furnishing, etc.) + confidence flags + gazetteer-matched coords.
