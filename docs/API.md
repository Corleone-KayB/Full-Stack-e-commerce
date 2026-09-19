# API

Every endpoint under `/api`. Route handlers are thin: parse, authorise, call
one service, return.

## Conventions

**Envelope.** Success is `{ "ok": true, "data": … }`, optionally with `meta`
for pagination. Failure is:

```json
{ "ok": false, "error": { "code": "OUT_OF_STOCK", "message": "Only 2 left of iPhone 15 · 128 GB.", "details": { … }, "ref": "…" } }
```

`message` is written for a customer to read. `details` carries structure the UI
uses — a Zod failure returns `details.fields` keyed by field path, which the
forms render inline. `ref` appears only on 5xx and is the correlation id in the
server log; the log has the stack trace, the response never does.

**Error codes and their statuses.**

| Code | Status | |
|---|---|---|
| `BAD_REQUEST` | 400 | |
| `VALIDATION_ERROR` | 422 | with `details.fields` |
| `UNAUTHENTICATED` | 401 | no session |
| `FORBIDDEN` | 403 | session without the permission, or CSRF failure |
| `NOT_FOUND` | 404 | |
| `CONFLICT` | 409 | e.g. already paid |
| `OUT_OF_STOCK` | 409 | with `details.available` |
| `PRICE_CHANGED` | 409 | with `details.shown` and `details.actual` |
| `CART_EMPTY` | 400 | |
| `COUPON_INVALID` | 422 | |
| `PAYMENT_FAILED` | 402 | |
| `PAYMENT_TIMEOUT` | 408 | |
| `PROVIDER_UNAVAILABLE` | 503 | |
| `PROVIDER_NOT_CONFIGURED` | 501 | enabled but missing credentials |
| `RATE_LIMITED` | 429 | |
| `INTERNAL` | 500 | generic message plus `ref` |

**CSRF.** Every `POST`, `PATCH`, `PUT` and `DELETE` must send the `aurum_csrf`
cookie value back in an `x-aurum-csrf` header. Middleware mints the cookie;
`src/lib/client-api.ts` attaches the header, so the storefront and admin code
get it for free. Webhooks are the exception — the caller is a provider, not a
browser.

**Identity.** Guests are tracked by an `aurum_guest` cookie, which is also the
cart token. Signing in sets `aurum_session` and merges the guest cart.

**Rate limits**, per IP:

| Bucket | Limit |
|---|---|
| `login` | 8 / 5 min |
| `register` | 5 / 10 min |
| `passwordReset` | 5 / 15 min |
| `checkout` | 20 / 10 min |
| `paymentInitiate` | 10 / 5 min |
| `paymentStatus` | 120 / min |
| `search` | 90 / min |
| `write` (admin) | 60 / min |
| `webhook` | 600 / min |

The default store is in-process, which is correct for one instance. Behind more
than one, point `src/lib/rate-limit.ts` at Redis — the interface is `consume()`.

---

## Catalogue (public)

### `GET /api/products`
Filtered, sorted, paginated catalogue.

Query: `q`, `category`, `brand`, `series`, `condition`, `storage`, `color`,
`ram` (each comma-separated), `minPrice`, `maxPrice` (major units),
`availability` (`in-stock` | `all`), `featured`, `bestseller`, `sort`, `page`,
`perPage` (6–60), `currency`.

Returns product cards with effective prices already converted to the requested
display currency, plus the facet counts for the filter sidebar.

### `GET /api/products/[handle]`
One product by slug: variants, attributes, images, specification sheet, live
stock per SKU, and the effective price of each variant.

### `GET /api/search?q=…&limit=…`
Type-ahead. `limit` 1–12.

---

## Cart

The cart is identified by the `aurum_guest` cookie. No endpoint accepts a
price.

| | |
|---|---|
| `GET /api/cart` | The priced cart: lines, totals, issues, delivery estimate |
| `POST /api/cart/items` | `{ variantId, quantity }` (1–20) |
| `PATCH /api/cart/items` | `{ lineId, quantity }` — `0` removes the line |
| `POST /api/cart/coupon` | `{ code }` — `null` clears it |

