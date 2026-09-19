import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-6 text-center">
      <p className="eyebrow mb-3">404</p>
      <h1 className="font-display text-4xl tracking-tight text-ink">We could not find that page</h1>
      <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted">
        The link may be old, or the device may no longer be listed. Everything currently in stock is on the shop page.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/shop" className="inline-flex h-11 items-center rounded bg-ink px-6 text-sm font-medium text-canvas">
          Shop devices
        </Link>
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded border border-ink/25 px-6 text-sm font-medium text-ink"
        >
          Home
        </Link>
      </div>
    </div>
  );
}
