# Payments

Four providers ship: MTN Mobile Money, Airtel Money, a Stripe-compatible hosted
card checkout, and a sandbox simulator. They all implement the same interface,
so checkout, the order service, the webhook route and the admin screen have no
knowledge of any particular one.

## The three rules

**1. Only the server can decide a payment succeeded.** A webhook is a hint that
something changed. It is signature-checked and deduplicated, and then the
provider is asked directly what happened. `verifyAndSettle` is the only
function that can mark an order paid, and it does so only when the provider's
answer is `SUCCESSFUL` *and* the amount and currency match the order.

**2. A payment for the wrong amount is a failure, not a sale.** If a provider
confirms an amount that does not match, the payment is failed with
`amount_mismatch`, the order is left unpaid and flagged, and `payment.amount_mismatch`
is logged at error level. It is either a bug or an attack and neither should
quietly become revenue.

**3. Nothing sensitive is stored.** There is no column, field, form input or log
line anywhere in this repository for a card number, a CVV, an expiry date or a
mobile-money PIN. Card payments happen on the processor's hosted page. What
comes back and is kept is the brand, the last four digits, a masked payer
(`••560`) and a SHA-256 hash of the payer identifier for reconciliation.

## Flow

```
customer picks a method
        │
POST /api/payments/initiate ──► payment.service.initiatePayment
        │                            │ create Payment (PENDING), freeze FX rate
        │                            │ provider.initiatePayment()
        │                            ▼
        │                       redirect URL, or "check your handset"
        │
        ├── redirect providers: customer returns to /checkout/processing
        └── handset providers: /checkout/processing polls GET /api/payments/[ref]
                    │
                    │  meanwhile, the provider may call
                    ▼
POST /api/payments/webhook/[provider]
        │  verify signature against the RAW bytes
        │  insert PaymentEvent (unique idempotencyKey) — duplicate ⇒ stop here
        │  find the Payment by externalRef
        ▼
payment.service.verifyAndSettle
        │  ask the provider directly (never trust the webhook body)
        │  check amount + currency against the order
        ▼
order.service.markOrderPaid — reservation becomes a sale, confirmation sent
```

Three things can drive settlement: the webhook, the customer's browser polling,
and a scheduled poll. All three funnel into `verifyAndSettle`, which is
idempotent, so whichever arrives first wins and the others do nothing.

## The provider interface

```ts
interface PaymentProvider {
  descriptor: ProviderDescriptor;
  validateFields(fields: Record<string, string>): Record<string, string>;
  initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
  checkPaymentStatus(externalRef: string): Promise<PaymentStatusResult>;
  verifyPayment(input: VerificationInput): Promise<VerificationResult>;
  refundPayment(input: RefundInput): Promise<RefundResult>;
  handleWebhook(raw: RawWebhook): Promise<WebhookParseResult>;
}
```

`descriptor` is what the rest of the app reads: display name, blurb, settlement
currencies, capabilities (async approval, redirect, refunds, partial refunds,
polling, webhooks), whether it is `configured`, and `requiredFields` — which is
how checkout knows to ask for a phone number for one provider and nothing for
another. Adding a field to a provider adds it to the checkout form; no UI
change.

`configured` is false when the environment variables are missing.
An unconfigured provider still appears in the admin (with a hint saying what is
missing) and never appears at checkout.

### Adding a provider

1. Write `src/lib/payments/providers/yourprovider.ts` implementing the
   interface.
2. Add one line to `FACTORIES` in `src/lib/payments/registry.ts`.
3. Add its id to `PAYMENTS_ENABLED`.

That is the whole change. Checkout renders it, the webhook route accepts it,
the admin lists it.

## Sandbox and live are never mixed

`PAYMENTS_ENVIRONMENT` is `sandbox` or `live`. In live mode the registry
refuses to load any adapter whose descriptor reports `environment: 'sandbox'`,
and logs `payments.sandbox_credentials_in_live_mode` if it finds one. The
simulator is disabled outright. Mixing the two is the most expensive mistake
available in payments, so it is made structurally impossible rather than left
to discipline.

## Webhook security

Every rule below is implemented in `src/lib/payments/signature.ts` and covered
by tests in `tests/unit/webhook-signature.test.ts`.

- **Raw bytes.** `request.text()` is read before anything parses, and the
  signature is computed over those bytes. Re-serialising JSON changes the
  whitespace and would break — correctly.
- **Constant-time comparison.** `timingSafeEqual`, with a length check first.
- **Replay window.** Timestamped signatures (`t=…,v1=…`) are rejected outside
  ±300 seconds, in both directions.
- **A missing secret is a rejection**, never a pass.
- **Idempotency at the database.** `PaymentEvent.idempotencyKey` is unique and
  namespaced by provider (`mtn_momo:evt_123`). A redelivery hits the constraint,
  the handler returns "duplicate", and nothing else runs. A callback can never
  create a second order or deduct stock twice.
- **Rejections are recorded.** An invalid signature writes an event marked
  `signatureValid: false` so repeated forgery is visible, and touches no
  payment.
- **Size and rate limits.** Bodies over 512 KB are refused; 600 requests per
  minute per IP.

Status codes matter to a provider's retry logic: `401` means never retry,
`500` means please do, `200` covers both fresh and duplicate deliveries.

## Multi-currency

Orders are priced in the store's base currency (AED by default). A provider
declares what it can settle in. At initiation, `resolveSettlement` converts the
order total at the current admin-set rate and **freezes** it on the `Payment`
row as `chargedAmount`, `chargedCurrency` and `exchangeRate`.

