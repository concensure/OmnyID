// @locs-version: 1.0
export type InlineEntityMapLocation = {
  label: string;
  lat: number;
  lon: number;
};

export type InlineEntityCurrencyConversion = {
  result: number | null;
  date: string;
};

export type InlineEntityExchangeRate = {
  rate: number | null;
};

type FetchLike = (
  input: string,
  init?: {
    headers?: Record<string, string>;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumberFromString(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseInlineEntityMapLocationPayload(payload: unknown): InlineEntityMapLocation | null {
  if (!Array.isArray(payload)) return null;
  const first = payload.find(isRecord);
  if (!first) return null;

  const lat = finiteNumberFromString(first.lat);
  const lon = finiteNumberFromString(first.lon);
  const label = typeof first.display_name === "string" && first.display_name.trim()
    ? first.display_name.trim()
    : null;

  return lat === null || lon === null || !label
    ? null
    : { label, lat, lon };
}

export function parseInlineEntityCurrencyPayload(
  payload: unknown,
  targetCurrency: string,
): InlineEntityCurrencyConversion {
  if (!isRecord(payload) || !isRecord(payload.rates)) return { result: null, date: "" };

  const result = payload.rates[targetCurrency];
  return {
    result: typeof result === "number" && Number.isFinite(result) ? result : null,
    date: typeof payload.date === "string" ? payload.date.trim() : "",
  };
}

export function parseInlineEntityExchangeRatePayload(
  payload: unknown,
  targetCurrency: string,
): InlineEntityExchangeRate {
  if (!isRecord(payload) || !isRecord(payload.rates)) return { rate: null };

  const rate = payload.rates[targetCurrency];
  return {
    rate: typeof rate === "number" && Number.isFinite(rate) ? rate : null,
  };
}

export async function fetchInlineEntityExchangeRate(
  {
    from,
    to,
  }: {
    from: string;
    to: string;
  },
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<InlineEntityExchangeRate> {
  const response = await fetchImpl(`https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const rate = parseInlineEntityExchangeRatePayload(await response.json(), to);
  if (rate.rate === null) throw new Error(`No rate for ${to}`);
  return rate;
}
