import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePagePermission } from '@/lib/auth';
import { formatMoney } from '@/lib/money';
import { getCurrency } from '@/lib/services/currency.service';
import { getOrderByNumber, parseOrderAddress } from '@/lib/services/order.service';
import { decodeJson } from '@/lib/json';
import { formatDateTime } from '@/lib/utils';
import { hasPermission } from '@/lib/rbac';
import { OrderActions } from '@/components/admin/order-actions';
import { PageHeader, StatusBadge } from '@/components/admin/data-table';
import { Badge } from '@/components/ui';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TRANSITIONS,
  PAYMENT_STATUS_LABELS,
  type OrderStatus,
  type PaymentStatus,
} from '@/types/enums';

export const dynamic = 'force-dynamic';

type Params = Promise<{ orderNumber: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { orderNumber } = await params;
  return { title: `Order ${orderNumber}` };
}

const PROVIDER_LABELS: Record<string, string> = {
  card: 'Credit / debit card',
  mtn_momo: 'MTN Mobile Money',
  airtel_money: 'Airtel Money',
  simulator: 'Sandbox wallet',
};

export default async function AdminOrderPage({ params }: { params: Params }) {
  const user = await requirePagePermission('order:read');
  const { orderNumber } = await params;

  const order = await getOrderByNumber(orderNumber);
  if (!order) notFound();

  const currency = await getCurrency(order.currency);
  const money = (amount: number) => formatMoney(amount, currency);
  const shipping = parseOrderAddress(order.shippingAddress);
  const status = order.status as OrderStatus;

  const canWrite = hasPermission(user.permissions, 'order:write');
  const canRefund = hasPermission(user.permissions, 'payment:refund');
  const nextStatuses = ORDER_STATUS_TRANSITIONS[status] ?? [];

  return (
    <>
      <PageHeader
        title={order.orderNumber}
        description={`Placed ${formatDateTime(order.placedAt)}${order.isDemo ? ' · demo data' : ''}`}
        actions={
          <>
            <StatusBadge status={order.status} label={ORDER_STATUS_LABELS[status]} />
            <StatusBadge
              status={order.paymentStatus}
              label={PAYMENT_STATUS_LABELS[order.paymentStatus as PaymentStatus]}
            />
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <Card title={`Items · ${order.items.length}`}>
            <ul className="divide-y divide-hairline">
              {order.items.map((item) => {
                const attributes = decodeJson<Record<string, string>>(item.attributes, {});
                return (
                  <li key={item.id} className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
                    <span className="product-ground relative h-14 w-12 shrink-0 overflow-hidden rounded border border-hairline">
                      {item.imageUrl && (
                        <Image src={item.imageUrl} alt="" fill sizes="48px" className="object-contain p-1" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink">{item.productName}</span>
                      <span className="block truncate text-xs text-muted">
                        {item.variantName} · {item.sku}
                      </span>
                      {Object.keys(attributes).length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {Object.entries(attributes).map(([key, value]) => (
                            <Badge key={key} tone="outline">
                              {key}: {value}
                            </Badge>
                          ))}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[13px] tabular text-ink">{money(item.lineTotal)}</span>
                      <span className="block text-xs text-muted">
                        {item.quantity} × {money(item.unitPrice)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>

            <dl className="mt-4 space-y-2 border-t border-hairline pt-4 text-[13px]">
              <Row label="Subtotal" value={money(order.subtotal)} />
              {order.discountTotal > 0 && (
                <Row label={`Discount${order.couponCode ? ` (${order.couponCode})` : ''}`} value={`−${money(order.discountTotal)}`} />
              )}
              <Row label="Delivery" value={order.deliveryTotal === 0 ? 'Free' : money(order.deliveryTotal)} />
              {order.refundedTotal > 0 && <Row label="Refunded" value={`−${money(order.refundedTotal)}`} />}
              <div className="flex justify-between border-t border-hairline pt-2.5">
                <dt className="font-medium text-ink">Total</dt>
                <dd className="text-[15px] font-medium tabular text-ink">{money(order.grandTotal)}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Payments">
            {order.payments.length === 0 ? (
              <p className="py-4 text-sm text-muted">No payment has been attempted.</p>
            ) : (
              <ul className="space-y-4">
                {order.payments.map((payment) => (
                  <li key={payment.id} className="rounded border border-hairline bg-canvas p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[13px] text-ink">
                          {PROVIDER_LABELS[payment.provider] ?? payment.provider}
                          {payment.cardBrand && ` · ${payment.cardBrand} ••${payment.cardLast4}`}
                          {payment.payerMasked && ` · ${payment.payerMasked}`}
                        </p>
                        <p className="mt-0.5 font-mono text-2xs text-faint">{payment.externalRef}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusBadge
                          status={payment.status}
                          label={PAYMENT_STATUS_LABELS[payment.status as PaymentStatus]}
                        />
                        <span className="text-[13px] tabular text-ink">{money(payment.amount)}</span>
                      </div>
                    </div>

                    {payment.chargedCurrency && payment.chargedCurrency !== payment.currency && (
                      <p className="mt-2 text-xs text-muted">
                        Charged {payment.chargedAmount} {payment.chargedCurrency} at a rate of{' '}
                        {payment.exchangeRate?.toFixed(4)} — frozen at the time of payment.
                      </p>
                    )}
                    {payment.failureMessage && (
                      <p className="mt-2 text-xs text-critical">{payment.failureMessage}</p>
                    )}

                    {payment.events.length > 0 && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-2xs uppercase tracking-[0.1em] text-faint">
                          {payment.events.length} provider event{payment.events.length === 1 ? '' : 's'}
                        </summary>
                        <ul className="mt-2 space-y-1.5 border-l border-hairline pl-3">
                          {payment.events.map((event) => (
                            <li key={event.id} className="text-xs">
                              <span className="text-ink">{event.type}</span>
                              <span className="text-faint">
                                {' · '}
                                {event.source.toLowerCase()}
                                {event.signatureValid === false ? ' · signature rejected' : ''}
                                {' · '}
                                {formatDateTime(event.createdAt)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="History">
            <ol className="space-y-3.5">
              {order.events.map((event) => (
                <li key={event.id} className="flex gap-3.5 text-[13px]">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-ink">{event.message}</span>
                    <span className="block text-xs text-faint">
                      {formatDateTime(event.createdAt)}
                      {event.actor ? ` · ${event.actor.firstName ?? event.actor.email}` : ''}
                      {!event.visibleToCustomer ? ' · internal' : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-5">
          <OrderActions
            orderNumber={order.orderNumber}
            status={status}
            nextStatuses={nextStatuses}
            trackingNumber={order.trackingNumber}
            trackingUrl={order.trackingUrl}
            internalNote={order.internalNote}
            canWrite={canWrite}
            canRefund={canRefund}
            payments={order.payments
              .filter((payment) => payment.status === 'SUCCESSFUL' || payment.status === 'PARTIALLY_REFUNDED')
              .map((payment) => ({
                id: payment.id,
                label: `${PROVIDER_LABELS[payment.provider] ?? payment.provider} · ${money(payment.amount)}`,
                maxRefundable: (payment.chargedAmount ?? payment.amount) - payment.refundedAmount,
              }))}
          />

          <Card title="Customer">
            <p className="text-[13px] text-ink">
              {order.user ? `${order.user.firstName ?? ''} ${order.user.lastName ?? ''}`.trim() || order.email : 'Guest'}
            </p>
            <p className="text-xs text-muted">{order.email}</p>
            {order.phone && <p className="text-xs text-muted">{order.phone}</p>}
            {order.user && (
              <Link
                href={`/admin/customers/${order.user.id}`}
                className="mt-3 inline-block text-xs text-accent underline underline-offset-4"
              >
                Customer record
              </Link>
            )}
          </Card>

          <Card title={order.deliveryMethod === 'PICKUP' ? 'Collection' : 'Delivery'}>
            {shipping ? (
              <address className="text-[13px] not-italic leading-relaxed text-muted">
                {shipping.firstName} {shipping.lastName}
                <br />
                {shipping.line1}
                {shipping.line2 ? (
                  <>
                    <br />
                    {shipping.line2}
                  </>
                ) : null}
                <br />
                {shipping.city}
                {shipping.region ? `, ${shipping.region}` : ''}
                <br />
                {shipping.phone}
              </address>
            ) : (
              <p className="text-[13px] text-muted">Collection from the counter.</p>
            )}
            {order.deliveryZone && <p className="mt-3 text-xs text-faint">Zone: {order.deliveryZone.name}</p>}
            {order.customerNote && (
              <p className="mt-3 rounded bg-ink/5 px-3 py-2 text-xs text-muted">“{order.customerNote}”</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-hairline bg-surface p-5">
      <h2 className="mb-4 text-sm font-medium text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular text-ink">{value}</dd>
    </div>
  );
}
