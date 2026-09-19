# AURUM

**A production-grade e-commerce platform for selling devices.** Storefront, cart,
checkout, payments, customer accounts, and a complete admin — not a template,
not a catalogue page with a "Buy" button that opens WhatsApp.

### ▶ Live demo — **[full-stack-e-commerce-kabeho.vercel.app](https://full-stack-e-commerce-kabeho.vercel.app)**

No signup, no setup. Browse → add to cart → check out with the sandbox wallet.

**The payment sandbox is the thing to try.** Mobile-money payments are
asynchronous — the customer confirms on their handset, and the outcome arrives
seconds later over a webhook, or never arrives at all. This demo lets you drive
every one of those branches from the checkout form: **the last digit of the
phone number you enter picks the outcome.**

| Enter a phone ending in | What happens |
|---|---|
| `…0` | Succeeds instantly |
| `…1` | Succeeds after ~6 seconds — the realistic mobile-money case |
| `…2` | Declined on the handset |
| `…3` | Fails on insufficient funds |
| `…4` | Never confirms, then expires |

Try `…1` and `…4` — those are the two that break naive implementations.

<sub>The live deployment is a public sandbox seeded with synthetic data and is
reset periodically. Admin access to the live instance is available on request;
the local seed below creates an admin account for you automatically.</sub>

---

## Screenshots

<p align="center">
  <img src="docs/screenshots/storefront.png" width="49%" alt="AURUM storefront" />
  <img src="docs/screenshots/product-detail.png" width="49%" alt="Product detail with variant selection and live stock" />
</p>
<p align="center">
  <img src="docs/screenshots/checkout-momo.png" width="49%" alt="Checkout with mobile money selected" />
  <img src="docs/screenshots/shop-filters.png" width="49%" alt="Shop with faceted filtering" />
</p>

<sub>Regenerate against the live deployment with `npm run screenshots`.</sub>

---

## Why this repo is worth a look

It ships seeded with an iPhone catalogue (21 products, 120 SKUs) priced in AED,
but nothing about phones is hard-coded. Categories, brands, series, attributes,
variants, prices, imagery, delivery zones, currencies, coupons and copy are all
database rows a merchant edits in the admin. Adding Samsung, Pixel, laptops,
tablets or accessories is data entry, not a deployment.

Three payment rails — **MTN Mobile Money**, **Airtel Money** and a
Stripe-compatible hosted card checkout — sit behind one `PaymentProvider`
interface, with signature-checked webhooks, deduplication and server-side
verification before an order is ever marked paid. **170 unit and integration
tests** (`npm test`) cover the money paths.

---

## Run it

**Prerequisites:** Node.js 20.9+ and npm. No external database or service is
required to get started — local development runs on a file-based SQLite
database and a built-in payment sandbox.

```bash
npm install          # also runs prisma generate
cp .env.example .env # the defaults work as-is for local development
npm run db:push      # create the SQLite schema
npm run db:seed      # 21 products, 120 SKUs, demo orders, admin user
npm run dev          # http://localhost:3000
```

Or `npm run setup`, which is the three database steps in one.

| | |
|---|---|
| Storefront | http://localhost:3000 |
| Admin | http://localhost:3000/admin |
| Admin sign-in | `admin@aurum.store` / `ChangeMe!2026` &mdash; **local seed only**; set a strong `SEED_ADMIN_PASSWORD` in `.env` before seeding anything publicly reachable |

Test payments work out of the box through the sandbox wallet — no credentials
required. The outcome is chosen by the last digit of the phone number, exactly
as in the live demo table at the top of this README.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | `prisma generate` then a production build |
| `npm start` | Serve the production build |
| `npm test` | 170 unit and integration tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (flat config, `eslint.config.mjs`) |
| `npm run db:push` | Apply the schema without a migration file |
| `npm run db:seed` | Seed catalogue, settings and demo orders |
| `npm run db:reset` | Drop, recreate and reseed |
| `npm run db:studio` | Prisma Studio |
| `npm run screenshots` | Recapture `docs/screenshots/` from the live deployment |

## What is in it

**Storefront** — home, shop with faceted filtering and sorting, product detail
with variant selection and live stock, search, deals, wishlist, cart, a
four-step checkout, order confirmation and tracking, customer accounts with
order history and saved addresses, CMS pages, FAQ, contact.

