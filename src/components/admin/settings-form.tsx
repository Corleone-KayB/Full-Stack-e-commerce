'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { apiPatch, errorMessage } from '@/lib/client-api';
import { useToast } from '@/components/providers';
import { Button, Checkbox, Field, Input, Select, Textarea } from '@/components/ui';

/**
 * Settings form.
 *
 * A settings group is a JSON blob; this renders a declared field list over it
 * and PATCHes the whole group back. Deep keys use dot paths ("store.email"),
 * so a nested settings shape does not need a bespoke form per screen.
 */

export type SettingFieldType = 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'money' | 'list';

export interface SettingField {
  path: string;
  label: string;
  type: SettingFieldType;
  hint?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  wide?: boolean;
}

export interface SettingSection {
  title: string;
  description?: string;
  fields: SettingField[];
}

function get(object: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown>)?.[key], object);
}

function set(object: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const keys = path.split('.');
  const next = structuredClone(object);
  let cursor = next as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) {
    cursor[key] = { ...((cursor[key] as Record<string, unknown>) ?? {}) };
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[keys[keys.length - 1]] = value;
  return next;
}

export function SettingsForm({
  group,
  initial,
  sections,
  canWrite,
  footnote,
}: {
  group: string;
  initial: Record<string, unknown>;
  sections: SettingSection[];
  canWrite: boolean;
  footnote?: React.ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  async function save() {
    setSaving(true);
    try {
      await apiPatch('/api/admin/settings', { group, value: values });
      toast.success('Settings saved', 'The storefront updates within a minute.');
      setDirty(false);
      router.refresh();
    } catch (error) {
      toast.error("Couldn't save", errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function update(path: string, value: unknown) {
    setValues((current) => set(current, path, value));
    setDirty(true);
  }

  return (
    <div className="space-y-5">
      {sections.map((section) => (
        <section key={section.title} className="rounded-lg border border-hairline bg-surface p-5 lg:p-6">
          <h2 className="text-sm font-medium text-ink">{section.title}</h2>
          {section.description && <p className="mt-1 max-w-2xl text-xs text-muted">{section.description}</p>}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {section.fields.map((field) => {
              const value = get(values, field.path);
              const wrapper = field.wide || field.type === 'textarea' || field.type === 'list' ? 'sm:col-span-2' : '';

              if (field.type === 'boolean') {
                return (
                  <div key={field.path} className={wrapper}>
                    <Checkbox
                      label={field.label}
                      description={field.hint}
                      checked={!!value}
                      disabled={!canWrite}
                      onChange={(event) => update(field.path, event.target.checked)}
                    />
                  </div>
                );
              }

              return (
                <Field key={field.path} label={field.label} hint={field.hint} className={wrapper}>
                  {field.type === 'textarea' ? (
                    <Textarea
                      value={String(value ?? '')}
                      disabled={!canWrite}
                      rows={3}
                      onChange={(event) => update(field.path, event.target.value)}
                      placeholder={field.placeholder}
                    />
                  ) : field.type === 'select' ? (
                    <Select
                      value={String(value ?? '')}
                      disabled={!canWrite}
                      onChange={(event) => update(field.path, event.target.value)}
                    >
                      {field.options?.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  ) : field.type === 'list' ? (
                    <Input
                      value={Array.isArray(value) ? value.join(', ') : String(value ?? '')}
                      disabled={!canWrite}
                      placeholder={field.placeholder ?? 'Comma separated'}
                      onChange={(event) =>
                        update(
                          field.path,
                          event.target.value
                            .split(',')
                            .map((entry) => entry.trim())
                            .filter(Boolean),
                        )
                      }
                    />
                  ) : (
                    <Input
                      type={field.type === 'number' || field.type === 'money' ? 'number' : 'text'}
                      value={
                        field.type === 'money' && typeof value === 'number' ? String(value / 100) : String(value ?? '')
                      }
                      disabled={!canWrite}
                      placeholder={field.placeholder}
                      onChange={(event) =>
                        update(
                          field.path,
                          field.type === 'money'
                            ? Math.round(Number(event.target.value || 0) * 100)
                            : field.type === 'number'
                              ? Number(event.target.value)
                              : event.target.value,
                        )
                      }
                    />
                  )}
                </Field>
              );
            })}
          </div>
        </section>
      ))}

      {footnote && <div className="text-xs leading-relaxed text-faint">{footnote}</div>}

      {canWrite ? (
        <div className="sticky bottom-0 -mx-4 flex items-center gap-3 border-t border-hairline bg-canvas/95 px-4 py-4 backdrop-blur-xl lg:-mx-8 lg:px-8">
          <Button onClick={save} loading={saving} disabled={!dirty}>
            Save settings
          </Button>
          {dirty && <span className="text-xs text-caution">Unsaved changes</span>}
        </div>
      ) : (
        <p className="rounded border border-hairline bg-surface px-4 py-3 text-[13px] text-muted">
          Your role can view these settings but not change them.
        </p>
      )}
    </div>
  );
}
