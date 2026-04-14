export type ParsedSeat = {
  externalId: string;
  seatLabel: string;
  rowLabel: string | null;
  x: number;
  y: number;
  sectorCode: string;
};

function attributes(rawTag: string) {
  const attrRegex = /(\w+(?::\w+)?)="([^"]*)"/g;
  const attrs: Record<string, string> = {};
  let match: RegExpExecArray | null = attrRegex.exec(rawTag);
  while (match) {
    attrs[match[1]] = match[2];
    match = attrRegex.exec(rawTag);
  }
  return attrs;
}

export function parseSvgSeats(svg: string): ParsedSeat[] {
  const circleTags = svg.match(/<circle\b[^>]*>/g) ?? [];

  return circleTags
    .map((tag, index): ParsedSeat | null => {
      const attrs = attributes(tag);
      const cx = Number(attrs.cx ?? "0");
      const cy = Number(attrs.cy ?? "0");
      const id = attrs.id ?? `seat-${index + 1}`;
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
