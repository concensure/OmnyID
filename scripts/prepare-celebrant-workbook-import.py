"""Prepare a transactional, idempotent listing reconciliation; never publish contact data.

Usage: python scripts/prepare-celebrant-workbook-import.py workbook.xlsx output.sql
The generated SQL defaults to ROLLBACK. Add --apply to generate COMMIT after
reviewing the dry-run counts. Execute using psql -X -v ON_ERROR_STOP=1.
Names/suburbs become searchable; phone/email are used transiently for deduplication
only. No email, invitation, registration verification or owner claim is implied.
"""
import argparse
import hashlib
import json
import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def read_rows(path):
    with zipfile.ZipFile(path) as archive:
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            strings = ["".join(node.itertext()) for node in ET.fromstring(
                archive.read("xl/sharedStrings.xml")).findall("m:si", NS)]
        rows = ET.fromstring(archive.read("xl/worksheets/sheet1.xml")).findall("m:sheetData/m:row", NS)
        headers = {}
        result = []
        for index, row in enumerate(rows):
            values = {}
            for cell in row.findall("m:c", NS):
                column = re.sub(r"\d", "", cell.attrib["r"])
                node = cell.find("m:v", NS)
                inline = cell.find("m:is", NS)
                value = node.text if node is not None else "".join(inline.itertext()) if inline is not None else ""
                if cell.attrib.get("t") == "s" and value:
                    value = strings[int(value)]
                values[column] = (value or "").strip()
            if not index:
                headers = values
                if not {"name", "phone", "vendor_id", "suburb", "state"}.issubset(set(headers.values())):
                    raise ValueError("Required workbook columns are missing")
                continue
            record = {headers.get(key, key): value for key, value in values.items()}
            if not record.get("phone"):
                continue
            name, vendor_id = record.get("name", ""), record.get("vendor_id", "")
            if not name or len(name) > 300 or not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,159}", vendor_id):
                raise ValueError(f"Invalid name/vendor reference at row {index + 1}")
            result.append({"vendor_id": vendor_id, "name": name,
                           "area": " ".join(filter(None, [record.get("suburb"), record.get("state"), record.get("postcode")])),
                           "phone": record["phone"], "email": record.get("email", ""), "row_number": index + 1})
        if len({r["vendor_id"] for r in result}) != len(result):
            raise ValueError("Duplicate workbook vendor references require manual review")
        return result


def prepare_sql(rows, digest, apply=False):
    data = json.dumps(rows, ensure_ascii=True)
    delimiter = "$workbook_" + digest[:16] + "$"
    if delimiter in data:
        raise ValueError("Unexpected SQL delimiter in input")
    return f"""\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
-- Serialize this operator reconciliation; never modify existing claimed records.
SELECT pg_advisory_xact_lock(hashtext('wed376-celebrant-workbook'));
CREATE TEMP TABLE source_celebrants ON COMMIT DROP AS
SELECT * FROM jsonb_to_recordset({delimiter}{data}{delimiter}::jsonb)
 AS x(vendor_id text,name text,area text,phone text,email text,row_number integer);
CREATE TEMP TABLE celebrant_mapping ON COMMIT DROP AS
SELECT s.*, CASE WHEN EXISTS(SELECT 1 FROM wedding_vendors v WHERE v.vendor_id=s.vendor_id)
 THEN ARRAY(SELECT vendor_id FROM wedding_vendors v WHERE v.vendor_id=s.vendor_id)
 ELSE ARRAY(SELECT vendor_id FROM wedding_vendors v WHERE lower(trim(v.category))='celebrant'
   AND (lower(trim(v.vendor_name))=lower(trim(s.name))
     OR (length(regexp_replace(s.phone,'[^0-9]','','g'))>=9 AND
         right(regexp_replace(v.contact_phone,'[^0-9]','','g'),9)=right(regexp_replace(s.phone,'[^0-9]','','g'),9))
     OR (s.email<>'' AND lower(v.contact_email)=lower(s.email)))) END matches
FROM source_celebrants s;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM celebrant_mapping WHERE cardinality(matches)>1) THEN
   RAISE EXCEPTION 'Ambiguous existing listings: reconcile privately before importing'; END IF;
 IF EXISTS(SELECT 1 FROM celebrant_mapping m JOIN wedding_vendors v ON v.vendor_id=ANY(m.matches)
           WHERE lower(trim(v.category))<>'celebrant') THEN
   RAISE EXCEPTION 'Workbook reference belongs to a different category'; END IF;
END $$;
CREATE TEMP TABLE inserted_celebrants ON COMMIT DROP AS
WITH inserted AS (
 INSERT INTO wedding_vendors(vendor_id,vendor_slug,vendor_name,category,service_area,status,
     source_label,evidence,caveat_labels)
 SELECT vendor_id,vendor_id,name,'Celebrant',area,'active',
   'User-supplied NSW celebrant register workbook',
   jsonb_build_object('workbook_import',jsonb_build_object('sha256','{digest}',
       'row',row_number,'contact_details_withheld',true,'register_verification','pending')),
   ARRAY['Unclaimed listing; confirm details directly']::text[]
 FROM celebrant_mapping WHERE cardinality(matches)=0
 ON CONFLICT(vendor_id) DO NOTHING RETURNING vendor_id
) SELECT * FROM inserted;
SELECT json_build_object('source_rows',(SELECT count(*) FROM source_celebrants),
 'existing_matches',(SELECT count(*) FROM celebrant_mapping WHERE cardinality(matches)=1),
 'created',(SELECT count(*) FROM inserted_celebrants),
 'unresolved',(SELECT count(*) FROM celebrant_mapping m WHERE cardinality(matches)=0
     AND NOT EXISTS(SELECT 1 FROM wedding_vendors v WHERE v.vendor_id=m.vendor_id)),
 'source_sha256','{digest}','applied',{'true' if apply else 'false'});
{'COMMIT' if apply else 'ROLLBACK'};
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    rows = read_rows(args.workbook)
    digest = hashlib.sha256(args.workbook.read_bytes()).hexdigest()
    args.output.write_text(prepare_sql(rows, digest, args.apply), encoding="utf-8")
    print(json.dumps({"phone_bearing_rows": len(rows), "workbook_sha256": digest,
                      "mode": "apply" if args.apply else "dry_run", "contacts_published": False}))


if __name__ == "__main__":
    main()
