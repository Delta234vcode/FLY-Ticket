# Ticket Operator MVP (Admin)

## Stack
- `apps/admin`: Next.js admin panel
- `apps/api`: Express + Prisma API
- `packages/shared`: shared zod schemas

## Quick start
1. Copy `apps/api/.env.example` to `apps/api/.env` and configure PostgreSQL.
2. Install deps:
   - `npm install`
3. Generate Prisma client and run migration:
   - `npm run prisma:generate -w apps/api`
   - `npm run prisma:migrate -w apps/api`
4. Run services:
   - API: `npm run dev:api`
   - Admin: `npm run dev:admin`

## MVP flow
1. Create event in admin form.
2. Upload SVG with `<circle>` seats.
3. Import parsed seats from SVG.
4. Select seats and apply price tier.
5. Validate event pricing:
   - `GET /admin/events/:id/validation`

## API endpoints
- `POST /admin/events`
- `PUT /admin/events/:id`
- `GET /admin/events/:id`
- `POST /admin/events/:id/layout`
- `POST /admin/events/:id/seats/import-from-svg`
- `PUT /admin/events/:id/seats/pricing`
- `GET /admin/events/:id/seats`
- `GET /admin/events/:id/validation`

## SVG seat metadata
The parser reads each `<circle>` as a seat.
Supported attributes:
- `id` -> unique external seat id
- `cx`, `cy` -> seat coordinates
- `data-row` -> row label
- `data-seat` -> seat label
- `data-sector` -> sector code
