# Pipeline v3 — Response to Scraper Feedback

Point-by-point response to the June 12 feedback. Code shipped in `scrapper-main/`; tests in `scrapper-main/run_tests.js` (fixtures transcribed from the attached screenshots).

---

## 1. Finder vs Lister — root cause + fix

**Root cause:** v2 used one regex family for "looking for". But direction depends on the *object*:
- "looking for a **flatmate/tenant**" = LISTER (offering space, seeking a person)
- "looking for a **flat/room/PG**" = FINDER (seeking space)

The attached Nidhi Tiwari post ("LOOKING FOR A FEMALE FLATMATE… Rent 13000") was flagged as finder. Confirmed bug.

**Fix (shipped):** `classifyPostType()` in extraction.js:
- `SEEKING_PERSON` (flatmate/roommate/tenant objects) → lister, high confidence
- `SEEKING_PLACE` (flat/room/bhk objects, with negative lookbehind for "anyone/someone/know" so "if you know anyone looking for a flat" doesn't misfire) → finder
- `OFFERING` (for rent / available / to-let) → lister
- both seeking-place + offering → mixed
- rent+phone but no verbs → lister, low confidence

**Output columns:** `post_type` (lister/finder/mixed/unknown), `post_type_confidence` (high/medium/low), `post_type_reason` (which signal fired — auditable).

**Test results:** 8/8 fixtures correct, including both adversarial cases (flatmate-wanted post, "know anyone looking" post).

**Honest ceiling:** regex confidence is rule-based, not statistical. Posts with novel phrasing will land in unknown/low. See §10 for the LLM recommendation.

## 2. Original post date — partially solvable, shipped best-effort

**Reality check:** FB feed shows relative/abbreviated timestamps ("1m", "2 hrs", "9 June at 22:19"). Exact datetimes live in hover tooltips we don't touch (passive capture). So `post_created_at` is **approximate by construction** — minute-level for recent posts ("1m"), day-level for older ("9 June").

**Shipped:** content.js finds the timestamp anchor in each post, parses relative ("1m/2h/3d/1w"), "Yesterday at HH:MM", and "9 June at 22:19" formats → ISO. New columns: `post_created_at`, `post_age_days`. `freshness_state` now derives from post date when available (fresh ≤2d, mid ≤7d, stale >7d), scrape date as fallback — with a note flagging which was used.

## 3. Deduplication strategy

**Matching logic (exact, documented):**

| Scenario | Rule | Result |
|---|---|---|
| Same post re-rendered while scrolling | exact text hash (first 400 chars, normalized whitespace) | dropped silently |
| A: two people, same flat | same phone + locality + bhk + compatible rent | grouped |
| B: same person reposting | same phone (or same author when no phone) + locality + bhk/rent | grouped |
| C: same person, different flats | author matches but locality/bhk/rent differ | **NOT merged** — feeds broker score only |
| D: broker volume | same phone/author across ≥3 distinct listing groups → 0.9; 2 → 0.6; broker keywords → 0.8; "no broker/direct owner" caps at 0.3 | `broker_probability` |

"Compatible rent" = equal, or one side missing (posts often omit rent in reposts). Confidence: `high` = both rents stated and equal; `medium` = one missing, or author-based match.

**Output columns:** `dedup_group_id`, `duplicate_confidence`, `broker_probability`, `canonical_listing_id` (first-seen row in group; duplicates carry a REVIEW note pointing at it).

**Limitation:** photo-hash matching (DATA_MODEL's fourth signal) not implemented — would need image downloads (active requests to FB CDN, mild risk + heavy). Phone+locality+bhk covers most repost behavior; revisit if false-negatives show up in review.

## 4. Post URL mismatch — root cause + fix

**Root cause confirmed:** v2 took the *first* `/posts/|/permalink/` link inside each article container. FB articles contain many links — shared posts, comment anchors, "see more" targets — so the wrong URL got attached. Not scroll drift: text and images come from the same DOM node, so they never desync; only the permalink heuristic was wrong.

**Fix (shipped):** the canonical permalink on FB is the anchor whose *text is the timestamp*. `getPermalinkAndDate()` now finds post-shaped links whose label parses as a timestamp — that yields permalink AND post date from the same element (one element, two fields, mutually validating). Fallback to old heuristic with empty date when no timestamp anchor exists.

**Validation check:** if a permalink repeats across rows with different text hashes, the second occurrence is suspect — visible in Excel by sorting on source_ref.

## 5. Field-by-field accuracy

Method + known failure modes per field (fixes shipped where found):

| Field | Method | Known failures → action |
|---|---|---|
| phone | regex on de-spaced text | was solid; numbers in images still missed (needs OCR — V2) |
| rent | keyword-anchored, all matches tried, sanity 2k–500k | **fixed:** "rentals 9398…" poisoned the match and aborted (single-match + no word boundary). Now word-bounded, phone-prefix-guarded, iterates all candidates. "12k" and "₹85,000 per month" pass |
| deposit | NEW — numeric or "N months rent" form | both forms in fixtures pass |
| maintenance | NEW — numeric, "included" (0), "+ maintenance" (extra, unstated) | passes |
| locality / lat / lng / corridor / geo_precision | gazetteer scan, localities beat landmarks, earliest mention wins | gazetteer grew: Masjid Banda, Khajaguda, Kavuri Hills, Tolichowki/Miyapur/Kukatpally (corridor "Other" so off-corridor rows aren't lost), Hill Ridge Springs, Aparna Zenon. Unknown areas still blank — by design, founder extends gazetteer |
| bhk / furnishing / listing_type | keyword | ordering fixed: "semi furnished" no longer reads as "full"; "double occupancy" → flatmate |
| tenant_pref | keyword | widened: "female flatmate", "Hey girls", "for boys" forms |
| amenities | NEW — 20-keyword scan (gym, pool, parking, AC, geyser, power backup, gated, attached washroom, …) | populated; pipe-separated |
| available_from | NEW — "Availability: 1st July 2026", "Move In 1 July", "immediately" | passes |
| photos | per-post `<img>` ≥100px, emoji/static filtered | URLs only; FB CDN links expire after days — download-at-validation is a future step |
| dedup/broker/canonical | §3 | tested scenarios A–D |
| reject_reason / validated_at | founder-owned review columns | intentionally blank at capture |

**Failure rates: cannot be honestly computed yet** — needs labeled ground truth. Methodology (proposed): first real session, founder labels ~50 rows (correct/incorrect per field) in Excel; that yields per-field precision and drives the next iteration. Anything else would be invented numbers.

## 6. Information preservation

Shipped, following your good/bad example:
- normalized field + one `*_raw` companion only where parse can fail (`rent_raw`, `deposit_raw`, `maintenance_raw`)
- `extras` column: pipe-separated detected attributes that have no schema column — pets, non_veg, curfew, visitors, short_term_ok, working_professionals, students, couples, wfh, society:<name>, rent_per_person, contact_via_dm_only, no_fees_claimed
- `raw_text` always kept in full — nothing is discarded

## 7. Dynamic schema

The `extras` column IS the evolution feed: recurring tokens are countable in Excel (pivot on extras). Promotion rule of thumb: an extras token appearing in >10% of validated listings earns a real column. Automating discovery of *novel* attributes (beyond the seeded signal list) is LLM work, not regex — see §10.

## 8. Attached examples → fixtures

All five screenshots transcribed into `scrapper-main/test_fixtures.js` + three synthetic controls (true finder, broker repost, broker different-flat). `node run_tests.js` runs the suite; `sample_output.csv` (46 columns, 8 rows) committed for format review. These caught: the finder/lister bug, the rentals/rent regex poisoning, semi-furnished ordering, and the dedup rent-strictness issue.

**Note on WhatsApp (RentRadar):** the extension captures FB DOM only. WhatsApp Web has a different structure — separate capture path needed (V2 candidate: paste-text mode or WhatsApp Web selector). The *parser* already handles WhatsApp-style text (fixtures 4–5 pass), so ingestion is the only gap. `source` column supports it (`other`).

## 10 (and 9). Architecture position — challenging the premise

Several asks (statistical confidence, reasoning audit trails, automatic schema discovery, field accuracy self-reporting) are past the regex ceiling. The honest architecture:

1. **Extension = capture + fast regex pass** (instant Excel, zero deps) — this is shipped and good enough to start flooding inventory **today**.
2. **LLM enrichment pass (recommended next):** raw_text of each captured post → Claude with a structured-output schema → fills the same columns with true confidence scores, catches novel phrasing, extracts amenities/extras regex can't see, and proposes emerging schema fields. ~150 posts/day is pennies. Runs as a small script over the exported CSV — founder workflow unchanged (still Excel).
3. **Don't block collection on accuracy work.** Capture is lossless (raw_text + photos + permalink kept), so every past session can be re-parsed by a better parser later. Parsing improves retroactively; scrolling time doesn't. Start collecting now.

FlatX research: separate deliverable (see Roost repo, `v1/docs/FLATX_TEARDOWN.md`).
