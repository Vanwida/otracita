# PROJECT_CONTEXT — otracita

> **For the AI assistant**: everything relevant about this project lives here.
> Keep it up to date as work progresses.

---

## What this is

**otracita** (otracita.es) is a WhatsApp chatbot SaaS for barbershops in Spain.

**Tagline**: *Que no se te escape otra cita.*

**Value prop**: the AI receptionist that answers WhatsApp 24/7, closes reservations on its own, and syncs them with the barbershop's existing Booksy.

**Target market**: Spanish barberías (Barcelona first). Spain-only for now — hence `.es` domain. Later could expand to LATAM, but not now.

**Current brand** (3rd iteration):
- v1: *Reserva* — internal codename, never shipped
- v2: *Agendalo* — shipped at `agendalo.aistudios.pro` until 2026-04-20
- v3: **otracita** — current, at `otracita.es`

---

## Status (2026-04-20)

- ✅ MVP live on production at `agendalo.aistudios.pro` AND `otracita.es` (DNS propagating)
- ✅ Security hardened (HMAC signatures, multi-tenancy, URL validation, migrations baseline)
- ✅ Full rebrand to otracita (light theme, terracotta/cream palette, Fraunces+Inter)
- ✅ Hero video rendered with HyperFrames, on landing
- ⏳ Booksy email sync: code done, no email service attached
- ⏳ Voice bot: prototype works in browser, Twilio bridge pending
- ⏳ **0 paying clients** — biggest open item

---

## Tech stack

| Layer | Tool |
|---|---|
| Framework | Next.js 16 (breaking changes — see `AGENTS.md`) |
| Deploy | Vercel, project `vanwidas-projects/reserva` |
| DB | Neon Postgres `reserva-aistudios` |
| ORM | Drizzle with versioned migrations (baseline 0000) |
| Auth | Better Auth (self-hosted in Postgres) |
| Messaging | Meta WhatsApp Cloud API (direct, no BSP) |
| AI | OpenAI GPT-4o-mini for intent · xAI Grok Realtime for voice |
| Payments | Stripe (checkout → account creation → dashboard) |
| Calendar | Google Calendar API (legacy, per-client flag `useDbAvailability`) |

---

## Brand system

| Token | Value | Use |
|---|---|---|
| `--color-brand` | `#C9653C` | Terracotta — primary actions, accents |
| `--color-canvas` | `#F7F3EE` | Bone white — page background |
| `--color-ink` | `#2A1D14` | Espresso — primary text |
| `--color-gold` | `#D4A574` | Muted gold — premium highlights |
| `--color-success` | `#5E8B6B` | Sage green |
| Display font | **Fraunces** (next/font) | Headings, wordmark |
| Body font | **Inter** (next/font) | Paragraphs, UI |

Vibe: modern Spanish artisan. NOT Silicon Valley tech. Warm, confident, unashamed of being Spanish-first. Light theme everywhere (including sidebar — no dark per user).

---

## Key files

| Path | Purpose |
|---|---|
| `src/app/page.tsx` | Landing page |
| `src/app/layout.tsx` | Root + metadata + fonts |
| `src/app/globals.css` | Brand tokens + utilities |
| `src/app/dashboard/*` | Authed dashboard |
| `src/app/api/whatsapp/route.ts` | Meta webhook (HMAC verified) |
| `src/app/api/email/inbound/route.ts` | Inbound email webhook (body shape from initial Postmark iteration; production will wire this behind Gmail API + Pub/Sub push — NO Postmark contract) |
| `src/app/api/scrape-booksy/route.ts` | Booksy page extractor (auth-gated) |
| `src/lib/whatsapp/engine.ts` | Bot conversation engine (~2200 lines — refactor TODO) |
| `src/lib/auth/require-client-access.ts` | Multi-tenancy guard used by all tenant APIs |
| `src/lib/booksy-email-parser.ts` | Parses Booksy confirmation emails |
| `src/db/schema.ts` | Drizzle schema (clients, bookings, conversations, etc.) |
| `drizzle/` | SQL migrations — see `docs/migrations.md` for workflow |
| `public/hero.mp4` | Landing hero video, rendered from `/otracita-hero-video/` |

---

## Hero video (HyperFrames)

Source lives OUTSIDE the project at `../otracita-hero-video/`.

**Re-render workflow:**
```bash
cd ../otracita-hero-video
# edit index.html
npx hyperframes lint
npx hyperframes render
cp renders/<latest>.mp4 ../reserva/public/hero.mp4
```

12-second composition: title → phone chat mockup → agenda filling → logo reveal. Autoplay muted loop on landing.

---

## Deploy workflow

Vercel is **not** connected to GitHub — always deploy manually:

```bash
cd /Users/alexsolecarretero/Public/projects/alex-freelance/reserva
source ~/.openclaw/credentials/vanwida-tokens.env
npx vercel deploy --prod --token="$VERCEL_TOKEN"
```

Commits MUST use author `vanwida@aistudios.pro` / `Vanwida`.

**Rollback** if bad deploy: `npx vercel rollback --token=$VERCEL_TOKEN`.

---

## External accounts

