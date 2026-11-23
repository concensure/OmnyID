/** Return a portable telephone URI while leaving visible formatting to the UI. */
export function phoneTelHref(value: string | null | undefined): string | null {
  const compact = (value ?? "").replace(/[^+\d]/g, "");
  if (!compact || (compact.match(/\+/g)?.length ?? 0) > 1 || (compact.includes("+") && !compact.startsWith("+"))) return null;
  const normalized = /^0\d{9}$/.test(compact)
    ? `+61${compact.slice(1)}`
    : /^61\d{9}$/.test(compact)
      ? `+${compact}`
      : compact;
  return /^\+\d{8,15}$/.test(normalized) ? `tel:${normalized}` : null;
}
