import type { PaymentMethod } from '../../models/Payment';
import type { PaymentProvider, PaymentProviderDescriptor } from './types';

const providers = new Map<PaymentMethod, PaymentProvider>();

export function registerProvider(provider: PaymentProvider) {
  providers.set(provider.descriptor.method, provider);
  return provider;
}

export function getProvider(method: PaymentMethod) {
  const provider = providers.get(method) ?? providers.get('mock');
  if (!provider) throw Object.assign(new Error(`No payment provider registered for method ${method}`), { status: 400 });
  return provider;
}

export function listProviders(): PaymentProviderDescriptor[] {
  return Array.from(providers.values()).map((provider) => provider.descriptor);
}

export function listPaymentMethods(): PaymentMethod[] {
  return Array.from(providers.keys());
}
