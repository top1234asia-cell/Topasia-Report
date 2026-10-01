/** Calculate the next calendar date from a port cutoff, independent of browser timezone. */
export function etaFromCutoff(cutoff: string): string {
  const input = cutoff.trim();
  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/.exec(input);
  const dayFirst = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[T\s].*)?$/.exec(input);
  if (!iso && !dayFirst) return "";
  const year = Number((iso || dayFirst)![iso ? 1 : 3]);
  const month = Number((iso || dayFirst)![2]);
  const day = Number((iso || dayFirst)![iso ? 3 : 1]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  date.setUTCDate(date.getUTCDate() + 1);
  return `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
