# Architecture

## The shape of it

```
Browser
  │
  ├─ Server Components ──────────► services ──► Prisma ──► SQLite / PostgreSQL
  │     read-only page render         │
  │                                   │
  └─ fetch() ──► route handlers ──────┘
        POST/PATCH/DELETE      Zod → permission check → service → envelope
                                                          │
                                                          ├─► payment providers
                                                          └─► notifications
```

Two paths into the same services. Pages read through Server Components, which
means the first byte of HTML already contains the products, the cart and the
prices — no loading spinner, no client-side data fetch on first paint.
Mutations go through route handlers under `/api`, which validate, authorise,
call a service and return `{ ok, data }` or `{ ok, error }`.

Nothing in `src/components/store` or `src/components/admin` talks to Prisma.
Nothing in `src/lib/services` imports React. That separation is the whole
architecture; everything below is detail.

## Directory map

```
src/
  app/
    (store)/          storefront pages — home, shop, PDP, cart, checkout, account
    admin/            admin pages, each gated by requirePermission()
    api/              route handlers
  components/
    store/            storefront client components
    admin/            admin client components
    ui/               the design-system primitives (Button, Field, Modal, …)
    providers/        theme, toast, cart context
  lib/
    services/         business rules — the only place they live
    payments/         provider interface, registry, adapters, signatures
    db.ts             the Prisma singleton
    db-adapter.ts     picks libSQL or node-postgres from DATABASE_URL
    auth.ts           passwords, sessions, permission gates, CSRF
    rbac.ts           permissions and role bundles
    money.ts          minor units, conversion, formatting
    api.ts            route wrapper and the response envelope
    errors.ts         AppError and the code → HTTP status table
    settings.ts       merchant-editable store settings
  types/
    enums.ts          the string unions the database stores as text
  generated/prisma/   generated client (gitignored)
prisma/
  schema.prisma       41 models
  seed.ts             catalogue, settings, demo orders
  catalog-data.ts     the seed price list
  product-images.ts   generated SVG studio imagery
tests/
  unit/               pure functions, no database
  integration/        real services against a copy of the seeded database
```

## Layers, and what each is allowed to do

**Route handlers** (`src/app/api/**/route.ts`) are thin on purpose. Each one
parses the request with a Zod schema, calls `requirePermission()` where the
route is privileged, calls exactly one service function, and returns. They
contain no business rules, so there is never a rule that exists in an endpoint
but not on the page that does the same thing.

Every handler is wrapped by `route()` from `src/lib/api.ts`, which turns a
`ZodError` into a field-keyed 422 the forms render directly, an `AppError` into
its declared status with a message written for a customer, and anything else
into a 500 carrying a correlation id and nothing whatsoever about the internals.

**Services** (`src/lib/services/*`) own the rules. They take plain arguments,
return plain data, throw `AppError`, and know nothing about HTTP. A service is
free to call another service; each file's header comment states the invariant
it exists to defend. The important ones:

| Service | The invariant it holds |
|---|---|
| `pricing.service` | One function decides a sale price. Storefront, cart, checkout and admin preview all call it, so what is shown is what is charged. |
| `cart.service` | `priceCart` is the only place a total is computed. |
| `order.service` | The browser supplies intent, never money. Every figure is recomputed at submit. |
| `inventory.service` | Reservations are conditional writes inside a transaction, so stock cannot be oversold. |
| `payment.service` | Only a server-side verification whose amount and currency match the order can mark it paid. |
| `currency.service` | Conversion happens on the server; the browser receives amounts already denominated. |
| `import-export.service` | Validate reports, commit applies — all or nothing. |

**Components** render. Server Components fetch through services and pass plain
serialisable props down; client components own interaction and call the API.
Because a function is not serialisable across that boundary, formatting
instructions travel as data — the charts take a `ValueFormat` descriptor, not a
formatter callback.

## Request lifecycle: placing an order

1. `POST /api/orders` — Zod parses the body: a cart token, contact details, an
   address, a delivery choice, and an advisory `expectedTotal`.
2. `createOrderFromCart` loads the cart **from the database by token**. The
   request's idea of what is in the bag is not consulted.
3. Every line is re-validated: the product is still active, the quantity is
   sane.
