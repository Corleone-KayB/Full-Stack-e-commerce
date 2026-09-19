import { crudCollection } from '@/lib/admin-crud';
import { categoryResource } from '@/lib/admin-resources';

export const dynamic = 'force-dynamic';

export const { GET, POST } = crudCollection(categoryResource);
