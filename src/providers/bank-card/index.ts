import { createMockProvider } from '../mock/provider';
import type { ProviderPaymentRequest, ProviderPaymentResult } from '../base';

export const bankCardProvider = {
  ...createMockProvider({
    id: 'mock-bank-card',
    name: 'Card Sandbox',
    method: 'bank-card',
    currencies: ['XOF', 'USD', 'EUR', 'GHS', 'NGN'],
    countries: ['CI', 'SN', 'BJ', 'TG', 'GH', 'NG', 'FR', 'US'],
    notes: 'Simule les cartes test 4242 (succès) et 4000 0000 0000 0002 (échec).',
  }),
  async createPayment(request: ProviderPaymentRequest): Promise<ProviderPaymentResult> {
    const number = String(request.details.cardNumber ?? '').replace(/\s+/g, '');
    if (number === '4000000000000002') {
      return { providerPaymentId: `card_${Date.now()}`, provider: 'mock-bank-card', status: 'failed', failureCode: 'card_declined', failureMessage: 'Sandbox card declined' };
    }
    if (request.details.forceStatus === 'requires_action') {
      return { providerPaymentId: `card_${Date.now()}`, provider: 'mock-bank-card', status: 'requires_action', actionRequired: { type: 'redirect', url: 'https://sandbox.diapay.local/3ds/mock' } };
    }
    return { providerPaymentId: `card_${Date.now()}`, provider: 'mock-bank-card', status: 'succeeded', raw: { scheme: number.startsWith('4') ? 'visa' : 'card' } };
  },
};

export const providerName = bankCardProvider.descriptor.method;
