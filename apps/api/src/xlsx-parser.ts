import XLSX from "xlsx";

export type ParsedSheetSeat = {
  externalId: string;
  seatLabel: string;
  rowLabel: string | null;
  x: number;
  y: number;
  sectorCode: string;
  amount?: number;
  currency?: string;
  tierName?: string;
};

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/\s+/g, "").replace(/[_-]/g, "");
}

function firstValue(record: Record<string, unknown>, candidates: string[]) {
  for (const [rawKey, value] of Object.entries(record)) {
    const key = normalizeKey(rawKey);
    if (candidates.includes(key)) return value;
  }
  return undefined;
}

function asString(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asNumber(value: unknown) {
  const parsed = Number(asString(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseSeatsFromXlsx(buffer: Buffer): ParsedSheetSeat[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  const summaryLike = rows.every((row) => {
    const category = asString(firstValue(row, ["categorías", "categorias", "category", "categoría"]));
    const seats = asNumber(firstValue(row, ["seats", "qty", "count", "cantidad"]));
    return !category || Number.isFinite(seats);
  });

  if (summaryLike) {
    const generated: ParsedSheetSeat[] = [];
    let globalIndex = 0;

    for (const row of rows) {
      const category = asString(
        firstValue(row, ["categorías", "categorias", "category", "categoría"]),
      );
      const count = asNumber(firstValue(row, ["seats", "qty", "count", "cantidad"]));
      if (!category || !count || count < 1) continue;

      for (let i = 0; i < count; i += 1) {
        const seatNumber = i + 1;
        const rowNumber = Math.floor(i / 30) + 1;
        const colNumber = (i % 30) + 1;
        globalIndex += 1;
        generated.push({
          externalId: `${category}:${rowNumber}:${seatNumber}`,
          seatLabel: String(seatNumber),
          rowLabel: String(rowNumber),
          x: colNumber * 20,
          y: rowNumber * 20 + Math.floor(globalIndex / 300) * 40,
          sectorCode: category,
          tierName: category,
        });
      }
    }

    return generated;
  }

  const result: ParsedSheetSeat[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];

    const sector = asString(
      firstValue(row, ["sector", "section", "zone", "сектор", "zona", "sektor"]),
    ) || "default";
    const rowLabelRaw = asString(firstValue(row, ["row", "ryad", "ряд", "line", "рядок"]));
    const seatLabel = asString(
      firstValue(row, ["seat", "place", "number", "no", "место", "місце", "seatnumber"]),
    );

    if (!seatLabel) continue;

    const x = asNumber(firstValue(row, ["x", "coordx", "posx", "позициях"])) ?? (i % 30) * 20 + 20;
    const y = asNumber(firstValue(row, ["y", "coordy", "posy", "позицияy"])) ?? Math.floor(i / 30) * 20 + 20;
    const amount = asNumber(firstValue(row, ["price", "amount", "cost", "ціна", "цена"]));
    const currency = asString(firstValue(row, ["currency", "валюта", "curr"])) || undefined;
    const tierName = asString(firstValue(row, ["tier", "tariff", "category", "тариф", "категория"])) || undefined;

    const rowLabel = rowLabelRaw || null;
    const externalId = `${sector}:${rowLabel ?? "norow"}:${seatLabel}`;

    result.push({
      externalId,
      seatLabel,
      rowLabel,
      x,
      y,
      sectorCode: sector,
      amount,
      currency,
      tierName,
    });
  }

  return result;
}
