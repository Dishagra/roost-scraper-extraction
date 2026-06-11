"""FB listing field extraction patterns for Hyderabad rentals."""

import re
from enum import Enum

# BHK patterns: "1 BHK", "2bhk", "studio", "room", "RK" (rent kitchen)
BHK_PATTERNS = [
    (r'\b4\s*\+?\s*bhk\b', '4+'),
    (r'\b4\s*bhk\b', '4'),
    (r'\b3\s*bhk\b', '3'),
    (r'\b2\s*bhk\b', '2'),
    (r'\b1\s*bhk\b', '1'),
    (r'\bstudio\b', 'studio'),
    (r'\broom\b', 'room'),
    (r'\brk\b', 'rk'),  # rent kitchen
]

# Furnishing: "fully furnished", "semi furnished", "unfurnished"
FURNISHING_PATTERNS = [
    (r'\bfully?\s+furnish', 'full'),
    (r'\bsemi?\s+furnish', 'semi'),
    (r'\bunfurnish|bare\s+shell\b', 'none'),
]

# Listing type: "whole flat", "room", "pg", "flatmate", "handover"
LISTING_TYPE_PATTERNS = [
    (r'\bwhole\s+flat|entire\s+flat|independent\b', 'whole'),
    (r'\broom\s*to?\s*rent', 'room'),
    (r'\bpg\b', 'pg'),
    (r'\bflatmate|room\s+sharing|share\b', 'flatmate'),
    (r'\bhandover|ready\s+possession\b', 'handover'),
]

# Tenant preference: "family", "bachelors", "girls", "boys", "veg"
TENANT_PREF_PATTERNS = [
    (r'\bno\s+bachelors?|family\s+only\b', 'family'),
    (r'\bonly?\s+bachelors?|no\s+family\b', 'bachelors'),
    (r'\bgirls?\s+only\b', 'girls'),
    (r'\bboys?\s+only\b', 'boys'),
    (r'\bvegetarian\b', 'veg'),
]

# Rent: "₹5000", "5000 pm", "5000/month", "ask", "negotiable"
RENT_PATTERN = r'[₹₨]?\s*(\d+(?:,\d{3})*)\s*(?:/|per|pm|month|/-|rs|rupee)'
RENT_ASK_PATTERN = r'\b(?:ask|negotiable|dm|contact|call)\b'

# Phone: 10-digit Indian mobile (6-9 prefix for Airtel, Jio, Voda, etc.)
PHONE_PATTERN = r'(?:\+91|0)?[6-9]\d{9}'

# Poster kind heuristics
BROKER_INDICATORS = [
    r'\bbroker\b',
    r'\bproperty\s+agent\b',
    r'\breal\s+estate\b',
    r'\bbrokerage\s+applicable\b',
    r'\bcommission\b',
]

OWNER_INDICATORS = [
    r'\bno?\s+broker',
    r'\bdirect\s+owner\b',
    r'\bowner\s+only\b',
    r'\bself\s+owned\b',
]


def extract_field(text, patterns, ignore_case=True):
    """Extract first match from patterns list."""
    if not text:
        return None
    text = str(text).strip()
    flags = re.IGNORECASE if ignore_case else 0
    for pattern, value in patterns:
        if re.search(pattern, text, flags):
            return value
    return None


def extract_rent(text):
    """Extract rent amount as int, or None if 'ask'."""
    if not text:
        return None
    text = str(text).strip()

    # Check if asking price / negotiable
    if re.search(RENT_ASK_PATTERN, text, re.IGNORECASE):
        return None

    # Extract numeric rent
    match = re.search(RENT_PATTERN, text, re.IGNORECASE)
    if match:
        rent_str = match.group(1).replace(',', '')
        try:
            return int(rent_str)
        except ValueError:
            return None
    return None


def extract_phone(text):
    """Extract first valid 10-digit phone number."""
    if not text:
        return None
    text = str(text)

    match = re.search(PHONE_PATTERN, text)
    if match:
        phone = match.group(0)
        # Normalize: remove spaces, dashes, leading +91/0
        phone = re.sub(r'[-.\s]', '', phone)
        phone = re.sub(r'^\+91', '', phone)
        phone = re.sub(r'^0', '', phone)
        if len(phone) == 10 and phone[0] in '6789':
            return phone
    return None


def extract_bhk(text):
    """Extract BHK type."""
    return extract_field(text, BHK_PATTERNS)


def extract_furnishing(text):
    """Extract furnishing level."""
    return extract_field(text, FURNISHING_PATTERNS)


def extract_listing_type(text):
    """Extract listing type."""
    return extract_field(text, LISTING_TYPE_PATTERNS)


def extract_tenant_pref(text):
    """Extract tenant preference."""
    return extract_field(text, TENANT_PREF_PATTERNS)


def extract_poster_kind(text, phone=None):
    """Determine poster kind: owner, broker, unknown."""
    if not text:
        return 'unknown'

    text = str(text)
    broker_score = sum(1 for pat in BROKER_INDICATORS if re.search(pat, text, re.IGNORECASE))
    owner_score = sum(1 for pat in OWNER_INDICATORS if re.search(pat, text, re.IGNORECASE))

    if broker_score > owner_score:
        return 'broker'
    elif owner_score > 0:
        return 'owner'
    return 'unknown'
