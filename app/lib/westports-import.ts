export type WestportsTimes = { booking: string; gateOpen: string; cutoff: string };

function parseRows(input: string): string[][] {
  if (input.includes("\t") && !input.includes('"')) return input.trim().split(/\r?\n/).map(line => line.split("\t").map(value => value.trim()));
  const rows: string[][] = []; let cells: string[] = [], current = "", quoted = false;
  for (let i = 0; i < input.length; i++) {
    const character = input[i];
    if (character === '"') {
      if (quoted && input[i + 1] === '"') { current += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (character === "," || character === "\t" || character === "\n" || character === "\r")) {
      if (character === "," || character === "\t") { cells.push(current.trim()); current = ""; }
      else if (character === "\n" || input[i + 1] !== "\n") { cells.push(current.trim()); rows.push(cells); cells = []; current = ""; }
    } else current += character;
  }
  if (current || cells.length) { cells.push(current.trim()); rows.push(cells); }
  return rows.filter(row => row.some(Boolean));
}

const normalize = (value: string) => value.replace(/\s+/g, "").replace(/[^a-z0-9]/gi, "").toUpperCase();
export const bookingMatches = (actual: string, expected: string) => normalize(actual) === normalize(expected);
export function westportsRangeValid(opening: string, closing: string, allowDateOnly = false): boolean {
  if (!westportsDate(opening, allowDateOnly) || !westportsDate(closing)) return false;
  const toTime = (value: string) => { const [date, time = "00:00"] = value.split(" "); const [d, m, y] = date.split("/").map(Number); return Date.UTC(y, m - 1, d, ...time.split(":").map(Number)); };
  return toTime(opening) <= toTime(closing);
}

export function westportsDate(value: string, allowDateOnly = false): string | null {
  const text = value.trim();
  if (allowDateOnly && /^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4})$/.test(text)) {
    const normalized = text.includes("-") ? text.replace(/^(\d{4})-(\d{1,2})-(\d{1,2})$/, "$3/$2/$1") : text;
    const parsed = westportsDate(normalized + " 00:00");
    return parsed?.split(" ")[0] || null;
  }
  const local = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!local && !iso) return null;
  const [, day, month, year, hour, minute] = local ? local.map(Number) : [0, Number(iso![3]), Number(iso![2]), Number(iso![1]), Number(iso![4]), Number(iso![5])];
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || hour > 23 || minute > 59) return null;
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function parseWestportsBooking(input: string, expectedBooking: string): WestportsTimes | null {
  const rows = parseRows(input.replace(/^\uFEFF/, ""));
  const header = rows.findIndex(row => row.some(value => normalize(value) === "BOOKINGNO") &&
    row.some(value => normalize(value).includes("YARDOPENINGTIME")) && row.some(value => normalize(value).includes("YARDCLOSINGTIME")));
  const headers = rows[header] || [];
  const field = (match: (value: string) => boolean) => headers.findIndex(value => match(normalize(value)));
  const bookingIndex = header >= 0 ? field(value => value === "BOOKINGNO") : 0;
  const openingIndex = header >= 0 ? field(value => value.includes("YARDOPENINGTIME")) : 14;
  const closingIndex = header >= 0 ? field(value => value.includes("YARDCLOSINGTIME")) : 13;
  if (bookingIndex < 0 || openingIndex < 0 || closingIndex < 0) return null;
  const matches = (header < 0 ? rows : rows.slice(header + 1)).filter(row => bookingMatches(row[bookingIndex] || "", expectedBooking));
  if (matches.length !== 1) return null;
  const row = matches[0];
  const gateOpen = westportsDate(row[openingIndex] || ""), cutoff = westportsDate(row[closingIndex] || "");
  if (!gateOpen || !cutoff) return null;
  if (!westportsRangeValid(gateOpen, cutoff)) return null;
  return { booking: row[bookingIndex].trim(), gateOpen, cutoff };
}

export function parseNorthportBooking(input: string, expectedBooking: string): WestportsTimes | null {
  const booking = input.match(/Booking\s+Reference\s*[:：]?\s*([A-Za-z0-9][A-Za-z0-9/-]*)/i)?.[1];
  const opening = input.match(/Gate\s*[-–]?\s*Open\s*[:：]?\s*(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1];
  const closing = input.match(/Gate\s*[-–]?\s*Cutoff\s*[:：]?\s*(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2})/i);
  if (!booking || !bookingMatches(booking, expectedBooking) || !opening || !closing) return null;
  const gateOpen = westportsDate(opening, true), cutoff = westportsDate(`${closing[1]} ${closing[2]}`);
  if (!gateOpen || !cutoff || !westportsRangeValid(gateOpen, cutoff, true)) return null;
  return { booking, gateOpen, cutoff };
}
