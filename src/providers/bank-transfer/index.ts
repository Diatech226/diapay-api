import { createMockProvider } from '../mock/provider';
import type { ProviderPaymentRequest, ProviderPaymentResult } from '../base';

export const bankTransferProvider = {
  ...createMockProvider({
    id: 'mock-bank-transfer',
    name: 'Bank Transfer Sandbox',
    method: 'bank-transfer',
    capabilities: ['payments', 'webhooks'],
    currencies: ['XOF', 'USD', 'EUR'],
    countries: ['CI', 'SN', 'BJ', 'TG'],
    notes: 'Retourne des instructions de virement sandbox; aucun compte bancaire réel exposé.',
  }),
  async createPayment(request: ProviderPaymentRequest): Promise<ProviderPaymentResult> {
    if (request.details.forceStatus === 'failed') {
      return { providerPaymentId: `bt_${Date.now()}`, provider: 'mock-bank-transfer', status: 'failed', failureCode: 'bank_transfer_rejected', failureMessage: 'Sandbox bank transfer rejected' };
    }
    return {
      providerPaymentId: `bt_${Date.now()}`,
      provider: 'mock-bank-transfer',
      status: 'processing',
      actionRequired: { type: 'bank_instructions', message: `Virement sandbox vers DIAPAY TEST / REF ${request.metadata?.reference ?? 'AUTO'}` },
    };
  },
};

export const providerName = bankTransferProvider.descriptor.method;
