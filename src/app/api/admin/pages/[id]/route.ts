import { crudItem } from '@/lib/admin-crud';
import { contentPageResource } from '@/lib/admin-resources';

export const dynamic = 'force-dynamic';

export const { PATCH, DELETE } = crudItem(contentPageResource);
