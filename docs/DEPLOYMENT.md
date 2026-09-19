# Deployment

The application is a standard Next.js 16 server. It needs Node 20.9+, a
database, and somewhere to put uploaded images. Nothing else.

## Before the first deploy

### 1. Database

Follow *Moving to PostgreSQL* in `docs/DATABASE.md`: change `provider` in
`prisma/schema.prisma`, point `DATABASE_URL` at the instance, run
`prisma migrate deploy`. Managed Postgres with automated backups and
point-in-time recovery is the right default; the ledger this app keeps is the
kind of data you only wish you had backed up once.

SQLite is genuinely fine for a single-instance shop with modest traffic. It is
not fine behind more than one instance, because a file is not shared. A hosted
libSQL/Turso database is the middle option and needs only a URL change.

### 2. Secrets

Generate a real `AUTH_SECRET`:

```bash
openssl rand -base64 48
```

Set every variable in `.env.example` that your deployment actually uses. Do not
commit `.env`. Use the platform's secret store — Vercel environment variables,
Fly secrets, Docker secrets, whatever you have.

The only variables that reach the browser are `NEXT_PUBLIC_APP_URL` and the
optional `NEXT_PUBLIC_ANALYTICS_ID`. Both are non-secret. Nothing else may ever
be prefixed `NEXT_PUBLIC_`.

### 3. Change the seeded admin password

The seed creates `SEED_ADMIN_EMAIL` with `SEED_ADMIN_PASSWORD`. Set both to
real values before seeding production, or sign in and change the password
immediately. Then create individual accounts for each person in
**Settings → Users & roles** — shared logins destroy the audit log's usefulness.

### 4. Image storage

