import { z } from 'zod';
import { created, noContent, ok, parseBody, route } from '@/lib/api';
import { assertCsrf, requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { notFound } from '@/lib/errors';
import { addressSchema, idSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const user = await requireUser();
  return ok(
    await prisma.address.findMany({
      where: { userId: user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    }),
  );
});

export const POST = route(async (request) => {
  await assertCsrf(request);
  const user = await requireUser();
  const body = await parseBody(request, addressSchema);

  if (body.isDefault) {
    await prisma.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
  }

  const address = await prisma.address.create({
    data: {
      userId: user.id,
      label: body.label ?? 'Address',
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone,
      line1: body.line1,
      line2: body.line2 ?? null,
      city: body.city,
      region: body.region ?? null,
      postalCode: body.postalCode ?? null,
      country: body.country,
      isDefault: body.isDefault ?? false,
    },
  });

  return created(address);
});

export const PATCH = route(async (request) => {
  await assertCsrf(request);
  const user = await requireUser();
  const body = await parseBody(request, addressSchema.partial().extend({ id: idSchema }));

  const existing = await prisma.address.findFirst({ where: { id: body.id, userId: user.id } });
  if (!existing) throw notFound('Address not found.');

  if (body.isDefault) {
    await prisma.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
  }

  const { id, ...rest } = body;
  return ok(await prisma.address.update({ where: { id }, data: rest }));
});

export const DELETE = route(async (request) => {
  await assertCsrf(request);
  const user = await requireUser();
  const { id } = await parseBody(request, z.object({ id: idSchema }));
  await prisma.address.deleteMany({ where: { id, userId: user.id } });
  return noContent();
});
