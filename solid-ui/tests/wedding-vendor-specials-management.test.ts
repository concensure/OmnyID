import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFile(resolve(root, path), "utf8");

test("vendor special management exchanges a fragment secret into a scoped session", async () => {
  const [entry, api, flow, page, compose] = await Promise.all([
    read("solid-ui/src/vendor-claim-main.tsx"),
    read("solid-ui/src/lib/vendorSpecialsApi.ts"),
    read("solid-ui/src/components/vendor/VendorSpecialManagementFlow.tsx"),
    read("solid-ui/vendor.html"),
    read("docker-compose.oracle.minimal.yml"),
  ]);

  assert.match(entry, /window\.location\.hash\.slice\(1\)/);
  assert.match(entry, /special_management/);
  assert.doesNotMatch(entry, /params\.get\("special_management"\)/);
  assert.match(api, /credentials: "same-origin"/);
  assert.match(api, /"x-csrf-token"/);
  assert.match(flow, /history\.replaceState/);
  assert.match(api, /account_access: false/);
  assert.match(flow, /confirm\("Withdraw this offer/);
  assert.match(flow, /Subject|indicative|Availability remains indicative/i);
  assert.match(page, /name="robots" content="noindex,nofollow,noarchive"/);
  assert.match(page, /name="referrer" content="no-referrer"/);
  assert.match(compose, /OMNYID_WEDDING_VENDOR_SPECIALS_ENABLED: \$\{OMNYID_WEDDING_VENDOR_SPECIALS_ENABLED:-false\}/);
  assert.match(compose, /OMNYID_WEDDING_VENDOR_SPECIALS_CAPABILITY_PEPPER_FILE/);
});

test("vendor special management exposes date commercial facts and explicit actions", async () => {
  const flow = await read("solid-ui/src/components/vendor/VendorSpecialManagementFlow.tsx");
  for (const label of ["Capacity", "Minimum spend", "Per head", "Inclusions"]) {
    assert.match(flow, new RegExp(label));
  }
  for (const action of ["Publish offer", "Pause offer", "Reconfirm dates", "Mark booked", "Withdraw date"]) {
    assert.match(flow, new RegExp(action));
  }
});