Totals always come back recomputed. A line whose price moved since it was added
is flagged `priceChanged`; a line that can no longer be filled is flagged
`quantityAdjusted`, and both appear in `issues`.

### `POST /api/checkout/quote`
Re-prices for a delivery choice without creating anything. Send
`{ deliveryMethod, deliveryZoneId, couponCode?, currency? }`; get the totals the
order would be written with. The checkout page calls this whenever the customer
changes delivery, which is why the amount on the review step is always the
amount charged.

---

## Orders

### `POST /api/orders`
Places the order.

```json
{
  "email": "buyer@example.com",
  "phone": "+971…",
  "deliveryMethod": "DELIVERY",
  "deliveryZoneId": "…",
  "shippingAddress": { "firstName": "…", "lastName": "…", "phone": "…", "line1": "…", "city": "…", "country": "AE" },
  "billingAddress": null,
  "customerNote": "…",
  "expectedTotal": 234500,
  "createAccount": false
}
```

Note what is absent: no product ids, no quantities, no prices, no currency, no
total to charge. The bag is read from the server-side cart; every figure is
recomputed. `expectedTotal` is advisory — if it does not match the server's
figure the order is refused with `PRICE_CHANGED` rather than charged.

`createAccount: true` with a `password` registers the customer in the same
request and signs them in.

Returns the created order. Rate limit `checkout`.

### `GET /api/orders`
The signed-in customer's orders, paginated. Guests get nothing here — a guest
reads their order through the confirmation link.

### `GET /api/orders/[id]`
One order. A signed-in customer may read their own; a guest may read one whose
email matches the checkout session. Anything else is a 404, not a 403 — an
order number should not be a probe for whether an order exists.

### `PATCH /api/orders/[id]`
Admin. Requires `order:write` (or `order:cancel` for a cancellation). Status
changes are validated against the transition table, so an order cannot skip
from pending to shipped.

---

## Payments

### `POST /api/payments/initiate`

```json
{ "orderId": "…", "provider": "mtn_momo", "fields": { "msisdn": "0781234560" } }
```

The amount is read from the order the server wrote — the request cannot name
one. `fields` carries whatever that provider declared in `requiredFields`.
Only the order's owner (or the holder of the checkout session that created it)
may pay.

Returns `{ paymentId, externalRef, status, redirectUrl?, instruction?, expiresAt, provider }`.
A redirect provider gives `redirectUrl`; a push-to-handset provider gives
`instruction`. Rate limit `paymentInitiate`.

### `GET /api/payments/[ref]`
Polls a payment by `externalRef`. If it is not in a terminal state, the server
re-verifies with the provider first, so the answer is current rather than
cached. Returns `{ status, orderNumber, orderStatus, failureMessage, expiresAt }`.
Rate limit `paymentStatus`. This is what the checkout waiting screen calls.

### `POST /api/payments/refund`
Admin, requires `payment:refund`. `{ paymentId, amount?, reason? }`. Omitting
`amount` refunds the remainder. A provider without refund support returns
`PROVIDER_NOT_CONFIGURED` with an instruction to refund manually and record it —
rather than a silent failure.

### `POST /api/payments/webhook/[provider]`
Provider callbacks. Not CSRF-checked and not wrapped in the envelope: the raw
body is read as text before anything parses it, because the signature must be
verified against the exact bytes received.

| Response | Meaning |
|---|---|
| `200 {"received":true,"duplicate":false}` | accepted and processed |
| `200 {"received":true,"duplicate":true}` | already seen; nothing done |
| `401` | signature invalid — do not retry, it will never be accepted |
| `413` | body over 512 KB |
| `429` | rate limited |
| `500` | we failed; please retry |

A duplicate is a 200 because from the provider's side it succeeded, and
retrying changes nothing. `GET` on the same path returns `{"status":"ready"}`
for providers that probe before enabling.

Full flow in `docs/PAYMENTS.md`.

---

## Accounts

