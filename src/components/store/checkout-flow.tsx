'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, CreditCard, Lock, ShoppingBag, Smartphone, Store, Truck } from 'lucide-react';
import { ApiError, apiPost, errorMessage } from '@/lib/client-api';
import { cn } from '@/lib/utils';
import { useCart, useCurrency } from '@/components/providers';
import { Badge, Button, Checkbox, EmptyState, Field, Input, LinkButton, Select, Textarea } from '@/components/ui';
import type { CartDTO } from '@/lib/services/cart.service';
import type { ProviderDescriptor } from '@/lib/payments/types';

/**
 * Checkout.
 *
 * Four steps on one page, with the order summary always visible on desktop and
 * collapsible on mobile. The order is created on the server when the customer
 * reaches payment — before that, nothing is written — and the total shown is
 * the total the server calculated, sent back as `expectedTotal` purely so a
 * stale page is rejected rather than silently charged a different amount.
 */

export interface CheckoutZone {
  id: string;
  name: string;
  fee: number;
  freeThreshold: number | null;
  minDays: number;
  maxDays: number;
  pickupAvailable: boolean;
}

interface CheckoutFlowProps {
  initialCart: CartDTO;
  zones: CheckoutZone[];
  providers: ProviderDescriptor[];
  pickupEnabled: boolean;
  pickupAddress: string | null;
  securityCopy: string;
  user: { email: string; firstName: string | null; lastName: string | null; phone: string | null } | null;
  defaultAddress: {
    firstName: string;
    lastName: string;
    phone: string;
    line1: string;
    line2: string | null;
    city: string;
    region: string | null;
    postalCode: string | null;
    country: string;
  } | null;
}

type Step = 'contact' | 'delivery' | 'review' | 'payment';

const STEPS: { id: Step; label: string }[] = [
  { id: 'contact', label: 'Contact' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'review', label: 'Review' },
  { id: 'payment', label: 'Payment' },
];

