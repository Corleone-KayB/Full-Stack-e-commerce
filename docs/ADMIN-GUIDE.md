# Running the store

Written for whoever runs the shop, not for a developer. Nothing in here needs
code, a deploy, or anyone with database access.

Sign in at `/admin`. What you can see and do depends on your role — see
*People and roles* at the end.

---

## Adding a whole new product line

This is the part worth reading properly. The store ships selling iPhones, but
nothing about phones is built in. Selling laptops, tablets, watches or
accessories is four screens of setup and then normal product entry.

Work in this order, because each step uses the one before it.

### 1. Attributes — the properties your products have

**Catalog → Attributes.** An attribute is one property, like Storage, Colour,
RAM or Screen size.

Two kinds, and the difference matters:

- **Variant axis on.** This property creates separate things to buy. Storage
  and Colour are variant axes: 128 GB Black and 256 GB Black are different
  SKUs with their own price and their own stock.
- **Variant axis off.** This property describes the product but does not split
  it. Chipset, Water resistance and Battery capacity are specifications — they
  appear on the product page and can be filtered on, but there is one of them
  per product.

For each attribute you set a **name** (what shoppers see), a **key**
(lower-case, no spaces — used internally, and you cannot change it later), an
optional **unit** (`GB`, `inch`), whether it is **filterable** (appears in the
shop sidebar) and whether it **shows in specs**. Then you list its values.
Colour values can carry a hex code, which is what draws the little swatches on
the product page.

Get the variant-axis decision right the first time. Changing it later on an
attribute already used by products means rebuilding those products' SKUs.

### 2. Category — where it lives, and what it asks for

**Catalog → Categories.** Create the category ("Laptops"), optionally under a
parent. Then attach the attributes that apply to it.

This attachment is what keeps the admin clean: a laptop asks for RAM and Screen
size and never asks for anything phone-specific, because you said which
attributes belong to laptops.

`Show in nav` puts it in the storefront menu.

### 3. Brand and series — optional, useful

**Catalog → Brands** for the manufacturer. **Catalog → Series** for a family
within a brand and category ("MacBook Pro", "Galaxy S"). Series drives the
"Sales by series" figures on the dashboard and gives shoppers a sensible way to
narrow down.

### 4. Products

**Products → New product.** Eight steps, and you can move between them freely;
nothing is saved until you publish.

1. **Basic information** — name, category, brand, series, condition, short and
   full description.
2. **Pricing** — the list price and an optional compare-at price. Prices are in
   your base currency and you type them normally (`2300` or `2300.00`).
3. **Variants** — pick which attributes create variants, tick the values you
   actually stock, and generate the matrix. Choosing Storage 128/256 and Colour
   Black/Silver gives you four SKUs. Each row then gets its own SKU code, price
   and stock; you can adjust any of them individually or delete rows you do not
   carry.
4. **Inventory** — opening stock and a low-stock threshold per SKU. The
   threshold is what puts a product in the dashboard's low-stock list.
5. **Images** — upload, reorder by dragging, and optionally tie an image to a
   specific colour so the gallery changes when a shopper picks it.
6. **Specifications** — the non-variant properties, grouped ("Display",
   "Camera", "In the box"). This is what renders the specification table.
7. **SEO** — page title, meta description, URL slug. Left blank, sensible ones
   are generated.
8. **Publish** — a summary, then Active or Draft.

**Duplicate** on an existing product copies everything but the SKUs and stock,
which is the fast way to add the next model in a range.

---

## Prices and promotions

**Changing a price** — edit the product, change the price, save. It takes
effect immediately, everywhere: shop, product page, and any cart that has not
been checked out yet.

**Running a sale** — use a price schedule rather than editing the price. On the
product's pricing step, add a schedule with a promotional price, a start, an
optional end and a priority. The list price stays untouched underneath, so:

- the sale can be set up in advance and starts on its own,
- the "was" price shoppers see is real,
- ending the sale is deleting the schedule, with nothing to remember.

Where two schedules overlap, the **higher priority** wins — not the cheaper
one. That is deliberate: a members' price should beat a general clearance price
even if it is higher.

**Coupons** — **Marketing → Coupons**. A code, a type (percentage or fixed
amount), a value, and optional limits: minimum spend, maximum discount, total
redemptions, and a date window. Redemptions are counted as orders are placed.

---

## Stock

**Inventory** shows every SKU with three numbers:

- **On hand** — what is physically in the shop.
- **Reserved** — spoken for by orders placed but not yet paid or shipped.
- **Available** — on hand minus reserved. This is what a shopper can buy.