| | |
|---|---|
| `POST /api/auth/register` | `{ email, password, firstName?, lastName?, phone? }` |
| `POST /api/auth/login` | `{ email, password }` — merges the guest cart |
| `POST /api/auth/logout` | Revokes the session |
| `GET /api/auth/me` | The current session user, or `null` |
| `POST /api/auth/password` | Request a reset, or perform one with a token |
| `PATCH /api/account/profile` | Name, phone, marketing preferences |
| `GET POST PATCH DELETE /api/account/addresses` | The address book |
| `GET POST DELETE /api/wishlist` | Works for guests too, keyed on the guest cookie |
| `POST /api/newsletter` | `{ email }` |

Passwords: at least 10 characters, mixed case, at least one digit. Login and
registration are rate limited and answer identically for an unknown email and a
wrong password.

---

## Admin

Every route below calls `requirePermission()` on the server. A signed-in
customer hitting one gets 403; a signed-out visitor gets 401.

### Catalogue

| Route | Methods | Permission |
|---|---|---|
| `/api/products` | POST | `product:write` |
| `/api/products/[handle]` | PATCH, DELETE | `product:write` |
| `/api/admin/products/[id]/duplicate` | POST | `product:write` |
| `/api/admin/categories`, `/[id]` | GET POST PATCH DELETE | `taxonomy:write` |
| `/api/admin/brands`, `/[id]` | GET POST PATCH DELETE | `taxonomy:write` |
| `/api/admin/series`, `/[id]` | GET POST PATCH DELETE | `taxonomy:write` |
| `/api/admin/attributes`, `/[id]` | GET POST PATCH DELETE | `taxonomy:write` |
| `/api/admin/price-schedules` | GET POST PATCH DELETE | `price:write` |
| `/api/admin/upload` | POST | `product:write` |

Creating a product sends the whole thing at once — basics, variants with their
attribute values, images, specification sheet, SEO — and it is written in one
transaction, so a product never exists without its SKUs.

### Inventory

| Route | Methods | Permission |
|---|---|---|
| `/api/inventory` | GET | `inventory:read` |
| `/api/inventory/[variantId]` | PATCH | `inventory:write` |

`PATCH` takes `{ mode: "increase" | "decrease" | "set", quantity, reason?, lowStockThreshold?, backorderable? }`
and writes a movement recording who did it and why.

### Import / export

| Route | Methods | Permission |
|---|---|---|
| `/api/admin/export?type=products\|template` | GET | `product:read` |
| `/api/admin/import` | POST | `product:write` |

`POST /api/admin/import` takes `{ csv, mode: "validate" | "commit" }`.
`validate` writes nothing and returns a plan: every row that would change, with
before and after per field, plus issues by row number and column. `commit`
re-validates and applies in one transaction; a file with any error is refused
whole. The importer updates existing SKUs only — it never invents a product, a
brand or a category from a flat file.

### Commerce and configuration

| Route | Methods | Permission |
|---|---|---|
| `/api/admin/coupons`, `/[id]` | GET POST PATCH DELETE | `marketing:write` |
| `/api/admin/banners`, `/[id]` | GET POST PATCH DELETE | `content:write` |
| `/api/admin/pages`, `/[id]` | GET POST PATCH DELETE | `content:write` |
| `/api/admin/faqs`, `/[id]` | GET POST PATCH DELETE | `content:write` |
| `/api/admin/delivery-zones`, `/[id]` | GET POST PATCH DELETE | `settings:write` |
| `/api/admin/settings` | GET PATCH | `settings:read` / `settings:write` |
| `/api/admin/payment-providers` | GET PATCH | `payment:configure` |
| `/api/admin/users`, `/[id]` | GET POST PATCH DELETE | `user:manage` |

`GET /api/admin/payment-providers` returns each provider's descriptor and
whether it is configured. It never returns a credential — only whether one is
present.

Creating an admin user returns a one-time temporary password in the response
and stores only its bcrypt hash. It is shown once and never again.

---

## Client helper

`src/lib/client-api.ts` wraps `fetch` for the browser: it attaches the CSRF
header, unwraps the envelope, and throws an `ApiError` carrying `code`,
`message` and `details` so a component can branch on the code and render
`details.fields` against its inputs.

```ts
import { apiPost, errorMessage } from '@/lib/client-api';

try {
  const order = await apiPost('/api/orders', payload);
} catch (error) {
  toast.error("Couldn't place the order", errorMessage(error));
}
```
