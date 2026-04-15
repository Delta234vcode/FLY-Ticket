"use client";

import { useEffect, useMemo, useState } from "react";

type Seat = {
  id: string;
  externalId: string;
  x: number;
  y: number;
  seatPrices: { amount: string; currency: string; priceTier?: { name: string } }[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const VIEWBOX_WIDTH = 1000;
const VIEWBOX_HEIGHT = 520;

function decodeTierColor(rawName: string | undefined) {
  if (!rawName) return null;
  const parts = rawName.split("__");
  const maybeColor = parts.at(-1) ?? "";
  if (/^#[0-9a-f]{6}$/i.test(maybeColor)) return maybeColor;
  return null;
}

function encodeTier(name: string, color: string) {
  return `${name}__${color.toLowerCase()}`;
}

export default function PricingEditorPage() {
  const [eventId, setEventId] = useState("");
  const [seats, setSeats] = useState<Seat[]>([]);
  const [tierName, setTierName] = useState("Standard");
  const [tierColor, setTierColor] = useState("#7f699b");
  const [price, setPrice] = useState("5000");
  const [message, setMessage] = useState("Оберіть тариф, ціну й клікайте по місцях.");
  const [isSavingSeatId, setIsSavingSeatId] = useState<string | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    setEventId(searchParams.get("eventId") ?? "");
  }, []);

  async function refreshSeats(currentEventId: string) {
    if (!currentEventId) return;
    const response = await fetch(`${API_URL}/admin/events/${currentEventId}/seats`);
    if (!response.ok) return;
    const payload = await response.json();
    setSeats(payload.seats);
  }

  useEffect(() => {
    void refreshSeats(eventId);
  }, [eventId]);

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

  async function applySeatPrice(seat: Seat) {
    if (!eventId) {
      setMessage("Відсутній eventId. Відкрийте редактор із адмінки після імпорту.");
      return;
    }

    const amount = Number(price);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Введіть коректну ціну більше 0.");
      return;
    }

    setIsSavingSeatId(seat.id);
    const response = await fetch(`${API_URL}/admin/events/${eventId}/seats/pricing`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actorEmail: "admin@local",
        updates: [
          {
            seatIds: [seat.externalId],
            amount,
            currency: "AMD",
            tierName: encodeTier(tierName, tierColor),
          },
        ],
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setMessage(payload?.error ?? "Не вдалося застосувати ціну до місця.");
      setIsSavingSeatId(null);
      return;
    }

    setSeats((prev) =>
      prev.map((current) =>
        current.id === seat.id
          ? {
              ...current,
              seatPrices: [{ amount: String(amount), currency: "AMD", priceTier: { name: encodeTier(tierName, tierColor) } }],
            }
          : current,
      ),
    );
    setMessage(`Збережено ${amount} AMD для ${seat.externalId}`);
    setIsSavingSeatId(null);
  }

  return (
    <main>
      <h1 className="title">Seat Pricing Editor</h1>
      <section className="card">
        <h2>Швидка розцінка по кліку</h2>
        <div className="grid">
          <input value={eventId} onChange={(e) => setEventId(e.target.value)} placeholder="Event ID" />
          <input value={tierName} onChange={(e) => setTierName(e.target.value)} placeholder="Тариф" />
          <input value={tierColor} onChange={(e) => setTierColor(e.target.value)} type="color" title="Колір тарифу" />
          <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min={1} placeholder="Ціна (AMD)" />
          <button type="button" onClick={() => void refreshSeats(eventId)} disabled={!eventId}>
            Оновити місця
          </button>
        </div>
      </section>

      <section className="card">
        <div className="layout-editor">
          <svg width="1000" height="520" viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}>
            {seats.map((seat) => {
              const pricedColor = pricedColors.get(seat.externalId);
              const priceHint = seat.seatPrices.length
                ? `${seat.seatPrices[0].amount} ${seat.seatPrices[0].currency}`
                : "Без ціни";

              return (
                <circle
                  key={seat.id}
                  className={`seat ${isSavingSeatId === seat.id ? "saving" : ""} ${pricedColor ? "priced" : ""}`}
                  cx={seat.x}
                  cy={seat.y}
                  r={6}
                  style={pricedColor ? { fill: pricedColor } : undefined}
                  onClick={() => void applySeatPrice(seat)}
                >
                  <title>{`${seat.externalId} | ${priceHint}`}</title>
                </circle>
              );
            })}
          </svg>
        </div>
        {message && <p className="status">{message}</p>}
      </section>
    </main>
  );
}
