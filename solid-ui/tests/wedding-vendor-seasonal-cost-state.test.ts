import test from "node:test";
import assert from "node:assert/strict";
import { SYDNEY_WEDDING_MONTHLY_INDICES, weddingVendorAvailabilityPrior, weddingVendorEffectiveCost } from "../src/lib/weddingVendorSeasonalCostState.ts";

test("Sydney indices match the research CSV and reproduce peak/off-peak worked costs", () => {
  assert.deepEqual(SYDNEY_WEDDING_MONTHLY_INDICES, {
    1: { venue: 105, catering: 103, demand: 78 }, 2: { venue: 100, catering: 100, demand: 72 },
    3: { venue: 115, catering: 108, demand: 100 }, 4: { venue: 120, catering: 112, demand: 92 },
    5: { venue: 108, catering: 105, demand: 76 }, 6: { venue: 82, catering: 88, demand: 42 },
    7: { venue: 78, catering: 85, demand: 35 }, 8: { venue: 84, catering: 90, demand: 48 },
    9: { venue: 108, catering: 105, demand: 88 }, 10: { venue: 125, catering: 115, demand: 100 },
    11: { venue: 122, catering: 113, demand: 96 }, 12: { venue: 112, catering: 108, demand: 86 },
  });
  const base = { venueHireFee: 12000, cateringPerGuest: 180, guestCount: 100, greaterSydney: true, dayOfWeek: 6 };
  assert.equal(weddingVendorEffectiveCost({ ...base, month: 10 }).total, 35700);
  assert.equal(weddingVendorEffectiveCost({ ...base, month: 7 }).total, 24660);
});
test("quotes override estimates and availability prior is demand aware", () => {
  const quote = weddingVendorEffectiveCost({ venueHireFee: 12000, cateringPerGuest: 180, guestCount: 100, month: 10, greaterSydney: true, quoteTotal: 32000 });
  assert.equal(quote.estimated, false);
  assert.equal(quote.authority, "vendor_reply");
  assert.equal(weddingVendorAvailabilityPrior({ month: null }), 0.5);
  assert.equal(weddingVendorAvailabilityPrior({ month: 10 }), 0.35);
  assert.equal(weddingVendorAvailabilityPrior({ month: 7 }), 0.675);
});

test("seasonal estimates stay indicative and do not apply outside Greater Sydney", () => {
  const input = { venueHireFee: 12000, cateringPerGuest: 180, guestCount: 100, month: 10, dayOfWeek: 6 };
  const outside = weddingVendorEffectiveCost({ ...input, greaterSydney: false });
  assert.equal(outside.total, 30000);
  assert.equal(outside.estimated, false);
  assert.equal(outside.note, null);
  const inferred = weddingVendorEffectiveCost({ ...input, greaterSydney: true });
  assert.equal(inferred.estimated, true);
  assert.equal(inferred.authority, "inferred");
  assert.ok(inferred.confidence <= 0.4);
  assert.match(inferred.note ?? "", /indicative, not a quote/i);
});