**Admin** — dashboard, products (an eight-step editor with a variant-matrix
generator), categories, brands, series, attributes, inventory with a movement
ledger, CSV import/export, orders with a status workflow, customers, payments
and refunds, payment-provider configuration, coupons, promotions, banners, CMS
pages, FAQs, analytics, currency rates, delivery zones, notification templates,
users and roles, and an audit log.

**Payments** — MTN Mobile Money, Airtel Money, a Stripe-compatible hosted card
checkout, and a sandbox simulator, all behind one `PaymentProvider` interface.
Multi-currency: display in AED, RWF or USD; settle mobile money in its own
currency at an admin-set rate.

## How it is built

Next.js 16 (App Router, React Server Components), React 19, TypeScript in
strict mode, Tailwind CSS, Prisma 7 with driver adapters. SQLite for local
development, PostgreSQL for production, one schema for both.

There is no ORM-level magic and no service mesh. Business rules live in
`src/lib/services/*`, each one a plain module with a documented contract; route
handlers validate input with Zod, call a service, and return a uniform
envelope. `docs/ARCHITECTURE.md` explains the layering.

### Project structure

```
src/
  app/
    (store)/    storefront routes — home, shop, product, cart, checkout, account
    admin/      admin console routes
    api/        route handlers (validate → call a service → uniform envelope)
  lib/
    services/   business logic — cart, catalog, currency, inventory, order,
                payment, pricing, product-admin, taxonomy, notification, analytics
    payments/   the PaymentProvider adapters (MTN, Airtel, card, sandbox)
    auth.ts, rbac.ts     authentication and role/permission checks
    db.ts, db-adapter.ts Prisma client and the SQLite/PostgreSQL switch
    money.ts             currency-safe arithmetic
  components/   shared UI
  hooks/        client-side React hooks
  types/        shared TypeScript types
prisma/         schema and seed script
docs/           architecture, database, API, payments, deployment, admin guide
tests/          unit and integration tests (vitest)
```

Anything a merchant needs to change day to day — products, prices, categories,
banners, coupons, delivery zones — is a database row edited through `admin`,
not a file edited through here.

## The rules this codebase holds itself to

These are not aspirations; they are enforced in code and covered by tests.

- **The browser never decides money.** Prices, discounts, delivery and totals
  are recomputed server-side from database rows at order time. A total sent by
  the client is only ever compared against the server's figure and rejected on
  mismatch — never trusted.
- **Nothing is marked paid without server-side verification.** A webhook is a
  hint that something changed. It is signature-checked, deduplicated, and then
  the provider is asked directly. Only a verification whose amount and currency
  match the order can complete it.
- **Stock cannot be oversold.** Reservation happens inside the order
  transaction with a conditional write, so two shoppers racing for the last
  unit produce one sale and one "just sold out".
- **No card data ever touches this server.** Card payments go through the
  processor's hosted session. There is no field, column or log line for a PAN,
  a CVV or a mobile-money PIN.
- **Secrets stay server-side.** Every credential is read from the environment
  in a server module. The only `NEXT_PUBLIC_` variables are a URL and an
  optional analytics tag.
- **Admin routes check permissions on the server**, per page and per endpoint.
  A hidden menu item is a convenience, never the control.
- **Errors do not leak.** Customers see a safe message and a correlation id;
  the stack trace goes to the log.
- **No invented API endpoints.** Where a provider's specification was not
  available, the adapter says so and marks the integration point instead of
  guessing a URL. MTN's refund method throws rather than pretend.

## Documentation

| | |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layering, data flow, where to add things |
| [docs/DATABASE.md](docs/DATABASE.md) | The data model and the SQLite → PostgreSQL move |
| [docs/API.md](docs/API.md) | Every endpoint, its shape and its permission |
| [docs/PAYMENTS.md](docs/PAYMENTS.md) | Provider interface, webhooks, going live |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production checklist |
| [docs/ADMIN-GUIDE.md](docs/ADMIN-GUIDE.md) | For the merchant: adding a product line without a developer |

## Licence

Provided to the commissioning merchant for their own use. Third-party packages
keep their own licences; run `npm ls --all` for the list.
