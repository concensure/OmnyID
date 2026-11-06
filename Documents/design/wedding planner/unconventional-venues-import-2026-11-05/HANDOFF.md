# Unconventional Sydney venues: handoff for Codex (2026-11-05)

Seed doc: `Documents/wedding research/unconventional wedding venue.md` (themes: boats, warehouses, museums/galleries/libraries,
entertainment venues, botanical/zoo/aquarium). Scope: Sydney first, then rest of NSW, then other states.
Method: `Documents/design/wedding planner/vendor-scrape-and-import-playbook.md`. Database untouched.

## Batch plan
| Batch | Special category slug | Status |
|---|---|---|
| 01 | `boat` (boats, yachts, ferries, tall ships, glass boats) | **done**: 12 new + 1 staged-record addition |
| 02 | `warehouse` (industrial, creative studio) | **done**: 6 new + 6 tag-only additions |
| 03 | `museum`, `gallery`, `library` | **done**: 8 new + 7 tag-only additions |
| 04 | `entertainment` (cinema, arcade, bowling, mini golf, attractions) | **done**: 13 new + 2 tag-only additions |
| 05 | `botanical`, `zoo_aquarium` | **done**: 18 new + 5 tag-only additions |

## How the special category is stored (filterable)
`wedding_vendors.category` stays `Venue`. The special type is in `evidence`:
- `evidence->'special_category'`: jsonb array of slugs (`boat`, later `museum`, ...). Use this as the filter.
- `evidence->'special_subtype'`: finer type (`glass boat`, `tall ship`, `catamaran`, `superyacht`, `ferry`, `historic vessel`, ...).
- The slug is also a plain word in the `style_tags` attribute, so it is searchable today with no code change.

```sql
SELECT vendor_id, vendor_name FROM wedding_vendors WHERE evidence->'special_category' ? 'boat' AND status = 'active';
```
Follow-up (needs a Rust change, not made here): add a `venue_special_category` Tags attribute to
`src/server/wedding_vendor_search_routes/attribute_catalog.rs` so the admin UI and search facets can read it directly.
Unknown attribute keys were deliberately not written to `wedding_vendor_attributes`.

