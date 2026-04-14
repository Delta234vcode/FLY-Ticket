export type ParsedSeat = {
  externalId: string;
  seatLabel: string;
  rowLabel: string | null;
  x: number;
  y: number;
  sectorCode: string;
};

function attributes(rawTag: string) {
  const attrRegex = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  const attrs: Record<string, string> = {};
  let match: RegExpExecArray | null = attrRegex.exec(rawTag);
  while (match) {
    attrs[match[1]] = match[2] ?? match[3] ?? "";
    match = attrRegex.exec(rawTag);
  }
  return attrs;
}

export function parseSvgSeats(svg: string): ParsedSeat[] {
  const seatTags = [
    ...(svg.match(/<circle\b[^>]*>/gi) ?? []),
    ...(svg.match(/<ellipse\b[^>]*>/gi) ?? []),
  ];

  return seatTags
    .map((tag, index): ParsedSeat | null => {
      const attrs = attributes(tag);
      // Many editors export single-quoted attrs or uppercase tags.
      const cx = Number(attrs.cx ?? attrs.CX ?? "0");
      const cy = Number(attrs.cy ?? attrs.CY ?? "0");
      const id = attrs.id ?? attrs.ID ?? `seat-${index + 1}`;
      const row: string | null = attrs["data-row"] ?? null;
      const label = attrs["data-seat"] ?? `${index + 1}`;
      const sector = attrs["data-sector"] ?? "default";

      if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
        return null;
      }

      return {
        externalId: id,
        seatLabel: label,
        rowLabel: row,
        x: cx,
        y: cy,
        sectorCode: sector,
      };
    })
    .filter((seat): seat is ParsedSeat => seat !== null);
}
