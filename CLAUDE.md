@AGENTS.md

# otracita — repo guide for AI assistants

otracita is a multi-tenant SaaS for Spanish barbershops: WhatsApp booking
bot, dashboard agenda, payments via Stripe Connect, public PWA per
barbería, AEAT VeriFactu invoicing.

Read this file end-to-end before writing code. The conventions here are
not optional — breaking them produces real customer-facing bugs.

## Tech stack

- **Next.js 16** (App Router, server actions). See `AGENTS.md` — APIs differ from training data.
- **Drizzle ORM** + **Neon Postgres** (serverless driver via `@neondatabase/serverless`).
- **Better Auth** (email/password + Google SSO) for the dashboard. PWA uses a separate phone-OTP session system in `src/lib/app-auth/`.
- **Tailwind CSS** with design tokens (`var(--color-ink)`, `--color-brand`, etc.). Never inline hex.
- **Vercel** hosting. Crons in `vercel.json`.
- **WhatsApp Cloud API** (Meta) for the bot.
- **Stripe Connect Express** for accepting payments on behalf of barbers.

## Where things live

| Area | Path |
|------|------|
| Dashboard pages | `src/app/dashboard/*` |
| Public booking PWA | `src/app/b/[slug]/*` |
| WhatsApp bot engine | `src/lib/whatsapp/engine.ts` (router) + `followup.ts` (rating/tip) |
| Booking creation pipeline | `src/lib/bookings/create.ts` (single source — bot + voice + dashboard + PWA all funnel here) |
| Availability engine | `src/lib/availability.ts` |
| VeriFactu (AEAT compliance) | `src/lib/verifactu/*` + `/legal/verifactu/page.tsx` (Declaración Responsable) |
| Loyalty (stamps/points) | `src/lib/loyalty/*` + `src/app/api/loyalty/*` |
| Promos contextuales | `src/lib/promos/*` + `src/app/api/promos/*` |
| Notification dispatcher | `src/lib/notifications/dispatch.ts` (push-or-WhatsApp, never both) |
| DB schema | `src/db/schema.ts` (single file, all tables) |
| Migrations | `drizzle/*.sql` |
| Cron jobs | `src/app/api/cron/*` (reminders, post-booking-followup, loyalty-award) |
| Admin tooling | `src/app/admin/*` (gated by `isAdminEmail` in `src/lib/auth/admin.ts`) |

## Critical conventions

### 1. Multi-tenancy — never trust the caller

Every authenticated dashboard API route MUST resolve the tenant via
`requireClientAccess(req)` from `src/lib/auth/require-client-access.ts`.
Never accept `clientId` from the request body or query — only from the
authenticated session.

Webhooks (Stripe, WhatsApp, Postmark) authenticate via signed payloads.
Cron routes use `requireCron(req)` with `CRON_SECRET`.

### 2. `bookings.price` is in EUROS, not cents

Foot-gun. Everything else (`invoices.subtotalCents`, `payments.amountCents`,
`tips.amountCents`, `loyalty` thresholds) is in **cents**. Bookings is the
exception — the price column is plain euros (e.g. `25` for €25.00).

When passing a booking price into anything else, multiply by 100. See
`computeBookingDelta` in `src/lib/loyalty/compute.ts` for the canonical
example.

### 3. Notifications: one channel per event

Use `dispatchUserNotification` from `src/lib/notifications/dispatch.ts`
for every outbound user notification (reminders, promos, confirmations).
It picks **push if the customer has the PWA installed**, **WhatsApp
otherwise** — never both. Sending both costs money (WhatsApp templates)
and vibrates the phone twice.

Bot conversational replies in `engine.ts` are NOT notifications — those
are chat-thread continuations and stay on WhatsApp regardless.

### 4. The `barbers` table is canonical, not `clients.booksyServices`

Old code stored team as a jsonb array on `clients.booksyServices`. That
column is **frozen legacy** — never read or write to it for team data.
Always query the `barbers` table (`active = true`, `displayOrder` asc).

This caused a recent bug where soft-deleted barbers reappeared in the
agenda because the old jsonb wasn't updated.

### 5. Drizzle migrations need manual cleanup

`drizzle-kit generate` produces noisy diffs that try to ADD columns
already present in DB (the snapshot is out of sync with reality on this
project). After generating, **read the SQL** and strip out anything that
isn't related to your change. Use `IF NOT EXISTS` and `DO $$ ... EXCEPTION
WHEN duplicate_object` blocks for safety.

Pattern reference: `drizzle/0014_promos_contextuales.sql`.

### 6. Apple Web Push needs `Urgency: high`

`web-push` defaults to `Urgency: normal`, which Apple silently retains
on iOS until the device is "active". Always pass `{ urgency: 'high', TTL: 3600 }`
for user-visible notifications. Already wired in `src/lib/app-auth/push.ts`.

### 7. Voice bot lives separately from the chat bot

The voice receptionist (`src/app/dashboard/voice-test/`) is **browser-test
only** today — Twilio bridge is a separate todo. Don't assume anything in
`engine.ts` runs for voice.

## Pre-commit checklist

```bash
npx tsc --noEmit                  # MUST pass
npm run lint                      # MUST pass
# tests are scoped — run only what you touched:
node --experimental-strip-types --test "src/lib/<module>/*.test.ts"
```

The user runs the dev server (`npm run dev`) themselves — never start it
from agent code.

## DB migrations workflow

1. Edit `src/db/schema.ts`
2. `npm run db:generate -- --name <descriptive_name>`
3. **Read the generated SQL** — strip noise, add `IF NOT EXISTS` guards
4. Apply locally: `psql "$DATABASE_URL" -f drizzle/<file>.sql`
5. Commit both schema + migration in same commit
6. Vercel runs migrations automatically on deploy via `db:push`? **No** — there is no migrate step on deploy. Migrations apply lazily when code first hits a missing column. Watch for runtime errors after deploy.

## Things NOT to do

- Don't add menu items to the dashboard sidebar without asking. The user
  is actively trying to reduce the menu (target: 4 top-level items).
- Don't build "configuration screens" for things that have sensible
  defaults. Hardcode + iterate. Premature config wastes design time.
- Don't write README/docs files unless explicitly asked.
- Don't start the WhatsApp bot or voice bot — Alex manages lifecycle.

## When in doubt

Read the existing similar feature first. Loyalty (`src/lib/loyalty/`)
and Promos (`src/lib/promos/`) are recent, well-structured, and follow
all the conventions above. Mirror their shape.
