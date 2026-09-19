# Database

41 models in `prisma/schema.prisma`, one schema that runs unchanged on SQLite
and PostgreSQL.

## Conventions

**Money is an integer number of minor units.** `price = 230000` is 2,300.00 AED.
RWF has no minor unit, so `precision = 0` and the integer is the amount.
Floats never appear in a monetary column. All arithmetic goes through
`src/lib/money.ts`.

**Enumerations are `String`.** SQLite has no enum type, so the unions live in
`src/types/enums.ts` and are enforced by Zod at every boundary and by the
service that writes the column. The trade is deliberate: one schema for both
engines, and a status added in TypeScript needs no migration. See *Hardening*
below for converting these to native Postgres enums.

**Structured blobs are JSON-encoded `String`** — an order's address snapshot, an
order item's attribute map, a payment's provider metadata. Read and written
through `src/lib/json.ts`, which redacts anything key-shaped before storing.

**Ids are `cuid()`.** Order numbers are separate and human-facing:
`ORD-YYYYMMDD-0001`, allocated inside the order transaction.

**Deletes are soft where history matters.** Products archive, sessions revoke,
orders cancel. Nothing that a customer or an accountant might ask about later
is destroyed by a click.

## The model groups

### Identity and access
`Role`, `Permission`, `RolePermission`, `User`, `Session`, `PasswordResetToken`,
`Address`.

`User` covers customers and staff alike; the role decides which. `Session`
stores `tokenHash` (SHA-256 of the opaque cookie value), never the token.
`revokedAt` is set on sign-out rather than deleting the row.

### Catalogue taxonomy
`Category` (self-referencing tree), `Brand`, `Series`, `AttributeDefinition`,
`AttributeValue`, `CategoryAttribute`.

This group is what makes the store category-agnostic. An `AttributeDefinition`
with `isVariantAxis = true` (Storage, Colour) generates SKUs; one with
`isVariantAxis = false` (Chipset, Water resistance) is a specification shown on
the product page. `CategoryAttribute` says which attributes apply where — so a
laptop category can carry RAM and Screen size without a phone ever seeing them.

### Products
`Product`, `ProductVariant`, `VariantAttributeValue`, `ProductAttributeValue`,
`ProductImage`, `PriceSchedule`.

A `Product` is the thing a customer browses; a `ProductVariant` is the thing
they buy and the thing stock is counted against. `PriceSchedule` layers sale
and promotional prices over the variant's list price with a window and a
priority, so a promotion can be scheduled ahead, previewed and rolled back
without ever overwriting the real price.

### Inventory
`Inventory` (one row per variant: `onHand`, `reserved`, `lowStockThreshold`,
`backorderable`), `InventoryMovement` (an append-only ledger).

`available = onHand − reserved`. Every change writes a movement carrying the
resulting balances, the reason and the reference, so any figure can be
explained after the fact.

### Commerce
`Cart`, `CartItem`, `WishlistItem`, `Order`, `OrderItem`, `OrderEvent`,
`DeliveryZone`, `Coupon`, `Currency`.

`OrderItem` denormalises the product name, variant name, SKU, image and unit
price at the moment of sale. Renaming a product next year does not rewrite last
year's invoices. `OrderEvent` is the order's timeline, with a
`visibleToCustomer` flag separating what the shopper sees from internal notes.

### Payments
`Payment`, `PaymentEvent`.

`Payment` records both the order amount (`amount`, `currency`) and what the
provider was actually charged (`chargedAmount`, `chargedCurrency`,
`exchangeRate`), because a mobile-money settlement in RWF must reconcile
against an order priced in AED. `externalRef` is unique and is what a webhook
is matched on. There is no column for a card number, a CVV or a PIN — only
`cardBrand`, `cardLast4`, `payerMasked` and `payerHash`.

`PaymentEvent.idempotencyKey` is unique. That single constraint is what makes a
redelivered webhook a no-op: the insert fails with P2002 and the handler
returns "duplicate" without touching the payment.

### Content and operations
`Setting`, `ContentPage`, `Faq`, `Banner`, `NotificationTemplate`,
`Notification`, `Review`, `AuditLog`, `ProductViewStat`.

