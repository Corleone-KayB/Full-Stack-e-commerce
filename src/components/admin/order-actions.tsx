'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { apiPatch, apiPost, errorMessage } from '@/lib/client-api';
import { useToast } from '@/components/providers';
import { Button, Checkbox, ConfirmDialog, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/types/enums';

/**
 * Order actions.
 *
 * Only the transitions the server will actually accept are offered — the
 * status machine lives in one place (types/enums.ts) and both sides read it,
 * so the UI can never present a move that then fails.
 */

export function OrderActions({
  orderNumber,
  status,
  nextStatuses,
  trackingNumber,
  trackingUrl,
  internalNote,
  canWrite,
  canRefund,
  payments,
}: {
  orderNumber: string;
  status: OrderStatus;
  nextStatuses: OrderStatus[];
  trackingNumber: string | null;
  trackingUrl: string | null;
  internalNote: string | null;
  canWrite: boolean;
  canRefund: boolean;
  payments: { id: string; label: string; maxRefundable: number }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [pendingStatus, setPendingStatus] = React.useState<OrderStatus | null>(null);
  const [notify, setNotify] = React.useState(true);
  const [tracking, setTracking] = React.useState(trackingNumber ?? '');
  const [trackingLink, setTrackingLink] = React.useState(trackingUrl ?? '');
  const [note, setNote] = React.useState('');
  const [internal, setInternal] = React.useState(internalNote ?? '');
  const [refundOpen, setRefundOpen] = React.useState(false);

  async function applyStatus(next: OrderStatus) {
    setBusy(true);
    try {
      await apiPatch(`/api/orders/${orderNumber}`, {
        status: next,
        notifyCustomer: notify,
        trackingNumber: tracking || undefined,
        trackingUrl: trackingLink || undefined,
      });
      toast.success(`Order ${ORDER_STATUS_LABELS[next].toLowerCase()}`, notify ? 'The customer has been emailed.' : undefined);
      router.refresh();
    } catch (error) {
      toast.error("Couldn't update the order", errorMessage(error));
    } finally {
      setBusy(false);
      setPendingStatus(null);
    }
  }

  return (
    <>
      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-4 text-sm font-medium text-ink">Actions</h2>

        {!canWrite ? (
          <p className="text-[13px] text-muted">
            Your role can view orders but not change them.
          </p>
        ) : nextStatuses.length === 0 ? (
          <p className="text-[13px] text-muted">
            This order is {ORDER_STATUS_LABELS[status].toLowerCase()} — no further status changes are possible.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {nextStatuses.map((next) => (
                <Button
                  key={next}
                  size="sm"
                  variant={next === 'CANCELLED' || next === 'REFUNDED' ? 'secondary' : 'primary'}
                  onClick={() => setPendingStatus(next)}
                  disabled={busy}
                >
                  Mark {ORDER_STATUS_LABELS[next].toLowerCase()}
                </Button>
              ))}
            </div>

            <Checkbox
              label="Email the customer about this change"
              checked={notify}
              onChange={(event) => setNotify(event.target.checked)}
            />
          </div>
        )}

        {canWrite && (
          <div className="mt-5 space-y-3 border-t border-hairline pt-5">
            <Field label="Tracking number">
              <Input
                value={tracking}
                onChange={(event) => setTracking(event.target.value)}
                placeholder="AE123456789"
                className="h-9 text-[13px]"
              />
            </Field>
            <Field label="Tracking URL">
              <Input
                value={trackingLink}
                onChange={(event) => setTrackingLink(event.target.value)}
                placeholder="https://…"
                className="h-9 text-[13px]"
              />
            </Field>
            <Button
              size="sm"
              variant="secondary"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await apiPatch(`/api/orders/${orderNumber}`, {
                    trackingNumber: tracking || null,
                    trackingUrl: trackingLink || null,
                  });
                  toast.success('Tracking saved');
                  router.refresh();
                } catch (error) {
                  toast.error("Couldn't save tracking", errorMessage(error));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save tracking
            </Button>
          </div>
        )}

        {canWrite && (
          <div className="mt-5 space-y-3 border-t border-hairline pt-5">
            <Field label="Internal note" hint="Only visible in this admin.">
              <Textarea
                value={internal}
                onChange={(event) => setInternal(event.target.value)}
                rows={3}
                className="text-[13px]"
              />
            </Field>
            <Field label="Timeline note" hint="Added to the order history.">
              <Input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Called the customer to confirm the address"
                className="h-9 text-[13px]"
              />
            </Field>
            <Button
              size="sm"
              variant="secondary"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await apiPatch(`/api/orders/${orderNumber}`, {
                    internalNote: internal || null,
                    note: note || undefined,
                  });
                  setNote('');
                  toast.success('Note saved');
                  router.refresh();
                } catch (error) {
                  toast.error("Couldn't save the note", errorMessage(error));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save notes
            </Button>
          </div>
        )}

        {canRefund && payments.length > 0 && (
          <div className="mt-5 border-t border-hairline pt-5">
            <Button size="sm" variant="danger" onClick={() => setRefundOpen(true)}>
              Issue a refund
            </Button>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={!!pendingStatus}
        loading={busy}
        onClose={() => setPendingStatus(null)}
        onConfirm={() => pendingStatus && applyStatus(pendingStatus)}
        title={`Mark this order ${pendingStatus ? ORDER_STATUS_LABELS[pendingStatus].toLowerCase() : ''}?`}
        body={
          pendingStatus === 'CANCELLED'
            ? 'Reserved stock will be released back to the shelf, and the customer will be told the order was cancelled.'
            : pendingStatus === 'REFUNDED'
              ? 'This marks the order refunded and returns the items to stock. Money is only moved by issuing a refund on the payment.'
              : notify
                ? 'The customer will receive an email about this change.'
                : 'The customer will not be notified.'
        }
        confirmLabel="Confirm"
        destructive={pendingStatus === 'CANCELLED' || pendingStatus === 'REFUNDED'}
      />

      <RefundDialog
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        payments={payments}
        onDone={() => {
          setRefundOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}

function RefundDialog({
  open,
  onClose,
  payments,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  payments: { id: string; label: string; maxRefundable: number }[];
  onDone: () => void;
}) {
  const toast = useToast();
  const [paymentId, setPaymentId] = React.useState(payments[0]?.id ?? '');
  const [amount, setAmount] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const selected = payments.find((payment) => payment.id === paymentId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Issue a refund"
      description="The refund is sent to the provider. Only providers that support automated refunds will accept it."
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await apiPost('/api/payments/refund', {
                  paymentId,
                  amount: amount ? Math.round(Number(amount) * 100) : undefined,
                  reason: reason || undefined,
                });
                toast.success('Refund issued');
                onDone();
              } catch (error) {
                toast.error('Refund failed', errorMessage(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            Refund
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Payment">
          <Select value={paymentId} onChange={(event) => setPaymentId(event.target.value)}>
            {payments.map((payment) => (
              <option key={payment.id} value={payment.id}>
                {payment.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Amount"
          hint={
            selected
              ? `Leave blank to refund everything still outstanding on this payment (${(selected.maxRefundable / 100).toFixed(2)}).`
              : undefined
          }
        >
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="Full amount"
          />
        </Field>
        <Field label="Reason" hint="Recorded in the audit log and the order history.">
          <Input value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
