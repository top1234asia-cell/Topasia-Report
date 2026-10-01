export function downloadCsv(filename: string, lines: Array<Array<string | number>>) {
  const csv = "\uFEFF" + lines.map(line => line.map(cell => {
    const raw = String(cell ?? "");
    // Prevent spreadsheet programs interpreting imported user text as formulas.
    const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(raw) && !/^-?\d+(?:\.\d+)?$/.test(raw.trim()) ? "'" + raw : raw;
    return '"' + safe.replaceAll('"', '""') + '"';
  }).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
