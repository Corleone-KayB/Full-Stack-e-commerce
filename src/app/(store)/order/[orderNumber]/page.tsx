import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2, Clock, Package, Truck, XCircle } from 'lucide-react';
import { getSessionUser } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { formatMoney } from '@/lib/money';
import { getCurrency } from '@/lib/services/currency.service';
import { getOrderByNumber, parseOrderAddress } from '@/lib/services/order.service';
import { formatDateTime } from '@/lib/utils';
import { LinkButton } from '@/components/ui';
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, type OrderStatus, type PaymentStatus } from '@/types/enums';

type Params = Promise<{ orderNumber: string }>;

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your order',
  robots: { index: false, follow: false },
};

const TIMELINE: { status: OrderStatus; label: string; icon: React.ReactNode }[] = [
  { status: 'CONFIRMED', label: 'Confirmed', icon: <CheckCircle2 className="h-4 w-4" /> },
  { status: 'PROCESSING', label: 'Preparing', icon: <Package className="h-4 w-4" /> },
  { status: 'SHIPPED', label: 'On its way', icon: <Truck className="h-4 w-4" /> },
  { status: 'DELIVERED', label: 'Delivered', icon: <CheckCircle2 className="h-4 w-4" /> },
];

export default async function OrderPage({ params }: { params: Params }) {
  const { orderNumber } = await params;
  const [order, user, settings] = await Promise.all([
    getOrderByNumber(orderNumber),
    getSessionUser(),
    getSettings(),
  ]);

  if (!order) notFound();

  // A guest reaching this page straight after paying is allowed through; an
  // order belonging to an account is only shown to that account.
  const isOwner = !!user && order.userId === user.id;
  const isStaff = !!user?.isAdmin;
  const isGuestOrder = !order.userId;
  if (!isOwner && !isStaff && !isGuestOrder) notFound();

  const currency = await getCurrency(order.currency);
  const money = (amount: number) => formatMoney(amount, currency);
  const address = parseOrderAddress(order.shippingAddress);
  const status = order.status as OrderStatus;
  const paymentStatus = order.paymentStatus as PaymentStatus;
  const paid = paymentStatus === 'SUCCESSFUL';
  const cancelled = status === 'CANCELLED' || status === 'REFUNDED';
  const activeStep = TIMELINE.findIndex((item) => item.status === status);

  return (
    <div className="container max-w-3xl py-12 lg:py-16">
      <div className="rounded-xl border border-hairline bg-surface p-7 lg:p-9">
        <div className="flex items-start gap-4">
          <span
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
              cancelled ? 'bg-critical/10 text-critical' : paid ? 'bg-positive/10 text-positive' : 'bg-caution/10 text-caution'
            }`}
          >
            {cancelled ? (
              <XCircle className="h-6 w-6" />
            ) : paid ? (
              <CheckCircle2 className="h-6 w-6" />
            ) : (
              <Clock className="h-6 w-6" />
            )}
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-3xl tracking-tight text-ink">
              {cancelled
                ? 'This order was cancelled'
                : paid
                  ? 'Thank you — your order is confirmed'
                  : 'Your order is awaiting payment'}
            </h1>
            <p className="mt-2 text-sm text-muted">
              Order <span className="tabular text-ink">{order.orderNumber}</span> · placed{' '}
              {formatDateTime(order.placedAt)}
            </p>
            {!paid && !cancelled && (
              <p className="mt-3 text-sm text-caution">
                We have not received payment yet. Your items are reserved until the payment window closes.
              </p>
            )}
          </div>
        </div>

        {!cancelled && (
          <ol className="mt-9 grid grid-cols-4 gap-2" aria-label="Order progress">
            {TIMELINE.map((item, index) => {
              const reached = activeStep >= index && paid;
              return (
                <li key={item.status} className="flex flex-col items-center gap-2 text-center">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                      reached ? 'bg-accent text-accent-ink' : 'border border-hairline text-faint'
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span className={`text-2xs ${reached ? 'text-ink' : 'text-faint'}`}>{item.label}</span>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <InfoCard title="Status">
          <dl className="space-y-2 text-sm">
            <Row label="Order" value={ORDER_STATUS_LABELS[status] ?? status} />
            <Row label="Payment" value={PAYMENT_STATUS_LABELS[paymentStatus] ?? paymentStatus} />
            {order.trackingNumber && <Row label="Tracking" value={order.trackingNumber} />}
          </dl>
        </InfoCard>

        <InfoCard title={order.deliveryMethod === 'PICKUP' ? 'Collection' : 'Delivery'}>
          {order.deliveryMethod === 'PICKUP' ? (
            <p className="text-sm text-muted">{settings.delivery.pickupAddress}</p>
          ) : address ? (
            <address className="text-sm not-italic leading-relaxed text-muted">
              {address.firstName} {address.lastName}
              <br />
              {address.line1}
              {address.line2 ? (
                <>
                  <br />
                  {address.line2}
                </>
              ) : null}
              <br />
              {address.city}
              {address.region ? `, ${address.region}` : ''}
              <br />
              {address.phone}
            </address>
          ) : (
            <p className="text-sm text-muted">No delivery address on file.</p>
          )}
        </InfoCard>
      </div>

      <div className="mt-6 rounded-xl border border-hairline bg-surface">
        <p className="border-b border-hairline px-5 py-3.5 text-xs font-medium uppercase tracking-[0.1em] text-muted">
          Items
        </p>
        <ul className="divide-y divide-hairline">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center gap-4 px-5 py-4">
              <span className="product-ground relative h-16 w-14 shrink-0 overflow-hidden rounded border border-hairline">
                {item.imageUrl && (
                  <Image src={item.imageUrl} alt="" fill sizes="56px" className="object-contain p-1.5" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-ink">{item.productName}</span>
                <span className="block text-xs text-muted">
                  {item.variantName} · Qty {item.quantity} · {item.sku}
                </span>
              </span>
              <span className="text-sm tabular text-ink">{money(item.lineTotal)}</span>
            </li>
          ))}
        </ul>

        <dl className="space-y-2.5 border-t border-hairline px-5 py-4 text-sm">
          <Row label="Subtotal" value={money(order.subtotal)} />
          {order.discountTotal > 0 && <Row label="Discount" value={`−${money(order.discountTotal)}`} />}
          <Row label="Delivery" value={order.deliveryTotal === 0 ? 'Free' : money(order.deliveryTotal)} />
          {order.refundedTotal > 0 && <Row label="Refunded" value={`−${money(order.refundedTotal)}`} />}
          <div className="flex items-baseline justify-between border-t border-hairline pt-3">
            <dt className="text-[15px] font-medium text-ink">Total</dt>
            <dd className="text-[17px] font-medium tabular text-ink">{money(order.grandTotal)}</dd>
          </div>
        </dl>
      </div>

      {order.events.filter((event) => event.visibleToCustomer).length > 0 && (
        <div className="mt-6 rounded-xl border border-hairline bg-surface p-5">
          <p className="eyebrow mb-4">History</p>
          <ol className="space-y-3.5">
            {order.events
              .filter((event) => event.visibleToCustomer)
              .map((event) => (
                <li key={event.id} className="flex gap-3.5 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-ink">{event.message}</span>
                    <span className="block text-2xs text-faint">{formatDateTime(event.createdAt)}</span>
                  </span>
                </li>
              ))}
          </ol>
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        {!paid && !cancelled && <LinkButton href="/checkout">Complete payment</LinkButton>}
        <LinkButton href="/shop" variant={paid ? 'primary' : 'secondary'}>
          Continue shopping
        </LinkButton>
        {user && (
          <LinkButton href="/account/orders" variant="secondary">
            All your orders
          </LinkButton>
        )}
      </div>

      <p className="mt-8 text-center text-xs text-faint">
        Questions about this order?{' '}
        <Link href="/contact" className="text-accent underline underline-offset-4">
          Contact us
        </Link>{' '}
        quoting {order.orderNumber}.
      </p>
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface p-5">
      <p className="eyebrow mb-3">{title}</p>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular text-ink">{value}</dd>
    </div>
  );
}
