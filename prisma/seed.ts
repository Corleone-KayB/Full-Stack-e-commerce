import { existsSync } from 'node:fs';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client';
import { createAdapter } from '../src/lib/db-adapter';
import { PRODUCTS, RAM_VALUES, SERIES, STORAGE_VALUES } from './catalog-data';
import { FINISHES, imageKey, writeBrandArtwork, writeDeviceImages } from './product-images';

/**
 * Seed.
 *
 * Creates the roles, permissions, taxonomy, opening catalogue and a small set
 * of clearly-marked demo customers, orders and payments so the dashboard has
 * something to show. Everything written here is editable in the admin; delete
 * the demo rows with `Settings → Data → Remove demo data`.
 *
 * Run: npm run db:seed   (or `npm run db:reset` to wipe first)
 */

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
if (existsSync('.env')) process.loadEnvFile('.env');

const prisma = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

const AED = (major: number) => Math.round(major * 100);

/** Deterministic PRNG so re-seeding produces the same demo numbers. */
function mulberry32(seed: number) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260912);
const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)];
const between = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;

const PERMISSION_ROWS = [
  ['dashboard:view', 'general', 'View the admin dashboard'],
  ['product:read', 'catalog', 'View products and catalogue data'],
  ['product:write', 'catalog', 'Create, edit, duplicate and delete products'],
  ['product:publish', 'catalog', 'Activate or deactivate products'],
  ['price:write', 'catalog', 'Change prices and price schedules'],
  ['taxonomy:write', 'catalog', 'Manage categories, brands, series and attributes'],
  ['inventory:read', 'inventory', 'View stock levels and movements'],
  ['inventory:write', 'inventory', 'Adjust stock'],
  ['order:read', 'orders', 'View orders'],
  ['order:write', 'orders', 'Update order status, fulfilment and notes'],
  ['order:cancel', 'orders', 'Cancel orders'],
  ['customer:read', 'customers', 'View customer accounts'],
  ['customer:write', 'customers', 'Edit customer accounts'],
  ['payment:read', 'payments', 'View transactions and payment events'],
  ['payment:refund', 'payments', 'Issue refunds'],
  ['payment:configure', 'payments', 'Change payment provider configuration'],
  ['marketing:write', 'marketing', 'Manage coupons, promotions and merchandising'],
  ['content:write', 'content', 'Edit pages, banners and FAQs'],
  ['analytics:read', 'analytics', 'View analytics and reports'],
  ['settings:read', 'settings', 'View store settings'],
  ['settings:write', 'settings', 'Change store settings'],
  ['user:manage', 'settings', 'Manage admin users and roles'],
  ['audit:read', 'settings', 'Read the audit log'],
] as const;

const ROLE_ROWS: { key: string; name: string; description: string; permissions: string[] | '*' }[] = [
  { key: 'SUPER_ADMIN', name: 'Super Admin', description: 'Unrestricted access.', permissions: '*' },
  {
    key: 'PRODUCT_MANAGER',
    name: 'Product Manager',
    description: 'Catalogue, pricing and inventory.',
    permissions: [
      'dashboard:view', 'product:read', 'product:write', 'product:publish', 'price:write',
      'taxonomy:write', 'inventory:read', 'inventory:write', 'content:write', 'analytics:read', 'marketing:write',
    ],
  },
  {
    key: 'ORDER_MANAGER',
    name: 'Order Manager',
    description: 'Orders, fulfilment and delivery.',
    permissions: [
      'dashboard:view', 'order:read', 'order:write', 'order:cancel', 'customer:read',
      'inventory:read', 'product:read', 'payment:read', 'analytics:read',
    ],
  },
  {
    key: 'FINANCE',
    name: 'Finance',
    description: 'Payments, refunds and financial reporting.',
    permissions: [
      'dashboard:view', 'order:read', 'payment:read', 'payment:refund', 'payment:configure',
      'customer:read', 'analytics:read', 'settings:read', 'audit:read',
    ],
  },
  {
    key: 'SUPPORT',
    name: 'Support Agent',
    description: 'Read-only access for customer support.',
    permissions: ['dashboard:view', 'order:read', 'customer:read', 'product:read', 'inventory:read'],
  },
  { key: 'CUSTOMER', name: 'Customer', description: 'Storefront account.', permissions: [] },
];

