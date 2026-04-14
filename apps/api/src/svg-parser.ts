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

function parseTranslate(transform: string | undefined) {
  if (!transform) return null;
  const match = transform.match(/translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)/i);
  if (!match) return null;
  return { x: Number(match[1]), y: Number(match[2]) };
}

export function parseSvgSeats(svg: string): ParsedSeat[] {
  const seatTags = svg.match(/<([a-zA-Z][\w:-]*)\b[^>]*>/g) ?? [];

  return seatTags
    .map((tag, index): ParsedSeat | null => {
      const attrs = attributes(tag);
      const tagName = (tag.match(/^<([a-zA-Z][\w:-]*)/)?.[1] ?? "").toLowerCase();
      const translate = parseTranslate(attrs.transform);

      // Many editors export seats as circle/ellipse/rect/use with mixed-case attrs.
      let xRaw =
        attrs.cx ??
        attrs.CX ??
        attrs["sodipodi:cx"] ??
        attrs["SODIPODI:CX"] ??
        attrs.x ??
        attrs.X;
      let yRaw =
        attrs.cy ??
        attrs.CY ??
        attrs["sodipodi:cy"] ??
        attrs["SODIPODI:CY"] ??
        attrs.y ??
        attrs.Y;

      if ((tagName === "rect" || tagName === "use") && xRaw && yRaw) {
        const width = Number(attrs.width ?? attrs.WIDTH ?? "0");
        const height = Number(attrs.height ?? attrs.HEIGHT ?? "0");
        xRaw = String(Number(xRaw) + (Number.isFinite(width) ? width / 2 : 0));
        yRaw = String(Number(yRaw) + (Number.isFinite(height) ? height / 2 : 0));
      }

      if ((!xRaw || !yRaw) && translate) {
        xRaw = String(translate.x);
        yRaw = String(translate.y);
      }

      const cx = Number(xRaw ?? "0");
      const cy = Number(yRaw ?? "0");
      const id = attrs.id ?? attrs.ID ?? `seat-${index + 1}`;
      const row: string | null = attrs["data-row"] ?? attrs["data-ryad"] ?? null;
      const label = attrs["data-seat"] ?? attrs["data-place"] ?? attrs["seat"] ?? `${index + 1}`;
      const sector = attrs["data-sector"] ?? "default";
      const className = (attrs.class ?? attrs.CLASS ?? "").toLowerCase();
      const radiusHint = Number(attrs.r ?? attrs.R ?? attrs.rx ?? attrs.RX ?? attrs.ry ?? attrs.RY ?? "0");
      const looksLikeSeat =
        ["circle", "ellipse", "rect", "use"].includes(tagName) ||
        (tagName === "path" && (Boolean(attrs["sodipodi:cx"]) || radiusHint > 0)) ||
        className.includes("seat") ||
        Boolean(attrs["data-seat"] ?? attrs["data-place"] ?? attrs["seat"]);

      if (!looksLikeSeat || !Number.isFinite(cx) || !Number.isFinite(cy)) {
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
