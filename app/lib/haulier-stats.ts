export const truckCategories = ["SIDE LOADER", "SIDE LOADER WAITING", "WAITING FINISH", "POTONG TRAILER"] as const;
export type HaulierRecord = { haulier?: string; truckType?: string; deliveryTime?: string; date?: string; status?: string; cancelledAt?: string };

export function deliveryMonth(record: HaulierRecord): string | null {
  const value = (record.deliveryTime || record.date || "").trim();
  const iso = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\D|$)/);
  const local = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\D|$)/);
  if (!iso && !local) return null;
  const year = Number(iso?.[1] || local?.[3]);
  const month = Number(iso?.[2] || local?.[2]);
  const day = Number(iso?.[3] || local?.[1]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function summarizeHauliers(records: HaulierRecord[]) {
  const totals = new Map<string, Map<string, Map<string, number>>>();
  for (const record of records) {
    const haulier = (record.haulier || "").trim();
    if (!haulier || record.cancelledAt || record.status === "已取消") continue;
    const month = deliveryMonth(record) || "undated";
    const category = (record.truckType || "").trim().toUpperCase() || "未分类";
    const hauliers = totals.get(month) || new Map<string, Map<string, number>>();
    const categories = hauliers.get(haulier) || new Map<string, number>();
    categories.set(category, (categories.get(category) || 0) + 1);
    hauliers.set(haulier, categories);
    totals.set(month, hauliers);
  }
  return [...totals].sort(([a], [b]) => a === "undated" ? 1 : b === "undated" ? -1 : b.localeCompare(a))
    .map(([month, hauliers]) => {
      const extras = new Set<string>();
      for (const counts of hauliers.values()) for (const category of counts.keys()) if (!truckCategories.includes(category as typeof truckCategories[number]) && category !== "未分类") extras.add(category);
      const categories = [...truckCategories, ...[...extras].sort(), "未分类"];
      const rows = [...hauliers].map(([name, counts]) => ({ name, count: [...counts.values()].reduce((sum, count) => sum + count, 0), categories: Object.fromEntries(categories.map(category => [category, counts.get(category) || 0])) }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      return { month, total: rows.reduce((sum, row) => sum + row.count, 0), categories, hauliers: rows };
    });
}
