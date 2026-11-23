// @locs-version: 1.0
export type DatabaseExportRow = { id: string; table: string; data: Record<string, unknown> };

export type DatabaseExportSnapshot = {
  databaseId: string;
  name: string;
  tableLabel: string;
  columns: string[];
  rows: Array<{ id: string; table: string; values: string[] }>;
  generatedAt: string;
  truncated: boolean;
};

const clean = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(clean).filter(Boolean).join(" · ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).replace(/\s+/g, " ").trim();
};

const escapeHtml = (value: string): string => value
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export function buildDatabaseExportSnapshot(input: {
  databaseId: string;
  name: string;
  tableLabel?: string | null;
  columns: string[];
  rows: DatabaseExportRow[];
  generatedAt?: string;
  limit?: number;
}): DatabaseExportSnapshot {
  const columns = input.columns.slice(0, 12);
  const limit = Math.max(1, Math.min(input.limit ?? 100, 250));
  return {
    databaseId: input.databaseId,
    name: input.name.trim() || "Database",
    tableLabel: input.tableLabel?.trim() || "All tables",
    columns,
    rows: input.rows.slice(0, limit).map((row) => ({
      id: row.id,
      table: row.table,
      values: columns.map((column) => clean(row.data[column])),
    })),
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    truncated: input.rows.length > limit,
  };
}

export function databaseSnapshotHtml(snapshot: DatabaseExportSnapshot): string {
  const headings = ["Table", ...snapshot.columns].map((label) => `<th>${escapeHtml(label)}</th>`).join("");
  const rows = snapshot.rows.map((row) => `<tr><td>${escapeHtml(row.table)}</td>${row.values.map((value) => `<td>${escapeHtml(value || "—")}</td>`).join("")}</tr>`).join("");
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><title>${escapeHtml(snapshot.name)}</title><style>body{font:14px system-ui;margin:28px;color:#17201d}h1{font-size:24px}p{color:#53615c}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #cfd8d4;padding:8px;text-align:left;vertical-align:top}th{background:#edf5f1}@media print{body{margin:12mm}}</style></head><body><h1>${escapeHtml(snapshot.name)}</h1><p>${escapeHtml(snapshot.tableLabel)} · exported ${escapeHtml(new Date(snapshot.generatedAt).toLocaleString("en-AU"))}</p><table><thead><tr>${headings}</tr></thead><tbody>${rows}</tbody></table>${snapshot.truncated ? "<p>Only the first 100 rows are included in this share.</p>" : ""}</body></html>`;
}

export function databaseSnapshotSvg(snapshot: DatabaseExportSnapshot): string {
  const columns = ["Table", ...snapshot.columns.slice(0, 5)];
  const rows = snapshot.rows.slice(0, 24);
  const width = 1440;
  const cellWidth = width / columns.length;
  const height = 126 + (rows.length + 1) * 42;
  const text = (value: string, max = 27) => escapeHtml(value.length > max ? `${value.slice(0, max - 1)}…` : value);
  const header = columns.map((label, index) => `<text x="${index * cellWidth + 12}" y="112" font-weight="700">${text(label)}</text>`).join("");
  const body = rows.map((row, rowIndex) => {
    const values = [row.table, ...row.values.slice(0, 5)];
    const y = 148 + rowIndex * 42;
    return `<rect x="0" y="${y - 25}" width="${width}" height="42" fill="${rowIndex % 2 ? "#f8fbf9" : "#ffffff"}"/>${values.map((value, index) => `<text x="${index * cellWidth + 12}" y="${y}" fill="#26352f">${text(value || "—")}</text>`).join("")}`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f4f8f6"/><text x="24" y="38" font-family="system-ui" font-size="26" font-weight="700" fill="#143d32">${text(snapshot.name, 70)}</text><text x="24" y="68" font-family="system-ui" font-size="14" fill="#53615c">${text(snapshot.tableLabel, 80)}</text><rect x="0" y="82" width="${width}" height="42" fill="#dcece5"/><g font-family="system-ui" font-size="14" fill="#143d32">${header}${body}</g></svg>`;
}

export function databaseSnapshotEmailBody(snapshot: DatabaseExportSnapshot): string {
  const lines = snapshot.rows.slice(0, 20).map((row) => {
    const details = snapshot.columns.map((column, index) => `${column}: ${row.values[index] || "—"}`).join("; ");
    return `- ${row.table}: ${details}`;
  });
  return [`${snapshot.name} — ${snapshot.tableLabel}`, "", ...lines, snapshot.truncated ? "" : null, snapshot.truncated ? "This is a bounded preview; open the source database for the complete view." : null].filter((value): value is string => value !== null).join("\n");
}