async function wipe() {
  console.log('  · clearing existing data');
  // Order matters: children before parents.
  await prisma.$transaction([
    prisma.paymentEvent.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.orderEvent.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.cartItem.deleteMany(),
    prisma.cart.deleteMany(),
    prisma.wishlistItem.deleteMany(),
    prisma.inventoryMovement.deleteMany(),
    prisma.inventory.deleteMany(),
    prisma.priceSchedule.deleteMany(),
    prisma.variantAttributeValue.deleteMany(),
    prisma.productAttributeValue.deleteMany(),
    prisma.productImage.deleteMany(),
    prisma.productVariant.deleteMany(),
    prisma.productViewStat.deleteMany(),
    prisma.review.deleteMany(),
    prisma.product.deleteMany(),
    prisma.series.deleteMany(),
    prisma.categoryAttribute.deleteMany(),
    prisma.attributeValue.deleteMany(),
    prisma.attributeDefinition.deleteMany(),
    prisma.category.deleteMany(),
    prisma.brand.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.notificationTemplate.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.session.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.address.deleteMany(),
    prisma.user.deleteMany(),
    prisma.rolePermission.deleteMany(),
    prisma.permission.deleteMany(),
    prisma.role.deleteMany(),
    prisma.coupon.deleteMany(),
    prisma.deliveryZone.deleteMany(),
    prisma.currency.deleteMany(),
    prisma.contentPage.deleteMany(),
    prisma.faq.deleteMany(),
    prisma.banner.deleteMany(),
    prisma.setting.deleteMany(),
  ]);
}

async function seedRoles() {
  console.log('  · roles and permissions');
  for (const [key, group, description] of PERMISSION_ROWS) {
    await prisma.permission.create({ data: { key, group, description } });
  }
  const allPermissions = await prisma.permission.findMany();

  for (const role of ROLE_ROWS) {
    const created = await prisma.role.create({
      data: { key: role.key, name: role.name, description: role.description, isSystem: true },
    });
    const keys = role.permissions === '*' ? allPermissions.map((p) => p.key) : role.permissions;
    for (const key of keys) {
      const permission = allPermissions.find((p) => p.key === key);
      if (permission) {
        await prisma.rolePermission.create({
          data: { roleId: created.id, permissionId: permission.id },
        });
      }
    }
  }
}

async function seedUsers() {
  console.log('  · users');
  const roles = await prisma.role.findMany();
  const roleId = (key: string) => roles.find((r) => r.key === key)!.id;

  const adminPassword = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!2026', 12);
  const demoPassword = await bcrypt.hash('DemoPass!2026', 12);

  const admin = await prisma.user.create({
    data: {
      email: (process.env.SEED_ADMIN_EMAIL ?? 'admin@aurum.store').toLowerCase(),
      passwordHash: adminPassword,
      firstName: 'Amina',
      lastName: 'Rashid',
      phone: '+971 50 000 0001',
      roleId: roleId('SUPER_ADMIN'),
      emailVerified: new Date(),
    },
  });

  // One account per admin role, so permissions can be demonstrated immediately.
  const staff = [
    ['catalog@aurum.store', 'Youssef', 'Haddad', 'PRODUCT_MANAGER'],
    ['orders@aurum.store', 'Lina', 'Farouk', 'ORDER_MANAGER'],
    ['finance@aurum.store', 'Daniel', 'Okoro', 'FINANCE'],
    ['support@aurum.store', 'Mariam', 'Saleh', 'SUPPORT'],
  ] as const;

  for (const [email, firstName, lastName, key] of staff) {
    await prisma.user.create({
      data: {
        email, firstName, lastName, passwordHash: demoPassword, roleId: roleId(key),
        emailVerified: new Date(), isDemo: true,
      },
    });
  }

  const customerNames = [
    ['sara.almansoori@example.com', 'Sara', 'Al Mansoori', '+971 50 111 2201'],
    ['omar.khalid@example.com', 'Omar', 'Khalid', '+971 55 222 3302'],
    ['fatima.zahra@example.com', 'Fatima', 'Zahra', '+971 52 333 4403'],
    ['james.mitchell@example.com', 'James', 'Mitchell', '+971 56 444 5504'],
    ['priya.nair@example.com', 'Priya', 'Nair', '+971 50 555 6605'],
    ['kevin.mugisha@example.com', 'Kevin', 'Mugisha', '+250 78 666 7706'],
    ['aisha.bello@example.com', 'Aisha', 'Bello', '+971 54 777 8807'],
    ['tom.becker@example.com', 'Tom', 'Becker', '+971 58 888 9908'],
  ] as const;

  const customers = [];
  for (const [email, firstName, lastName, phone] of customerNames) {
    const user = await prisma.user.create({
      data: {
        email, firstName, lastName, phone,
        passwordHash: demoPassword,
        roleId: roleId('CUSTOMER'),
        emailVerified: new Date(),
        marketingOptIn: rand() > 0.5,
        isDemo: true,
        createdAt: new Date(Date.now() - between(5, 220) * 86_400_000),
        addresses: {
          create: {
            label: 'Home',
            firstName, lastName, phone,
            line1: `${between(10, 90)} ${pick(['Jumeirah Beach Road', 'Sheikh Zayed Road', 'Al Wasl Road', 'Marina Walk'])}`,
            line2: `Apartment ${between(2, 30)}0${between(1, 9)}`,
            city: pick(['Dubai', 'Abu Dhabi', 'Sharjah']),
            region: 'Dubai',
            postalCode: String(between(10000, 99999)),
            country: 'AE',
            isDefault: true,
          },
        },
      },
    });
    customers.push(user);
  }

  return { admin, customers };
}

