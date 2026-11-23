import test from "node:test";
import assert from "node:assert/strict";

import { parseNavBarWeatherResponse } from "../src/lib/navBarWeatherState.ts";

test("parseNavBarWeatherResponse normalizes supported weather payloads", () => {
  assert.deepEqual(
    parseNavBarWeatherResponse({
      current: {
        weathercode: 2,
        temperature_2m: 21.6,
        relativehumidity_2m: 67,
        windspeed_10m: 9.7,
      },
    }),
    {
      code: 2,
      temp: 22,
      humidity: 67,
      windspeed: 10,
    },
  );
});

test("parseNavBarWeatherResponse rejects malformed weather payloads", () => {
  assert.equal(parseNavBarWeatherResponse(null), null);
  assert.equal(parseNavBarWeatherResponse({ current: [] }), null);
  assert.equal(parseNavBarWeatherResponse({ current: { weathercode: "2", temperature_2m: 21 } }), null);
  assert.equal(parseNavBarWeatherResponse({ current: { weathercode: 2, temperature_2m: Number.NaN } }), null);
});
