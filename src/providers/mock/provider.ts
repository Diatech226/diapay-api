import crypto from 'crypto';
import type { PaymentProvider, ProviderMutationResult, ProviderPaymentRequest, ProviderPaymentResult, ProviderRefundRequest } from '../base';

function reference(prefix: string) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function forcedStatus(details: Record<string, unknown>) {
  if (details.forceStatus === 'pending') return 'processing' as const;
  if (details.forceStatus === 'expired') return 'expired' as const;
  if (details.forceStatus === 'requires_action') return 'requires_action' as const;
  if (details.forceStatus === 'failed') return 'failed' as const;
  return undefined;
}

export function createMockProvider(overrides: Partial<PaymentProvider['descriptor']> = {}): PaymentProvider {
  const method = overrides.method ?? 'mock';
  const id = overrides.id ?? `mock-${method}`;

  return {
    descriptor: {
      id,
      name: overrides.name ?? `Diapay ${method} sandbox`,
      method,
      environment: overrides.environment ?? 'test',
      capabilities: overrides.capabilities ?? ['payments', 'refunds', 'cancellations', 'webhooks'],
      currencies: overrides.currencies ?? ['XOF', 'USD', 'EUR', 'GHS', 'NGN', 'USDC'],
      countries: overrides.countries ?? ['CI', 'SN', 'BJ', 'TG', 'GH', 'NG'],
      status: overrides.status ?? 'ready',
      testMode: overrides.testMode ?? true,
      implementation: overrides.implementation ?? 'mock',
      notes: overrides.notes ?? 'Mock provider local sans appel API externe ni credential sensible.',
    },
    async createPayment(request: ProviderPaymentRequest): Promise<ProviderPaymentResult> {
      const status = forcedStatus(request.details) ?? 'succeeded';
      return {
        providerPaymentId: reference('pp_mock'),
        provider: id,
        status,
        failureCode: status === 'failed' ? 'sandbox_declined' : undefined,
        failureMessage: status === 'failed' ? 'Sandbox forced failure' : undefined,
        raw: { mode: 'mock', method: request.method },
      };
    },
    async cancelPayment(paymentId: string): Promise<ProviderMutationResult> {
      return { providerReference: paymentId, status: 'cancelled', raw: { mode: 'mock' } };
    },
    async refundPayment(request: ProviderRefundRequest): Promise<ProviderMutationResult> {
      return { providerReference: request.paymentId, status: 'refunded', raw: { mode: 'mock', amount: request.amount } };
    },
  };
}

export const mockProvider = createMockProvider();
