'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { apiDelete, apiPatch, apiPost, errorMessage } from '@/lib/client-api';
import { useToast } from '@/components/providers';
import { Button, Checkbox, ConfirmDialog, Field, Input, Modal } from '@/components/ui';

/** Profile, password and address book — the editable parts of an account. */

export function ProfileForm({
  initial,
}: {
  initial: { firstName: string; lastName: string; phone: string; marketingOptIn: boolean };
}) {
  const toast = useToast();
  const [form, setForm] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);
  const [passwordOpen, setPasswordOpen] = React.useState(false);

  return (
    <>
      <form
        className="max-w-lg space-y-4 rounded-lg border border-hairline bg-surface p-6"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          try {
            await apiPatch('/api/account/profile', form);
            toast.success('Saved');
          } catch (error) {
            toast.error("Couldn't save", errorMessage(error));
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name">
            <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          </Field>
          <Field label="Last name">
            <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </Field>
        </div>
        <Field label="Mobile number">
          <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Checkbox
          label="Email me occasionally about stock and offers"
          checked={form.marketingOptIn}
          onChange={(e) => setForm({ ...form, marketingOptIn: e.target.checked })}
        />
        <div className="flex flex-wrap gap-3 pt-1">
          <Button type="submit" loading={saving}>
            Save changes
          </Button>
          <Button type="button" variant="secondary" onClick={() => setPasswordOpen(true)}>
            Change password
          </Button>
        </div>
      </form>

      <PasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </>
  );
}

function PasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await apiPost('/api/account/profile', { currentPassword: current, newPassword: next });
      toast.success('Password changed', 'Other devices have been signed out.');
      setCurrent('');
      setNext('');
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change password"
      description="Other signed-in devices will be signed out."
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={saving} onClick={submit}>
            Change password
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <p className="text-[13px] text-critical">{error}</p>}
        <Field label="Current password" required>
          <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password" required hint="At least 10 characters, upper and lower case, and a number.">
          <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

export interface AddressRecord {
  id: string;
  label: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string | null;
  country: string;
  isDefault: boolean;
}

const EMPTY = {
  label: 'Home',
  firstName: '',
  lastName: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  region: '',
  postalCode: '',
  country: 'AE',
  isDefault: false,
};

export function AddressBook({ initial }: { initial: AddressRecord[] }) {
  const toast = useToast();
  const [addresses, setAddresses] = React.useState(initial);
  const [editing, setEditing] = React.useState<AddressRecord | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [form, setForm] = React.useState(EMPTY);
  const [saving, setSaving] = React.useState(false);
  const [removing, setRemoving] = React.useState<AddressRecord | null>(null);

  function openCreate() {
    setForm(EMPTY);
    setEditing(null);
    setCreating(true);
  }

  function openEdit(address: AddressRecord) {
    setForm({
      label: address.label ?? 'Address',
      firstName: address.firstName,
      lastName: address.lastName,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2 ?? '',
      city: address.city,
      region: address.region ?? '',
      postalCode: address.postalCode ?? '',
      country: address.country,
      isDefault: address.isDefault,
    });
    setEditing(address);
    setCreating(true);
  }

  async function save() {
    setSaving(true);
    try {
      const payload = { ...form, line2: form.line2 || null, region: form.region || null, postalCode: form.postalCode || null };
      if (editing) {
        const updated = await apiPatch<AddressRecord>('/api/account/addresses', { id: editing.id, ...payload });
        setAddresses((current) =>
          current.map((a) => (a.id === updated.id ? updated : form.isDefault ? { ...a, isDefault: false } : a)),
        );
      } else {
        const created = await apiPost<AddressRecord>('/api/account/addresses', payload);
        setAddresses((current) => [created, ...(form.isDefault ? current.map((a) => ({ ...a, isDefault: false })) : current)]);
      }
      toast.success(editing ? 'Address updated' : 'Address saved');
      setCreating(false);
    } catch (error) {
      toast.error("Couldn't save the address", errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!removing) return;
    try {
      await apiDelete('/api/account/addresses', { id: removing.id });
      setAddresses((current) => current.filter((a) => a.id !== removing.id));
      toast.success('Address removed');
    } catch (error) {
      toast.error("Couldn't remove it", errorMessage(error));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {addresses.map((address) => (
          <div key={address.id} className="rounded-lg border border-hairline bg-surface p-5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] font-medium text-ink">{address.label ?? 'Address'}</p>
              {address.isDefault && (
                <span className="rounded-xs bg-accent/12 px-2 py-0.5 text-2xs uppercase tracking-wide text-accent">
                  Default
                </span>
              )}
            </div>
            <address className="text-[13px] not-italic leading-relaxed text-muted">
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
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => openEdit(address)}
                className="text-xs text-accent underline underline-offset-4"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setRemoving(address)}
                className="inline-flex items-center gap-1 text-xs text-muted hover:text-critical"
              >
                <Trash2 className="h-3 w-3" />
                Remove
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={openCreate}
          className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed
                     border-hairline text-muted transition-colors hover:border-accent hover:text-accent"
        >
          <Plus className="h-5 w-5" />
          <span className="text-[13px]">Add an address</span>
        </button>
      </div>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={editing ? 'Edit address' : 'Add an address'}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={saving} onClick={save}>
              Save address
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Label">
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Home" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" required>
              <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </Field>
            <Field label="Last name" required>
              <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </Field>
          </div>
          <Field label="Contact number" required>
            <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Address" required>
            <Input value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} />
          </Field>
          <Field label="Apartment, floor">
            <Input value={form.line2} onChange={(e) => setForm({ ...form, line2: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="City" required>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </Field>
            <Field label="Emirate / region">
              <Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
            </Field>
          </div>
          <Checkbox
            label="Use as my default address"
            checked={form.isDefault}
            onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        title="Remove this address?"
        body="It will be removed from your address book. Orders already placed keep the address they were sent to."
        confirmLabel="Remove"
        destructive
      />
    </>
  );
}
