import { crudItem } from '@/lib/admin-crud';
import { couponResource } from '@/lib/admin-resources';

export const dynamic = 'force-dynamic';

export const { PATCH, DELETE } = crudItem(couponResource);