Adjust with **Increase** (a delivery arrived), **Decrease** (breakage, a
manual sale) or **Set** (after a stock count). Always type a reason. Every
change is written to **Inventory → Movements** with who made it, when, why and
the resulting balance — which is what lets you answer "where did those two go"
three weeks later.

If reserved looks stuck high, it is usually abandoned checkouts. Those release
themselves automatically once the payment window passes.

**Backorderable** lets a SKU be sold past zero. Off by default, and it should
stay off unless you genuinely can supply.

### Bulk changes by spreadsheet

**Catalog → Import / export.**

Export gives you one row per SKU. Change prices and stock in Excel or Sheets,
save as CSV, upload it, and press **Check the file** first. You get a preview:
every row that would change, the old value and the new one side by side, and
any problems listed by row number. Nothing is written until you press Apply.

The file is matched on SKU. It updates price, compare-at price, stock,
low-stock threshold, active, featured, best-seller and the short description.
It will not create products — a spreadsheet cannot say which category or brand
something belongs to without guessing, so new products are added in the editor
where you can see what you are making. Rows for SKUs you do not carry are
listed as warnings and skipped.

If any row has a real error, nothing at all is applied. That is intentional: a
half-applied price list is worse than no price list.

---

## Orders

**Orders** lists everything with its status and payment state. Open one to see
the items, the customer, the addresses, the payment, and a full timeline.

Statuses move in one direction:

```
Pending → Confirmed → Processing → Ready → Shipped → Delivered
     ↘ Cancelled                                  ↘ Refunded
```

You cannot skip a step, and cancelled and refunded are final. **Pending** means
placed but not paid — stock is held. **Confirmed** means the payment was
verified by us with the provider, not merely reported.

Cancelling an unpaid order releases its reservation. Cancelling or refunding a
paid order puts the stock back on the shelf. Either way you do not adjust stock
by hand afterwards.

**Notes** on an order can be internal or customer-visible; the timeline shows
which is which.

---

## Payments and refunds

**Payments** lists every transaction with its provider, amount, and — for a
mobile-money payment settled in another currency — both the order amount and
what was actually charged, with the rate used.

**Refunding**: open the payment, choose full or partial, give a reason. The
refund goes to the provider and the order is updated.

Some providers cannot be refunded automatically. MTN Mobile Money is one: their
collections product has no refund endpoint, so the button is disabled and you
refund through MTN's own channel and record it against the order. The store
tells you this rather than appearing to succeed.

**Payments → Providers** shows each method and whether it is switched on. A
method with missing credentials shows what is missing and never appears at
checkout. Credentials themselves are not editable here — they are environment
settings your developer or host holds, which is what keeps them out of the
browser.

---

## Settings

**Store** — name, tagline, legal name, logo, contact details, address, social
links. Used across the storefront, in emails and in structured data.

**Homepage and copy** — hero text, buttons, the trust statements in the footer.
Write claims you can stand behind; if you cannot prove "100% genuine", say
something you can.

**Currency** — the base currency (what orders are priced in), which currencies
shoppers may switch to, and the rate for each. Rates are yours to set and do not
update themselves. Diary a review; a stale rate is a slow, invisible loss on
every mobile-money settlement.

**Delivery** — zones with a fee, a free-delivery threshold, an estimated
window, and whether collection is offered. Checkout prices delivery from the
zone the customer picks.

**Notifications** — the email and SMS templates. Placeholders like
`{{orderNumber}}` are filled in when the message is sent.

**Content** — CMS pages (terms, privacy, returns, warranty), FAQs and homepage
banners. Have someone who can be held to them read the legal pages before you
open.

---

## People and roles

**Settings → Users & roles.** Give every person their own account. Shared
logins make the audit log useless, which is the one thing you will want when
something has gone wrong.

| Role | Can do |
|---|---|
| **Super Admin** | Everything, including managing people |
| **Product Manager** | Catalogue, pricing, inventory, content, marketing |
| **Order Manager** | Orders, fulfilment, customers, and reading stock |
| **Finance** | Payments, refunds, reporting, the audit log |
| **Support Agent** | Read-only: orders, customers, products, stock |

Only a Super Admin can add or change people. A new person gets a temporary
password shown once — hand it over in person or over something you trust, and
ask them to change it.

Changing someone's role or suspending them takes effect on their next click.
Suspending is better than deleting: it keeps their history intact.

**Settings → Audit** records who changed what, and when.

---

## The dashboard

Revenue over 30 days against the previous 30, revenue today, average order
value, customers, and orders by state. Below that: revenue and order volume
day by day, payment methods, sales by series, recent orders, best sellers, and
the low-stock and out-of-stock lists.

Every chart has a **Show data table** link. The figures are the same; the table
is there for reading exact numbers and for copying out.
