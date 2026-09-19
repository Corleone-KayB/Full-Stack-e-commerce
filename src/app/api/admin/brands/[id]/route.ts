import { crudItem } from '@/lib/admin-crud';
import { brandResource } from '@/lib/admin-resources';

export const dynamic = 'force-dynamic';

export const { PATCH, DELETE } = crudItem(brandResource);
