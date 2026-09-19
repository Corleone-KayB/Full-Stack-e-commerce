import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ok, route } from '@/lib/api';
import { assertCsrf, requirePermission } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Product image upload.
 *
 * Local disk by default (writes to /public/uploads), which is right for
 * development and for a single-server deployment with a mounted volume. Set
 * STORAGE_DRIVER=s3 and the S3_* variables to push to object storage instead —
 * the returned URL is all the rest of the application ever sees, so nothing
 * downstream changes.
 *
 * Validation is deliberately strict: an allow-list of image types, a size cap,
 * and a generated filename. A user-supplied filename is never used on disk.
 */

const ALLOWED = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
  ['image/svg+xml', 'svg'],
]);

const MAX_BYTES = 5 * 1024 * 1024;

export const POST = route(async (request) => {
  await assertCsrf(request);
  await requirePermission('product:write');

  const form = await request.formData().catch(() => null);
  if (!form) throw new AppError('BAD_REQUEST', 'Expected a multipart upload.');

  const files = form.getAll('files').filter((entry): entry is File => entry instanceof File);
  if (!files.length) throw new AppError('BAD_REQUEST', 'No files were attached.');
  if (files.length > 10) throw new AppError('BAD_REQUEST', 'Upload at most 10 images at a time.');

  const driver = process.env.STORAGE_DRIVER ?? 'local';
  const results: { url: string; name: string }[] = [];

  for (const file of files) {
    const extension = ALLOWED.get(file.type);
    if (!extension) {
      throw new AppError('VALIDATION_ERROR', `${file.name} is not an image we accept (JPEG, PNG, WebP, AVIF or SVG).`);
    }
    if (file.size > MAX_BYTES) {
      throw new AppError('VALIDATION_ERROR', `${file.name} is larger than 5 MB.`);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = `${randomUUID()}.${extension}`;

    if (driver === 's3') {
      // Single integration point. Implement with your S3 client of choice and
      // return the public URL; nothing else in the app needs to change.
      throw new AppError(
        'PROVIDER_NOT_CONFIGURED',
        'S3 uploads are not wired up in this build. Set STORAGE_DRIVER=local, or implement the S3 branch in src/app/api/admin/upload/route.ts.',
      );
    }

    const directory = join(process.cwd(), 'public', 'uploads');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, filename), buffer);

    results.push({ url: `/uploads/${filename}`, name: file.name });
    logger.info('upload.stored', { driver, filename, bytes: file.size });
  }

  return ok(results);
});

