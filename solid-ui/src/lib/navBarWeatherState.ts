// @locs-version: 1.0
export type NavBarWeatherState = {
  code: number;
  temp: number;
  humidity?: number;
  windspeed?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseNavBarWeatherResponse(payload: unknown): NavBarWeatherState | null {
  if (!isRecord(payload) || !isRecord(payload.current)) return null;

  const code = finiteNumber(payload.current.weathercode);
  const temp = finiteNumber(payload.current.temperature_2m);
  if (code === null || temp === null) return null;

  const humidity = finiteNumber(payload.current.relativehumidity_2m);
  const windspeed = finiteNumber(payload.current.windspeed_10m);

  return {
    code,
    temp: Math.round(temp),
    ...(humidity !== null ? { humidity } : {}),
    ...(windspeed !== null ? { windspeed: Math.round(windspeed) } : {}),
  };
}
