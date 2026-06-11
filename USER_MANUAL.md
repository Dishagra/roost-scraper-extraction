# User Manual — Roost Scraper

FB capture → extraction → Excel → import.

---

## Setup (One-Time)

**Load extension:**
```
Chrome → chrome://extensions → Developer mode
Load unpacked → /Users/Dishagra/Documents/roost-scraper-extraction/scrapper-main/
```

---

## Daily Workflow

### 1. Capture (10 min)
- Open FB group
- Extension popup: "Start"
- Scroll 30+ posts
- "Pause" → "Export JSON"
- Downloads: `session_XXXX.json`

### 2. Extract (1 min)
```bash
python /Users/Dishagra/Documents/roost-scraper-extraction/extract.py \
  ~/Downloads/session_*.json --open
```
Opens CSV in Excel automatically. Columns: phone, rent, BHK, furnishing, locality, lat/lng, validation_status.

### 3. Validate (5 min, optional)
Review in Excel:
- Phone: 10-digit, starts 6-9?
- Rent: numeric or null/"ask"?
- Locality: recognized?
- Bad rows: set `validation_status=rejected`

### 4. Import
```bash
python /Users/Dishagra/Documents/Roost/v1/backend/importer/import_inventory.py \
  extracted.csv
```

---

## Components

**Extension (scrapper-main/)**
- Manual capture while browsing (human profile, FB safe)
- Stores in browser memory
- Exports JSON with URL, text, images

**Extraction (extract.py)**
- Input: JSON from extension
- Output: CSV with phone, rent, BHK, furnishing, locality, coords, confidence flags
- Phone regex: `[6-9]\d{9}`
- Rent: `₹5000/month` → 5000
- Locality: fuzzy match vs gazetteer
- `--open` flag: open Excel automatically

**Gazetteer (gazetteer.csv)**
- Localities: Gachibowli, Madhapur, Kondapur + sub-areas
- Maps to corridor + lat/lng
- Fuzzy match: "gachibowli" = "gachbowli"

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Extension not capturing | Enabled in chrome://extensions? Refresh page after "Start". Wait 1-2s. |
| Phone not extracted | Check visible text. Format: `9876543210` or `+91-9876543210` |
| Locality not recognized | Check gazetteer. Add aliases for misspellings. Sets geo_precision=null if not found. |
| Import fails | Check Supabase credentials (service role key). CSV columns match schema. |

---

## Targets

≥150 validated listings in 3 corridors. 50 posts/day = 7–10 days to launch.

## V2 (Future)

- Auto-scroll (less manual)
- OCR (higher confidence)
- NLP locality parsing
- Commute rank
- First-party form
