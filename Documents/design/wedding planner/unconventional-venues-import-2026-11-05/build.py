"""Merge hand-written source_*.json batches, de-duplicate against the DB export and staged batches,
and write unconventional_venues_2026-11-05.json + .csv. Does not touch the database.

Usage: python build.py   (run from any directory)
"""
import csv
import json
import re
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).parent
PLANNER = HERE.parent
CHECKED = "2026-11-05"
EXPORT = PLANNER / "oracle-venue-export-2026-10-12-easyweddings.csv"
STAGED = [
    PLANNER / "weddingnsw-import" / "weddingnsw_venues_2026-10-15.json",
    PLANNER / "venue-import-2026-10-15" / "venues_2026-10-15.json",
]
# Hosts shared by several distinct venues (host-only match is a false positive): decide by name/phone instead.
SHARED_HOSTS = {"mhnsw.au", "doltonehouse.com.au", "portauthoritynsw.com.au", "harbourtrust.gov.au",
                "botanicgardens.org.au", "taronga.org.au", "merlinevents.com.au", "nationaltrust.org.au",
                "hornsby.nsw.gov.au"}
# Last-8 digits of lines shared by several venues (Merlin catering, Royal Botanic Garden hire, Hornsby council).
SHARED_PHONES = {"90664095", "92318111", "98476666"}


def norm(name):
    s = re.sub(r"\(.*?\)", "", name.lower().replace("&", "and"))
    s = re.sub(r"\b(the|pty|ltd)\b", "", s)
    return re.sub(r"[^a-z0-9]", "", s)


def host(url):
    return (urlparse(url or "").netloc or "").lower().removeprefix("www.")


def tail(phone):
    d = re.sub(r"\D", "", phone or "")
    return d[-8:] if len(d) >= 8 else ""


def pool():
    rows = [{"id": r["vendor_id"], "name": r["vendor_name"], "host": host(r["website_url"]),
             "phone": tail(r["contact_phone"]), "origin": "db"}
            for r in csv.DictReader(open(EXPORT, encoding="utf-8-sig"))]
    for path in STAGED:
        for v in json.loads(path.read_text(encoding="utf-8"))["new_venues"]:
            rows.append({"id": None, "name": v["vendor_name"], "host": host(v.get("website_url")),
                         "phone": tail(v.get("contact_phone")), "origin": path.parent.name})
    return rows


def match(v, rows):
    for r in rows:
        if norm(r["name"]) == norm(v["vendor_name"]):
            return r, "name"
        if r["phone"] and r["phone"] not in SHARED_PHONES and r["phone"] == tail(v["contact_phone"]):
            return r, "phone"
        if r["host"] and r["host"] == host(v["website_url"]) and r["host"] not in SHARED_HOSTS:
            return r, "host"
    return None, None


rows = pool()
new, matched = [], []
for src in sorted(HERE.glob("source_*.json")):
    for v in json.loads(src.read_text(encoding="utf-8")):
        hit, how = match(v, rows)
        if hit:
            matched.append({
                "source": v["vendor_name"], "matches": hit["name"], "db_vendor_id": hit["id"],
                "origin": hit["origin"], "by": how,
                "special_category": v["special_category"], "special_subtype": v["special_subtype"],
                "extra_style_tags": v["style_tags"], "extra_description": v["editorial_summary"],
                "fill_if_blank": {k: v.get(k) for k in (
                    "address", "website_url", "contact_phone", "contact_email",
                    "capacity_seated_max", "capacity_standing_max") if v.get(k)},
                "capacity_note": v.get("capacity_note"), "price_note": v.get("price_note"),
                "sources": v["sources"], "flags": v["flags"]})
            continue
        v.update(category="Venue")
        v.setdefault("source_checked_at", CHECKED)
        new.append(v)
        rows.append({"id": None, "name": v["vendor_name"], "host": host(v["website_url"]),
                     "phone": tail(v["contact_phone"]), "origin": "this batch"})

out = {"generated": CHECKED, "new_venues": new, "matched_existing": matched}
(HERE / "unconventional_venues_2026-11-05.json").write_text(
    json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

cols = ["vendor_name", "category", "special_category", "special_subtype", "service_area", "address",
        "website_url", "contact_phone", "contact_email", "capacity_seated_max", "capacity_standing_max",
        "capacity_note", "price_note", "style_tags", "editorial_summary", "sources", "flags"]
with open(HERE / "unconventional_venues_2026-11-05.csv", "w", newline="", encoding="utf-8-sig") as fh:
    w = csv.writer(fh)
    w.writerow(cols)
    for v in new:
        w.writerow([" | ".join(v[c]) if isinstance(v.get(c), list) else (v.get(c) or "") for c in cols])
print(f"{len(new)} new, {len(matched)} matched existing")
for m in matched:
    print("  matched:", m)
