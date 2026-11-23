# Sydney wedding florists: handoff for the uploading agent (2026-11-06)

35 new florists, `category = "Florist"`, ready to load. **Nothing was written to production by the source handoff.** Follows
`../vendor-scrape-and-import-playbook.md` and mirrors `../photographers-import-2026-10-17/HANDOFF.md`.

## Integration decision (WED-341)

The committed generator also performs the requested guarded correction for the
existing exact row `best-buds-sydney-florist`: it changes `Floral Designer` to
the canonical `Florist` category only while the vendor ID, name and old category
all match. It cannot rename or recategorise a different listing.

## Files
- `florists_src.py`: hand-written source (`FLORISTS` = 35 records, `HOLD` = 4 too-thin stubs). Edit here, never the outputs.
- `build.py`: validates (in-batch duplicates, match against existing DB florists, tag counts, contact basis) and writes the outputs.
- `florists_2026-11-06.json`: `new_florists` (35, each with an `attributes` array) and `existing_florist_additions` (empty).
- `new_florists_2026-11-06.csv`: flat copy (tags and flags joined with `;`).
- Regenerate: `cd` into this folder, then `python -I build.py`.

## How to load (per record)
1. `wedding_vendors`: `vendor_id` and `vendor_slug` (same value, `florist-<slug>`), `vendor_name`, `category` (`Florist`),
   `service_area`, `address`, `website_url`, `contact_phone`, `contact_email`, `source_url`, `source_label`,
   `source_checked_at`, `status` (`active`). Put `flags` into `caveat_labels`. Put `instagram_url`, `price_note`,
   `price_from_aud`, `price_status` and `contact_basis` into `evidence` JSON (no columns for them).
   `ON CONFLICT (vendor_id) DO NOTHING` so a re-run is safe.
2. `wedding_vendor_attributes`: insert each row of `attributes` (`attribute_key`, `value` as JSONB, `status`, `authority`,
   `source_url`, `retrieved_at`, `notes`). `ON CONFLICT (vendor_id, attribute_key) DO UPDATE` only when the existing row's
   authority is not `operator` or `vendor_reply`.
3. Keys written (all apply to every category in `attribute_catalog.rs`): `editorial_summary`, `style_tags`, `official_website`,
   `instagram_url`, `price_estimate_total_aud`, `deposit_percent`, `years_in_business`. Venue-only and photographer-only keys
   are deliberately not used. No photo rows: images need the vendor licence flow (`../vendor photo licence.md`).
4. Authority: `primary_official` for own-site and search-summary-of-own-site records, `directory` for the 4 directory-only records.
   Prices are `estimated` (lowest published starting figure or minimum spend), never `known`.

## Matching
Pool = the 17 `Florist` rows in `postgres/data/2026-10-07_vendor_directory_expansion.sql` + Best Buds (`Floral Designer`, migration 0085).
Rule: normalised name, website host or last 8 phone digits. **Zero matches**; the existing rows are mostly delivery shops and none overlap.
- **Category vocabulary:** existing rows use `Florist`; Best Buds originally used `Floral Designer` in `wedding_vendor_seed_details`. WED-341 moves only that exact
  canonical listing to `Florist`, keeping one directory category and stable vendor ID.
- **Possible addition, not made:** Flowers at Kirribilli is now "Lush Flower Co Kirribilli" per a Wheree listing. The DB already has Lush
  Flower Co (Neutral Bay); same group is likely but unconfirmed, so no record or merge was created.

## Sources
Discovery only (names, never records or `website_url`): Wedlockers, Hello May, Easy Weddings, Wedding NSW, Real Weddings, The Florist Quarter
and search results. Every record's website and contacts come from the florist's own site where readable (`contact_basis = own_site`: 29).
- `search_result` (2: Rosella, Eden & Bell): own site returned 404 or TLS error to scripts; contacts taken from a search summary of the own-site pages.
- `directory` (4: The Faux Fernery, Christine & Rose, Ivy Trail Events, Bloom Boss): no own-site read (DNS failure, 403, or JS-only);
  contacts from directory/social listings. **Unverified** and flagged. Default per playbook is load as `active` with the caveat label;
  hide them instead if you want only verified contacts on the public site.
- Prose is written in own words. Only contacts, addresses and figures were copied.

## Contact gaps (flag `needs_contact_lookup`)
- No phone: Nunu Designs, Floral Fix, The Lillipillian, Bold Botanicals.
- No email: Ally Bell, Lime Tree Bower, Form Over Function, Eden & Bell.
- No street address (service area only): 14 records (flag `no_street_address` or `no_street_number`).
- Named-person emails kept because they are the only ones found (`named_person_email`): Fiona's Floral Designs, Events Florist, The Lillipillian.

