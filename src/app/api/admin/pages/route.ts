import { crudCollection } from '@/lib/admin-crud';
import { contentPageResource } from '@/lib/admin-resources';

export const dynamic = 'force-dynamic';

export const { GET, POST } = crudCollection(contentPageResource);
