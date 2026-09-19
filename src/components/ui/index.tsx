'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, ChevronDown, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ==========================================================================
   Primitives.

   Small, unstyled-where-it-matters, and shared by the storefront and the
   admin so the two feel like one product. Everything here is keyboard
   operable and carries the labelling a screen reader needs.
   ========================================================================== */

// -------------------------------------------------------------------- Button

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'accent';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded font-medium tracking-tight ' +
  'transition-[background-color,color,border-color,box-shadow,transform] duration-200 ease-premium ' +
  'disabled:pointer-events-none disabled:opacity-50 active:scale-[0.985] select-none whitespace-nowrap';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-canvas hover:bg-ink/90 shadow-subtle',
  accent: 'bg-accent text-accent-ink hover:bg-accent/90 shadow-subtle',
  secondary: 'bg-surface text-ink border border-hairline hover:border-ink/25 hover:bg-elevated',
  outline: 'border border-ink/25 text-ink hover:border-ink hover:bg-ink/5',
  ghost: 'text-muted hover:text-ink hover:bg-ink/5',
  danger: 'bg-critical text-white hover:bg-critical/90',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-[13px]',
  md: 'h-11 px-5 text-sm',
  lg: 'h-[52px] px-7 text-[15px]',
  icon: 'h-10 w-10',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Announced while `loading` is true. */
  loadingLabel?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, loadingLabel, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
});

export interface LinkButtonProps extends React.ComponentProps<typeof Link> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function LinkButton({ className, variant = 'primary', size = 'md', ...props }: LinkButtonProps) {
  return (
    <Link
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...props}
    />
  );
}

// --------------------------------------------------------------------- Input

export interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
  htmlFor?: string;
}

/**
 * Field passes an id, and the description of any hint or error, down to
 * whichever control it wraps.
 *
 * Without this, `<label>` would need an explicit `htmlFor` at every call site —
 * and the one that gets forgotten is an input a screen reader announces as
 * nothing at all. The control reads the context and applies the id itself, so
 * labelling is correct by default rather than by discipline. Passing `htmlFor`
 * still wins, for the cases where the control is not one of ours.
 */
const FieldContext = React.createContext<{ id?: string; describedBy?: string; invalid?: boolean } | null>(null);

function useFieldProps(explicitId?: string, explicitInvalid?: boolean) {
  const field = React.useContext(FieldContext);
  return {
    id: explicitId ?? field?.id,
    'aria-describedby': field?.describedBy,
    'aria-invalid': explicitInvalid || field?.invalid || undefined,
  };
}

export function Field({ label, hint, error, required, className, children, htmlFor }: FieldProps) {
  const generatedId = React.useId();
  const id = htmlFor ?? generatedId;
  const messageId = error || hint ? `${id}-message` : undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={id} className="block text-[13px] font-medium text-ink">
          {label}
          {required && (
            <span className="ml-0.5 text-critical" aria-hidden>
              *
            </span>
          )}
        </label>
      )}
      <FieldContext.Provider value={{ id, describedBy: messageId, invalid: !!error }}>
        {children}
      </FieldContext.Provider>
      {error ? (
        <p id={messageId} className="text-xs text-critical" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-xs text-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, id, ...props }, ref) {
    const field = useFieldProps(id, invalid);
    return (
      <input ref={ref} className={cn('field', invalid && 'field-invalid', className)} {...field} {...props} />
    );
  },
);

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, id, ...props }, ref) {
  const field = useFieldProps(id, invalid);
  return (
    <textarea
      ref={ref}
      className={cn('field min-h-[96px] resize-y', invalid && 'field-invalid', className)}
      {...field}
      {...props}
    />
  );
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(function Select({ className, invalid, children, id, ...props }, ref) {
  const field = useFieldProps(id, invalid);
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn('field appearance-none pr-9', invalid && 'field-invalid', className)}
        {...field}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
        aria-hidden
      />
    </div>
  );
});

