# otracita

Multi-tenant SaaS for Spanish barbershops. WhatsApp booking bot,
agenda dashboard, customer PWA, Stripe Connect for payments,
AEAT VeriFactu invoicing.

Production: <https://otracita.es>

---

## What it does

A barbershop signs up. We give them:

- A **WhatsApp bot** that answers their customers, books appointments,
  sends reminders, asks for ratings, and accepts cancellations.
- A **dashboard** at `/dashboard` to see the agenda, manage team and
  services, configure invoicing, and watch incoming bookings.
- A **public PWA** at `/b/<slug>` that customers can install on their
  phone — see upcoming bookings, loyalty points, get push notifications.
- **Stripe Connect** so customers can pay online (deposits, tips,
  remote charges) and the money lands in the barber's bank account.
- **VeriFactu** (Spanish AEAT compliance, RD 1007/2023) — every emitted
  invoice is hash-chained, QR-stamped, and (will be) submitted to AEAT.
- **Loyalty** — stamps or points, configurable per shop.
- **Promos contextuales** — barber clicks "Llenar huecos", we detect
  empty slots, suggest loyal customers, send a one-off discount push.

---

## Repo map

```
src/
├── app/
│   ├── api/              REST + server endpoints
│   │   ├── cron/         Vercel cron jobs (reminders, followup, loyalty)
│   │   ├── promos/       Llenar huecos: preview + send + config
│   │   ├── loyalty/      Stamps/points config + redeem + adjust
│   │   ├── verifactu/    AEAT submission (M4 — pending FNMT cert)
│   │   ├── bookings/     Create / update / cancel
│   │   └── app/          PWA endpoints (OTP login, bookings, push subs)
│   ├── dashboard/        Barber dashboard (agenda, clientes, ajustes...)
│   ├── b/[slug]/         Public PWA per barbería
│   ├── admin/            Internal admin (Alex only — gated by email)
│   ├── legal/verifactu/  Public Declaración Responsable (RD 1007/2023)
│   └── login/            Better Auth login (email/pwd + Google SSO)
│
├── lib/
│   ├── whatsapp/         Bot engine, sender, follow-up flow
│   ├── bookings/         create.ts — single booking pipeline
│   ├── availability.ts   Slot computation (per-barber + shop)
│   ├── notifications/    dispatch.ts — push-or-WhatsApp router
│   ├── verifactu/        Hash chain + XML + QR + Declaración
│   ├── loyalty/          Stamps/points engine + ledger
│   ├── promos/           Gap detection + eligible customers
│   ├── app-auth/         PWA session (phone OTP) + push subscriptions
│   └── auth/             Dashboard auth helpers + multi-tenancy guard
│
├── db/schema.ts          All Drizzle tables (single file)
└── components/           Shared UI primitives

drizzle/                  SQL migrations (numbered)
public/sw.js              Service worker (push handler)
vercel.json               Cron schedule
```

---

## Getting started

```bash
cp .env.example .env.local       # fill in secrets
npm install
npm run db:push                  # apply schema to your DB
npm run dev                      # http://localhost:3000
```

Required env vars to even boot: `DATABASE_URL`, `BETTER_AUTH_SECRET`,
`BETTER_AUTH_URL`. Everything else is per-feature (Stripe, Meta, VAPID,
OpenAI...) — see `.env.example` for the full list.

---

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | ESLint |
| `npm run test` | Node test runner over `src/**/*.test.ts` |
| `npm run db:generate -- --name <x>` | Generate a Drizzle migration |
| `npm run db:push` | Push schema changes directly (dev) |
| `npm run db:studio` | Drizzle Studio UI |

There is **no** `typecheck` script; use `npx tsc --noEmit`.

---

## Working on this codebase

- **AI assistants:** read [`CLAUDE.md`](./CLAUDE.md) — it lists the
  critical conventions and foot-guns (multi-tenancy, `bookings.price`
  in euros not cents, notification dispatcher, etc.).
- **Migrations:** `drizzle-kit generate` produces noisy diffs. After
  generating, hand-clean the SQL — keep only what's relevant to your
  change, add `IF NOT EXISTS` guards. Pattern: `drizzle/0014_promos_contextuales.sql`.
- **Pre-commit:** `npx tsc --noEmit && npm run lint` must pass.

---

## Architecture notes

- **Multi-tenant by `client_id`.** Every row outside `app_users` (which
  is global PWA identity) is scoped to a barbería.
- **Idempotency where it matters.** Stripe webhooks
  (`processed_stripe_events`), loyalty awards (unique partial index on
  `loyalty_ledger.booking_id`), email-inbound dedup.
- **VeriFactu hash chain** is append-only (`invoice_registro_events`).
  Once an invoice is hashed and chained, you don't mutate — you emit a
  rectificativa.
- **PWA push** uses Web Push + VAPID. Apple silently drops normal-urgency
  pushes on iOS — we always send `urgency: high`.

---

## Status (April 2026)

- ✅ MVP live, accepting payments via Stripe Connect.
- ✅ WhatsApp bot routing bookings end-to-end.
- ✅ PWA with push, loyalty, account.
- ✅ VeriFactu M1–M3, M5, M6 done.
- ⏳ VeriFactu M4 blocked on FNMT certificate (Alex admin task).
- ⏳ Meta WhatsApp OTP template pending approval (Alex admin task).
