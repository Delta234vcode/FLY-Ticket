import cors from "cors";
import express from "express";
import multer from "multer";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { eventInputSchema, seatPricingSchema } from "@ticket/shared";
import { prisma } from "./prisma.js";
import { parseSvgSeats } from "./svg-parser.js";
import { ensureUploadDir, uploadsRoot } from "./storage.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);

ensureUploadDir();
const upload = multer({ dest: uploadsRoot() });

app.use(cors());
app.use(express.json());

app.post("/admin/events", async (req, res) => {
  const parsed = eventInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const input = parsed.data;
  const venue = await prisma.venue.upsert({
    where: { name: input.venueName },
    update: {},
    create: { name: input.venueName },
  });

  const event = await prisma.event.create({
    data: {
      title: input.title,
      startsAt: new Date(input.startsAt),
      status: input.status,
      venueId: venue.id,
    },
    include: { venue: true },
  });

  return res.status(201).json(event);
});

app.get("/admin/events/:id", async (req, res) => {
  const event = await prisma.event.findUnique({
    where: { id: req.params.id },
    include: {
      venue: true,
      layouts: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  if (!event) {
    return res.status(404).json({ error: "Event not found" });
  }

  return res.json(event);
});

app.put("/admin/events/:id", async (req, res) => {
  const parsed = eventInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const input = parsed.data;
  const existing = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: "Event not found" });
  }

  const venue = await prisma.venue.upsert({
    where: { name: input.venueName },
    update: {},
    create: { name: input.venueName },
  });

  const updated = await prisma.event.update({
    where: { id: req.params.id },
    data: {
      title: input.title,
      startsAt: new Date(input.startsAt),
      status: input.status,
      venueId: venue.id,
    },
    include: { venue: true },
  });

  return res.json(updated);
});

app.post("/admin/events/:id/layout", upload.single("layout"), async (req, res) => {
  const eventId = req.params.id;
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) {
    return res.status(404).json({ error: "Event not found" });
  }

  if (!req.file) {
    return res.status(400).json({ error: "SVG file is required" });
  }

  const extension = path.extname(req.file.originalname).toLowerCase();
  if (extension !== ".svg") {
    return res.status(400).json({ error: "Only .svg files are supported" });
  }

  const latest = await prisma.eventLayout.findFirst({
    where: { eventId },
    orderBy: { version: "desc" },
  });

  const created = await prisma.eventLayout.create({
    data: {
      eventId,
      filePath: req.file.path,
      version: (latest?.version ?? 0) + 1,
    },
  });

  return res.status(201).json(created);
});

app.post("/admin/events/:id/seats/import-from-svg", async (req, res) => {
  const eventId = req.params.id;

  const layout = await prisma.eventLayout.findFirst({
    where: { eventId },
    orderBy: { version: "desc" },
  });

  if (!layout) {
    return res.status(404).json({ error: "No uploaded layout for event" });
  }

  const svg = await readFile(layout.filePath, "utf8");

  const parsedSeats = parseSvgSeats(svg);
  if (!parsedSeats.length) {
    return res.status(400).json({ error: "No seats found in svg circles" });
  }

  const duplicated = new Set<string>();
  const seen = new Set<string>();
  for (const seat of parsedSeats) {
    if (seen.has(seat.externalId)) duplicated.add(seat.externalId);
    seen.add(seat.externalId);
  }

  if (duplicated.size > 0) {
    return res.status(400).json({
      error: "Duplicated seat ids found",
      duplicates: Array.from(duplicated),
    });
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.seatPrice.deleteMany({ where: { seat: { eventId } } });
    await tx.seat.deleteMany({ where: { eventId } });
    await tx.sector.deleteMany({ where: { eventId } });

    const sectorMap = new Map<string, string>();

    for (const seat of parsedSeats) {
      if (!sectorMap.has(seat.sectorCode)) {
        const createdSector = await tx.sector.create({
          data: {
            eventId,
            code: seat.sectorCode,
            name: seat.sectorCode,
          },
        });
        sectorMap.set(seat.sectorCode, createdSector.id);
      }

      await tx.seat.create({
        data: {
          eventId,
          sectorId: sectorMap.get(seat.sectorCode)!,
          seatLabel: seat.seatLabel,
          rowLabel: seat.rowLabel,
          externalId: seat.externalId,
          x: seat.x,
          y: seat.y,
        },
      });
    }
  });

  return res.json({ imported: parsedSeats.length });
});

const pricingPayload = z.object({
  updates: z.array(seatPricingSchema).min(1),
  actorEmail: z.string().email().optional().default("admin@local"),
});

app.put("/admin/events/:id/seats/pricing", async (req, res) => {
  const eventId = req.params.id;
  const parsed = pricingPayload.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) {
    return res.status(404).json({ error: "Event not found" });
  }

  const { updates, actorEmail } = parsed.data;

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const update of updates) {
        const tier = await tx.priceTier.upsert({
          where: { eventId_name: { eventId, name: update.tierName } },
          update: {},
          create: { eventId, name: update.tierName },
        });

        const seats = await tx.seat.findMany({
          where: { eventId, externalId: { in: update.seatIds }, isActive: true },
        });

        if (seats.length !== update.seatIds.length) {
          throw new Error("Some seat ids are invalid or inactive");
        }

        for (const seat of seats) {
          await tx.seatPrice.upsert({
            where: { seatId: seat.id },
            update: {
              amount: update.amount,
              currency: update.currency.toUpperCase(),
              priceTierId: tier.id,
            },
            create: {
              seatId: seat.id,
              amount: update.amount,
              currency: update.currency.toUpperCase(),
              priceTierId: tier.id,
            },
          });
        }
      }

      await tx.pricingLog.create({
        data: {
          eventId,
          actorEmail,
          action: "pricing_update",
          payload: updates as unknown as object,
        },
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pricing update failed";
    return res.status(400).json({ error: message });
  }

  return res.json({ ok: true });
});

app.get("/admin/events/:id/seats", async (req, res) => {
  const eventId = req.params.id;
  const seats = await prisma.seat.findMany({
    where: { eventId },
    include: {
      sector: true,
      seatPrices: { include: { priceTier: true } },
    },
    orderBy: [{ y: "asc" }, { x: "asc" }],
  });

  const missingPrice = seats.filter((seat: (typeof seats)[number]) => !seat.seatPrices.length && seat.isActive).length;

  return res.json({
    seats,
    stats: {
      total: seats.length,
      withoutPrice: missingPrice,
    },
  });
});

app.get("/admin/events/:id/validation", async (req, res) => {
  const eventId = req.params.id;
  const seats = await prisma.seat.findMany({
    where: { eventId, isActive: true },
    include: { seatPrices: true },
  });

  const withoutPrice = seats
    .filter((seat: (typeof seats)[number]) => seat.seatPrices.length === 0)
    .map((seat: (typeof seats)[number]) => seat.externalId);
  const hasErrors = withoutPrice.length > 0;

  return res.status(hasErrors ? 422 : 200).json({
    ok: !hasErrors,
    errors: hasErrors
      ? [{ code: "UNPRICED_ACTIVE_SEATS", message: "Active seats without price", seatIds: withoutPrice }]
      : [],
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`API is running on http://localhost:${port}`);
});
