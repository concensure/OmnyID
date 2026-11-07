"""Build the reviewed florist JSON, CSV and idempotent operator SQL.

Run: python -I build.py   (from this folder; -I needs the explicit path insert below)
"""
import csv
import json
import os
import re
import sys
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from florists_src import CHECKED, FLORISTS  # noqa: E402

# Existing `Florist` rows (postgres/data/2026-10-07_vendor_directory_expansion.sql) plus the
# 0085 seed Best Buds. Matching is by normalised name, website host and last 8 phone digits.
EXISTING = [
    ("Flowers Across Sydney", "flowersacrosssydney.com.au", "90557795"),
    ("Urban Flower", "urbanflower.com.au", "97451668"),
    ("Pearsons Florist Sydney", "pearsonsflorist.com.au", "1300158899"),
    ("Floral Expressions", "floralexpressions.com.au", "96831116"),
    ("Lush Flower Co", "lushflowerco.com.au", "90304040"),
    ("Sweetheart Florist", "sweetheartflorist.com.au", "93869699"),
    ("Flowers On Norton St", "flowersonnortonst.com.au", "95509897"),
    ("The Flower Room", "theflowerroom.com.au", "95503100"),
    ("Blue Flowers", "blueflowers.com.au", "0429279795"),
    ("Flower Merchants", "flowermerchants.com.au", "88247200"),
    ("Seed Blossom Pod", "seedblossompod.com.au", "96201400"),
    ("Five Petals Florist", "fivepetals.com.au", "0468080500"),
    ("Belflora", "belflora.com.au", "49696622"),
    ("Blooms on Darby Florist", "bloomsondarby.com", "0435126041"),
    ("Lurve Flowers", "lurveflowers.com.au", "0421558184"),
    ("The Little Garden", "thelittlegardenau.com", "0412305584"),
    ("Dear Petal Hunter Valley", "dearpetal.com", "40092925"),
    ("Best Buds Sydney Florist", "bestbuds.com.au", "93101136"),
]

AUTHORITY = {"own_site": "primary_official", "search_result": "primary_official", "directory": "directory"}
SOURCE_LABEL = {
    "own_site": "Florist website",
    "search_result": "Florist website (read via search summary)",
    "directory": "Directory or social listing (unverified)",
}


def norm(name):
    name = re.sub(r"\bthe\b|&|\band\b", " ", name.lower())
    return re.sub(r"[^a-z0-9]", "", name)


def host(url):
    return (urlparse(url).netloc or "").lower().removeprefix("www.")


def digits(phone):
    return re.sub(r"\D", "", phone or "")[-8:]


def attr(key, value, status, authority, url, notes=None):
    row = {"attribute_key": key, "value": value, "status": status, "authority": authority,
           "source_url": url, "retrieved_at": CHECKED}
    if notes:
        row["notes"] = notes
    return row


def build_record(f):
    auth = AUTHORITY[f["basis"]]
    url = f["source_url"]
    own_words = "Written by OmnyID in own words."
    attrs = [
        attr("editorial_summary", f["summary"], "known", auth, url, own_words),
        attr("style_tags", f["tags"], "known", auth, url, own_words),
        attr("official_website", f["website"], "known", auth, f["website"]),
    ]
    if f["instagram"]:
        attrs.append(attr("instagram_url", f"https://www.instagram.com/{f['instagram']}/", "known", auth, url))
    if f["price_from"]:
        attrs.append(attr("price_estimate_total_aud", f["price_from"], "estimated", auth, url,
                          "Lowest published wedding starting figure or minimum spend; confirm with the florist."))
    if f["deposit_pct"]:
        attrs.append(attr("deposit_percent", f["deposit_pct"], "known", auth, url))
    if f["years"]:
        attrs.append(attr("years_in_business", f["years"], "estimated", auth, url, "Rounded from florist wording."))
    vendor_id = f"florist-{f['slug']}"
    return {
        "vendor_id": vendor_id, "vendor_slug": vendor_id, "vendor_name": f["name"], "category": "Florist",
        "service_area": f["service_area"], "address": f["address"], "website_url": f["website"],
        "contact_phone": f["phone"], "contact_email": f["email"],
        "instagram_url": f"https://www.instagram.com/{f['instagram']}/" if f["instagram"] else None,
        "price_from_aud": f["price_from"], "price_status": f["price_status"], "price_note": f["price_note"],
        "deposit_percent": f["deposit_pct"], "years_in_business": f["years"],
        "style_tags": f["tags"], "editorial_summary": f["summary"],
        "contact_basis": f["basis"], "flags": f["flags"],
        "source_url": url, "source_label": SOURCE_LABEL[f["basis"]], "source_checked_at": CHECKED,
        "status": "active", "attributes": attrs,
    }


def check(records):
    problems, seen = [], {"id": set(), "name": set(), "host": set(), "phone": set()}
    for r in records:
        n, h, p = norm(r["vendor_name"]), host(r["website_url"]), digits(r["contact_phone"])
        for kind, val in (("id", r["vendor_id"]), ("name", n), ("host", h), ("phone", p)):
            if val and val in seen[kind]:
                problems.append(f"duplicate {kind} inside batch: {r['vendor_name']}")
            seen[kind].add(val)
        for en, eh, ep in EXISTING:
            if n == norm(en) or h == eh or (p and p == ep):
                problems.append(f"matches existing DB row {en}: {r['vendor_name']}")
        floor = 6 if "thin_content" in r["flags"] else 8
        if not floor <= len(r["style_tags"]) <= 13:
            problems.append(f"{r['vendor_name']}: {len(r['style_tags'])} style tags (want 8-13)")
        if r["contact_basis"] == "own_site" and not (r["contact_phone"] or r["contact_email"]):
            problems.append(f"{r['vendor_name']}: no phone or email")
        if r["contact_basis"] != "own_site" and not any("unverified" in x or "search_result" in x or "directory" in x
                                                          or "blocked" in x or "needs_contact" in x for x in r["flags"]):
            problems.append(f"{r['vendor_name']}: non-own-site contacts need an unverified flag")
    return problems