`Setting` is a key/value store holding everything a merchant may edit without a
developer: brand, copy, trust statements, delivery defaults, currency
configuration, SEO. `AuditLog` records who changed what in the admin.

## Indexes

Indexed for the queries the app actually runs: catalogue browsing
(`Product(categoryId, active)`, `(brandId, active)`, `(featured, active)`),
price sorting (`ProductVariant(price)`), pricing windows
(`PriceSchedule(variantId, active, startsAt)`), the order lists
(`Order(status)`, `(paymentStatus)`, `(placedAt)`, `(email)`), the stock ledger
(`InventoryMovement(variantId, createdAt)`, `(referenceType, referenceId)`), and
session lookup (`Session(userId)`, `(expiresAt)`).

Unique constraints that carry a rule rather than just a shape:
`Payment.externalRef`, `PaymentEvent.idempotencyKey`, `Order.orderNumber`,
`ProductVariant.sku`, `CartItem(cartId, variantId)`,
`AttributeValue(attributeId, value)`.

## Local development

```bash
npm run db:push     # apply the schema (no migration files)
npm run db:seed     # 21 products, 120 SKUs, 34 demo orders, an admin user
npm run db:reset    # drop, recreate, reseed
npm run db:studio   # browse it
```

The seed is idempotent in the sense that it recreates a known-good store; run
`db:reset` rather than seeding twice.

## Moving to PostgreSQL

Two changes.

```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
}
```

```bash
# .env
DATABASE_URL="postgresql://user:password@host:5432/aurum?schema=public&sslmode=require"
DATABASE_POOL_MAX="10"
```

Then:

```bash
npx prisma migrate dev --name init   # once, to create the migration
npx prisma migrate deploy            # on the server
npm run db:seed                      # only if you want the demo catalogue
```

No application code changes. `src/lib/db-adapter.ts` reads the URL shape and
constructs `PrismaPg` instead of `PrismaLibSql`.

For a hosted libSQL/Turso database instead, keep `provider = "sqlite"` and set:

```bash
DATABASE_URL="libsql://your-db.turso.io"
DATABASE_AUTH_TOKEN="…"
```

## Hardening on PostgreSQL (optional)

The String-as-enum and String-as-JSON conventions exist for SQLite. Once you
are on Postgres you may convert them for stricter constraints and better query
support. This is optional — the application works either way, because it
validates in TypeScript regardless.

Native enums:

```sql
CREATE TYPE order_status AS ENUM
  ('PENDING','CONFIRMED','PROCESSING','READY','SHIPPED','DELIVERED','CANCELLED','REFUNDED');

ALTER TABLE "Order"
  ALTER COLUMN "status" TYPE order_status USING "status"::order_status;
```

Repeat for `paymentStatus`, `fulfillmentStatus`, `InventoryMovement.type`,
`OrderEvent.type` and `PaymentEvent.source`, then mirror the change in
`schema.prisma` with real `enum` blocks. The union types in
`src/types/enums.ts` already list every legal value, so the SQL and the code
stay in step.

`jsonb` for the encoded blobs:

```sql
ALTER TABLE "Order"
  ALTER COLUMN "shippingAddress" TYPE jsonb USING "shippingAddress"::jsonb,
  ALTER COLUMN "billingAddress"  TYPE jsonb USING "billingAddress"::jsonb;
```

If you do this, change those fields to `Json` in `schema.prisma` and drop the
`encodeJson`/`decodeJson` calls at their read and write sites — `src/lib/json.ts`
is imported in a handful of places and TypeScript will find them all.

Two constraints worth adding on Postgres, which SQLite cannot express:

```sql
ALTER TABLE "ProductVariant" ADD CONSTRAINT price_non_negative CHECK ("price" >= 0);
ALTER TABLE "Inventory"      ADD CONSTRAINT stock_non_negative CHECK ("onHand" >= 0 AND "reserved" >= 0);
```

The services already enforce both; the constraint makes it true even for a
hand-written `UPDATE` at 2am.

## Backups

The data that cannot be reconstructed is orders, payments, customers and the
inventory ledger. On managed Postgres, enable point-in-time recovery. On
SQLite, copy the `.db` file — with the application stopped, or via
`sqlite3 dev.db ".backup out.db"` while it runs. Test a restore before you need
one.
