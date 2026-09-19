import Link from 'next/link';
import { requirePagePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatMoney } from '@/lib/money';
import { getCurrency } from '@/lib/services/currency.service';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/admin/data-table';
import { Badge } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Customers' };

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePagePermission('customer:read');
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));
  const perPage = 30;

  const where = {
    role: { key: 'CUSTOMER' },
    ...(params.q
      ? {
          OR: [
            { email: { contains: params.q } },
            { firstName: { contains: params.q } },
            { lastName: { contains: params.q } },
            { phone: { contains: params.q } },
          ],
        }
      : {}),
  };

  const [customers, total, currency] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        orders: { where: { paymentStatus: 'SUCCESSFUL' }, select: { grandTotal: true } },
        _count: { select: { orders: true } },
      },
    }),
    prisma.user.count({ where }),
    getCurrency('AED'),
  ]);

  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone with an account. Guests who checked out without registering appear on their orders only."
      />

      <div className="overflow-hidden rounded-lg border border-hairline bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-hairline text-2xs uppercase tracking-[0.08em] text-faint">
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Joined</th>
                <th className="px-4 py-3 text-right font-medium">Orders</th>
                <th className="px-4 py-3 text-right font-medium">Spent</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Marketing</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => {
                const spent = customer.orders.reduce((sum, order) => sum + order.grandTotal, 0);
                return (
                  <tr key={customer.id} className="border-b border-hairline last:border-0 hover:bg-ink/[0.025]">
                    <td className="px-4 py-3">
                      <Link href={`/admin/customers/${customer.id}`} className="hover:text-accent">
                        <span className="block font-medium">
                          {`${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() || '—'}
                        </span>
                        <span className="block text-xs text-muted">{customer.email}</span>
                      </Link>
                    </td>
                    <td className="hidden px-4 py-3 text-muted sm:table-cell">{formatDate(customer.createdAt)}</td>
                    <td className="px-4 py-3 text-right tabular">{customer._count.orders}</td>
                    <td className="px-4 py-3 text-right tabular">{formatMoney(spent, currency)}</td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      {customer.marketingOptIn ? <Badge tone="positive">Opted in</Badge> : <span className="text-xs text-faint">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-hairline px-4 py-3 text-xs text-muted">
          <span className="tabular">{total} customers</span>
          <span className="flex gap-3">
            {page > 1 && (
              <Link href={`/admin/customers?page=${page - 1}`} className="text-accent hover:underline">
                Previous
              </Link>
            )}
            {page * perPage < total && (
              <Link href={`/admin/customers?page=${page + 1}`} className="text-accent hover:underline">
                Next
              </Link>
            )}
          </span>
        </div>
      </div>
    </>
  );
}