async function seedCurrencies() {
  console.log('  · currencies');
  await prisma.currency.createMany({
    data: [
      { code: 'AED', name: 'UAE Dirham', symbol: 'AED', rate: 1, precision: 2, isBase: true, active: true, position: 0 },
      { code: 'USD', name: 'US Dollar', symbol: '$', rate: 0.2723, precision: 2, isBase: false, active: true, position: 1 },
      { code: 'RWF', name: 'Rwandan Franc', symbol: 'FRw', rate: 393.5, precision: 0, isBase: false, active: true, position: 2 },
    ],
  });
}

async function seedTaxonomy() {
  console.log('  · categories, brands, attributes');

  const smartphones = await prisma.category.create({
    data: {
      name: 'Smartphones', slug: 'smartphones', position: 10, showInNav: true,
      description: 'Flagship and value smartphones, every unit inspected and warrantied.',
      metaTitle: 'Smartphones', metaDescription: 'Premium smartphones with warranty and next-day UAE delivery.',
    },
  });

  // Seeded empty so the merchant can see — and use — the expansion path.
  const others = await Promise.all(
    [
      ['Tablets', 'tablets', 20],
      ['Laptops', 'laptops', 30],
      ['Smartwatches', 'smartwatches', 40],
      ['Audio', 'audio', 50],
      ['Accessories', 'accessories', 60],
    ].map(([name, slug, position]) =>
      prisma.category.create({
        data: { name: name as string, slug: slug as string, position: position as number, showInNav: true },
      }),
    ),
  );

  const apple = await prisma.brand.create({
    data: { name: 'Apple', slug: 'apple', position: 0, description: 'iPhone, iPad, Mac, Watch and AirPods.' },
  });
  await prisma.brand.createMany({
    data: [
      { name: 'Samsung', slug: 'samsung', position: 1, description: 'Galaxy smartphones, tablets and wearables.' },
      { name: 'Google', slug: 'google', position: 2, description: 'Pixel smartphones and accessories.' },
    ],
  });

  const storage = await prisma.attributeDefinition.create({
    data: {
      key: 'storage', name: 'Storage', inputType: 'SELECT', unit: 'GB',
      isVariantAxis: true, isFilterable: true, showInSpecs: true, position: 10,
      values: { create: STORAGE_VALUES },
    },
  });

  const color = await prisma.attributeDefinition.create({
    data: {
      key: 'color', name: 'Colour', inputType: 'SELECT',
      isVariantAxis: true, isFilterable: true, showInSpecs: true, position: 20,
      values: {
        create: Object.values(FINISHES).map((f, index) => ({
          value: f.value, label: f.label, position: index * 10,
          meta: JSON.stringify({ hex: f.hex }),
        })),
      },
    },
  });

  const ram = await prisma.attributeDefinition.create({
    data: {
      key: 'ram', name: 'Memory', inputType: 'SELECT', unit: 'GB',
      isVariantAxis: true, isFilterable: true, showInSpecs: true, position: 30,
      values: { create: RAM_VALUES },
    },
  });

  // Product-level (non-variant) spec attributes.
  const specDefs = await Promise.all(
    [
      ['display', 'Display', 40],
      ['chip', 'Chip', 50],
      ['camera', 'Camera', 60],
      ['battery', 'Battery', 70],
      ['connectivity', 'Connectivity', 80],
    ].map(([key, name, position]) =>
      prisma.attributeDefinition.create({
        data: {
          key: key as string, name: name as string, inputType: 'TEXT',
          isVariantAxis: false, isFilterable: false, showInSpecs: true, position: position as number,
        },
      }),
    ),
  );

  // Category → attribute wiring. Phones use storage + colour; laptops also RAM.
  await prisma.categoryAttribute.createMany({
    data: [
      { categoryId: smartphones.id, attributeId: storage.id, required: true, position: 10 },
      { categoryId: smartphones.id, attributeId: color.id, required: true, position: 20 },
      ...specDefs.map((d, i) => ({ categoryId: smartphones.id, attributeId: d.id, position: 30 + i * 10 })),
      { categoryId: others[1].id, attributeId: storage.id, required: true, position: 10 },
      { categoryId: others[1].id, attributeId: ram.id, required: true, position: 20 },
      { categoryId: others[0].id, attributeId: storage.id, required: true, position: 10 },
      { categoryId: others[0].id, attributeId: color.id, position: 20 },
    ],
  });

  const seriesRows = [];
  for (const series of SERIES) {
    seriesRows.push(
      await prisma.series.create({
        data: {
          name: series.name, slug: series.slug, year: series.year, position: series.position,
          brandId: apple.id, categoryId: smartphones.id,
        },
      }),
    );
  }

  return { smartphones, apple, storage, color, specDefs, seriesRows };
}

