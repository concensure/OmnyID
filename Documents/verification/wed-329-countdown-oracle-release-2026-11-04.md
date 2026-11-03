# WED-329 Countdown Oracle release evidence

- Application commit: `415fe21dc4a35bb944781580273d5ed2ad1346f2`
- Release checkout: `C:\Users\ozans\AppData\Local\Temp\omnyid-wed329-release-415fe21`
- Release date: 2026-11-04 Australia/Sydney
- Public route: `https://omnyid.com/wedding/wedding-planning-checklist-australia.html`
- Generated catalogue: `https://omnyid.com/wedding/assets/data/wedding-catalogue.v1.json`

## Candidate verification

The clean exact-SHA candidate passed:

- generated-static parity and focused catalogue, vendor lead-time and legal tests;
- four deterministic public Countdown engine tests;
- all 2,180 Wedding tests;
- Wedding website smoke and the 74-page public metadata contract;
- Solid UI typecheck and both line-budget checks; and
- the production Solid UI build.

## Hosted verification

- The checklist returns HTTP 200 with the expected title.
- The generated catalogue returns HTTP 200 and reports `wedding-catalogue.v1`,
  `publicationReady: true`, 65 tasks, 31 vendor timing categories and three official legal sources.
- Oracle `SOURCE_COMMIT` and `oracle-runtime-manifest.json` both contain the exact application SHA.
- Runtime proof status is `pass`; homeserver and backup services are running, and the fresh backup
  manifest verifies.

## Capacity note

A full disposable restore drill was attempted separately and failed closed at its capacity
preflight. Oracle root use was 90 percent with about 4.9 GB free; the drill required about 8.2 GB.
The final runtime proof therefore records `restore_drill_status: skipped` rather than misreporting a
restore test. No production records, backups or images were deleted as part of this release.

## Product boundary

This release publishes the autonomous Countdown dependency. Invitation wording and Palette assets
remain unpublished until their separate inclusive-language, professional-content, licensing and
diversity reviews are recorded.