## Files
- `source_botanical_zoo_batch_05.json`: hand-written source for batch 5.
- `source_entertainment_batch_04.json`: hand-written source for batch 4.
- `source_museums_batch_03.json`: hand-written source for batch 3.
- `source_warehouses_batch_02.json`: hand-written source for batch 2 (same rules).
- `source_boats_batch_01.json`: hand-written source (own words; only contacts and figures copied from the operators' own sites).
- `build.py` -> `unconventional_venues_2026-11-05.json` (cumulative: `new_venues` 57, `matched_existing` 20) and `.csv`.
- `build_sql.py` -> `postgres/data/2026-11-05_unconventional_venues_import.sql`.
- Regenerate: `python build.py && python build_sql.py`.

## To apply
Run the SQL **after** the WeddingNSW load and `2026-10-19_wedlockers_urbanlist_import.sql`, because the Harbourside Cruises
addition targets the staged row `venue-harbourside-cruises` (it is a no-op if that row does not exist yet).
The SQL file is cumulative (batches 1 to 5). Tested 2026-11-05 on a throwaway Postgres 16 with migrations 0088 + 0094 and stub rows for the matched venues: runs twice with no errors; category arrays are unioned, so a venue can carry several (e.g. `["boat","warehouse"]`).

## Matching
Pool = `oracle-venue-export-2026-10-12-easyweddings.csv` (194) + staged `weddingnsw-import` and `venue-import-2026-10-15` new venues.
Duplicate if normalised name, last 8 phone digits or website host matches. No boat operator was in the DB. One matched a staged record:
- **Harbourside Cruises** (WeddingNSW batch, not yet uploaded). Keep the staged name/id. Added: boat tags, seated 130 / standing 200
  from the operator's own page, official page URL. **Conflicts, staged values kept:** staged standing 160 vs official 200; staged price
  "from $99pp" (WeddingNSW) vs official "from $179pp, 70-guest minimum". Official figures are in the record's `price_note`/`capacity_note`.
  Its email `info@harboursidecruises.com.au` comes from the WeddingNSW record and a search snippet; the operator's site shows an enquiry form only.

## Contacts
All phones, emails and addresses are from each operator's own site. Emails for Fantasea (`charters@fantasea.com.au`) and
Sydney Harbour Yacht Charter (`info@shyc.com.au`) were decoded from Cloudflare-protected links on their own pages.
Flagged `needs_contact_lookup` (no email, enquiry form only): Sydney Harbour Escapes, Prestige Harbour Cruises, Boatique, Eastcoast Sailing.
No street address published (service area only): Prestige, Sydney Harbour Yacht Charter, Sydney Harbour Exclusive, Sydney Yacht Club,
Sydney Catamaran Hire, Boatique, Eastcoast Sailing (flag `no_street_address`).
Shared fleets: the same vessels (Starship Sydney, Blue Room, Constellation, Seadeck) are listed by several brokers
(`charter_broker`, `charter_fleet_multiple_vessels`). They are separate businesses with their own contacts, so they are separate records.

## Skipped / not verified
- Captain Cook Cruises, Starship Sydney (Australian Cruise Group site), Sydney Harbour Days: sites return 403 to automated fetches
  (also on their contact/wedding pages). Not guessed. Starship Sydney/Aqua still appear through Sydney Harbour Escapes' fleet list.
- Sydney Harbour Yacht Charter's page footer says copyright 2020 (`verify_trading`); Sydney Harbour Tall Ships' page looks several
  years old (`verify_availability`).
- Capacity: only figures an operator states are stored. Where the page gives one total per boat (Fantasea 399, Prestige, SHYC,
  Boatique, Eastcoast, Sydney Catamaran Hire) it is in `capacity_note`, not in a seated/standing attribute.
- Prices are operator "from" figures, stored only in the vendor `notes`. No photos collected (licence flow applies).
- Sydney Yacht Club (boat charter) is a charter agency, not the members' club of that name; the record name has "(boat charter)" to avoid confusion.
- Not yet covered: Manly/Parramatta River ferries, Sydney Ferries charter, Pittwater/Hawkesbury houseboats, Sydney Heritage Fleet, Lady Hopetoun.
  Candidates for a boat batch 01b.

## Batch 02: warehouses and creative studios (2026-11-05)
Sources: each venue's own site (contacts and figures), after discovery via wedding guides.
**New (6):** 3Danks (Waterloo; dry-hire blank canvas, 270 seated / 400 standing, from $3,300 + GST), Nauti Studios Sydney (Forest Lodge; ~140 + 44 guests, BYO),
Unexpected Guest Distillery (Marrickville; private hire incl. weddings, capacity unpublished), Cockatoo Island (ceremony on Biloela Lawn up to ~100, reception at the island cafes),
Carriageworks (Eveleigh), White Bay Cruise Terminal (Rozelle).
**Tag-only additions (6, existing or staged venues; just get `warehouse` + tags):** Three Blue Ducks Rosebery, Kensington Street Venues (Olio / Old Rum Store),
Events by Alpha (loose fit), The Grounds of Alexandria, Doltone House - Jones Bay Wharf (SoHo and Loft rooms only), The Freedom Hub (staged).
**Verify before publishing:** Carriageworks and White Bay Cruise Terminal publish nothing about weddings on their own sites (`verify_weddings_accepted`);
WBCT's phone is the Port Authority switchboard and its page says both 2,500 cocktail and a 500-person cap. Unexpected Guest has no public phone, and the postcode (2204) and
Carriageworks' postcode (2015) are inferred from the suburb, not printed on the site (`postcode_inferred`). Nauti prices have no currency stated.
Cockatoo Island and White Bay have no street address.

**Dropped (do not re-research):**
- Closed: The Venue Alexandria (redirects to Navarra), Woodburn Creatives (closed), Staves Brewery (no live site), The Studio Rosebery (reported closed).
- Do not take weddings or no wedding evidence: Sydney Brewery Rozelle (ex White Bay Beer Co; functions only, phone looks like a placeholder), Willie the Boatman (taproom closed for works),
  Akasha Brewing (functions, no weddings), San Telmo Studio, Stanley 2204 (private events, no weddings), The Cutaway at Barangaroo (ICC Sydney; event types exclude weddings),
  Mimmynvovo Studio (third-party listing only), Doltone House Western Sydney / Marconi (ballroom, not warehouse; already staged).
- Could not verify: Sun Studios Alexandria (site blocks fetches), Stick n Stone Marrickville (no official site), The Loft at Jones Bay Wharf (covered via Doltone tag).

## Batch 03: museums, galleries, libraries (2026-11-05)
Sources: each institution's own site (Museums of History NSW pages read by curl because WebFetch gets 403 there).
Multi-value categories are used where it fits (MCA is `["museum","gallery"]`).
**New (8):** Australian Museum (Hintze Hall 270 seated / 550), Australian National Maritime Museum, Museum of Contemporary Art Australia (MCA),
Hyde Park Barracks Museum (evening marquee reception, 250 seated / 500 standing), Elizabeth Bay House (small weddings, finish 10:30pm),
Penrith Regional Gallery & The Lewers Bequest (Emu Plains; 40-100 guests, from $60pp), Campbelltown Arts Centre, Barnet Long Room at Customs House (`library` tag; the library itself is not for hire).
**Tag-only or blank-fill additions (7):** The Mint, Estate Vaucluse House, Rouse Hill Estate (`museum`), Art Gallery of NSW (`gallery`), State Library of NSW (`library`)
and Hazel Kitchen & Bar (`gallery`; staged with no contact, so the SQL now **blank-fills phone, address, website and email** on matched rows, never overwriting).
**Verify before publishing:**
- ANMM contacts are the museum's general line `(02) 9298 3777` / `info@sea.museum`; a 2021 brochure listed `venues@sea.museum` and `02 9298 3649` (unverified). Ceremony capacities there are from that brochure (about 100) and sources disagree on the largest space.
- Customs House contact is the City of Sydney council address. Hazel's postcode (2227) is inferred; it has no published email and its capacity pages disagree (stored the lower 120 / 180).
- Campbelltown Arts Centre names weddings only on its Performance Studio page and hires 8:30am-4:30pm by default (`verify_weddings_accepted`).
- Penrith gallery email `galleryfunctions@ppandva.com.au` is from the official pages; a search snippet showed `galleryfunctions@penrith.city`.
- Museums of History NSW sites (Mint, Hyde Park Barracks, Elizabeth Bay House, Vaucluse House, Rouse Hill) share one hire team: `venues@mhnsw.au`, no hire phone published.
**Dropped:** Powerhouse Museum Ultimo (closed for revitalisation), Powerhouse Parramatta (opens 7 Nov 2026; no wedding hire stated, revisit),
Sydney Jewish Museum (closed for redevelopment until mid-2027), Museum of Sydney, Justice & Police Museum, Sydney Observatory, Chau Chak Wing Museum,
Liverpool Powerhouse, Manly Art Gallery & Museum (none state weddings). University of Sydney Great Hall / MacLaurin Hall reportedly host civil weddings (online form only; not read directly): check next.

## Batch 04: entertainment venues (2026-11-05/06)
Slug is `entertainment`; the finer type is in `special_subtype` (`private cinema`, `bowling alley`, `arcade bar`, `mini golf`, `escape room`, `observation deck`, `wax museum`, `theatre`).
Sources: each operator's own site. Re-run of the SQL test on throwaway Postgres 16: two runs clean; `entertainment` = 15 (13 new + Golden Age + Opera House), cumulative 39 new venues.
**Only one Sydney cinema states weddings on its own site** (Golden Age Cinema & Bar, hire-kit PDF). Most of this batch is "private hire, weddings not named", so almost every record carries `verify_weddings_accepted`.
**New (13):**
- Cinema/theatre (outside Sydney): James Theatre Dungog (Hunter), The Roxy Theatre Bingara (contact is the visitor centre).
- Bowling/arcade: Kingpin North Strathfield (Room 300, 60 people, seated/standing not stated), Strike Bowling King Street Wharf (one record for all NSW Strike sites, form only, 80 seated),
  Archie Brothers Cirque Electriq Alexandria, Fortress Sydney (Arena 100 banquet / 360 cocktail, from $43pp), Astro's Arcade Bar Newtown, Arcade Bar & Club (CBD; official site no longer shows arcade games, mobile phone).
- Other: Holey Moley Golf Club Sydney (one record, Darlinghurst address; Alexandria site covered in the note), Hijinx Hotel Alexandria, Sydney Tower Eye, Madame Tussauds Sydney (contacts are Merlin's catering lines), Escape Hunt Sydney - Loft on George.
**Tag-only or blank-fill additions (2):** Golden Age Cinema & Bar (already in the DB; the hire kit lists wedding ceremonies; cinema 56 seated / 70 standing), Sydney Opera House (staged; Yallamundi Rooms / Utzon Room, Winter Weddings offer 2027-28).
**Verify before publishing:**
- Weddings are not named on the official sites of Kingpin, Strike, Archie Brothers, Fortress, Astro's, Arcade Bar & Club, Hijinx, Escape Hunt (all `verify_weddings_accepted`). Astro's nav has a "Weddings" tab that links to an expired site.
- Phones/emails: Strike, Holey Moley, Hijinx, Archie Brothers, Kingpin, Astro's, Escape Hunt publish forms or phone only (`email_missing_form_only`). Hijinx postcode inferred (2015). Escape Hunt address says level 4, the loft page says level 7.
- Holey Moley address is listed as Darlinghurst Road but with a Potts Point postcode (2011).
- Capacity conflicts stored at the lower figure: Opera House (150-180 seated / 350-400 cocktail), Madame Tussauds (zone figures; whole venue about 750), Golden Age bar standing (60 vs 70).
- Sydney Tower Eye SKYWALK is unavailable until 12 Nov 2026. Opera House has an exclusive caterer (Trippas White Group).
**Dropped:** Palace Chauvel (closed Jan 2026), Palace Moore Park / Norton Street / Overlook Bar, Ritz Randwick, Dendy Newtown, Hayden Orpheum, Moonlight Cinema, Skyline Drive-In, Roxy Parramatta (disused),
Reservoir Cinema at Rydges (hotel room, site 403), Zone Bowling / Timezone (kids parties only on official site), The Standard Bowl (closed), B. Lucky & Sons (no Sydney site), 1989 Arcade Bar (parked domain),
Sydney Tower Eye 80s arcade bar (2022 pop-up), Hordern Pavilion (concert hall, no wedding offer), Capitol Theatre / Lyric (show-night packages only), Riverside Theatres Parramatta (weddings not named, redevelopment),
Two80 Cabaret, Bondi Pavilion Theatre (says weddings but no address/contact captured), Sea Life / Wild Life (go to batch 05).
**Retry later:** Luna Park Sydney (official site blocks automated reads; strong candidate, check manually), The Magicians' Cabaret Pyrmont (hire page errored), Bondi Pavilion Theatre, Moonlight Cinema, Hayden Orpheum.

## Batch 05: botanical gardens, zoos, aquariums (2026-11-06)
Slugs: `botanical`, `zoo_aquarium` (finer type in `special_subtype`: `botanic garden`, `glasshouse`, `zoo`, `aquarium`, `wildlife park`).
Sources: each operator's own site; the SQL re-test on throwaway Postgres 16 ran twice clean (botanical 15, zoo_aquarium 8; cumulative 57 new venues, 197 attribute rows).
`build.py` now also skips host and phone matches for shared hosts/lines (Royal Botanic Garden, Taronga, Merlin, National Trust, Hornsby council) so different venues are not merged by accident.
**New (18):**
- Botanical: Blue Mountains Botanic Garden Mount Tomah (60 seated / 100 standing, packages $4,700-$4,900), Chinese Garden of Friendship (100 seated / 180 cocktail; pavilions $780-$1,280 for 3h),
  Wollongong Botanic Garden (150 seated, ceremony only, $735/h), Hunter Region Botanic Gardens (capacity/price unknown, phone conflict), Auburn Botanic Gardens, Fagan Park Galston and Lisgar Gardens Hornsby (ceremony only),
  Everglades House and Gardens Leura (120 ceremony guests from $2,600), Campbell Rhododendron Gardens (up to 100, $300-$500), Illawarra Rhododendron and Rainforest Gardens, Gosford Edogawa Commemorative Garden (about 150 standing).
- Zoo/aquarium: SEA LIFE Sydney Aquarium, WILD LIFE Sydney Zoo (both Merlin: shared catering phone/email, whole venue about 1000 / 450), Sydney Zoo Bungarribee (350 seated / 750 standing, exclusive caterer),
  Australian Reptile Park Somersby, Taronga Western Plains Zoo Dubbo (reception $1,500, ceremony+reception $2,500, from a Sept 2024 PDF), Featherdale Wildlife Park, Mogo Wildlife Park.
**Tag-only or blank-fill additions (5):** Royal Botanic Garden Sydney (Palm House and lawns; 120 seated, $2,300/4h), The Calyx (200 seated / 400 cocktail, from $7,250), Botanic House (150 / 200, exclusive caterer),
The Australian Botanic Garden Mount Annan (200 / 600), Taronga Zoo Sydney (Dalang Ballroom 250 / 300; ceremony spaces 100-300).
**Verify before publishing:**
- Ceremony-only venues (`ceremony_only`): Wollongong, Auburn, Fagan Park, Lisgar, Everglades, Campbell. Fees for Auburn and Fagan Park are in a booking portal/PDF not read.
- Weddings not named on the official site: Featherdale, Mogo (`verify_weddings_accepted`, no phone/email read). Sydney Zoo's ceremony sub-pages 404.
- **WILD LIFE Sydney Zoo rechecked 2026-11-06:** its current official wedding page explicitly confirms the venue offers weddings, pre-set and tailored packages, planning support and Bespoke Catering (`merlin@bespokecatering.net.au`). The former `ceremony_not_confirmed` caveat was removed. Historic space capacities remain marked for reconfirmation because the current page does not publish them.
- Royal Botanic Garden, Calyx, Mount Annan and Mount Tomah list a phone line and enquiry form only (no hire email). Gosford Edogawa address is from a search result; Hunter Region Botanic Gardens has a phone conflict.
- Exclusive caterers: Calyx, Botanic House, Chinese Garden, Edogawa, Sydney Zoo, Taronga (Trippas White), Merlin venues (Bespoke).
- Postcodes inferred: Chinese Garden, Wollongong, Auburn, Campbell, Western Plains Zoo (2830).
**Dropped:** Albury Botanic Gardens (no address/contact captured), Paddington Reservoir Gardens (council says ceremonies not approved), Nurragingy Reserve (council hall), Corbett Gardens Bowral, Western Sydney Parklands,
Symbio Wildlife Park (parties only), Koala Park Sanctuary, Shoalhaven Zoo, Manly SEA LIFE (closed 2018), Hunter Valley Zoo / Wildlife Park / Oakvale / Port Stephens Koala Sanctuary (no official wedding page readable), Calmsley Hill (farm).
**Retry later:** Luna Park Sydney, Port Stephens Koala Sanctuary, Oakvale, Albury Botanic Gardens contacts.

## Remaining work after batch 05
All five themes in the seed doc are done for Sydney and nearby NSW. Next: other states (VIC, QLD, WA, SA, TAS), the retry list above, and optionally the `venue_special_category` Rust attribute (see HANDOFF top).
