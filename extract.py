#!/usr/bin/env python3
"""Extract structured listings from FB post captures."""

import json
import csv
import sys
import argparse
import uuid
import subprocess
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any

import patterns


class Gazetteer:
    """Load locality → corridor + lat/lng mapping."""

    def __init__(self, csv_path: str):
        self.localities = {}  # name → {corridor, lat, lng, landmarks}
        self.load(csv_path)

    def load(self, csv_path: str):
        with open(csv_path) as f:
            reader = csv.DictReader(f)
            for row in reader:
                if not row.get('lat') or not row.get('lng'):
                    continue  # Skip incomplete entries
                name = row['name'].lower()
                try:
                    self.localities[name] = {
                        'corridor': row['corridor'],
                        'lat': float(row['lat']),
                        'lng': float(row['lng']),
                        'landmarks': row.get('landmarks', '').split('|') if row.get('landmarks') else [],
                    }
                except (ValueError, KeyError):
                    pass  # Skip malformed rows

    def lookup(self, locality_name: Optional[str]) -> Optional[Dict[str, Any]]:
        """Match locality name (fuzzy). Return {corridor, lat, lng} or None."""
        if not locality_name:
            return None

        key = locality_name.lower().strip()

        # Exact match
        if key in self.localities:
            return self.localities[key]

        # Substring match (first match wins)
        for local_key, data in self.localities.items():
            if key in local_key or local_key in key:
                return data

        return None


def extract_listing(capture: Dict[str, Any], gazetteer: Gazetteer) -> Optional[Dict[str, Any]]:
    """Convert raw capture → structured listing (Tier 1/2 fields)."""

    raw_text = capture.get('visibleText') or capture.get('bodyInnerText') or ''
    url = capture.get('url', '')
    title = capture.get('title', '')
    captured_at = capture.get('capturedAt', datetime.now().isoformat())
    image_urls = capture.get('imageUrls', [])

    # Tier 1: always present
    listing = {
        'id': str(uuid.uuid4()),
        'source': 'fb_group',
        'source_ref': url,
        'scraped_at': captured_at,
        'photos': [img.get('src', '') for img in image_urls if img.get('src')],
        'raw_text': raw_text,
        'capture_method': 'manual',  # extension = manual capture
        'capture_source_url': url,
    }

    # Tier 2: parsed with confidence=parsed
    listing['phone'] = patterns.extract_phone(raw_text)
    listing['phone_confidence'] = 'parsed' if listing['phone'] else None

    listing['rent'] = patterns.extract_rent(raw_text)
    listing['rent_confidence'] = 'parsed' if listing['rent'] else None
    listing['rent_raw'] = None  # Could extract original text if needed

    locality_match = patterns.extract_field(raw_text, [
        (r'\b(gachibowli|nanakramguda|kokapet|financial\s+district)\b', lambda x: x),
        (r'\b(madhapur|hitec\s+city)\b', lambda x: x),
        (r'\b(kondapur|nallagandla)\b', lambda x: x),
    ])

    # Better: just extract any mentioned locality from raw text and lookup
    locality_name = None
    for potential in ['gachibowli', 'nanakramguda', 'kokapet', 'financial district',
                      'madhapur', 'hitec city', 'kondapur', 'nallagandla']:
        if potential.lower() in raw_text.lower():
            locality_name = potential
            break

    gazetteer_data = gazetteer.lookup(locality_name) if locality_name else None
    listing['locality_name'] = locality_name
    listing['locality_confidence'] = 'parsed' if locality_name else None

    listing['bhk'] = patterns.extract_bhk(raw_text)
    listing['bhk_confidence'] = 'parsed' if listing['bhk'] else None

    listing['listing_type'] = patterns.extract_listing_type(raw_text)
    listing['listing_type_confidence'] = 'parsed' if listing['listing_type'] else None

    listing['furnishing'] = patterns.extract_furnishing(raw_text)
    listing['furnishing_confidence'] = 'parsed' if listing['furnishing'] else None

    listing['tenant_pref'] = patterns.extract_tenant_pref(raw_text)
    listing['tenant_pref_confidence'] = 'parsed' if listing['tenant_pref'] else None

    listing['poster_kind'] = patterns.extract_poster_kind(raw_text, listing['phone'])
    listing['poster_kind_confidence'] = 'parsed'  # always determined

    # Tier 3: sometimes present (placeholder, needs more pattern work)
    listing['deposit'] = None
    listing['deposit_confidence'] = None
    listing['maintenance'] = None
    listing['maintenance_confidence'] = None
    listing['available_from'] = None
    listing['available_from_confidence'] = None

    # Tier 4: derived
    if gazetteer_data:
        listing['lat'] = gazetteer_data['lat']
        listing['lng'] = gazetteer_data['lng']
        listing['geo_precision'] = 'locality_centroid'
        listing['corridor'] = gazetteer_data['corridor']
    else:
        listing['lat'] = None
        listing['lng'] = None
        listing['geo_precision'] = None
        listing['corridor'] = None

    # State
    listing['validation_status'] = 'unvalidated'
    listing['validated_at'] = None
    listing['archived'] = False
    listing['contact_tap_count'] = 0

    return listing


def main():
    parser = argparse.ArgumentParser(
        description='Extract structured listings from FB capture data.'
    )
    parser.add_argument('input', help='JSON export from extension (metadata.json or captures.json)')
    parser.add_argument('--output', default='inventory_extracted.csv', help='Output CSV path')
    parser.add_argument('--gazetteer', default='gazetteer.csv', help='Locality gazetteer CSV')
    parser.add_argument('--dry-run', action='store_true', help='Parse only, no output')
    parser.add_argument('--open', action='store_true', help='Open CSV in Excel after extraction')

    args = parser.parse_args()

    # Load gazetteer
    if not Path(args.gazetteer).exists():
        print(f"Error: gazetteer not found at {args.gazetteer}", file=sys.stderr)
        print("Copy gazetteer.csv from Roost root to this directory.", file=sys.stderr)
        sys.exit(1)

    gazetteer = Gazetteer(args.gazetteer)

    # Load captures
    with open(args.input) as f:
        data = json.load(f)

    # Handle both direct captures array and metadata.json format
    captures = data.get('records', []) if isinstance(data, dict) and 'records' in data else data
    if isinstance(captures, dict):
        captures = list(captures.values()) if 'records' not in captures else captures['records']

    print(f"Processing {len(captures)} captures...", file=sys.stderr)

    listings = []
    for i, capture in enumerate(captures):
        listing = extract_listing(capture, gazetteer)
        if listing:
            listings.append(listing)
        if (i + 1) % 10 == 0:
            print(f"  {i + 1}/{len(captures)}", file=sys.stderr)

    print(f"Extracted {len(listings)} listings", file=sys.stderr)

    if args.dry_run:
        print(json.dumps(listings[:1], indent=2))  # Preview first
        return

    # Write CSV
    if not listings:
        print("No listings extracted.", file=sys.stderr)
        return

    with open(args.output, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=listings[0].keys())
        writer.writeheader()
        writer.writerows(listings)

    print(f"Wrote {len(listings)} to {args.output}", file=sys.stderr)

    # Open in Excel if requested
    if args.open:
        try:
            subprocess.Popen(['open', '-a', 'Microsoft Excel', args.output])
            print(f"Opening {args.output} in Excel...", file=sys.stderr)
        except FileNotFoundError:
            print(f"Excel not found, but file saved to {args.output}", file=sys.stderr)


if __name__ == '__main__':
    main()