async function seedCatalog(ctx: Awaited<ReturnType<typeof seedTaxonomy>>) {
  console.log('  · products, variants, inventory and imagery');

  // Render studio imagery for every silhouette/finish combination in use.
  const combos = PRODUCTS.flatMap((p) =>
    p.colors.map((finish) => ({ silhouette: p.silhouette, camera: p.camera, finish })),
  );
  const publicDir = join(process.cwd(), 'public');
  const imageUrls = writeDeviceImages(combos, publicDir);
  writeBrandArtwork(publicDir);

  const storageValues = await prisma.attributeValue.findMany({ where: { attributeId: ctx.storage.id } });
  const colorValues = await prisma.attributeValue.findMany({ where: { attributeId: ctx.color.id } });
  const specByKey = new Map(ctx.specDefs.map((d) => [d.key, d]));

  let productPosition = 0;
  let totalVariants = 0;

  for (const seed of PRODUCTS) {
    const series = ctx.seriesRows.find((s) => s.slug === seed.seriesSlug)!;
    const slug = seed.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const product = await prisma.product.create({
      data: {
        name: seed.name,
        slug,
        brandId: ctx.apple.id,
        categoryId: ctx.smartphones.id,
        seriesId: series.id,
        model: seed.model,
        shortDescription: seed.shortDescription,
        description: seed.description,
        condition: 'REFURBISHED_EXCELLENT',
        warrantyMonths: 12,
        featured: seed.featured ?? false,
        bestseller: seed.bestseller ?? false,
        newArrival: seed.newArrival ?? false,
        active: true,
        position: (productPosition += 10),
        publishedAt: new Date(),
        metaTitle: `${seed.name} — buy in the UAE`,
        metaDescription: seed.shortDescription,
        specSheet: JSON.stringify([
          { group: 'In the box', label: 'Contents', value: 'Device, USB-C cable, quick start guide' },
          { group: 'In the box', label: 'Charger', value: 'Not included (sold separately)' },
          { group: 'Condition', label: 'Grade', value: 'Excellent — light or no visible wear' },
          { group: 'Condition', label: 'Battery health', value: '85% or higher, verified at intake' },
          { group: 'Warranty', label: 'Cover', value: '12 months hardware warranty' },
          { group: 'Warranty', label: 'Returns', value: '14-day change of mind' },
        ]),
        attributes: {
          create: [
            { attributeId: specByKey.get('display')!.id, valueText: seed.displaySize },
            { attributeId: specByKey.get('chip')!.id, valueText: seed.chip },
            { attributeId: specByKey.get('camera')!.id, valueText: seed.cameraSpec },
            { attributeId: specByKey.get('battery')!.id, valueText: seed.battery },
            { attributeId: specByKey.get('connectivity')!.id, valueText: seed.connectivity },
          ],
        },
      },
    });

    // Gallery: back then front, for each finish.
    let imagePosition = 0;
    for (const finish of seed.colors) {
      for (const face of ['back', 'front'] as const) {
        const url = imageUrls.get(imageKey(seed.silhouette, seed.camera, finish, face));
        if (!url) continue;
        await prisma.productImage.create({
          data: {
            productId: product.id,
            url,
            alt: `${seed.name} in ${FINISHES[finish].label} — ${face === 'back' ? 'rear' : 'display'}`,
            position: imagePosition++,
            width: 900,
            height: 1100,
          },
        });
      }
    }

    // Variants: storage × colour. Colour does not change the price, which is
    // exactly how the real market works.
    let variantPosition = 0;
    for (const storage of seed.storages) {
      const storageValue = storageValues.find((v) => v.value === storage.value)!;
      for (const finish of seed.colors) {
        const colorValue = colorValues.find((v) => v.value === finish)!;
        const sku = `AUR-${slug.replace(/iphone-/, 'IP').toUpperCase().replace(/-/g, '')}-${storage.value.toUpperCase()}-${finish.slice(0, 3).toUpperCase()}`;
        const imageUrl = imageUrls.get(imageKey(seed.silhouette, seed.camera, finish, 'back')) ?? null;

        const variant = await prisma.productVariant.create({
          data: {
            productId: product.id,
            sku,
            name: `${storage.label} · ${FINISHES[finish].label}`,
            price: AED(storage.price),
            compareAtPrice: storage.compareAt ? AED(storage.compareAt) : null,
            costPrice: Math.round(AED(storage.price) * 0.78),
            currency: 'AED',
            position: (variantPosition += 10),
            active: true,
            weightGrams: between(174, 240),
            batteryHealth: between(86, 100),
            imageUrl,
            attributes: {
              create: [
                { attributeId: ctx.storage.id, valueId: storageValue.id },
                { attributeId: ctx.color.id, valueId: colorValue.id },
              ],
            },
          },
        });
        totalVariants++;

        // Newer models are scarcer; a couple of SKUs are deliberately out of
        // stock so the empty/low states are visible on a fresh install.
        const scarcity = seed.newArrival ? 0.55 : seed.bestseller ? 0.15 : 0.25;
        const onHand = rand() < scarcity ? between(0, 3) : between(4, 24);
        await prisma.inventory.create({
          data: { variantId: variant.id, onHand, reserved: 0, lowStockThreshold: 3, location: 'MAIN' },
        });
        await prisma.inventoryMovement.create({
          data: {
            variantId: variant.id, type: 'RECEIVE', quantity: onHand,
            reason: 'Opening stock', referenceType: 'import',
            resultingOnHand: onHand, resultingReserved: 0,
          },
        });
      }
    }

    // Seed some product views so "most viewed" is not empty.
    for (let d = 0; d < 30; d += 1) {
      const day = new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
      const views = between(0, seed.featured ? 26 : 9);
      if (views === 0) continue;
      await prisma.productViewStat.create({ data: { productId: product.id, day, views } });
    }
    await prisma.product.update({ where: { id: product.id }, data: { viewCount: between(120, 3200) } });
  }

  console.log(`    → ${PRODUCTS.length} products, ${totalVariants} variants`);
}

