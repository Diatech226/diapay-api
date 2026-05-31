import { createMockProvider } from '../mock/provider';
import type { ProviderPaymentRequest, ProviderPaymentResult } from '../base';

export const cryptoProvider = {
  ...createMockProvider({
    id: 'mock-crypto',
    name: 'Crypto Sandbox',
    method: 'crypto',
    capabilities: ['payments', 'refunds', 'webhooks'],
    currencies: ['USDC', 'USD', 'EUR'],
    countries: ['GLOBAL'],
    notes: 'Simule un paiement USDC/crypto avec adresse sandbox non réutilisable.',
  }),
  async createPayment(request: ProviderPaymentRequest): Promise<ProviderPaymentResult> {
    if (request.details.forceStatus === 'failed') {
      return { providerPaymentId: `crypto_${Date.now()}`, provider: 'mock-crypto', status: 'failed', failureCode: 'crypto_underpaid', failureMessage: 'Sandbox crypto underpayment' };
    }
    return {
      providerPaymentId: `crypto_${Date.now()}`,
      provider: 'mock-crypto',
      status: request.details.forceStatus === 'pending' ? 'processing' : 'succeeded',
      actionRequired: { type: 'wallet_address', message: 'Envoyer le montant exact à 0x000000000000000000000000000000000000d1a5' },
      raw: { network: request.details.network ?? 'polygon-amoy' },
    };
  },
};

export const providerName = cryptoProvider.descriptor.method;