Local development writes to `public/uploads`, which does not survive a
container restart or work across instances. In production set
`STORAGE_DRIVER=s3` and supply `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`,
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL`. Add the
public host to `images.remotePatterns` in `next.config.mjs` — Next will refuse
to optimise images from a host that is not allow-listed.

### 5. Email and SMS

Both default to `log`, which writes the message to the server log instead of
sending it. Order confirmations therefore do not reach customers until you set
`MAIL_DRIVER=smtp` with the SMTP settings, and `SMS_DRIVER=http` with
`SMS_API_URL` and `SMS_API_KEY` if you want SMS. Templates are editable in
**Settings → Notifications**.

## Deploying

```bash
npm ci
npx prisma migrate deploy
npm run build
npm start                    # or your platform's start command
```

`npm run build` runs `prisma generate` first, so the client always matches the
schema in the image.

If your build environment cannot reach `binaries.prisma.sh`, that is fine for
the client — Prisma 7 uses driver adapters and ships no query engine. The
Prisma *CLI* still downloads a schema engine for `migrate`; if the network
blocks it, run migrations from a machine that can reach it, or vendor the
binary and set `PRISMA_SCHEMA_ENGINE_BINARY`.

### Vercel

Works with no configuration. Set the environment variables, point
`DATABASE_URL` at a pooled connection string (Neon, Supabase pooler, Prisma
Accelerate), and add the reservation-expiry cron below. Note that `/api/payments/webhook/*`
must not be behind Vercel's deployment protection, or providers will get a 401
they cannot interpret.

### Docker

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "start"]
```

For a smaller image, set `output: 'standalone'` in `next.config.mjs` and copy
`.next/standalone`, `.next/static` and `public` into the runtime stage.

### Behind a proxy

Forward `X-Forwarded-For` — `clientIp()` reads it for rate limiting, and
without it every request looks like one client. Terminate TLS at the proxy;
the app sets `Strict-Transport-Security` and marks cookies `Secure` when
`NODE_ENV=production`.

## Scheduled work

One job matters: releasing stock held by orders whose payment never completed.

```
*/5 * * * *   → releaseExpiredReservations()
```

Expose it as a small authenticated route, a Vercel Cron, or a worker process —
whichever suits your platform. It is idempotent and safe to run as often as you
like. Without it, an abandoned checkout holds its reservation until someone
notices.

Optional: prune revoked and expired `Session` rows, and old `ProductViewStat`
rows, monthly.

## Security posture

Already in place:

- Security headers in `next.config.mjs` — HSTS, `X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`, a restrictive `Permissions-Policy`.
  `/admin/*` is `noindex, nofollow`; webhook routes are `no-store`.
- `poweredByHeader: false`.
- Passwords bcrypt cost 12; sessions stored as SHA-256 hashes of opaque tokens.
- CSRF double-submit on every mutation.
- Per-permission authorisation on every admin page and endpoint.
- Rate limiting on login, registration, password reset, checkout, payment
  initiation, search and webhooks.
- Errors return a safe message and a correlation id; stack traces stay in the
  log.

### Dependency advisories

`npm audit` reports four high-severity advisories at the time of writing, all
from one chain: `@prisma/client` → `prisma` → `mysql2` and `deepmerge-ts`. Two
things are worth knowing before you act on them.

They are not reachable here. `mysql2` is the driver the Prisma CLI uses for
MySQL datasources; this application connects through `@prisma/adapter-libsql`
or `@prisma/adapter-pg` and never loads it. The advisories concern MySQL
authentication and the compressed MySQL protocol — neither exists in this
codebase's execution path.

`npm audit fix --force` "fixes" them by installing `prisma@6`, which is a major
downgrade that removes driver adapters — the mechanism the whole
SQLite-and-PostgreSQL story depends on. Do not run it. Track the chain and
upgrade Prisma 7 when the fix lands upstream.

Everything that *is* fixable is fixed: the build runs on Next 16, which
resolved the postcss advisories present on the 15.x line, and every direct
dependency is current.

Worth adding for your environment:

- **A Content-Security-Policy.** Not shipped, because a useful one depends on
  which analytics, fonts and payment scripts you actually load, and a wrong CSP
  breaks checkout silently. Start in report-only mode.
- **Shared-store rate limiting.** The in-process limiter is per instance.
  Behind several, back `src/lib/rate-limit.ts` with Redis — the interface is one
  function.
- **A WAF or bot rules** in front of the storefront.
- **Log shipping.** `src/lib/logger.ts` emits structured JSON; point it at your
  aggregator and alert on `payment.amount_mismatch` and
  `webhook.signature_rejected` specifically. Both mean someone is doing
  something they should not be.

## Go-live checklist

**Infrastructure**
- [ ] PostgreSQL provisioned, `migrate deploy` run, backups and PITR on
- [ ] `AUTH_SECRET` freshly generated
- [ ] `APP_URL` and `NEXT_PUBLIC_APP_URL` set to the real origin
- [ ] TLS terminating, HSTS confirmed with a live request
- [ ] Object storage configured and its host in `images.remotePatterns`
- [ ] SMTP configured; a test order confirmation actually received
- [ ] Reservation-expiry job scheduled and observed running

**Payments** — the full list is at the end of `docs/PAYMENTS.md`
- [ ] `PAYMENTS_ENVIRONMENT=live`, simulator removed from `PAYMENTS_ENABLED`
- [ ] Live credentials and webhook secrets for every enabled provider
- [ ] Callback URLs registered: `https://…/api/payments/webhook/{providerId}`
- [ ] One real payment and one real refund per provider
- [ ] A forged webhook confirmed to return 401

**Store**
- [ ] Seeded admin password changed; a named account per person
- [ ] Store name, contact details, addresses and socials set in Settings
- [ ] Delivery zones and their fees set for the markets you serve
- [ ] Currency rates set, with a review cadence agreed
- [ ] Terms, privacy, returns and warranty pages reviewed by someone who can
      be held to them
- [ ] Trust statements checked — the store ships with configurable copy, and
      claims like "100% genuine" should only be there if you can stand behind
      them
- [ ] Catalogue reviewed: real stock, real prices, demo orders cleared

**Verification**
- [ ] `npm test` green
- [ ] `npm run typecheck` clean
- [ ] `npm run lint` clean
- [ ] `npm run build` clean
- [ ] A real purchase made end to end on the production URL
- [ ] The admin walked through on a phone

## Troubleshooting

**"DATABASE_URL is not set"** — copy `.env.example` to `.env`. The default
value works with no other setup.

**Everything database-backed returns 500 after a code change** — an old
`next start` may still be holding the port and serving the previous build.
`pkill -f next-server` and restart.

**`prisma generate` cannot reach `binaries.prisma.sh`** — a proxy is blocking
it. The application does not need an engine (driver adapters); the CLI does for
`migrate`. Run migrations elsewhere or set `PRISMA_SCHEMA_ENGINE_BINARY`.

**Images 400 in production** — the host is not in `images.remotePatterns`.

**Webhooks return 401** — the secret does not match, or the body is being
rewritten in transit. The signature is computed over the raw bytes; a proxy
that reformats JSON will break it.

**Rate limits firing for everyone** — `X-Forwarded-For` is not reaching the
app, so every request shares one bucket.
