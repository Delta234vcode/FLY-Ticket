import { z } from "zod";

export const eventInputSchema = z.object({
  title: z.string().min(3),
  startsAt: z.string().datetime(),
  venueName: z.string().min(2),
  status: z.enum(["draft", "published"]).default("draft"),
});

export const seatPricingSchema = z.object({
  seatIds: z.array(z.string()).min(1),
  amount: z.number().positive(),
  currency: z.string().length(3).default("AMD"),
  tierName: z.string().min(2),
});

export type EventInput = z.infer<typeof eventInputSchema>;
export type SeatPricingInput = z.infer<typeof seatPricingSchema>;