def sql_text(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def sql_json(value):
    return sql_text(json.dumps(value, ensure_ascii=False, separators=(",", ":"))) + "::jsonb"


def sql_array(values):
    return "ARRAY[" + ",".join(sql_text(value) for value in values) + "]::text[]"


def build_sql(records):
    rows = []
    attributes = []
    for record in records:
        evidence = {
            "source": "florists_import_2026_11_06",
            "instagram_url": record["instagram_url"],
            "price_note": record["price_note"],
            "price_from_aud": record["price_from_aud"],
            "price_status": record["price_status"],
            "contact_basis": record["contact_basis"],
        }
        rows.append("(" + ", ".join([
            sql_text(record["vendor_id"]), sql_text(record["vendor_slug"]),
            sql_text(record["vendor_name"]), sql_text(record["category"]),
            sql_text(record["service_area"]), sql_text(record["address"]),
            sql_text(record["website_url"]), sql_text(record["contact_phone"]),
            sql_text(record["contact_email"]), sql_text(record["source_url"]),
            sql_text(record["source_label"]), sql_text(record["source_checked_at"]),
            sql_text(record["status"]), sql_text(record["editorial_summary"]),
            sql_json(evidence), sql_array(record["flags"]),
        ]) + ")")
        for attribute in record["attributes"]:
            confidence = 0.8 if attribute["authority"] == "primary_official" else 0.55
            attributes.append("(" + ", ".join([
                sql_text(record["vendor_id"]), sql_text(attribute["attribute_key"]),
                sql_json(attribute["value"]), sql_text(attribute["status"]),
                str(confidence), sql_text(attribute["authority"]),
                sql_text(attribute["source_url"]), sql_text(record["source_label"]),
                "TIMESTAMPTZ " + sql_text(attribute["retrieved_at"] + " 00:00:00+00"),
                sql_text(attribute.get("notes")),
            ]) + ")")
    return "\n".join([
        "-- Reviewed Sydney florist operator load, generated from florists_src.py.",
        "-- Idempotent: vendor rows are never overwritten; high-authority attributes win.",
        "BEGIN;",
        "",
        "UPDATE wedding_vendor_seed_details",
        "SET category = 'Florist', updated_at = NOW()",
        "WHERE vendor_slug = 'best-buds-sydney-florist'",
        "  AND vendor_name = 'Best Buds Sydney Florist'",
        "  AND category = 'Floral Designer';",
        "",
        "INSERT INTO wedding_vendors (vendor_id, vendor_slug, vendor_name, category, service_area, address,",
        "    website_url, contact_phone, contact_email, source_url, source_label, source_checked_at, status,",
        "    notes, evidence, caveat_labels)",
        "VALUES",
        ",\n".join(rows),
        "ON CONFLICT (vendor_id) DO NOTHING;",
        "",
        "INSERT INTO wedding_vendor_attributes (vendor_id, attribute_key, value, status, confidence, authority,",
        "    source_url, source_label, retrieved_at, notes)",
        "VALUES",
        ",\n".join(attributes),
        "ON CONFLICT (vendor_id, attribute_key) DO UPDATE SET",
        "    value = EXCLUDED.value,",
        "    status = EXCLUDED.status,",
        "    confidence = EXCLUDED.confidence,",
        "    authority = EXCLUDED.authority,",
        "    source_url = EXCLUDED.source_url,",
        "    source_label = EXCLUDED.source_label,",
        "    retrieved_at = EXCLUDED.retrieved_at,",
        "    notes = EXCLUDED.notes",
        "WHERE wedding_vendor_attributes.authority NOT IN ('operator', 'vendor_reply');",
        "",
        "COMMIT;",
        "",
    ])


def main():
    records = [build_record(f) for f in FLORISTS]
    problems = check(records)
    out_json = os.path.join(HERE, f"florists_{CHECKED}.json")
    with open(out_json, "w", encoding="utf-8") as fh:
        json.dump({"generated": CHECKED, "new_florists": records, "existing_florist_additions": []},
                  fh, indent=2, ensure_ascii=False)
    cols = ["vendor_id", "vendor_name", "category", "service_area", "address", "website_url", "contact_phone",
            "contact_email", "instagram_url", "price_from_aud", "price_status", "price_note", "contact_basis",
            "style_tags", "editorial_summary", "flags", "source_url", "source_checked_at", "status"]
    with open(os.path.join(HERE, f"new_florists_{CHECKED}.csv"), "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(cols)
        for r in records:
            w.writerow([";".join(r[c]) if isinstance(r[c], list) else ("" if r[c] is None else r[c]) for c in cols])
    sql_path = os.path.normpath(os.path.join(HERE, "..", "..", "..", "..", "postgres", "data",
                                             f"{CHECKED}_florists_import.sql"))
    with open(sql_path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(build_sql(records))
    basis = {}
    for r in records:
        basis[r["contact_basis"]] = basis.get(r["contact_basis"], 0) + 1
    print(f"{len(records)} records, contact basis {basis}")
    print("no phone:", sum(1 for r in records if not r["contact_phone"]),
          "| no email:", sum(1 for r in records if not r["contact_email"]),
          "| no address:", sum(1 for r in records if not r["address"]))
    for p in problems:
        print("PROBLEM:", p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
