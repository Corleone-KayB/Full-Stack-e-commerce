import { requirePagePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatDateTime } from '@/lib/utils';
import { ROLE_DEFINITIONS } from '@/lib/rbac';
import { UsersScreen } from '@/components/admin/users-screen';
import { PageHeader } from '@/components/admin/data-table';
import { ADMIN_ROLE_KEYS, type RoleKey } from '@/types/enums';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Users & roles' };

export default async function UsersPage() {
  const actor = await requirePagePermission('user:manage');

  const users = await prisma.user.findMany({
    where: { role: { key: { in: ADMIN_ROLE_KEYS as unknown as string[] } } },
    orderBy: { createdAt: 'asc' },
    include: { role: true },
  });

  return (
    <>
      <PageHeader
        title="Users & roles"
        description="Who can get into this admin, and what each of them can do. A role change signs the person out immediately, so it takes effect on their next click."
      />

      <UsersScreen
        currentUserId={actor.id}
        currentRole={actor.role}
        rows={users.map((user) => ({
          id: user.id,
          email: user.email,
          name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || '—',
          roleKey: user.role.key,
          roleName: user.role.name,
          active: user.active,
          lastLoginLabel: user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'never',
        }))}
      />

      <section className="mt-8">
        <h2 className="mb-1 font-display text-xl tracking-tight text-ink">What each role can do</h2>
        <p className="mb-5 text-sm text-muted">
          Permissions are checked on the server for every page and every endpoint — hiding a menu item is a convenience,
          not the control.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {ADMIN_ROLE_KEYS.map((key) => {
            const definition = ROLE_DEFINITIONS[key as RoleKey];
            const permissions = definition.permissions === '*' ? ['Everything'] : definition.permissions;
            return (
              <div key={key} className="rounded-lg border border-hairline bg-surface p-5">
                <h3 className="text-sm font-medium text-ink">{definition.name}</h3>
                <p className="mt-1 text-xs text-muted">{definition.description}</p>
                <ul className="mt-3 flex flex-wrap gap-1">
                  {permissions.map((permission) => (
                    <li
                      key={permission}
                      className="rounded-xs border border-hairline px-1.5 py-0.5 font-mono text-[10px] text-muted"
                    >
                      {permission}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
