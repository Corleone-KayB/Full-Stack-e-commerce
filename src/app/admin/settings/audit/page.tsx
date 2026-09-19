import Link from 'next/link';
import { requirePagePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatDateTime } from '@/lib/utils';
import { decodeJson } from '@/lib/json';
import { PageHeader } from '@/components/admin/data-table';
import { Badge } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Audit log' };

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePagePermission('audit:read');
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));
  const perPage = 50;

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    }),
    prisma.auditLog.count(),
  ]);

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Sensitive administrative actions, in order. Credentials and card data are redacted before anything is written here."
      />

      <div className="overflow-hidden rounded-lg border border-hairline bg-surface">
        <ul className="divide-y divide-hairline">
          {entries.map((entry) => {
            const meta = decodeJson<Record<string, unknown>>(entry.meta, {});
            return (
              <li key={entry.id} className="px-4 py-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-[13px] text-ink">
                      <Badge tone="outline">{entry.action}</Badge>
                      {entry.summary}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {entry.actorEmail ?? entry.user?.email ?? 'system'} · {formatDateTime(entry.createdAt)}
                      {entry.ip ? ` · ${entry.ip}` : ''}
                    </p>
                  </div>
                  {entry.targetType && entry.targetId && (
                    <Link
                      href={
                        entry.targetType === 'product'
                          ? `/admin/products/${entry.targetId}`
                          : entry.targetType === 'order'
                            ? `/admin/orders/${entry.targetId}`
                            : '#'
                      }
                      className="shrink-0 text-xs text-accent underline-offset-4 hover:underline"
                    >
                      {entry.targetType}
                    </Link>
                  )}
                </div>
                {Object.keys(meta).length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-2xs uppercase tracking-[0.1em] text-faint">Details</summary>
                    <pre className="mt-2 overflow-x-auto rounded bg-ink/5 p-3 text-2xs text-muted">
                      {JSON.stringify(meta, null, 2)}
                    </pre>
                  </details>
                )}
              </li>
            );
          })}
        </ul>

        <div className="flex items-center justify-between border-t border-hairline px-4 py-3 text-xs text-muted">
          <span className="tabular">{total} entries</span>
          <span className="flex gap-3">
            {page > 1 && (
              <Link href={`/admin/settings/audit?page=${page - 1}`} className="text-accent hover:underline">
                Previous
              </Link>
            )}
            {page * perPage < total && (
              <Link href={`/admin/settings/audit?page=${page + 1}`} className="text-accent hover:underline">
                Next
              </Link>
            )}
          </span>
        </div>
      </div>
    </>
  );
}
