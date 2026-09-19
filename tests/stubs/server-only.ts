// The real `server-only` package throws the moment it is imported outside a
// React Server Component graph. Under vitest that is exactly what we are doing
// on purpose, so the module is aliased to this no-op in vitest.config.ts.
export {};
