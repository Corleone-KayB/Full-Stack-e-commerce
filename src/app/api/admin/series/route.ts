import { crudCollection } from '@/lib/admin-crud';
import { seriesResource } from '@/lib/admin-resources';

export const dynamic = 'force-dynamic';

export const { GET, POST } = crudCollection(seriesResource);
