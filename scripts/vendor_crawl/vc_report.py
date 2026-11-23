"""Compact views over a job: status counts, reading digests for curation, and a flat CSV export."""
import csv
import os
import re

from vc_sites import bare_host

EXPORT_FIELDS = ["key", "name", "label", "directory_url", "website", "email", "phone", "street",
                 "suburb", "postcode", "rating", "review_count", "price_range", "photos",
                 "social", "all_emails", "all_phones", "render", "needs_website"]


def clip(text, limit):
    text = re.sub(r"\s+", " ", text or "").strip()
    return text if len(text) <= limit else text[:limit] + "…"


def merged(job, key):
    """data (directory page) + web (own site) as one flat record. Own-site contacts win."""
    data, web = job.read(f"data/{key}.json"), job.read(f"web/{key}.json")
    entity = data.get("entity", {})
    website = web.get("website") or data.get("website", "")
    host = bare_host(website) if website else ""
    emails = list(web.get("emails", [])) + [e for e in data.get("emails", []) + [entity.get("email", "")]
                                             if e and e not in web.get("emails", [])]
    on_site = [e for e in emails if host and e.split("@")[1].endswith(host.split("/")[0])]
    phones = list(web.get("phones", [])) + [p for p in [entity.get("phone", "")] + data.get("phones", [])
                                             if p and p not in web.get("phones", [])]
    return {
        "key": key, "data": data, "web": web, "website": website,
        "name": entity.get("name") or data.get("name", ""),
        "email": (on_site or emails or [""])[0], "emails": emails,
        "phone": entity.get("phone") or (phones or [""])[0], "phones": phones,
        "photos": (data.get("images", []) or []) + (web.get("images", []) or []),
        "social": list(dict.fromkeys(web.get("social", []) + data.get("social", []))),
    }


def status(job):
    manifest = job.manifest()
    keys = list(manifest)
    raw = [k for k in keys if os.path.exists(job.path("raw", k + ".html.gz"))]
    errors = [k for k in keys if os.path.exists(job.path("raw", k + ".err"))]
    rows = [merged(job, k) for k in keys if os.path.exists(job.path("data", k + ".json"))]
    curated = job.curated()
    done = [k for k in keys if curated.get(k, {}).get("editorial_summary")]
    wanted = [r for r in rows if r["website"]]
    fetched = [r for r in wanted if r["web"].get("fetched")]
    print(f"job        {job.root}")
    print(f"pages      {len(keys)} listed | {len(raw)} fetched | {len(errors)} failed | {len(rows)} extracted")
    print(f"contacts   phone {sum(bool(r['phone']) for r in rows)} | email {sum(bool(r['email']) for r in rows)}"
          f" | website {len(wanted)} | photos {sum(bool(r['photos']) for r in rows)}")
    print(f"own sites  {len(fetched)}/{len(wanted)} fetched | "
          f"{sum(r['web'].get('render') != 'ok' for r in fetched)} look JS-rendered (need a browser pass)")
    print(f"curated    {len(done)}/{len(keys)} have editorial_summary")
    for label, test in (("no website", lambda r: not r["website"]), ("no email", lambda r: not r["email"])):
        missing = [r["key"] for r in rows if test(r)]
        if missing:
            print(f"{label:10s} {len(missing)}: {', '.join(missing[:12])}{' …' if len(missing) > 12 else ''}")
    if errors:
        print(f"failed     {', '.join(errors[:12])}  (see raw/*.err; `fetch --retry-errors`)")


def digest(job, keys, todo, chars):
    curated = job.curated()
    if not keys:
        pending = [k for k in job.manifest() if not curated.get(k, {}).get("editorial_summary")
                   and os.path.exists(job.path("data", k + ".json"))]
        keys = pending[:todo]
    for key in keys:
        rec = merged(job, key)
        data, entity = rec["data"], rec["data"].get("entity", {})
        place = ", ".join(p for p in (entity.get("street"), entity.get("suburb"), entity.get("postcode")) if p)
        print("=" * 90)
        print(f"{key} | {rec['name']} | {place} | {rec['phone']} | {rec['email']} | {rec['website'] or 'NO WEBSITE'}")
        rating = f"{entity['rating']} ({entity.get('review_count') or '?'})" if entity.get("rating") else "-"
        price = entity.get("price_range") or clip("; ".join(data.get("price_snippets", [])[:3]), 140) or "-"
        print(f"rating {rating} | price {price} | photos {len(rec['photos'])} | render {data.get('render')}")
        print("DESC:", clip(entity.get("description") or data.get("meta_description"), 400))
        print("HEAD:", clip(" | ".join(data.get("headings", [])), 200))
        print("TEXT:", clip(data.get("text"), chars))
        for qa in data.get("faq", [])[:6]:
            print(f"  Q: {clip(qa['q'], 80)} | A: {clip(qa['a'], 130)}")
        for page in rec["web"].get("site_text", [])[:3]:
            print(f"SITE {page['url']}: {clip(page['text'], chars // 2)}")


def export_csv(job, path):
    manifest = job.manifest()
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=EXPORT_FIELDS)
        writer.writeheader()
        for key, entry in manifest.items():
            rec = merged(job, key)
            entity = rec["data"].get("entity", {})
            writer.writerow({
                "key": key, "name": rec["name"], "label": entry.get("label", ""),
                "directory_url": entry["url"], "website": rec["website"], "email": rec["email"],
                "phone": rec["phone"], "street": entity.get("street", ""),
                "suburb": entity.get("suburb", ""), "postcode": entity.get("postcode", ""),
                "rating": entity.get("rating", ""), "review_count": entity.get("review_count", ""),
                "price_range": entity.get("price_range", ""), "photos": len(rec["photos"]),
                "social": " ".join(rec["social"]), "all_emails": " ".join(rec["emails"]),
                "all_phones": " | ".join(rec["phones"]), "render": rec["data"].get("render", ""),
                "needs_website": "" if rec["website"] else "yes",
            })
    return len(manifest)
