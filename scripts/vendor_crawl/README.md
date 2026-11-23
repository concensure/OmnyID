# vendor_crawl: reusable vendor-directory crawler

Stdlib-only Python (3.10+). Turns a directory listing (Easy Weddings, Wedlockers, Urban List, any
vendor category) into cached pages, structured JSON, a flat CSV and short reading digests, so an
agent reads ~1-2 KB per vendor instead of a 300 KB HTML page. All fetching and parsing happens in
code; LLM tokens are spent only on the own-words curation step.

Rules it enforces come from `Documents/design/wedding planner/vendor-scrape-and-import-playbook.md`
(read that first for matching, own-words writing and handoff). The tool never submits forms,
never logs in, respects robots.txt, and waits `--delay` seconds (default 1) between requests to one host.

## Quick start

```bash
VC=scripts/vendor_crawl/vendor_crawl.py
JOB="Documents/design/wedding planner/crawls/florists-sydney-2026-11-07"   # any folder you like

# 1. Learn how the site is built (one call, ~25 lines of output). Prints --link-regex suggestions.
python -I $VC probe "https://www.wedlockers.com.au/wedding-venues/sydney/"

# 2. Run the whole pipeline: list -> fetch -> extract -> own sites -> status
python -I $VC run "$JOB" --listing-url "https://www.wedlockers.com.au/wedding-venues/sydney/" \
  --link-regex '^https?://www\.wedlockers\.com\.au/b/[^/?#]+/?$' --category venue
```

Config is saved in `$JOB/job.json`, so later `python -I $VC run "$JOB"` resumes. Everything is
resumable: cached pages are never refetched, failures are recorded and skipped until `--retry-errors`.

## Commands

| Command | What it does |
|---|---|
| `probe URL` | Reports JSON-LD types, embedded JSON state, API hints, robots/sitemaps, JS-rendering and link-pattern suggestions. Run first; it decides the approach. |
| `list JOB` | Finds detail-page URLs from `--listing-url` (+ `--page-param page` or `--page-template '...{n}'`, `--max-pages`) and/or `--sitemap URL` (needs `--link-regex`). Without `--link-regex` it prints candidate patterns instead. |
| `add JOB URL... [--file f.txt] [--label x]` | Add URLs by hand (vendors a listing does not expose). |
| `fetch JOB [--workers 3] [--limit N] [--retry-errors]` | Download pages to `raw/*.html.gz`. |
| `extract JOB` | Offline parse into `data/<key>.json` (always safe to re-run). |
| `sites JOB [--only key...] [--refetch]` | Crawl each vendor's own website (home + wedding/contact/pricing pages) into `web/<key>.json`. |
| `status JOB` | Counts, plus which vendors lack website / email. |
| `digest JOB [key...] [--todo N] [--chars 900]` | Compact reading view for writing curated entries. Default: next 5 uncurated. |
| `export JOB [--out f.csv]` | Flat CSV (`export.csv`) with merged directory + own-site contacts. |
| `run JOB ...` | list + fetch + extract + sites + status. |

Use `python -I` (isolated mode): the tool inserts its own folder on `sys.path`, and `-I` stops Python
loading modules from whatever folder you are in.

## Job folder layout

`job.json` config | `urls.json` manifest `{key: {url, label}}` | `raw/` gz HTML (+ `.err` for failures) |
`listing/` cached index pages | `data/<key>.json` directory-page facts | `web/<key>.json` own-site facts |
`state/` embedded JSON blobs (Next.js etc.) | `websites.json` manual `{key: url}` overrides |
`curated/*.json` agent-written entries | `export.csv`.

`data/<key>.json` holds: `entity` (JSON-LD name, phone, street, suburb, postcode, rating, price_range,
images), `emails`, `phones`, `website`, `website_candidates`, `social`, `images`, `headings`, `faq`,
`price_snippets`, `text` (main text, 8000 chars), `render` (`ok` | `thin` | `spa`), `jsonld_types`.

## Typical agent workflow

1. `probe`, then `run`. Read `status`.
2. Vendors with no website: find it with `WebSearch` (use `blocked_domains` for the directory itself),
   put `{"key": "https://..."}` in `$JOB/websites.json`, run `sites`. Never guess a URL or an email.
3. `digest` 5 at a time, write own-words entries to `$JOB/curated/batch_NN.json` as
   `{key: {name, style_tags, editorial_summary, ...}}` (shape per the playbook, section 6). `status` counts
   an entry as curated when it has `editorial_summary`.
4. `export`, then match against the latest Oracle export and write the handoff (playbook sections 4, 5, 8).

## Site-specific fields

Drop a `profile.py` in the job folder with `enrich(key, url, page_html, data) -> dict`; the returned
fields are merged into each `data/<key>.json` on `extract`. Example: parsing a directory's capacity or
"price per head" block. Keep it in the job folder, not in this tool.

## Known limits (tested 2026-11-07 on Easy Weddings and Wedlockers)

- **Hidden or lazy-loaded listings.** Easy Weddings' Sydney page exposed 68 of the 71 venues found
  earlier; the other 3 are in neither the page HTML nor the sitemap. Compare the count with the site's
  own total, and `add` missing URLs. A listing that ignores `?page=` is not paginated in HTML.
- **Wedlockers** relative links need `<base href>` (handled) and detail pages live at `/b/<slug>`, which
  is the `--link-regex` to use. The 3 detail pages sampled showed no phone or email, so expect to fill
  contacts from each vendor's own site.
- **JS-rendered sites** (`render` is `spa` or `thin` in `status`) return little text over plain HTTP.
  Those need a browser pass (built-in browser or Chrome tools) for phone/email; this tool cannot do it.
- **Cloudflare-protected or challenge pages** come back as HTTP 403/429 and are recorded in `raw/*.err`.
  Stop and flag them; do not work around them.
- `website_candidates` is heuristic (anchor text such as "website"/"visit"). Only a JSON-LD `url` or a
  candidate scoring 3+ is promoted to `website`. Check affiliate/booking links before trusting one.
- Phones are matched with an Australian pattern; verify numbers on the vendor's own site.
- Copy only contact details. Descriptions, tags and summaries must be rewritten in your own words.