export function Checkbox({
  label,
  description,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode; description?: string }) {
  const id = React.useId();
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <span className="relative mt-0.5 flex h-[18px] w-[18px] shrink-0">
        <input
          id={id}
          type="checkbox"
          className="peer h-full w-full cursor-pointer appearance-none rounded-xs border border-hairline bg-surface
                     transition-colors checked:border-accent checked:bg-accent"
          {...props}
        />
        <Check
          className="pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2
                     text-accent-ink opacity-0 peer-checked:opacity-100"
          strokeWidth={3}
          aria-hidden
        />
      </span>
      <label htmlFor={id} className="cursor-pointer text-sm leading-tight text-ink">
        {label}
        {description && <span className="mt-0.5 block text-xs text-faint">{description}</span>}
      </label>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50',
          checked ? 'bg-accent' : 'bg-hairline',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow-subtle transition-transform duration-200 ease-premium',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}

// --------------------------------------------------------------------- Badge

type BadgeTone = 'neutral' | 'accent' | 'positive' | 'caution' | 'critical' | 'info' | 'outline';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-ink/8 text-muted',
  accent: 'bg-accent/15 text-accent',
  positive: 'bg-positive/15 text-positive',
  caution: 'bg-caution/15 text-caution',
  critical: 'bg-critical/15 text-critical',
  info: 'bg-info/15 text-info',
  outline: 'border border-hairline text-muted',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-xs px-2 py-0.5 text-2xs font-medium uppercase tracking-[0.08em]',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ------------------------------------------------------------------ Skeleton

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded', className)} aria-hidden />;
}

// --------------------------------------------------------------------- Modal

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();

  useLockBody(open);
  useFocusTrap(open, panelRef, onClose);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'relative w-full rounded-t-xl border border-hairline bg-elevated shadow-floating animate-slide-up',
          'sm:animate-scale-in sm:rounded-xl',
          size === 'sm' && 'sm:max-w-sm',
          size === 'md' && 'sm:max-w-lg',
          size === 'lg' && 'sm:max-w-3xl',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4">
          <div>
            <h2 id={titleId} className="text-base font-semibold tracking-tight text-ink">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded p-1.5 text-faint transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children && <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>}
        {footer && <div className="flex justify-end gap-2 border-t border-hairline px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = 'Confirm',
  destructive,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: string;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            size="sm"
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">{body}</p>
    </Modal>
  );
}

// -------------------------------------------------------------------- Drawer

export function Drawer({
  open,
  onClose,
  title,
  side = 'right',
  children,
  footer,
  widthClass = 'sm:max-w-md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  side?: 'right' | 'left' | 'bottom';
  children: React.ReactNode;
  footer?: React.ReactNode;
  widthClass?: string;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();

  useLockBody(open);
  useFocusTrap(open, panelRef, onClose);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] animate-fade-in" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'absolute flex flex-col border-hairline bg-canvas shadow-floating',
          side === 'right' && `right-0 top-0 h-full w-full border-l ${widthClass} animate-slide-in-right`,
          side === 'left' && `left-0 top-0 h-full w-full border-r ${widthClass} animate-slide-in-right`,
          side === 'bottom' && 'bottom-0 left-0 max-h-[88vh] w-full rounded-t-xl border-t animate-slide-up',
        )}
      >
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <h2 id={titleId} className="text-sm font-semibold uppercase tracking-[0.1em] text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 rounded p-1.5 text-faint transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="border-t border-hairline bg-surface px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

// --------------------------------------------------------------- Empty state

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}>
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
          {icon}
        </div>
      )}
      <h3 className="font-display text-xl tracking-tight text-ink">{title}</h3>
      {body && <p className="mt-2 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Disclosure

export function Accordion({
  items,
  className,
  defaultOpen,
}: {
  items: { id: string; question: React.ReactNode; answer: React.ReactNode }[];
  className?: string;
  defaultOpen?: string;
}) {
  const [open, setOpen] = React.useState<string | null>(defaultOpen ?? null);
  return (
    <div className={cn('divide-y divide-hairline border-y border-hairline', className)}>
      {items.map((item) => {
        const expanded = open === item.id;
        return (
          <div key={item.id}>
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : item.id)}
              aria-expanded={expanded}
              className="flex w-full items-center justify-between gap-6 py-4 text-left"
            >
              <span className="text-[15px] font-medium text-ink">{item.question}</span>
              <ChevronDown
                className={cn('h-4 w-4 shrink-0 text-faint transition-transform duration-200', expanded && 'rotate-180')}
                aria-hidden
              />
            </button>
            {expanded && (
              <div className="animate-fade-up pb-5 pr-8 text-sm leading-relaxed text-muted">{item.answer}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------- Helpers

export function useLockBody(active: boolean) {
  React.useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}

/** Traps Tab inside the panel and closes on Escape — required for a11y. */
export function useFocusTrap(
  active: boolean,
  ref: React.RefObject<HTMLElement | null>,
  onEscape: () => void,
) {
  React.useEffect(() => {
    if (!active) return;
    const node = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(
        node?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null);

    focusables()[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onEscape();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [active, ref, onEscape]);
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} aria-hidden />;
}

export function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
