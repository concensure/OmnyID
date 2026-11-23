import test from "node:test";
import assert from "node:assert/strict";

import {
  fetchInlineEntityExchangeRate,
  parseInlineEntityCurrencyPayload,
  parseInlineEntityExchangeRatePayload,
  parseInlineEntityMapLocationPayload,
} from "../src/lib/inlineEntityExternalData.ts";

test("parseInlineEntityMapLocationPayload accepts first valid map row", () => {
  assert.deepEqual(
    parseInlineEntityMapLocationPayload([{ lat: " -33.8688 ", lon: "151.2093", display_name: " Sydney " }]),
    { lat: -33.8688, lon: 151.2093, label: "Sydney" },
  );
});

test("parseInlineEntityMapLocationPayload rejects malformed map payloads", () => {
  assert.equal(parseInlineEntityMapLocationPayload({ lat: "1", lon: "2" }), null);
  assert.equal(parseInlineEntityMapLocationPayload([{ lat: "NaN", lon: "2", display_name: "x" }]), null);
  assert.equal(parseInlineEntityMapLocationPayload([{ lat: "1", lon: "2", display_name: "" }]), null);
});

test("parseInlineEntityCurrencyPayload accepts finite target rates only", () => {
  assert.deepEqual(
    parseInlineEntityCurrencyPayload({ rates: { AUD: 1.52 }, date: " 2026-08-12 " }, "AUD"),
    { result: 1.52, date: "2026-08-12" },
  );
  assert.deepEqual(
    parseInlineEntityCurrencyPayload({ rates: { AUD: Number.POSITIVE_INFINITY } }, "AUD"),
    { result: null, date: "" },
  );
});

test("parseInlineEntityExchangeRatePayload accepts finite target rates only", () => {
  assert.deepEqual(
    parseInlineEntityExchangeRatePayload({ result: "success", rates: { EUR: 0.91 } }, "EUR"),
    { rate: 0.91 },
  );
  assert.deepEqual(parseInlineEntityExchangeRatePayload({ rates: { EUR: "0.91" } }, "EUR"), { rate: null });
  assert.deepEqual(parseInlineEntityExchangeRatePayload({ rates: { GBP: 0.78 } }, "EUR"), { rate: null });
});

test("fetchInlineEntityExchangeRate returns a validated target rate", async () => {
  const result = await fetchInlineEntityExchangeRate(
    { from: "USD", to: "AUD" },
    async () => ({
      ok: true,
      status: 200,
      async json() {
        return { rates: { AUD: 1.52 } };
      },
    }),
  );

  assert.deepEqual(result, { rate: 1.52 });
});

test("fetchInlineEntityExchangeRate fails closed for unavailable or malformed responses", async () => {
  await assert.rejects(
    fetchInlineEntityExchangeRate(
      { from: "USD", to: "AUD" },
      async () => ({
        ok: false,
        status: 503,
        async json() {
          return {};
        },
      }),
    ),
    /HTTP 503/,
  );

  await assert.rejects(
    fetchInlineEntityExchangeRate(
      { from: "USD", to: "AUD" },
      async () => ({
        ok: true,
        status: 200,
        async json() {
          return { rates: { EUR: 0.91 } };
        },
      }),
    ),
    /No rate for AUD/,
  );
});
