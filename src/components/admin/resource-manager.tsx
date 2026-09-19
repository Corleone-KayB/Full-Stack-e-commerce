'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { ApiError, apiDelete, apiPatch, apiPost, errorMessage } from '@/lib/client-api';
import { useToast } from '@/components/providers';
import { Badge, Button, Checkbox, ConfirmDialog, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import { DataTable, PageHeader, type Column } from './data-table';

/**
 * Generic resource manager.
 *
 * Categories, brands, series, attributes, coupons, delivery zones, pages, FAQs
 * and banners are all "a list of rows with a form behind them". Rather than
 * write nine nearly-identical screens, each one declares its fields and this
 * component provides the table, the create/edit dialog, validation feedback
 * and the delete confirmation — so they behave identically and a fix to one
 * fixes all of them.
 */

export type FieldType = 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'color' | 'tags' | 'date';

export interface ResourceField {
  name: string;
  label: string;
  type: FieldType;
  hint?: string;
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** Full-width in the dialog grid. */
  wide?: boolean;
  defaultValue?: unknown;
}

export interface ResourceConfig<T> {
  title: string;
  description: string;
  endpoint: string;
  singular: string;
  fields: ResourceField[];
  columns: Column<T>[];
  /** Maps a row back into form values for editing. */
  toForm: (row: T) => Record<string, unknown>;
  emptyBody?: string;
  /** Rendered under the table — used for explanations. */
  footnote?: React.ReactNode;
  canWrite: boolean;
}

export function ResourceManager<T extends { id: string }>({
  config,
  rows,
}: {
  config: ResourceConfig<T>;
  rows: T[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = React.useState<T | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<T | null>(null);
  const [values, setValues] = React.useState<Record<string, unknown>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);

  function openCreate() {
    setValues(
      Object.fromEntries(
        config.fields.map((field) => [
          field.name,
          field.defaultValue ?? (field.type === 'boolean' ? true : field.type === 'tags' ? [] : ''),
        ]),
      ),
    );
    setErrors({});
    setEditing(null);
    setCreating(true);
  }

  function openEdit(row: T) {
    setValues(config.toForm(row));
    setErrors({});
    setEditing(row);
    setCreating(true);
  }

  async function save() {
    setBusy(true);
    setErrors({});
    try {
      const payload = Object.fromEntries(
        config.fields.map((field) => {
          const raw = values[field.name];
          if (field.type === 'number') return [field.name, raw === '' || raw == null ? null : Number(raw)];
          if (field.type === 'tags') {
            return [
              field.name,
              typeof raw === 'string'
                ? raw.split(',').map((v) => v.trim()).filter(Boolean)
                : Array.isArray(raw)
                  ? raw
                  : [],
            ];
          }
          if (field.type === 'date') return [field.name, raw ? new Date(String(raw)).toISOString() : null];
          if (field.type === 'text' || field.type === 'textarea' || field.type === 'color') {
            return [field.name, raw === '' ? null : raw];
          }
          return [field.name, raw];
        }),
      );

      // Strip nulls the API treats as "not provided" on create.
      const body = editing
        ? payload
        : Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== null && value !== ''));

      if (editing) await apiPatch(`${config.endpoint}/${editing.id}`, body);
      else await apiPost(config.endpoint, body);

      toast.success(editing ? `${config.singular} updated` : `${config.singular} created`);
      setCreating(false);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors);
        toast.error("Couldn't save", error.message);
      } else {
        toast.error("Couldn't save", errorMessage(error));
      }
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<T>[] = config.canWrite
    ? [
        ...config.columns,
        {
          key: '__actions',
          header: '',
          width: '80px',
          render: (row) => (
            <div className="flex items-center justify-end gap-1">
              <button
                type="button"
                onClick={() => openEdit(row)}
                aria-label="Edit"
                className="rounded p-1.5 text-faint transition-colors hover:text-ink"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setDeleting(row)}
                aria-label="Delete"
                className="rounded p-1.5 text-faint transition-colors hover:text-critical"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ),
        },
      ]
    : config.columns;

  return (
    <>
      <PageHeader
        title={config.title}
        description={config.description}
        actions={
          config.canWrite ? (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" />
              New {config.singular.toLowerCase()}
            </Button>
          ) : undefined
        }
      />

      <DataTable
        rows={rows}
        columns={columns}
        emptyTitle={`No ${config.title.toLowerCase()} yet`}
        emptyBody={config.emptyBody}
        emptyAction={
          config.canWrite ? (
            <Button onClick={openCreate}>Create the first {config.singular.toLowerCase()}</Button>
          ) : undefined
        }
      />

      {config.footnote && <div className="mt-5 text-xs leading-relaxed text-faint">{config.footnote}</div>}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={editing ? `Edit ${config.singular.toLowerCase()}` : `New ${config.singular.toLowerCase()}`}
        size="md"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={busy} onClick={save}>
              Save
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {config.fields.map((field) => (
            <FieldControl
              key={field.name}
              field={field}
              value={values[field.name]}
              error={errors[field.name]}
              onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
            />
          ))}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        loading={busy}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          setBusy(true);
          try {
            await apiDelete(`${config.endpoint}/${deleting.id}`);
            toast.success(`${config.singular} deleted`);
            router.refresh();
          } catch (error) {
            toast.error("Couldn't delete", errorMessage(error));
          } finally {
            setBusy(false);
            setDeleting(null);
          }
        }}
        title={`Delete this ${config.singular.toLowerCase()}?`}
        body="If anything still references it, the deletion is refused and you will be told what is in the way."
        confirmLabel="Delete"
        destructive
      />
    </>
  );
}

function FieldControl({
  field,
  value,
  error,
  onChange,
}: {
  field: ResourceField;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
}) {
  const wrapper = field.wide || field.type === 'textarea' || field.type === 'tags' ? 'sm:col-span-2' : '';

  if (field.type === 'boolean') {
    return (
      <div className={wrapper}>
        <Checkbox
          label={field.label}
          description={field.hint}
          checked={!!value}
          onChange={(event) => onChange(event.target.checked)}
        />
      </div>
    );
  }

  return (
    <Field label={field.label} hint={field.hint} error={error} required={field.required} className={wrapper}>
      {field.type === 'textarea' ? (
        <Textarea
          value={String(value ?? '')}
          onChange={(event) => onChange(event.target.value)}
          rows={5}
          placeholder={field.placeholder}
          invalid={!!error}
        />
      ) : field.type === 'select' ? (
        <Select value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} invalid={!!error}>
          <option value="">Choose…</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      ) : field.type === 'color' ? (
        <div className="flex gap-2">
          <input
            type="color"
            value={String(value ?? '#888888')}
            onChange={(event) => onChange(event.target.value)}
            aria-label={`${field.label} colour`}
            className="h-10 w-12 cursor-pointer rounded border border-hairline bg-surface"
          />
          <Input value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} placeholder="#000000" />
        </div>
      ) : field.type === 'tags' ? (
        <Input
          value={Array.isArray(value) ? value.join(', ') : String(value ?? '')}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder ?? 'Comma separated'}
          invalid={!!error}
        />
      ) : (
        <Input
          type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
          value={
            field.type === 'date' && value
              ? new Date(String(value)).toISOString().slice(0, 10)
              : String(value ?? '')
          }
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          invalid={!!error}
        />
      )}
    </Field>
  );
}

export { Badge };
