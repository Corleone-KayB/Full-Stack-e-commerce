import { crudItem } from '@/lib/admin-crud';
import { deliveryZoneResource } from '@/lib/admin-resources';

export const dynamic = 'force-dynamic';

export const { PATCH, DELETE } = crudItem(deliveryZoneResource);
