"use client";

import { useMemo, useState } from "react";

type EventResponse = { id: string; title: string };

type Seat = {
  id: string;
  externalId: string;
  x: number;
  y: number;
  seatPrices: { amount: string; currency: string }[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function AdminPage() {
  const [eventId, setEventId] = useState<string>("");
  const [title, setTitle] = useState("Тестова подія");
  const [venueName, setVenueName] = useState("Sport Concert Complex");
  const [startsAt, setStartsAt] = useState("2026-04-23T20:00");
  const [svgFile, setSvgFile] = useState<File | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [tierName, setTierName] = useState("Standard");
  const [price, setPrice] = useState("5000");
  const [message, setMessage] = useState("");

  const pricedIds = useMemo(
    () => new Set(seats.filter((seat) => seat.seatPrices.length > 0).map((seat) => seat.externalId)),
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
            tierName,
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
      </section>

      <section className="card">
        <h2>3. Розцінка місць</h2>
        <div className="grid">
          <input value={tierName} onChange={(e) => setTierName(e.target.value)} placeholder="Тариф" />
          <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min={1} />
          <button type="button" onClick={applyPricing} disabled={!selectedSeats.length}>
            Застосувати до {selectedSeats.length} місць
          </button>
        </div>

        <svg width="1000" height="520" viewBox="0 0 1000 520">
          {seats.map((seat) => {
            const selected = selectedSeats.includes(seat.externalId);
            const priced = pricedIds.has(seat.externalId);
            const cssClass = `seat ${selected ? "selected" : ""} ${priced ? "priced" : ""}`;
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
