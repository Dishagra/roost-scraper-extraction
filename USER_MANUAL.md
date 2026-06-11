# Roost Scraper — Complete Workflow

Manual browser extension + automated extraction → Excel CSV → Supabase import.

---

## Setup (One-Time)

### 1. Load Chrome Extension

1. Chrome → `chrome://extensions`
2. Toggle "Developer mode" (top right)
3. "Load unpacked" → select `/Users/Dishagra/Documents/roost-scraper-extraction/scrapper-main/`
4. Confirm: extension appears

### 2. Wrapper Script (Optional)

For single-command import (capture → extract → validate → import):

```bash
# Create: ~/roost-scrape
#!/bin/bash
EXTRACTION="/Users/Dishagra/Documents/roost-scraper-extraction"
IMPORTER="/Users/Dishagra/Documents/Roost/v1/backend/importer"

python "$EXTRACTION/extract.py" "$1" --open

# Auto-validate: phone + rent present → validated=true
python - extracted.csv validated.csv << 'PYTHON'
import sys, csv
extracted, validated = sys.argv[1], sys.argv[2]
with open(extracted) as f, open(validated, 'w', newline='') as out:
    reader, writer = csv.DictReader(f), None
    for row in reader:
        if not writer:
            writer = csv.DictWriter(out, fieldnames=row.keys())
            writer.writeheader()
        has_phone = row.get('phone') and row['phone'].strip()
        has_rent = row.get('rent') and row['rent'].strip() != ''
        if has_phone and has_rent:
            row['validation_status'] = 'validated'
            row['validated_at'] = '2026-06-12'
        writer.writerow(row)
PYTHON

python "$IMPORTER/import_inventory.py" validated.csv
PYTHON

chmod +x ~/roost-scrape
```

---

## Daily Workflow

### 1. Capture (10 min)

1. Open FB group
2. Extension popup: "Start"
3. Scroll through 30+ posts (extension auto-captures each page)
4. Click "Pause"
5. Click "Export JSON"
6. Browser downloads: `session_XXXX.json`

### 2. Extract (1 min)

```bash
python /Users/Dishagra/Documents/roost-scraper-extraction/extract.py \
  ~/Downloads/session_*.json --open
```

CSV opens in Excel automatically. Columns:
- Phone, rent, BHK, furnishing, locality (all parsed with confidence flags)
- Lat/lng from gazetteer match
- validation_status (unvalidated for manual review)

### 3. Validate (5 min, optional)

Review rows in Excel:
- Phone: 10-digit, starts with 6-9?
- Rent: numeric or null/"ask"?
- Locality: recognized?
- Set `validation_status=rejected` + `reject_reason` for bad rows

### 4. Import

```bash
python /Users/Dishagra/Documents/Roost/v1/backend/importer/import_inventory.py \
  inventory_extracted.csv
```

---

## Component Details

### Extension (`scrapper-main/`)

**What it does:**
- Listens for page loads while "Start" is active
- Captures: URL, visible text, images, screenshot
- Stores in browser memory (no cloud upload)
- Exports as JSON with metadata

**Why manual?**
- Human profile = FB safe (no bot detection)
- You control pace + groups

**Limitations:**
- Only captures one browser tab
- Requires active scrolling
- No auto-scroll yet (V2 feature)

### Extraction (`extract.py`)

**Input:** JSON from extension

**Output:** CSV with:
- **Tier 1 (always):** id, source, source_ref, scraped_at, photos, raw_text, capture_method
- **Tier 2 (parsed):** phone, rent, locality_name, bhk, listing_type, furnishing, tenant_pref, poster_kind
  - All tagged: `*_confidence=parsed` (founder confirms in Excel if uncertain)
- **Tier 4 (derived):** lat, lng, geo_precision, corridor (from gazetteer)
- **State:** validation_status, archived, contact_tap_count

**Extraction logic:**
- Phone: `[6-9]\d{9}` regex → normalized 10-digit
- Rent: `₹5000/month` → 5000 (null if "ask"/"negotiate")
- BHK: keyword match (1, 2, 3, 4+, studio, room, rk)
- Furnishing: full, semi, none
- Locality: fuzzy match vs gazetteer
- Poster kind: owner/broker heuristics (phrasing signals)

**Flag `--open`:** opens result in Excel immediately

### Gazetteer (`gazetteer.csv`)

Hyderabad localities → corridor + lat/lng:
- **Gachibowli:** Gachibowli, Nanakramguda, Kokapet, Financial District
- **Madhapur:** Madhapur, HITEC City
- **Kondapur:** Kondapur, Nallagandla

Fuzzy matched: "gachibowli" = "gachbowli" = "gachbowli area" all resolve to same corridor.

---

## Targets

**Launch bar:** ≥150 validated listings across 3 corridors.

**Cadence:** 50 posts/day = 7–10 days to launch.

---

## Troubleshooting

**Extension not capturing?**
- Enabled in chrome://extensions?
- Refresh page after "Start"
- Wait 1–2 sec (auto-capture delay)

**Phone not extracting?**
- Check visible text (sometimes in comments, not main post)
- Format: `9876543210` or `+91-9876543210`

**Locality not recognized?**
- Check gazetteer (maybe add alias if common misspelling)
- Post: `geo_precision=null` if not found

**Import failing?**
- Check Supabase credentials (service role key)
- CSV column names match schema

---

## Next (V2)

- Auto-scroll in extension (less manual browsing)
- OCR on screenshots (higher extraction confidence)
- NLP: "near landmark" → geocode to locality
- Commute rank (query-time, not stored)
- First-party form (zero scrape risk)

---

Updated: June 12, 2026.