## Flags to check before publishing
- **Conflicting data, first value stored:** Madame Fleur phone (`0424 669 932` in schema vs `0424 669 923` in tel link); Sydney's Flowers
  Heathcote has two addresses and two phones and says it has moved to studio pre-order trading; Fable Studio Co (Alexandria vs Mascot in schema);
  Biophilia Blooms (Rushcutters Bay vs Darlinghurst); Jewel Phon (Silverwater vs Lidcombe title); Copper Beech postcode (2093 vs 2097 in page text);
  LS Flower Design second mobile `0426 763 979`; Form Over Function second (South Coast) number `02 4268 1899`.
- **Prices from search summaries, not read directly** (`price_from_search_summary`): Nunu (from $6,000; a directory shows $3,000), Elodie's ($5,000 + GST
  minimum), Rosella ($600-$1,800 packages), Bold Botanicals ($4,500 minimum), Copper Beech (one $4,200 package), Ally Bell (item guideline prices,
  florals-led weddings from about $8,000). Japonica's minimums ($1,500 weekday / $3,000 weekend) are from its enquiry page. Felicia's prices conflict between
  directories and are not stored. The Bloom Folk's $4,500/$3,500 is a third-party figure, kept only in `price_note`.
- **Outside Sydney base:** The Bloom Folk (Hunter Valley), Ivy Trail Events (Blue Mountains), Elodie's (Camden, outer south-west). Kept because they state Sydney work.
- **Not pure florists:** Butchers Daughter (caterer with a florist arm), Form Over Function (planner; styling clients must also book its flowers), Fable Studio Co
  and Anna Wang (stylists with in-house florals), Events Florist (events-first), The Faux Fernery (faux flower hire, not fresh).
- **Retail shops with a wedding service** (`retail_florist_with_weddings`): Copper Beech, Ally Bell, LS Flower Design, Lime Tree Bower, Bold Botanicals, Eden & Bell.
- **verify_trading / verify_availability:** The Lillipillian (site said maintenance in progress), Architecture in Bloom (winter closure on homepage),
  Sydney's Flowers Heathcote, Rosella (road-works pause on Blue Mountains travel reported by a directory).
- **Anna Wang:** two domains (`annawangstylist.com.au`, `annawang.com.au`); email domain is `annawang.au`. Third-party reviews are mixed.
- **Glossie Studio:** domain is `glossiegals.com`.

## Hold list (found, not imported; see `HOLD` in the source)
Jardine Botanic (no contact in HTML), Flowers by Julia G (address only), The Sydney Botanist (email only), Mrs Gibbons Flowers (email only).

## Do not import / dropped
- **MISS Floral Studio:** `missfloralstudio.com` served a gambling-spam page title ("MsFloralBet...") on 2026-11-06. Domain looks compromised. Do not store the URL
  until a human confirms; the studio may have a new site or Instagram.
- Madeline Anne (now a content creator and photographer; florals are past work), Seaholly (national artificial-flower shop), The Faux Flower Company (national),
  Lily Ever After (South Coast), The Curated Life (planner, no florals page read), Diane's Floral Occasions and Style and Blooms (no official site found),
  Lush Flower Co Kirribilli (see matching), The Botanical Connection (Sydney location unconfirmed).

## Retry list (candidates, contacts not captured)
- Pia + Jade (`piaandjade.com.au`; South Coast, Southern Highlands and Sydney; site dropped scripted connections).
- Brides in Bloom (`bridesinbloom.com.au`; directories give 5 Parkview Drive, Sydney Olympic Park, (02) 8746 0800; domain did not resolve).
- The FlowerHouse Sydney (`theflowerhouse.com.au`; Penrith/Blue Mountains, no contacts in HTML), Rymonda Floral Design (`rymondafloraldesign.com`, no contacts in HTML),
  Flowers by Gwyneth (`flowersbygwyneth.com.au`, site returned 502), Sydney Wedding Flowers (`sydneyweddingflowers.com.au`, phone `0418 440 439` read but no location or detail),
  Fancy Flowers by Felicity (Heathcote; `fancyflowersbyfelicity.com.au`; phone only from a search snippet).
- Not yet searched: Hills/Western Sydney outside Baulkham Hills and Auburn, Wollongong/Illawarra, Central Coast, and Blue Mountains florists in depth.

## Not verified
- No ratings or review counts stored (directory ratings are third-party and the user does not want directories named as a rating source).
- Availability and hours were not checked. Instagram handles come from links on each florist's own site, except Rosella, The Faux Fernery,
  Christine & Rose (search or directory listings); Fiona's, Eden & Bell, Ivy Trail and Bloom Boss have none.
- Emails were not test-sent.
