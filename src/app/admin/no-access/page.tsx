import Link from 'next/link';
import { ArrowLeft, Lock } from 'lucide-react';
import { getSessionUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { PERMISSIONS, ROLE_DEFINITIONS, type Permission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'No access' };

/**
 * Where requirePagePermission sends someone who clicked a door they cannot
 * open. It names the missing permission, says what their role *can* do, and
 * gives them somewhere to go — which is the whole difference between a
 * permission boundary and a bug.
 */
export default async function NoAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ need?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/signin?next=/admin');

  const { need } = await searchParams;
  const permission = need as Permission | undefined;
  const described = permission && permission in PERMISSIONS ? PERMISSIONS[permission] : null;
  const definition = ROLE_DEFINITIONS[user.role];
  const granted = definition.permissions === '*' ? [] : definition.permissions;

  return (
    <div className="mx-auto max-w-xl py-16">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-caution/12 text-caution">
        <Lock className="h-5 w-5" />
      </span>

      <h1 className="mt-5 font-display text-3xl tracking-tight text-ink">You cannot open this page</h1>

      <p className="mt-3 text-sm leading-relaxed text-muted">
        {described ? (
          <>
            It needs the <span className="font-mono text-xs text-ink">{permission}</span> permission —{' '}
            {described.description.toLowerCase()} — and your account does not have it.
          </>
        ) : (
          <>Your account does not have the permission this page requires.</>
        )}{' '}
        Nothing has gone wrong; this is the access your role was given.
      </p>

      <dl className="mt-6 space-y-1 rounded-lg border border-hairline bg-surface p-5 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Signed in as</dt>
          <dd className="text-ink">{user.email}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Role</dt>
          <dd className="text-ink">{definition.name}</dd>
        </div>
      </dl>

      {granted.length > 0 && (
        <>
          <p className="mt-6 text-xs uppercase tracking-[0.1em] text-faint">What this role can do</p>
          <ul className="mt-2 flex flex-wrap gap-1">
            {granted.map((item) => (
              <li key={item} className="rounded-xs border border-hairline px-1.5 py-0.5 font-mono text-[10px] text-muted">
                {item}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/admin"
          className="inline-flex h-10 items-center gap-2 rounded bg-ink px-4 text-[13px] font-medium text-canvas"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to the dashboard
        </Link>
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded border border-hairline px-4 text-[13px] text-muted transition-colors hover:border-accent hover:text-accent"
        >
          View the store
        </Link>
      </div>

      <p className="mt-6 text-xs text-faint">
        If you need this access, ask a super admin to change your role in Settings → Users &amp; roles.
      </p>
    </div>
  );
}
