# Roost Scraper Extraction

Converts FB group capture data → validated inventory CSV ready for Supabase import.

## Usage

```bash
python extract.py captures.json --output inventory_extracted.csv
```

Input: JSON export from extension (metadata + captures array).
Output: CSV matching DATA_MODEL.md Tier 1/2 fields with confidence flags.

## Flow

1. Extension captures FB posts → ZIP export
2. User unzips → copies metadata.json to `captures.json`
3. `extract.py` parses each post:
   - Tier 1: always present (raw_text, photos, capture_method)
   - Tier 2: parsed with confidence=parsed (rent, phone, locality, BHK, furnishing, poster_kind)
   - Phone regex + locality gazetteer matching
4. Output CSV for founder validation
5. Founder confirms/rejects → import to DB

## Fields extracted

- **Tier 1:** id, source, source_ref, scraped_at, photos, raw_text, capture_method
- **Tier 2:** phone, rent, locality_name, bhk, listing_type, furnishing, tenant_pref, poster_kind
  - Each field has `_confidence: parsed | validated`
- **Tier 3:** deposit, maintenance, available_from
- **Derived:** geo_precision (set to locality_centroid for all parsed), corridor (from gazetteer)
- **State:** validation_status (unvalidated), archived (false)

## Configuration

- `gazetteer.csv`: locality → corridor + lat/lng mapping (from SUPPLY_OPS.md)
- Extraction patterns in `patterns.py`: regex for phone, rent, BHK, furnishing, etc.
