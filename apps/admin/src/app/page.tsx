"use client";

import { useMemo, useState } from "react";

type EventResponse = { id: string; title: string };

type Seat = {
  id: string;
  externalId: string;
  x: number;
  y: number;
  seatPrices: { amount: string; currency: string; priceTier?: { name: string } }[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function AdminPage() {
  const [eventId, setEventId] = useState<string>("");
  const [title, setTitle] = useState("Тестова подія");
  const [venueName, setVenueName] = useState("Sport Concert Complex");
  const [startsAt, setStartsAt] = useState("2026-04-23T20:00");
  const [svgFile, setSvgFile] = useState<File | null>(null);
  const [xlsxFile, setXlsxFile] = useState<File | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [tierName, setTierName] = useState("Standard");
  const [tierColor, setTierColor] = useState("#1f8dff");
  const [price, setPrice] = useState("5000");
  const [message, setMessage] = useState("");

  function encodeTier(name: string, color: string) {
    return `${name}__${color.toLowerCase()}`;
  }

  function decodeTierColor(rawName: string | undefined) {
    if (!rawName) return null;
    const parts = rawName.split("__");
    const maybeColor = parts.at(-1) ?? "";
    if (/^#[0-9a-f]{6}$/i.test(maybeColor)) return maybeColor;
    return null;
  }

  const pricedColors = useMemo(
    () =>
      new Map(
        seats
          .filter((seat) => seat.seatPrices.length > 0)
          .map((seat) => [
            seat.externalId,
            decodeTierColor(seat.seatPrices[0].priceTier?.name) ?? "#0b72e1",
          ]),
      ),
    [seats],
  );

  async function createEvent() {
    const response = await fetch(`${API_URL}/admin/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        startsAt: new Date(startsAt).toISOString(),
        venueName,
        status: "draft",
      }),
    });

    if (!response.ok) {
      setMessage("Не вдалося створити подію");
      return;
    }

    const created = (await response.json()) as EventResponse;
    setEventId(created.id);
    setMessage(`Подію створено: ${created.title}`);
  }

  async function updateEvent() {
    if (!eventId) return;
    const response = await fetch(`${API_URL}/admin/events/${eventId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        startsAt: new Date(startsAt).toISOString(),
        venueName,
        status: "draft",
      }),
    });

    setMessage(response.ok ? "Подію оновлено" : "Не вдалося оновити подію");
  }

  async function uploadSvg() {
    if (!eventId || !svgFile) return;
    const form = new FormData();
    form.append("layout", svgFile);

    const uploadResponse = await fetch(`${API_URL}/admin/events/${eventId}/layout`, {
      method: "POST",
      body: form,
    });

    if (!uploadResponse.ok) {
      const payload = await uploadResponse.json().catch(() => null);
      setMessage(payload?.error ?? "Помилка завантаження SVG");
      return;
    }

    const importResponse = await fetch(`${API_URL}/admin/events/${eventId}/seats/import-from-svg`, {
      method: "POST",
    });

    if (!importResponse.ok) {
      const payload = await importResponse.json().catch(() => null);
      setMessage(payload?.error ?? "Помилка імпорту місць з SVG");
      return;
    }

    await refreshSeats();
    setMessage("SVG імпортовано");
  }

  async function refreshSeats() {
    if (!eventId) return;
    const response = await fetch(`${API_URL}/admin/events/${eventId}/seats`);
    if (!response.ok) return;
    const payload = await response.json();
    setSeats(payload.seats);
  }

  async function importXlsx() {
    if (!eventId || !xlsxFile) return;
    const form = new FormData();
    form.append("sheet", xlsxFile);

    const response = await fetch(`${API_URL}/admin/events/${eventId}/seats/import-from-xlsx`, {
      method: "POST",
      body: form,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setMessage(payload?.error ?? "Помилка імпорту місць з XLSX");
      return;
    }

    await refreshSeats();
    setMessage("XLSX імпортовано");
  }

  async function applyPricing() {
    if (!eventId || !selectedSeats.length) return;

    const response = await fetch(`${API_URL}/admin/events/${eventId}/seats/pricing`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actorEmail: "admin@local",
        updates: [
          {
            seatIds: selectedSeats,
            amount: Number(price),
            currency: "AMD",
            tierName: encodeTier(tierName, tierColor),
          },
        ],
      }),
    });

    if (!response.ok) {
      setMessage("Не вдалося зберегти ціну");
      return;
    }

    setSelectedSeats([]);
    await refreshSeats();
    setMessage("Ціну збережено");
  }

  function toggleSeat(externalId: string) {
    setSelectedSeats((prev) =>
      prev.includes(externalId) ? prev.filter((id) => id !== externalId) : [...prev, externalId],
    );
  }

  return (
    <main>
      <h1 className="title">Ticket Operator Admin MVP</h1>

      <section className="card">
        <h2>1. Створити/редагувати подію</h2>
        <div className="grid">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Назва події" required />
          <input value={venueName} onChange={(e) => setVenueName(e.target.value)} placeholder="Майданчик" required />
          <input
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            type="datetime-local"
            required
          />
          <button type="button" onClick={createEvent}>Створити</button>
          <button type="button" onClick={updateEvent} disabled={!eventId}>Оновити</button>
        </div>
        {eventId && <p>Event ID: {eventId}</p>}
      </section>

      <section className="card">
        <h2>2. Завантажити SVG схему</h2>
        <div className="grid">
          <input
            type="file"
            accept=".svg"
            onChange={(e) => setSvgFile(e.target.files?.[0] ?? null)}
          />
          <button type="button" onClick={uploadSvg} disabled={!eventId || !svgFile}>
            Upload + Import
          </button>
          <button type="button" onClick={refreshSeats} disabled={!eventId}>
            Оновити місця
          </button>
        </div>
        <div className="grid" style={{ marginTop: "10px" }}>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setXlsxFile(e.target.files?.[0] ?? null)}
          />
          <button type="button" onClick={importXlsx} disabled={!eventId || !xlsxFile}>
            Import XLSX
          </button>
        </div>
      </section>

      <section className="card">
        <h2>3. Розцінка місць</h2>
        <div className="grid">
          <input value={tierName} onChange={(e) => setTierName(e.target.value)} placeholder="Тариф" />
          <input
            value={tierColor}
            onChange={(e) => setTierColor(e.target.value)}
            type="color"
            title="Колір тарифу"
          />
          <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min={1} />
          <button type="button" onClick={applyPricing} disabled={!selectedSeats.length}>
            Застосувати до {selectedSeats.length} місць
          </button>
        </div>

        <svg width="1000" height="520" viewBox="0 0 1000 520">
          {seats.map((seat) => {
            const selected = selectedSeats.includes(seat.externalId);
            const pricedColor = pricedColors.get(seat.externalId);
            const cssClass = `seat ${selected ? "selected" : ""} ${pricedColor ? "priced" : ""}`;
            const priceHint = seat.seatPrices.length
              ? `${seat.seatPrices[0].amount} ${seat.seatPrices[0].currency}`
              : "Без ціни";

            return (
              <circle
                key={seat.id}
                className={cssClass}
                cx={seat.x}
                cy={seat.y}
                r={6}
                style={pricedColor ? { fill: pricedColor } : undefined}
                onClick={() => toggleSeat(seat.externalId)}
              >
                <title>{`${seat.externalId} | ${priceHint}`}</title>
              </circle>
            );
          })}
        </svg>
      </section>

      {message && <p className="status">{message}</p>}
    </main>
  );
}
