import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { createAirtelProvider } from './providers/airtel';
import { createCardProvider } from './providers/card';
import { createMtnProvider } from './providers/mtn';
import { createSimulatorProvider } from './providers/simulator';
import type { PaymentProvider, ProviderDescriptor, ProviderId } from './types';

/**
 * Provider registry.
 *
 * Adding a payment method is: write an adapter implementing PaymentProvider,
 * add one line to FACTORIES, list its id in PAYMENTS_ENABLED. Checkout, the
 * order service, the webhook route and the admin UI all read from here.
 */

type Factory = () => PaymentProvider;

const FACTORIES: Record<string, Factory> = {
  mtn_momo: createMtnProvider,
  airtel_money: createAirtelProvider,
  card: createCardProvider,
  simulator: createSimulatorProvider,
};

let cache: Map<string, PaymentProvider> | null = null;

function enabledIds(): string[] {
  const raw = process.env.PAYMENTS_ENABLED ?? 'card,mtn_momo,airtel_money';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function build(): Map<string, PaymentProvider> {
  const map = new Map<string, PaymentProvider>();
  const live = process.env.PAYMENTS_ENVIRONMENT === 'live';

  for (const id of enabledIds()) {
    const factory = FACTORIES[id];
    if (!factory) {
      logger.warn('payments.unknown_provider', { id });
      continue;
    }
    try {
      const provider = factory();

      // A sandbox adapter must never be reachable in live mode, and a live
      // adapter must never be reachable while the store is in sandbox. Mixing
      // the two is the single most expensive payment mistake there is.
      if (live && provider.descriptor.environment === 'sandbox' && provider.descriptor.kind === 'TEST') {
        logger.warn('payments.provider_blocked_in_live', { id });
        continue;
      }
      if (live && provider.descriptor.environment === 'sandbox') {
        logger.error('payments.sandbox_credentials_in_live_mode', { id });
        continue;
      }
      map.set(id, provider);
    } catch (error) {
      logger.error('payments.provider_init_failed', { id, error: String(error) });
    }
  }
  return map;
}

function registry(): Map<string, PaymentProvider> {
  // Adapters read process.env at construction; in dev we rebuild each call so
  // an env change is picked up on the next request without a restart.
  if (process.env.NODE_ENV !== 'production') return build();
  if (!cache) cache = build();
  return cache;
}

export function listProviders(): PaymentProvider[] {
  return [...registry().values()];
}

/** Descriptors for the checkout UI. Only configured providers are offered. */
export function listAvailableDescriptors(): ProviderDescriptor[] {
  return listProviders()
    .filter((p) => p.descriptor.configured)
    .map((p) => p.descriptor);
}

/** Every registered descriptor, configured or not — for the admin screen. */
export function listAllDescriptors(): ProviderDescriptor[] {
  return listProviders().map((p) => p.descriptor);
}

export function getProvider(id: ProviderId): PaymentProvider {
  const provider = registry().get(id);
  if (!provider) {
    throw new AppError('PROVIDER_NOT_CONFIGURED', 'That payment method is not available.', {
      internal: { requested: id, enabled: enabledIds() },
    });
  }
  if (!provider.descriptor.configured) {
    throw new AppError('PROVIDER_NOT_CONFIGURED', 'That payment method is not activated for this store.', {
      internal: { requested: id, hint: provider.descriptor.configurationHint },
    });
  }
  return provider;
}

/** Resolves a provider for webhook handling — configuration is not required. */
export function getProviderForWebhook(id: ProviderId): PaymentProvider {
  const provider = registry().get(id);
  if (!provider) throw new AppError('NOT_FOUND', 'Unknown payment provider.');
  return provider;
}

export function invalidateProviderCache() {
  cache = null;
}

export function paymentsEnvironment(): 'sandbox' | 'live' {
  return process.env.PAYMENTS_ENVIRONMENT === 'live' ? 'live' : 'sandbox';
}
