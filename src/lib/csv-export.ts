/**
 * Client-safe CSV export (no Node/mongodb dependencies).
 * Use this from Client Components. For server-only utils see @/lib/utils.
 */

function escapeCsvCell(cell: string | number): string {
  const s = String(cell);
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Build CSV string from headers and rows, then trigger download.
 */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number)[][]
): void {
  const line = (row: (string | number)[]) => row.map(escapeCsvCell).join(",");
  const csv = [line(headers), ...rows.map(line)].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
