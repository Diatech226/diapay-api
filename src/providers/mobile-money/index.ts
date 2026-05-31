import { createMockProvider } from '../mock/provider';
import type { ProviderPaymentRequest, ProviderPaymentResult } from '../base';

export const mobileMoneyProvider = {
  ...createMockProvider({
    id: 'mock-mobile-money',
    name: 'Mobile Money Sandbox',
    method: 'mobile-money',
    currencies: ['XOF', 'GHS', 'NGN'],
    countries: ['CI', 'SN', 'BJ', 'TG', 'GH', 'NG'],
    notes: 'Simule Orange Money, MTN MoMo, Wave ou Moov sans credential provider.',
  }),
  async createPayment(request: ProviderPaymentRequest): Promise<ProviderPaymentResult> {
    const phone = String(request.details.phone ?? '');
    if (phone === '70000001') {
      return { providerPaymentId: `momo_${Date.now()}`, provider: 'mock-mobile-money', status: 'failed', failureCode: 'momo_declined', failureMessage: 'Sandbox mobile money failure' };
    }
    if (request.details.forceStatus === 'pending') {
      return { providerPaymentId: `momo_${Date.now()}`, provider: 'mock-mobile-money', status: 'processing', actionRequired: { type: 'otp', message: 'Confirmez le paiement sur le téléphone sandbox.' } };
    }
    return { providerPaymentId: `momo_${Date.now()}`, provider: 'mock-mobile-money', status: 'succeeded', raw: { network: request.details.network ?? 'sandbox-momo' } };
  },
};

export const providerName = mobileMoneyProvider.descriptor.method;