async function seedPromotions() {
  console.log('  · promotions and delivery');

  // A live promotion on one series, so scheduled pricing is demonstrable.
  const targets = await prisma.productVariant.findMany({
    where: { product: { series: { slug: 'iphone-12' } } },
    take: 40,
  });
  for (const variant of targets) {
    await prisma.priceSchedule.create({
      data: {
        variantId: variant.id,
        label: 'Autumn event',
        price: Math.round(variant.price * 0.9),
        compareAtPrice: variant.price,
        startsAt: new Date(Date.now() - 3 * 86_400_000),
        endsAt: new Date(Date.now() + 18 * 86_400_000),
        priority: 10,
        active: true,
      },
    });
  }

  await prisma.coupon.createMany({
    data: [
      {
        code: 'WELCOME10', description: '10% off your first order', type: 'PERCENT', value: 10,
        minSubtotal: AED(500), maxDiscount: AED(300), active: true, maxRedemptions: 500,
      },
      {
        code: 'FREEDELIVERY', description: 'Complimentary delivery', type: 'FREE_DELIVERY', value: 0, active: true,
      },
      {
        code: 'AURUM150', description: '150 AED off orders over 2,000 AED', type: 'FIXED',
        value: AED(150), minSubtotal: AED(2000), active: true,
      },
    ],
  });

  await prisma.deliveryZone.createMany({
    data: [
      {
        name: 'Dubai & Sharjah', regions: JSON.stringify(['Dubai', 'Sharjah', 'Ajman']),
        fee: AED(25), freeThreshold: AED(1500), minDays: 1, maxDays: 1,
        pickupAvailable: true, active: true, position: 0,
      },
      {
        name: 'Abu Dhabi & Al Ain', regions: JSON.stringify(['Abu Dhabi', 'Al Ain']),
        fee: AED(35), freeThreshold: AED(1500), minDays: 1, maxDays: 2, active: true, position: 1,
      },
      {
        name: 'Northern Emirates', regions: JSON.stringify(['Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain']),
        fee: AED(45), freeThreshold: AED(2500), minDays: 2, maxDays: 3, active: true, position: 2,
      },
      {
        name: 'GCC export', regions: JSON.stringify(['SA', 'OM', 'QA', 'BH', 'KW']),
        fee: AED(120), freeThreshold: null, minDays: 3, maxDays: 6, active: true, position: 3,
      },
    ],
  });
}

