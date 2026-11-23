"""Build celebrants_2026-11-23.json/.csv from celebrants_src.py and check them against the staged register.

Run: python -I build.py [register-sql-glob]   (from this folder)
The register SQL lives only in the primary checkout, so pass its glob when running from a worktree:
  python -I build.py "C:/Users/ozans/Desktop/projects/OmnyID/Documents/design/wedding planner/celebrants-nsw-register-import-2026-11-18/sql/*.sql"
Exits non-zero if an addition has no matching staged register row, a new record collides with one,
or a record breaks the tag-count and directory-host rules from the vendor playbook.
"""
import csv
import glob
import json
import os
import re
import sys
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from celebrants_src import ADDITIONS, CHECKED, NEW  # noqa: E402

PLAN = os.path.dirname(HERE)
REGISTER_SQL = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    PLAN, "celebrants-nsw-register-import-2026-11-18", "sql", "*.sql")
ROW = re.compile(r"^\('(celebrant-[^']+)', '[^']+', '((?:[^']|'')+)', 'Celebrant', '([^']*)', NULL, NULL, "
                 r"'([^']*)'", re.M)
DIRECTORY_HOSTS = ("easyweddings", "wedlockers", "hellomay", "weddingnsw", "polkadotwedding", "oneflare",
                   "weddinghero", "realweddings", "top4", "wheree")
OWN = "Written by OmnyID in own words."


def last8(phone):
    digits = re.sub(r"\D", "", phone or "")
    return digits[-8:] if len(digits) >= 8 else None


def host(url):
    return re.sub(r"^www\.", "", urlparse(url or "").netloc.lower())


def register_rows():
    rows = {}
    for path in glob.glob(REGISTER_SQL):
        for vid, name, area, phone in ROW.findall(open(path, encoding="utf-8").read()):
            rows[vid] = (name.replace("''", "'"), area, phone)
    return rows


def attr(key, value, status, url, note=None):
    row = {"attribute_key": key, "value": value, "status": status, "authority": "primary_official",
           "source_url": url, "retrieved_at": CHECKED}
    if note:
        row["notes"] = note
    return row


def attributes(rec, src, website, ig, years, years_note):
    rows = [attr("editorial_summary", rec["summary"], "known", src, OWN),
            attr("style_tags", rec["tags"], "known", src, OWN),
            attr("official_website", website, "known", website)]
    if ig:
        rows.append(attr("instagram_url", ig, "known", src))
    if rec.get("price"):
        rows.append(attr("price_estimate_total_aud", rec["price"], rec.get("price_status", "known"), src,
                         "Lowest published figure (legals-only tier); confirm with the celebrant."))
    if years:
        rows.append(attr("years_in_business", years, "estimated", src, years_note))
    if rec["cultures"]:
        rows.append(attr("cultural_religious_capabilities", rec["cultures"], "known", src))
    return rows


def addition(a):
    f = a["fill"]
    return {
        "vendor_id": a["vendor_id"], "name": a["name"], "trading_name": a["trading_name"],
        "source_url": a["source_url"], "source_checked_at": CHECKED,
        "fill": {k: v for k, v in f.items() if k in ("website_url", "contact_email")},
        "evidence_extra": {"instagram_url": f.get("instagram_url"), "facebook_url": f.get("facebook_url"),
                           "services": a["services"], "price_note": a["price_note"],
                           "trading_name": a["trading_name"], "service_area_detail": a["service_area_extra"],
                           "contact_basis": "own_site"},
        "extra_style_tags": a["tags"], "extra_description": a["summary"],
        "flags": sorted(a["flags"]),
        "attributes": attributes(a, a["source_url"], f["website_url"], f.get("instagram_url"),
                                 a["years"], a["years_note"]),
        "note": "Register-only row exists (staged 2026-11-18). Database values win; fill blanks only.",
    }


