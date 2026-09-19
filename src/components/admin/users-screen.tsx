'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { apiPatch, apiPost, errorMessage } from '@/lib/client-api';
import { useToast } from '@/components/providers';
import { Badge, Button, Field, Input, Modal, Select, Switch } from '@/components/ui';
import { DataTable, type Column } from './data-table';
import { ADMIN_ROLE_KEYS } from '@/types/enums';
import { ROLE_DEFINITIONS } from '@/lib/rbac';

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  roleKey: string;
  roleName: string;
  active: boolean;
  lastLoginLabel: string;
}

export function UsersScreen({
  rows,
  currentUserId,
  currentRole,
}: {
  rows: AdminUserRow[];
  currentUserId: string;
  currentRole: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [creating, setCreating] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [temporaryPassword, setTemporaryPassword] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({ email: '', firstName: '', lastName: '', roleKey: 'SUPPORT' });

  async function patchUser(id: string, body: Record<string, unknown>, message: string) {
    try {
      await apiPatch(`/api/admin/users/${id}`, body);
      toast.success(message);
      router.refresh();
    } catch (error) {
      toast.error("Couldn't update", errorMessage(error));
    }
  }

  const columns: Column<AdminUserRow>[] = [
    {
      key: 'user',
      header: 'Person',
      render: (row) => (
        <span>
          <span className="block font-medium">
            {row.name}
            {row.id === currentUserId && <span className="ml-2 text-xs text-faint">(you)</span>}
          </span>
          <span className="block text-xs text-muted">{row.email}</span>
        </span>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (row) => (
        <Select
          value={row.roleKey}
          disabled={row.id === currentUserId}
          onChange={(event) => patchUser(row.id, { roleKey: event.target.value }, 'Role changed')}
          className="h-9 w-[170px] text-[13px]"
          aria-label={`Role for ${row.email}`}
        >
          {ADMIN_ROLE_KEYS.map((key) => (
            <option key={key} value={key} disabled={key === 'SUPER_ADMIN' && currentRole !== 'SUPER_ADMIN'}>
              {ROLE_DEFINITIONS[key].name}
            </option>
          ))}
        </Select>
      ),
    },
    {
      key: 'lastLogin',
      header: 'Last sign-in',
      hideBelow: 'md',
      render: (row) => <span className="text-muted">{row.lastLoginLabel}</span>,
    },
    {
      key: 'active',
      header: 'Access',
      render: (row) =>
        row.id === currentUserId ? (
          <Badge tone="positive">Active</Badge>
        ) : (
          <Switch
            label={row.active ? 'Active' : 'Suspended'}
            checked={row.active}
            onChange={(value) => patchUser(row.id, { active: value }, value ? 'Access restored' : 'Access suspended')}
          />
        ),
    },
  ];

  return (
    <>
      <div className="mb-5 flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" />
          Add a person
        </Button>
      </div>

      <DataTable rows={rows} columns={columns} emptyTitle="No admin users" />

      <Modal
        open={creating}
        onClose={() => {
          setCreating(false);
          setTemporaryPassword(null);
        }}
        title="Add an admin user"
        description="They receive a temporary password you hand over yourself — it is shown once and never stored in the clear."
        footer={
          temporaryPassword ? (
            <Button
              size="sm"
              onClick={() => {
                setCreating(false);
                setTemporaryPassword(null);
              }}
            >
              Done
            </Button>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const created = await apiPost<{ temporaryPassword?: string }>('/api/admin/users', form);
                    setTemporaryPassword(created.temporaryPassword ?? null);
                    toast.success('User created');
                    router.refresh();
                  } catch (error) {
                    toast.error("Couldn't create the user", errorMessage(error));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Create
              </Button>
            </>
          )
        }
      >
        {temporaryPassword ? (
          <div className="space-y-3">
            <p className="text-sm text-ink">Temporary password for {form.email}:</p>
            <p className="select-all rounded border border-hairline bg-canvas px-4 py-3 font-mono text-sm text-ink">
              {temporaryPassword}
            </p>
            <p className="text-xs text-muted">
              This is the only time it is shown. Send it to them over a channel you trust and ask them to change it.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" required>
              <Input value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
            </Field>
            <Field label="Last name" required>
              <Input value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
            </Field>
            <Field label="Email" required className="sm:col-span-2">
              <Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </Field>
            <Field label="Role" className="sm:col-span-2" hint={ROLE_DEFINITIONS[form.roleKey as 'SUPPORT']?.description}>
              <Select value={form.roleKey} onChange={(event) => setForm({ ...form, roleKey: event.target.value })}>
                {ADMIN_ROLE_KEYS.map((key) => (
                  <option key={key} value={key} disabled={key === 'SUPER_ADMIN' && currentRole !== 'SUPER_ADMIN'}>
                    {ROLE_DEFINITIONS[key].name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
      </Modal>
    </>
  );
}