export function CheckoutFlow({
  initialCart,
  zones,
  providers,
  pickupEnabled,
  pickupAddress,
  securityCopy,
  user,
  defaultAddress,
}: CheckoutFlowProps) {
  const router = useRouter();
  const { format } = useCurrency();
  const { refresh } = useCart();

  const [cart, setCart] = React.useState(initialCart);
  const [step, setStep] = React.useState<Step>('contact');
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const [email, setEmail] = React.useState(user?.email ?? '');
  const [phone, setPhone] = React.useState(user?.phone ?? '');
  const [createAccount, setCreateAccount] = React.useState(false);
  const [password, setPassword] = React.useState('');

  const [method, setMethod] = React.useState<'DELIVERY' | 'PICKUP'>('DELIVERY');
  const [zoneId, setZoneId] = React.useState(zones[0]?.id ?? '');
  const [address, setAddress] = React.useState({
    firstName: defaultAddress?.firstName ?? user?.firstName ?? '',
    lastName: defaultAddress?.lastName ?? user?.lastName ?? '',
    phone: defaultAddress?.phone ?? user?.phone ?? '',
    line1: defaultAddress?.line1 ?? '',
    line2: defaultAddress?.line2 ?? '',
    city: defaultAddress?.city ?? '',
    region: defaultAddress?.region ?? '',
    postalCode: defaultAddress?.postalCode ?? '',
    country: defaultAddress?.country ?? 'AE',
  });
  const [note, setNote] = React.useState('');

  const [order, setOrder] = React.useState<{ id: string; orderNumber: string; grandTotal: number } | null>(null);
  const [providerId, setProviderId] = React.useState(providers[0]?.id ?? '');
  const [providerFields, setProviderFields] = React.useState<Record<string, string>>({});

  const activeProvider = providers.find((p) => p.id === providerId) ?? null;

  // Re-price whenever the delivery choice changes: fees and free-delivery
  // thresholds are zone-dependent, and the customer must see the real total
  // before they commit.
  React.useEffect(() => {
    let cancelled = false;
    async function reprice() {
      try {
        const params = new URLSearchParams({ deliveryMethod: method });
        if (zoneId) params.set('deliveryZoneId', zoneId);
        const next = await apiPost<CartDTO>(`/api/checkout/quote`, {
          deliveryMethod: method,
          deliveryZoneId: zoneId || null,
        });
        if (!cancelled) setCart(next);
      } catch {
        // Keep the previous figures rather than showing nothing.
      }
    }
    void reprice();
    return () => {
      cancelled = true;
    };
  }, [method, zoneId]);

  const blockingIssues = cart.issues.filter((issue) => issue.code !== 'COUPON_INVALID');

  function validateContact(): boolean {
    const errors: Record<string, string> = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.email = 'Enter a valid email address.';
    if (createAccount && password.length < 10) errors.password = 'Use at least 10 characters.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function validateDelivery(): boolean {
    if (method === 'PICKUP') return true;
    const errors: Record<string, string> = {};
    if (!address.firstName.trim()) errors.firstName = 'Required';
    if (!address.lastName.trim()) errors.lastName = 'Required';
    if (address.phone.trim().length < 7) errors.phone = 'Enter a contact number.';
    if (!address.line1.trim()) errors.line1 = 'Required';
    if (!address.city.trim()) errors.city = 'Required';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  /** Creates the order, then starts the payment with the chosen provider. */
  async function placeOrder() {
    setSubmitting(true);
    setFormError(null);
    try {
      let currentOrder = order;
      if (!currentOrder) {
        currentOrder = await apiPost<{ id: string; orderNumber: string; grandTotal: number }>('/api/orders', {
          email,
          phone: phone || address.phone || undefined,
          deliveryMethod: method,
          deliveryZoneId: method === 'DELIVERY' ? zoneId || null : null,
          shippingAddress: method === 'DELIVERY' ? { ...address, line2: address.line2 || null } : null,
          customerNote: note || undefined,
          expectedTotal: cart.totals.grandTotal,
          createAccount: createAccount || undefined,
          password: createAccount ? password : undefined,
        });
        setOrder(currentOrder);
      }

      const payment = await apiPost<{
        externalRef: string;
        status: string;
        redirectUrl?: string;
        instruction?: string;
      }>('/api/payments/initiate', {
        orderId: currentOrder.id,
        provider: providerId,
        fields: providerFields,
      });

      await refresh();

      if (payment.redirectUrl) {
        window.location.href = payment.redirectUrl;
        return;
      }
      router.push(`/checkout/processing?ref=${payment.externalRef}`);
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors);
        if (error.code === 'PRICE_CHANGED' || error.code === 'OUT_OF_STOCK') {
          setFormError(`${error.message} Your bag has been refreshed.`);
          await refresh();
          setOrder(null);
        } else {
          setFormError(error.message);
        }
      } else {
        setFormError(errorMessage(error));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (cart.lines.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag className="h-6 w-6" />}
        title="Your bag is empty"
        body="Add a device before checking out."
        action={<LinkButton href="/shop">Shop iPhone</LinkButton>}
        className="rounded-lg border border-hairline bg-surface"
      />
    );
  }

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="grid gap-10 lg:grid-cols-[1.35fr_1fr] lg:gap-16">
      <div className="min-w-0">
        <ol className="mb-9 flex items-center gap-2" aria-label="Checkout progress">
          {STEPS.map((item, index) => {
            const state = index < stepIndex ? 'done' : index === stepIndex ? 'current' : 'todo';
            return (
              <li key={item.id} className="flex flex-1 items-center gap-2">
                <button
                  type="button"
                  disabled={index > stepIndex}
                  onClick={() => index < stepIndex && setStep(item.id)}
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors',
                    state === 'done' && 'bg-accent text-accent-ink',
                    state === 'current' && 'bg-ink text-canvas',
                    state === 'todo' && 'border border-hairline text-faint',
                  )}
                  aria-current={state === 'current' ? 'step' : undefined}
                >
                  {state === 'done' ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </button>
                <span
                  className={cn(
                    'hidden text-xs sm:block',
                    state === 'todo' ? 'text-faint' : 'text-ink',
                  )}
                >
                  {item.label}
                </span>
                {index < STEPS.length - 1 && <span className="h-px flex-1 bg-hairline" aria-hidden />}
              </li>
            );
          })}
        </ol>

        {blockingIssues.length > 0 && (
          <div className="mb-6 rounded-lg border border-caution/40 bg-caution/8 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-caution">
              <AlertTriangle className="h-4 w-4" />
              Your bag changed
            </p>
            <ul className="mt-2 space-y-1 pl-6 text-[13px] text-muted">
              {blockingIssues.map((issue, index) => (
                <li key={index} className="list-disc">
                  {issue.message}
                </li>
              ))}
            </ul>
            <Link href="/cart" className="mt-3 inline-block text-[13px] font-medium text-accent underline underline-offset-4">
              Review your bag
            </Link>
          </div>
        )}

        {formError && (
          <div className="mb-6 rounded-lg border border-critical/40 bg-critical/8 p-4" role="alert">
            <p className="text-sm text-critical">{formError}</p>
          </div>
        )}

        {/* ---------------------------------------------------------- Contact */}
        {step === 'contact' && (
          <section className="animate-fade-up space-y-5">
            <h2 className="font-display text-2xl tracking-tight text-ink">How can we reach you?</h2>
            <Field label="Email address" required error={fieldErrors.email} htmlFor="checkout-email">
              <Input
                id="checkout-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                invalid={!!fieldErrors.email}
                placeholder="you@example.com"
              />
            </Field>
            <Field label="Mobile number" hint="For delivery updates only." htmlFor="checkout-phone">
              <Input
                id="checkout-phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+971 50 000 0000"
              />
            </Field>

            {!user && (
              <div className="rounded-lg border border-hairline bg-surface p-4">
                <Checkbox
                  label="Create an account"
                  description="Track this order and check out faster next time. Optional — you can order as a guest."
                  checked={createAccount}
                  onChange={(event) => setCreateAccount(event.target.checked)}
                />
                {createAccount && (
                  <div className="mt-4">
                    <Field label="Choose a password" required error={fieldErrors.password} htmlFor="checkout-password">
                      <Input
                        id="checkout-password"
                        type="password"
                        autoComplete="new-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        invalid={!!fieldErrors.password}
                      />
                    </Field>
                  </div>
                )}
              </div>
            )}

            <Button
              size="lg"
              className="w-full sm:w-auto"
              onClick={() => validateContact() && setStep('delivery')}
            >
              Continue to delivery
            </Button>
          </section>
        )}

        {/* --------------------------------------------------------- Delivery */}
        {step === 'delivery' && (
          <section className="animate-fade-up space-y-6">
            <h2 className="font-display text-2xl tracking-tight text-ink">Where should it go?</h2>

            {pickupEnabled && (
              <div className="grid gap-3 sm:grid-cols-2">
                <MethodCard
                  active={method === 'DELIVERY'}
                  onClick={() => setMethod('DELIVERY')}
                  icon={<Truck className="h-4 w-4" />}
                  title="Delivery"
                  body="To your address, 1–3 working days."
                />
                <MethodCard
                  active={method === 'PICKUP'}
                  onClick={() => setMethod('PICKUP')}
                  icon={<Store className="h-4 w-4" />}
                  title="Collection"
                  body={pickupAddress ?? 'From our counter.'}
                />
              </div>
            )}

            {method === 'DELIVERY' ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="First name" required error={fieldErrors.firstName}>
                    <Input
                      autoComplete="given-name"
                      value={address.firstName}
                      onChange={(event) => setAddress({ ...address, firstName: event.target.value })}
                      invalid={!!fieldErrors.firstName}
                    />
                  </Field>
                  <Field label="Last name" required error={fieldErrors.lastName}>
                    <Input
                      autoComplete="family-name"
                      value={address.lastName}
                      onChange={(event) => setAddress({ ...address, lastName: event.target.value })}
                      invalid={!!fieldErrors.lastName}
                    />
                  </Field>
                </div>

                <Field label="Contact number" required error={fieldErrors.phone}>
                  <Input
                    type="tel"
                    autoComplete="tel"
                    value={address.phone}
                    onChange={(event) => setAddress({ ...address, phone: event.target.value })}
                    invalid={!!fieldErrors.phone}
                  />
                </Field>

                <Field label="Address" required error={fieldErrors.line1}>
                  <Input
                    autoComplete="address-line1"
                    placeholder="Street and building"
                    value={address.line1}
                    onChange={(event) => setAddress({ ...address, line1: event.target.value })}
                    invalid={!!fieldErrors.line1}
                  />
                </Field>
                <Field label="Apartment, floor (optional)">
                  <Input
                    autoComplete="address-line2"
                    value={address.line2}
                    onChange={(event) => setAddress({ ...address, line2: event.target.value })}
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="City" required error={fieldErrors.city}>
                    <Input
                      autoComplete="address-level2"
                      value={address.city}
                      onChange={(event) => setAddress({ ...address, city: event.target.value })}
                      invalid={!!fieldErrors.city}
                    />
                  </Field>
                  <Field label="Delivery zone">
                    <Select value={zoneId} onChange={(event) => setZoneId(event.target.value)}>
                      {zones.map((zone) => (
                        <option key={zone.id} value={zone.id}>
                          {zone.name} — {zone.fee === 0 ? 'free' : format(zone.fee)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-hairline bg-surface p-5">
                <p className="text-sm font-medium text-ink">Collect from</p>
                <p className="mt-1 text-sm text-muted">{pickupAddress}</p>
                <p className="mt-3 text-[13px] text-muted">
                  We will email you as soon as your order is ready — usually within four working hours.
                </p>
              </div>
            )}

            <Field label="Note for the courier (optional)">
              <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} />
            </Field>

            <div className="flex gap-3">
              <Button variant="secondary" size="lg" onClick={() => setStep('contact')}>
                Back
              </Button>
              <Button size="lg" className="flex-1 sm:flex-none" onClick={() => validateDelivery() && setStep('review')}>
                Review order
              </Button>
            </div>
          </section>
        )}

        {/* ----------------------------------------------------------- Review */}
        {step === 'review' && (
          <section className="animate-fade-up space-y-6">
            <h2 className="font-display text-2xl tracking-tight text-ink">Check everything over</h2>

            <ReviewRow label="Contact" onEdit={() => setStep('contact')}>
              {email}
              {phone ? ` · ${phone}` : ''}
            </ReviewRow>

            <ReviewRow label={method === 'PICKUP' ? 'Collection' : 'Delivery'} onEdit={() => setStep('delivery')}>
              {method === 'PICKUP'
                ? pickupAddress
                : `${address.firstName} ${address.lastName}, ${address.line1}${address.line2 ? `, ${address.line2}` : ''}, ${address.city}`}
            </ReviewRow>

            <div className="rounded-lg border border-hairline bg-surface">
              <p className="border-b border-hairline px-4 py-3 text-xs font-medium uppercase tracking-[0.1em] text-muted">
                {cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'}
              </p>
              <ul className="divide-y divide-hairline">
                {cart.lines.map((line) => (
                  <li key={line.id} className="flex items-center gap-3.5 px-4 py-3.5">
                    <span className="product-ground relative h-14 w-12 shrink-0 overflow-hidden rounded border border-hairline">
                      {line.imageUrl && (
                        <Image src={line.imageUrl} alt="" fill sizes="48px" className="object-contain p-1" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{line.productName}</span>
                      <span className="block truncate text-xs text-muted">
                        {line.variantName} · Qty {line.quantity}
                      </span>
                    </span>
                    <span className="text-sm tabular text-ink">{format(line.lineTotal)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex gap-3">
              <Button variant="secondary" size="lg" onClick={() => setStep('delivery')}>
                Back
              </Button>
              <Button size="lg" className="flex-1 sm:flex-none" onClick={() => setStep('payment')}>
                Continue to payment
              </Button>
            </div>
          </section>
        )}

        {/* ---------------------------------------------------------- Payment */}
        {step === 'payment' && (
          <section className="animate-fade-up space-y-6">
            <h2 className="font-display text-2xl tracking-tight text-ink">How would you like to pay?</h2>

            {providers.length === 0 ? (
              <div className="rounded-lg border border-caution/40 bg-caution/8 p-5">
                <p className="text-sm text-caution">
                  No payment method is available right now. Please contact us and we will take your order directly.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {providers.map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => {
                      setProviderId(provider.id);
                      setProviderFields({});
                    }}
                    className={cn(
                      'flex w-full items-start gap-4 rounded-lg border p-4 text-left transition-colors',
                      providerId === provider.id
                        ? 'border-accent bg-accent/5'
                        : 'border-hairline hover:border-ink/25',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                        providerId === provider.id ? 'bg-accent/15 text-accent' : 'bg-ink/6 text-muted',
                      )}
                    >
                      {provider.kind === 'CARD' ? (
                        <CreditCard className="h-4 w-4" />
                      ) : (
                        <Smartphone className="h-4 w-4" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-medium text-ink">{provider.displayName}</span>
                        {provider.environment === 'sandbox' && <Badge tone="caution">Test mode</Badge>}
                      </span>
                      <span className="mt-1 block text-[13px] text-muted">{provider.blurb}</span>
                    </span>
                    <span
                      className={cn(
                        'mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                        providerId === provider.id ? 'border-accent bg-accent' : 'border-hairline',
                      )}
                    >
                      {providerId === provider.id && <Check className="h-2.5 w-2.5 text-accent-ink" strokeWidth={4} />}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {activeProvider?.requiredFields.map((field) => (
              <Field
                key={field.name}
                label={field.label}
                required
                error={fieldErrors[field.name]}
                hint={
                  activeProvider.kind === 'MOBILE_MONEY'
                    ? 'You will get a prompt on this number to approve the payment.'
                    : undefined
                }
              >
                <Input
                  type={field.type}
                  inputMode="tel"
                  placeholder={field.placeholder}
                  value={providerFields[field.name] ?? ''}
                  onChange={(event) =>
                    setProviderFields({ ...providerFields, [field.name]: event.target.value })
                  }
                  invalid={!!fieldErrors[field.name]}
                />
              </Field>
            ))}

            {activeProvider?.id === 'simulator' && (
              <div className="rounded border border-hairline bg-surface p-3.5 text-xs leading-relaxed text-muted">
                <strong className="text-ink">Sandbox behaviour.</strong> The last digit of the number decides the
                outcome: 0 succeeds immediately, 1 succeeds after a few seconds, 2 is declined, 3 has insufficient
                funds, 4 never responds.
              </div>
            )}

            <p className="flex items-start gap-2 text-xs leading-relaxed text-faint">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {securityCopy}
            </p>

            <div className="flex gap-3">
              <Button variant="secondary" size="lg" onClick={() => setStep('review')} disabled={submitting}>
                Back
              </Button>
              <Button
                size="lg"
                className="flex-1"
                onClick={placeOrder}
                loading={submitting}
                loadingLabel="Starting payment…"
                disabled={!providerId || providers.length === 0 || blockingIssues.length > 0}
              >
                Pay {format(cart.totals.grandTotal)}
              </Button>
            </div>
          </section>
        )}
      </div>

      <OrderSummary cart={cart} />
    </div>
  );
}

function MethodCard({
  active,
  onClick,
  icon,
  title,
  body,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-lg border p-4 text-left transition-colors',
        active ? 'border-accent bg-accent/5' : 'border-hairline hover:border-ink/25',
      )}
    >
      <span className={cn('mb-2 flex h-8 w-8 items-center justify-center rounded-full', active ? 'bg-accent/15 text-accent' : 'bg-ink/6 text-muted')}>
        {icon}
      </span>
      <span className="block text-sm font-medium text-ink">{title}</span>
      <span className="mt-0.5 block text-xs text-muted">{body}</span>
    </button>
  );
}

function ReviewRow({
  label,
  children,
  onEdit,
}: {
  label: string;
  children: React.ReactNode;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-hairline bg-surface px-4 py-3.5">
      <div className="min-w-0">
        <p className="eyebrow mb-1">{label}</p>
        <p className="text-sm text-ink">{children}</p>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 text-[13px] font-medium text-accent underline-offset-4 hover:underline"
      >
        Edit
      </button>
    </div>
  );
}

function OrderSummary({ cart }: { cart: CartDTO }) {
  const { format } = useCurrency();
  const [open, setOpen] = React.useState(false);

  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      <div className="rounded-lg border border-hairline bg-surface">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between px-5 py-4 lg:pointer-events-none"
        >
          <span className="text-sm font-medium text-ink">Order summary</span>
          <span className="flex items-center gap-2">
            <span className="text-sm tabular font-medium text-ink">{format(cart.totals.grandTotal)}</span>
            <span className="text-faint lg:hidden" aria-hidden>
              {open ? '−' : '+'}
            </span>
          </span>
        </button>

        <div className={cn('border-t border-hairline', open ? 'block' : 'hidden lg:block')}>
          <ul className="divide-y divide-hairline">
            {cart.lines.map((line) => (
              <li key={line.id} className="flex items-center gap-3 px-5 py-3.5">
                <span className="product-ground relative h-12 w-10 shrink-0 overflow-hidden rounded border border-hairline">
                  {line.imageUrl && <Image src={line.imageUrl} alt="" fill sizes="40px" className="object-contain p-1" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-ink">{line.productName}</span>
                  <span className="block truncate text-2xs text-muted">
                    {line.variantName} × {line.quantity}
                  </span>
                </span>
                <span className="text-[13px] tabular text-muted">{format(line.lineTotal)}</span>
              </li>
            ))}
          </ul>

          <dl className="space-y-2.5 border-t border-hairline px-5 py-4 text-sm">
            <Row label="Subtotal" value={format(cart.totals.subtotal)} />
            {cart.totals.discountTotal > 0 && (
              <Row
                label={cart.totals.couponLabel ?? 'Discount'}
                value={`−${format(cart.totals.discountTotal)}`}
                tone="positive"
              />
            )}
            <Row
              label="Delivery"
              value={cart.totals.deliveryTotal === 0 ? 'Free' : format(cart.totals.deliveryTotal)}
            />
            <div className="flex items-baseline justify-between border-t border-hairline pt-3">
              <dt className="text-[15px] font-medium text-ink">Total</dt>
              <dd className="text-[17px] font-medium tabular text-ink">{format(cart.totals.grandTotal)}</dd>
            </div>
            <p className="pt-1 text-2xs text-faint">{cart.estimatedDelivery}. Prices include VAT.</p>
          </dl>
        </div>
      </div>
    </aside>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'positive' }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className={cn('tabular', tone === 'positive' ? 'text-positive' : 'text-ink')}>{value}</dd>
    </div>
  );
}