def new_record(v):
    vid = f"celebrant-{v['slug']}"
    flags = sorted(v["flags"])
    return {
        "vendor_id": vid, "vendor_slug": vid, "vendor_name": v["name"], "category": "Celebrant",
        "trading_name": v["trading_name"], "service_area": v["area"], "address": None,
        "website_url": v["website"], "contact_phone": v["phone"], "contact_email": v["email"],
        "contact_form_url": v["form"], "instagram_url": v["ig"], "price_from_aud": v["price"],
        "price_status": v["price_status"], "price_note": v["price_note"], "services": v["services"],
        "style_tags": v["tags"], "editorial_summary": v["summary"], "contact_basis": "own_site",
        "sort_key": v["sort_key"], "flags": flags, "source_url": v["src"], "source_label": "Vendor website",
        "source_checked_at": CHECKED, "status": "active",
        "attributes": attributes(v, v["src"], v["website"], v["ig"], None, None),
    }


def validate(adds, news, register):
    problems = []
    for a in adds:
        row = register.get(a["vendor_id"])
        if not row:
            problems.append(f"MISSING register row for addition {a['vendor_id']}")
        elif a["fill"].get("website_url") and not 8 <= len(a["tags"]) <= 13:
            problems.append(f"{a['name']}: {len(a['tags'])} style tags")
    for v in news:
        if not 8 <= len(v["tags"]) <= 13:
            problems.append(f"{v['name']}: {len(v['tags'])} style tags")
        target = re.sub(r"[^a-z]", "", v["name"].lower())
        for vid, (name, _area, phone) in register.items():
            if re.sub(r"[^a-z]", "", name.lower()) == target or (v["phone"] and last8(phone) == last8(v["phone"])):
                problems.append(f"MATCHES register row {vid}: {v['name']}")
        if any(d in host(v["website"]) for d in DIRECTORY_HOSTS):
            problems.append(f"DIRECTORY host on {v['name']}")
    for rec in [*adds, *news]:
        site = rec.get("source_url") or rec.get("src")
        if any(d in host(site) for d in DIRECTORY_HOSTS):
            problems.append(f"DIRECTORY source on {rec['name']}")
    return problems


def write_csv(path, adds, news):
    cols = ["record_type", "vendor_id", "name", "trading_name", "website_url", "contact_phone", "contact_email",
            "instagram_url", "price_from_aud", "style_tags", "flags", "source_url", "source_checked_at"]
    with open(path, "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(cols)
        for a in adds:
            f = a["fill"]
            w.writerow(["addition", a["vendor_id"], a["name"], a["trading_name"], f.get("website_url"), "",
                        f.get("contact_email"), f.get("instagram_url"), a["price"] or "",
                        ";".join(a["tags"]), ";".join(a["flags"]), a["source_url"], CHECKED])
        for v in news:
            w.writerow(["new", f"celebrant-{v['slug']}", v["name"], v["trading_name"], v["website"],
                        v["phone"] or "", v["email"], v["ig"], v["price"] or "", ";".join(v["tags"]),
                        ";".join(v["flags"]), v["src"], CHECKED])


def main():
    register = register_rows()
    if not register:
        print(f"No register rows found at {REGISTER_SQL}. Pass the glob of the 2026-11-18 register SQL "
              "as the first argument.")
        return 2
    problems = validate(ADDITIONS, NEW, register)
    out = {"generated": CHECKED, "new_vendors": [new_record(v) for v in NEW],
           "existing_vendor_additions": [addition(a) for a in ADDITIONS]}
    with open(os.path.join(HERE, f"celebrants_{CHECKED}.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=1, ensure_ascii=False)
    write_csv(os.path.join(HERE, f"celebrants_{CHECKED}.csv"), ADDITIONS, NEW)
    print(f"register rows parsed: {len(register)} | new: {len(NEW)} | additions: {len(ADDITIONS)}")
    for line in problems:
        print(line)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
