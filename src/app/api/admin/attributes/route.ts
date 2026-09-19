import { crudCollection } from '@/lib/admin-crud';
import { attributeResource } from '@/lib/admin-resources';

export const dynamic = 'force-dynamic';

export const { GET, POST } = crudCollection(attributeResource);
