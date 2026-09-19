import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PaymentWaiting } from '@/components/store/payment-waiting';

export const metadata: Metadata = {
  title: 'Completing your payment',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function ProcessingPage() {
  return (
    <div className="container flex min-h-[60vh] items-center justify-center py-16">
      <Suspense fallback={<div className="skeleton h-64 w-full max-w-md rounded-xl" />}>
        <PaymentWaiting />
      </Suspense>
    </div>
  );
}