That freeze is what makes reconciliation possible: an order for 2,300.00 AED
settled through MTN in RWF records both figures and the rate used, so the
finance screen can tie a franc-denominated settlement back to a dirham order
months later. Rates are edited in **Settings → Currency**.

Verification compares against the *settlement* amount, because that is what the
provider actually took.

## The providers

### MTN Mobile Money (`mtn_momo`)

Collections API. `POST /collection/token/` for a bearer token,
`POST /collection/v1_0/requesttopay` to push a request to the handset,
`GET /collection/v1_0/requesttopay/{referenceId}` to poll.

```bash
MTN_BASE_URL="https://sandbox.momodeveloper.mtn.com"
MTN_SUBSCRIPTION_KEY=""          # Ocp-Apim-Subscription-Key, Collections product
MTN_API_USER=""                  # API user UUID
MTN_API_KEY=""
MTN_TARGET_ENVIRONMENT="sandbox" # or mtnrwanda, mtnuganda, …
MTN_CURRENCY="EUR"               # sandbox settles EUR only; live uses e.g. RWF
MTN_WEBHOOK_SECRET=""            # if your market provisions one
```

Setup: register at momodeveloper.mtn.com, subscribe to Collections, create an
API user and key, then register the callback
`{APP_URL}/api/payments/webhook/mtn_momo`.

**`refundPayment` throws on purpose.** MTN's Collections product has no
documented refund endpoint; Disbursements is a separate product with separate
credentials. Rather than invent a URL, the adapter raises
`PROVIDER_NOT_CONFIGURED` with an explanation, the admin refund button is
disabled for MTN, and the operator is told to refund through MTN's own channel
and record it against the order. Wire up Disbursements here if you have it.

### Airtel Money (`airtel_money`)

`POST /auth/oauth2/token`, `POST /merchant/v1/payments/`,
`GET /standard/v1/payments/{id}`, and a refund endpoint.

```bash
AIRTEL_BASE_URL="https://openapiuat.airtel.africa"
AIRTEL_CLIENT_ID=""
AIRTEL_CLIENT_SECRET=""
AIRTEL_COUNTRY="RW"
AIRTEL_CURRENCY="RWF"
AIRTEL_PUBLIC_KEY=""             # base64 RSA key for payload encryption (production)
AIRTEL_WEBHOOK_SECRET=""
```

Production requires RSA encryption of the payload with a key Airtel issues. The
adapter encrypts when `AIRTEL_PUBLIC_KEY` is set and sends plaintext to the UAT
host when it is not, which is what the sandbox expects.

### Card (`card`)

Hosted checkout against a Stripe-compatible API:
`POST /v1/checkout/sessions`, `GET /v1/checkout/sessions/{id}`,
`POST /v1/refunds`, and `Stripe-Signature: t=…,v1=…` webhooks.

```bash
CARD_PROVIDER="stripe"
CARD_API_BASE="https://api.stripe.com"
CARD_PROCESSOR_SECRET=""         # server only — never NEXT_PUBLIC
CARD_WEBHOOK_SECRET=""
CARD_CURRENCY="AED"
```

If your processor exposes the same shape, point `CARD_API_BASE` at it. If not,
implement the same interface in a sibling file and register that instead.

### Simulator (`simulator`)

Exists so the whole journey — including asynchronous approval, decline, timeout
and webhook idempotency — can be exercised with no credentials. Disabled
automatically when `PAYMENTS_ENVIRONMENT=live`.

The last digit of the phone number chooses the outcome:

| ends in | what happens |
|---|---|
| `0` | succeeds immediately |
| `1` | succeeds after ~6 seconds — the realistic mobile-money case |
| `2` | declined on the handset |
| `3` | fails, insufficient funds |
| `4` | never confirms, expires |
| other | succeeds after ~6 seconds |

## Expiry and reservations

An unpaid payment expires after `PAYMENT_EXPIRY_MINUTES` (15 by default).
`verifyAndSettle` marks it `EXPIRED` on the next check.
`releaseExpiredReservations()` in `inventory.service` then cancels stale pending
orders and returns their stock to sale, writing a customer-visible event
explaining why. It is safe to call repeatedly; run it from a cron or a queue —
for example `*/5 * * * *` hitting a small authenticated route, or a Vercel Cron.

## Going live

- [ ] `PAYMENTS_ENVIRONMENT=live`
- [ ] Live credentials for every provider in `PAYMENTS_ENABLED`; the simulator
      removed from that list
- [ ] `APP_URL` set to the real origin — callback URLs are built from it
- [ ] Callback URLs registered with each provider:
      `https://yourdomain/api/payments/webhook/{providerId}`
- [ ] Webhook secrets set for every provider that issues one
- [ ] A real payment made and refunded end to end, for each provider
- [ ] A deliberately forged webhook confirmed to return 401
- [ ] Reservation-expiry job scheduled
- [ ] Currency rates reviewed in Settings → Currency, and a review cadence
      agreed — a stale rate is a slow loss

## Testing

`tests/integration/payments.test.ts` covers settlement, in-flight holds,
decline, expiry, double-payment refusal, amount mismatch, refunds (full,
partial, over-refund, non-successful payment), and the webhook path: invalid
signature, recorded rejection, early webhook that must not shortcut
verification, duplicate delivery, unknown reference, unparseable body.
`tests/unit/webhook-signature.test.ts` covers the signature primitives.

```bash
npm test
```
