# Celebrant profile enrichment — 11 November 2026

## Scope

The live directory contained 16 active rows categorised as celebrants. The
approved, robots-aware vendor crawler fetched each listed official website.
Fifteen sites support a celebrant listing. Enzo Weddings Hunter Valley describes
a venue and cafe, so its category is corrected to `Venue` rather than inventing
a celebrant service.

## Evidence and curation

- Source list: `source-urls.txt`
- Flat crawler export: `export.csv`
- Own-word profiles: `curated/batch_01.json` and `curated/batch_02.json`
- Fetch result: 16/16 pages fetched and extracted; no blocked pages.
- The crawler's Jessie Cacchillo page linked to an unrelated website developer.
  That email and website candidate were rejected.
- No scraped testimonial is republished as a quote. A profile never implies an
  endorsement, current price, availability or official-register verification.

Raw HTML cache and extracted intermediary files are reproducible crawler output
and are intentionally excluded from the release commit. The curated JSON and
CSV retain the reviewable source trail.

## Photos and branding

The sites expose image URLs, but that does not grant OmnyID a publication
licence. Public profiles therefore use the existing vendor-upload and image
licence authority. Until a verified owner uploads an authorised image, the
directory renders a consistent branded initials placeholder. This avoids
hotlinking or presenting a photographer's work without permission.

## Consultation availability

Directory profiles distinguish profile evidence from availability evidence.
The ten-minute consultation status stays closed until the celebrant's official
register entry is operator-verified and the callback rollout is enabled. A
scoped management link may prepare that celebrant's hours before launch, but it
does not grant account access, expose leads or reveal another vendor's data.
