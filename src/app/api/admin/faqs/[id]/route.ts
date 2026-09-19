import { crudItem } from '@/lib/admin-crud';
import { faqResource } from '@/lib/admin-resources';

export const dynamic = 'force-dynamic';

export const { PATCH, DELETE } = crudItem(faqResource);