4. `computeOrderTotals` re-prices the whole cart through `effectivePrice`,
   applies the coupon, computes delivery from the zone, and produces the
   grand total in the base currency.
5. If `expectedTotal` was supplied and does not match, the order is refused
   with `PRICE_CHANGED` — the customer is shown a changed price rather than
   silently charged a different one.
6. One transaction: allocate an order number, write the order and its items,
   reserve stock for every line, write the `CREATED` event, increment the
   coupon, mark the cart converted. Any failure rolls the whole thing back, so
   there is no order without its stock and no reservation without its order.
7. `POST /api/payments/initiate` creates a `Payment`, freezes the settlement
   currency and exchange rate, and asks the provider to start.
8. Settlement — by webhook, by the customer's browser polling, or by a
   scheduled poll — runs `verifyAndSettle`, which asks the provider what
   actually happened. Only then does `markOrderPaid` convert the reservation
   into a sale and send the confirmation.

## Authentication and authorisation

Passwords are bcrypt at cost 12. Sessions are opaque 32-byte tokens; the
database stores only their SHA-256 hash, so a database leak does not hand
anyone a live session. The cookie is `httpOnly`, `SameSite=Lax`, and `Secure`
in production. Signing out revokes the row rather than deleting it, which keeps
"signed out at" auditable.

Authorisation is permission-based. `src/lib/rbac.ts` declares 24 permissions
and bundles them into six roles; `requirePermission('order:write')` appears at
the top of every admin page and every admin route handler. Middleware redirects
a visitor with no session cookie away from `/admin`, but that is ergonomics —
deleting the middleware would change the experience and not the security.

Mutations additionally carry a CSRF double-submit token (`aurum_csrf` cookie,
`x-aurum-csrf` header), minted by middleware because a Server Component cannot
set a cookie.

## Money

Every monetary value in the database, in the services and on the wire is an
**integer number of minor units** — fils for AED, cents for USD, whole francs
for RWF, which has no minor unit. Floats never touch a total. `src/lib/money.ts`
is the only place that converts, rounds or formats, and it rounds half-up with
an epsilon correction because both `Math.round(x * 100)` and
`Number(x.toFixed(2))` round 1.005 down.

## Portability

One schema serves SQLite and PostgreSQL. That costs three conventions:

- **Enumerations are `String`**, constrained by unions in `src/types/enums.ts`
  and by Zod at every boundary.
- **Structured blobs are JSON-encoded `String`**, read and written through
  `src/lib/json.ts` — which also redacts anything that looks like a secret
  before it is stored.
- **Money is an integer**, as above.

`src/lib/db-adapter.ts` picks the driver from the URL shape. Production is a
`DATABASE_URL` change plus one word in `schema.prisma`; see `docs/DATABASE.md`
for the optional hardening migration that converts those Strings to native
Postgres enums and `jsonb`.

## Extending it

**A new product category with its own specification fields.** No code. In the
admin: create the category, define attributes (Storage, Colour, RAM, Screen
size…), attach them to the category, then create products whose variant matrix
is generated from the attribute axes you chose. `docs/ADMIN-GUIDE.md` walks
through it.

**A new payment provider.** Write an adapter implementing `PaymentProvider` in
`src/lib/payments/providers/`, add one line to `FACTORIES` in `registry.ts`,
add its id to `PAYMENTS_ENABLED`. Checkout, the order service, the webhook
route and the admin screen all read from the registry, so nothing else changes.
`docs/PAYMENTS.md` has the interface.

**A new admin CRUD screen.** `src/lib/admin-resources.ts` describes a resource
— its fields, validation, list columns and permissions — and
`src/lib/admin-crud.ts` plus `resource-manager.tsx` turn that description into
both the API routes and the screen. Nine screens already work this way, which
is why they behave identically.

**A new business rule.** It goes in a service, with a comment saying what it
defends, and a test. If it needs to exist in two places, it is in the wrong
place.

## Performance notes

Product and category pages are statically generated where the data allows and
revalidated on write. Fonts are self-hosted (`@fontsource`), so there is no
third-party connection on first paint. Charts are hand-built SVG rather than a
charting library — the dashboard ships no chart runtime at all. `lucide-react`
imports are optimised by the compiler. Animation is limited and every
transition respects `prefers-reduced-motion`.