| Service | What for | Where to find creds |
|---|---|---|
| Vercel | Deploy | `~/.openclaw/credentials/vanwida-tokens.env` (`VERCEL_TOKEN`) |
| GoDaddy | DNS for otracita.es | Alex's personal GoDaddy |
| Meta Business | WhatsApp Cloud API | App ID 2437648270030506 |
| Neon | Postgres | `DATABASE_URL` in Vercel |
| Google Cloud | Calendar API service account | `GOOGLE_SERVICE_ACCOUNT_KEY` in Vercel |
| xAI | Grok Realtime (voice) | `XAI_API_KEY` in Vercel |
| OpenAI | GPT-4o-mini | `OPENAI_API_KEY` in Vercel |
| Stripe | Payments | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` in Vercel |

---

## Pricing

**One plan only**: 29€/mes — WhatsApp AI Bot (29€ launch, 39€ normal).

Features included: 24/7 responses, Booksy sync, bilingual ES/EN, cancel in 1 click, no lock-in.

Ads tier was removed from the main pricing — will live on a separate Vanwida landing when it comes.

---

## Open items by priority

| # | Item | Why |
|---|---|---|
| 1 | **Get 3 paying pilot clients** | Nothing else matters until this is real |
| 2 | Activate Booksy email sync via Gmail API + Pub/Sub (free, Google Cloud already configured for Calendar) | Once first client onboards |
| 3 | Twilio bridge for voice bot (Railway ~$5/mo) | Only after biz validation |
| 4 | Separate landing for Ads service | When ready to offer as upsell |
| 5 | Passive Booksy email parse-rate monitor | Once emails flow |
| 6 | GitHub repo rename from `agendalo` to `otracita` | Cosmetic |
| 7 | Refactor `src/lib/whatsapp/engine.ts` (~2200 lines) | Tech debt |
| 8 | Voice bot → Go microservice | Future TODO, after biz validation — see memory |

---

## Stripe account structure

otracita shares **one Stripe account** with Alex's other projects:
- Account: `acct_1T41xuBnAKM0wJqO` (aistudios.pro · `vanwida@aistudios.pro`)
- Standard account, ES, EUR
- Own account capabilities `card_payments: active`, `transfers: active` (for
  direct charges on the platform's own products like subscriptions)
- **Connect platform signup complete** (2026-04-22) — `accounts.create`
  for Express barbers now succeeds. Cobros online y propinas operativos
  a nivel infra.

**Decision log (2026-04-21)**: considered splitting into a dedicated otracita
account under a Vanwida organization. Declined — keeping everything in
`aistudios.pro` for operational simplicity. Known trade-off: when a barber
goes through Stripe Connect Express onboarding, the platform name shown is
"aistudios.pro", not "otracita". Acceptable for MVP. Revisit if/when
otracita becomes its own legal entity.

## Non-negotiables

- **Spanish-first**: all user-facing copy in Spanish (or bilingual ES/EN for the bot itself)
- **Light theme only**: no dark surfaces anywhere (including `/admin`)
- **No fake numbers**: never claim user counts or review counts the product doesn't have
- **Author all commits** as `vanwida@aistudios.pro`
- **Don't deploy without explicit OK** from Alex — production is real money risk

## Booking ↔ invoice state matrix (fiscal correctness)

Whenever a booking transitions state, the invoice side must be considered.
Missing a transition leaks into the `libro de facturas` and distorts
Modelo 303 filings.

| `bookings.status` | Invoice action |
|---|---|
| `confirmed` (create) | Auto-generate invoice if `invoicingEnabled` AND `price != null` (via `tryAutoInvoiceInBackground` in `/api/bookings/create` and `/api/email/inbound`) |
| `completed` | Invoice stays `issued` (customer paid) |
| `cancelled` | Void associated invoice (`tryVoidInvoicesInBackground` in `/api/email/inbound` Booksy cancel + anywhere a cancel server action runs) |
| `no_show` | Void associated invoice (`/api/bookings/no-show`) — customer didn't pay |
| undo from `no_show` → `confirmed` | Restore invoice `status = 'issued'` (MVP; strictly a rectificativa should be issued instead — see lesson below) |

**Rule**: anytime you add a new booking-status transition, update this table
AND make sure the API route touches invoices correctly. The matrix
exists because in the first invoicing ship we caught `cancelled → void`
but missed `no_show → void` — the "two features developed in parallel,
interaction untested" anti-pattern.

**Legal follow-up (post-launch)**: strict España compliance means a voided
invoice must be replaced with a `factura rectificativa` (new correlative
number, amounts negated, references the original). MVP restores `voided`
→ `issued` on undo for simplicity; this is acceptable if corrected fast
but should be hardened before scaling.

## Booking ↔ followup (rating + propina) state matrix

Independent from the invoice lifecycle. The cron
`/api/cron/post-booking-followup` runs every 10 min and fires the WhatsApp
rating/tip message 30 min (configurable per client) after the service ends.

| `bookings.status` | Followup action |
|---|---|
| `confirmed` (future) | Nothing — endsAt hasn't passed |
| `confirmed` (past, endsAt + `client.followupMinutesAfter` ≤ now) | Send rating message if `tipsEnabled` AND `followupSentAt is null`; mark `followupSentAt` on delivery |
| `completed` | Same criteria as `confirmed` past |
| `cancelled` | Never send. Idempotent because cancelled bookings fail the state filter |
| `no_show` | Never send — would be rubbing salt in the wound |
| rescheduled (cancel + new booking) | New booking anchors to its own endsAt; old one is cancelled so no send |

**Tips never generate invoices.** They are liberalidad (not contraprestación)
under Spanish tax law. Exports for the gestor include tips as a separate
section, never folded into `libro de facturas`.

**Rating flow**:
- Customer taps a ⭐ button → row inserted in `tips` with `status='rating_only'` and `amount_cents=0`
- If rating ≥ 4 → offer tip buttons (2€ / 3€ / "No, gracias")
- If rating ≤ 3 → thank and exit, no tip ask (sensitive)
- If tip accepted → delete the rating_only placeholder, insert new row with `status='pending'` + rating carried over → Stripe Checkout → webhook flips to `paid`