async function seedContent() {
  console.log('  · content, FAQs and templates');

  const pages = [
    {
      slug: 'terms',
      title: 'Terms & Conditions',
      body: `## 1. About these terms\n\nThese terms govern your use of this store and any purchase you make from it. Please read them before ordering.\n\n## 2. Orders\n\nAn order is an offer to buy. It is accepted when we confirm payment and send you a confirmation. We may decline an order where an item is out of stock, a price was listed in error, or we cannot verify the payment.\n\n## 3. Pricing\n\nAll prices are shown in the currency selected at the top of the page and include applicable VAT unless stated otherwise. The price charged is the price displayed at the moment your order is confirmed.\n\n## 4. Delivery\n\nDelivery estimates are working days from dispatch and are not guarantees. Risk passes to you on delivery.\n\n## 5. Your rights\n\nNothing in these terms limits your statutory rights as a consumer.\n\n## 6. Contact\n\nQuestions about these terms can be sent to the address on our contact page.`,
      position: 10,
    },
    {
      slug: 'privacy',
      title: 'Privacy Policy',
      body: `## What we collect\n\nWe collect the information you give us when you create an account or place an order: your name, email address, phone number and delivery address. We record which pages you view on this site in aggregate so we can see which products are popular.\n\n## Payment information\n\nWe do **not** receive, process or store card numbers, security codes or mobile-money PINs. Card payments are completed on our payment processor's own hosted page; mobile-money payments are authorised on your handset. We store only a transaction reference, the amount, the outcome, and for cards the brand and last four digits.\n\n## How we use it\n\nTo fulfil your order, to provide support, to prevent fraud, and — only if you opt in — to send you occasional marketing.\n\n## Retention\n\nOrder records are retained as long as we are legally required to keep them. You may ask us to delete your account at any time.\n\n## Your rights\n\nYou can request a copy of your data, ask for corrections, or ask us to erase it. Contact us using the details on our contact page.`,
      position: 20,
    },
    {
      slug: 'returns',
      title: 'Returns & Refunds',
      body: `## 14-day change of mind\n\nIf you change your mind, you can return an unmodified device in its original packaging within 14 days of delivery for a full refund of the item price.\n\n## Faulty devices\n\nIf a device develops a hardware fault within its warranty period, contact us and we will arrange repair or replacement. If we cannot repair or replace it, we will refund you.\n\n## How refunds are paid\n\nRefunds go back to the original payment method. Card refunds typically appear within 5–10 working days. Mobile-money refunds are processed as a transfer back to the paying wallet.\n\n## What is not covered\n\nAccidental damage, liquid damage, and devices with a broken or tampered seal are outside the warranty.`,
      position: 30,
    },
    {
      slug: 'delivery',
      title: 'Delivery',
      body: `## Timing\n\nOrders confirmed before 4pm on a working day are dispatched the same day. Dubai and Sharjah are next-day; other emirates take one to three working days.\n\n## Cost\n\nDelivery is charged by zone and shown before you pay. Orders above the free-delivery threshold ship at no cost.\n\n## Collection\n\nYou can choose collection at checkout and pick your order up from our counter once we email you to confirm it is ready.\n\n## Tracking\n\nYou will receive a tracking reference by email as soon as your order is dispatched.`,
      position: 40,
    },
    {
      slug: 'warranty',
      title: 'Warranty',
      body: `## What is covered\n\nEvery device carries a 12-month warranty against hardware faults from the date of delivery. That includes the battery, the display, the cameras, charging, speakers and connectivity.\n\n## Battery\n\nEvery device we sell is tested at intake and ships at 85% battery health or higher. If battery health falls below 80% within the warranty period, we will replace the battery.\n\n## Making a claim\n\nContact us with your order number and a description of the fault. We will arrange collection, diagnose the device, and repair, replace or refund it.\n\n## Exclusions\n\nAccidental damage, liquid damage, unauthorised repair and cosmetic wear are not covered.`,
      position: 50,
    },
    {
      slug: 'about',
      title: 'About AURUM',
      body: `AURUM sells carefully selected iPhones to people who care what they buy.\n\nEvery device passes a 42-point functional and cosmetic inspection before it is listed. We photograph the exact grade, state the battery health, and put a 12-month warranty behind it. If a device does not meet the grade we advertise, it does not go on sale.\n\nWe are based in Dubai and deliver across the Emirates and the wider GCC.`,
      position: 60,
    },
  ];

  for (const page of pages) {
    await prisma.contentPage.create({
      data: { ...page, metaTitle: page.title, metaDescription: page.body.slice(0, 150).replace(/[#*\n]/g, ' ') },
    });
  }

  const faqs = [
    ['Are these devices genuine Apple products?', 'Yes. Every device is an original Apple product. We do not sell replicas or devices with non-original main components, and each unit is checked against its serial number at intake.', 'products'],
    ['What condition are the devices in?', 'Everything currently listed is graded Excellent: fully functional with light or no visible wear. The grade and battery health are stated on every product page.', 'products'],
    ['What battery health can I expect?', 'A minimum of 85%, verified at intake and recorded against the specific unit you receive. Most units are between 88% and 95%.', 'products'],
    ['How long is the warranty?', '12 months against hardware faults, including the battery. See our warranty page for what is covered.', 'warranty'],
    ['Which payment methods can I use?', 'Credit and debit cards through our payment processor, and MTN Mobile Money or Airtel Money where those services operate. Card details never reach this website.', 'payment'],
    ['Is it safe to pay on this site?', 'Card payments are completed on our processor\'s hosted page and mobile-money payments are authorised on your own handset. We never see or store your card number, security code or PIN.', 'payment'],
    ['When will my order arrive?', 'Dubai and Sharjah next working day; other emirates one to three working days. You will get a tracking reference by email when it ships.', 'delivery'],
    ['Can I collect my order instead?', 'Yes — choose collection at checkout and we will email you when it is ready, usually within four working hours.', 'delivery'],
    ['Can I return something?', 'Yes, within 14 days of delivery if it is unmodified and in its original packaging.', 'returns'],
    ['Do you sell anything besides iPhones?', 'Not yet. The store is built to carry tablets, laptops, watches, audio and accessories, and those categories are already set up — we add stock as we source it.', 'general'],
  ] as const;

  for (const [question, answer, topic] of faqs) {
    await prisma.faq.create({ data: { question, answer, topic, position: faqs.indexOf([question, answer, topic] as never) } });
  }

  const templates = [
    ['account.created', 'Welcome to {{storeName}}', 'Hello {{firstName}},\n\nYour {{storeName}} account is ready.\n\n{{storeName}}'],
    ['order.confirmed', 'Order {{orderNumber}} confirmed', 'Thank you — we have received your order {{orderNumber}} ({{itemCount}} item(s), {{total}} {{currency}}).\n\n{{storeName}}'],
    ['payment.succeeded', 'Payment received for {{orderNumber}}', 'We have received your payment of {{total}} {{currency}} for order {{orderNumber}}.\n\n{{storeName}}'],
    ['payment.failed', "Payment wasn't completed for {{orderNumber}}", 'Your payment for order {{orderNumber}} was not completed and nothing has been charged. Your order is saved and you can retry.\n\n{{storeName}}'],
    ['order.status_changed', 'Order {{orderNumber}} is now {{status}}', 'Your order {{orderNumber}} is now {{status}}.\n\n{{storeName}}'],
    ['order.shipped', 'Order {{orderNumber}} is on its way', 'Your order {{orderNumber}} has shipped.\n\nTracking: {{trackingNumber}}\n\n{{storeName}}'],
    ['password.reset', 'Reset your {{storeName}} password', 'Use this link within 60 minutes:\n\n{{resetUrl}}'],
  ] as const;

  for (const [key, subject, body] of templates) {
    await prisma.notificationTemplate.create({ data: { key, channel: 'EMAIL', subject, body } });
  }

  await prisma.banner.createMany({
    data: [
      {
        title: 'The iPhone 16 series has landed',
        subtitle: 'Camera Control, the A18 chip and Wi-Fi 7 — in stock now.',
        ctaLabel: 'Shop iPhone 16', ctaHref: '/shop?series=iphone-16',
        placement: 'home_hero', position: 0, active: true,
      },
      {
        title: 'Autumn event — 10% off the iPhone 12 series',
        subtitle: 'Until the end of the month, while stock lasts.',
        ctaLabel: 'View the offer', ctaHref: '/shop?series=iphone-12',
        placement: 'home_promo', position: 1, active: true,
      },
    ],
  });
}

async function seedSettings() {
  console.log('  · settings');
  const rows: [string, Record<string, unknown>][] = [
    ['store', {}],
    ['currency', { base: 'AED', display: 'AED', supported: ['AED', 'USD', 'RWF'], mobileMoneySettlement: 'RWF' }],
    ['payments', {
      enabled: ['card', 'mtn_momo', 'airtel_money'],
      environment: 'sandbox',
      securityCopy: 'Payments are processed on our servers over TLS. Card numbers and mobile-money PINs never reach this website.',
    }],
    ['delivery', { freeDeliveryThreshold: 150000, estimateCopy: 'Delivered in 1–3 working days.', pickupEnabled: true }],
  ];
  for (const [key, value] of rows) {
    await prisma.setting.create({ data: { key, group: key, value: JSON.stringify(value) } });
  }
}

async function seedDemoOrders(customers: { id: string; email: string; firstName: string | null; lastName: string | null; phone: string | null }[]) {
  console.log('  · demo orders and payments');

  const variants = await prisma.productVariant.findMany({
    where: { inventory: { onHand: { gt: 2 } } },
    include: { product: { select: { name: true } }, inventory: true },
    take: 200,
  });
  const zones = await prisma.deliveryZone.findMany({ orderBy: { position: 'asc' } });
  if (!variants.length || !zones.length) return;

  const providers = ['card', 'card', 'card', 'mtn_momo', 'mtn_momo', 'airtel_money'];
  const outcomes: { status: string; payment: string; weight: number }[] = [
    { status: 'DELIVERED', payment: 'SUCCESSFUL', weight: 8 },
    { status: 'SHIPPED', payment: 'SUCCESSFUL', weight: 4 },
    { status: 'PROCESSING', payment: 'SUCCESSFUL', weight: 3 },
    { status: 'CONFIRMED', payment: 'SUCCESSFUL', weight: 3 },
    { status: 'PENDING', payment: 'PENDING', weight: 2 },
    { status: 'CANCELLED', payment: 'FAILED', weight: 2 },
    { status: 'REFUNDED', payment: 'REFUNDED', weight: 1 },
  ];
  const weighted = outcomes.flatMap((o) => Array<typeof o>(o.weight).fill(o));

  const perDay = new Map<string, number>();

  for (let i = 0; i < 34; i++) {
    const placedAt = new Date(Date.now() - between(0, 44) * 86_400_000 - between(0, 82_800) * 1000);
    const dayKey = placedAt.toISOString().slice(0, 10).replace(/-/g, '');
    const sequence = (perDay.get(dayKey) ?? 0) + 1;
    perDay.set(dayKey, sequence);

    const customer = pick(customers);
    const zone = pick(zones);
    const outcome = pick(weighted);
    const lineCount = rand() > 0.78 ? 2 : 1;

    const chosen: typeof variants = [];
    for (let l = 0; l < lineCount; l++) {
      const candidate = pick(variants);
      if (!chosen.some((c) => c.id === candidate.id)) chosen.push(candidate);
    }

    const items = chosen.map((variant) => {
      const quantity = rand() > 0.9 ? 2 : 1;
      return {
        variantId: variant.id,
        productName: variant.product.name,
        variantName: variant.name,
        sku: variant.sku,
        imageUrl: variant.imageUrl,
        unitPrice: variant.price,
        quantity,
        lineTotal: variant.price * quantity,
        attributes: JSON.stringify({}),
      };
    });

    const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
    const delivery = subtotal >= (zone.freeThreshold ?? Number.MAX_SAFE_INTEGER) ? 0 : zone.fee;
    const discount = rand() > 0.82 ? Math.round(subtotal * 0.1) : 0;
    const grandTotal = subtotal - discount + delivery;
    const paid = outcome.payment === 'SUCCESSFUL' || outcome.payment === 'REFUNDED';
    const provider = pick(providers);

    const address = {
      firstName: customer.firstName ?? 'Guest',
      lastName: customer.lastName ?? 'Customer',
      phone: customer.phone ?? '+971 50 000 0000',
      line1: `${between(10, 90)} Jumeirah Beach Road`,
      city: 'Dubai',
      region: 'Dubai',
      postalCode: String(between(10000, 99999)),
      country: 'AE',
    };

    const order = await prisma.order.create({
      data: {
        orderNumber: `ORD-${dayKey}-${String(sequence).padStart(4, '0')}`,
        userId: customer.id,
        email: customer.email,
        phone: customer.phone,
        status: outcome.status,
        paymentStatus: outcome.payment,
        fulfillmentStatus:
          outcome.status === 'DELIVERED' ? 'DELIVERED' : outcome.status === 'SHIPPED' ? 'SHIPPED' : 'UNFULFILLED',
        currency: 'AED',
        subtotal, discountTotal: discount, deliveryTotal: delivery, taxTotal: 0, grandTotal,
        refundedTotal: outcome.payment === 'REFUNDED' ? grandTotal : 0,
        couponCode: discount ? 'WELCOME10' : null,
        deliveryZoneId: zone.id,
        deliveryMethod: 'DELIVERY',
        shippingAddress: JSON.stringify(address),
        billingAddress: JSON.stringify(address),
        placedAt,
        paidAt: paid ? new Date(placedAt.getTime() + between(40, 900) * 1000) : null,
        shippedAt: ['SHIPPED', 'DELIVERED'].includes(outcome.status) ? new Date(placedAt.getTime() + 86_400_000) : null,
        deliveredAt: outcome.status === 'DELIVERED' ? new Date(placedAt.getTime() + 2 * 86_400_000) : null,
        cancelledAt: outcome.status === 'CANCELLED' ? new Date(placedAt.getTime() + 3600_000) : null,
        trackingNumber: ['SHIPPED', 'DELIVERED'].includes(outcome.status) ? `AE${between(100000000, 999999999)}` : null,
        isDemo: true,
        items: { create: items },
      },
    });

    await prisma.orderEvent.create({
      data: { orderId: order.id, type: 'CREATED', message: `Order ${order.orderNumber} placed.`, createdAt: placedAt },
    });
    if (paid) {
      await prisma.orderEvent.create({
        data: {
          orderId: order.id, type: 'PAYMENT_SUCCEEDED',
          message: `Payment confirmed via ${provider}.`,
          createdAt: new Date(placedAt.getTime() + 600_000),
        },
      });
    }

    const externalRef = crypto.randomUUID();
    await prisma.payment.create({
      data: {
        orderId: order.id,
        provider,
        externalRef,
        providerRef: provider === 'card' ? `pi_${externalRef.slice(0, 18)}` : `MP${between(1000000, 9999999)}`,
        status: outcome.payment,
        amount: grandTotal,
        currency: 'AED',
        chargedAmount: provider === 'card' ? grandTotal : Math.round((grandTotal / 100) * 393.5),
        chargedCurrency: provider === 'card' ? 'AED' : 'RWF',
        exchangeRate: provider === 'card' ? 1 : 393.5,
        refundedAmount: outcome.payment === 'REFUNDED' ? grandTotal : 0,
        cardBrand: provider === 'card' ? pick(['visa', 'mastercard', 'amex']) : null,
        cardLast4: provider === 'card' ? String(between(1000, 9999)) : null,
        payerMasked: provider === 'card' ? null : `••${between(100, 999)}`,
        failureMessage: outcome.payment === 'FAILED' ? 'The customer did not approve the request in time.' : null,
        environment: 'sandbox',
        isDemo: true,
        initiatedAt: placedAt,
        completedAt: paid ? new Date(placedAt.getTime() + 600_000) : null,
        createdAt: placedAt,
      },
    });
  }
}

async function main() {
  console.log('\nSeeding AURUM…');
  await wipe();
  await seedRoles();
  const { customers } = await seedUsers();
  await seedCurrencies();
  const taxonomy = await seedTaxonomy();
  await seedCatalog(taxonomy);
  await seedPromotions();
  await seedContent();
  await seedSettings();
  await seedDemoOrders(customers);

  const [products, variants, orders] = await Promise.all([
    prisma.product.count(),
    prisma.productVariant.count(),
    prisma.order.count(),
  ]);

  console.log(`\nDone. ${products} products · ${variants} SKUs · ${orders} demo orders.`);
  console.log(`\nAdmin sign-in:  ${process.env.SEED_ADMIN_EMAIL ?? 'admin@aurum.store'}`);
  console.log(`Admin password: ${process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!2026'}`);
  console.log('Staff accounts: catalog@ / orders@ / finance@ / support@aurum.store — password DemoPass!2026');
  console.log('Customer demo:  sara.almansoori@example.com — password DemoPass!2026\n');
}

main()
  .catch((error) => {
    console.error('\nSeed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
