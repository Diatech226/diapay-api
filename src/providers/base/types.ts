import type { PaymentMethod, PaymentStatus } from '../../models/Payment';

export type ProviderEnvironment = 'test' | 'live';

export type ProviderCapability = 'payments' | 'refunds' | 'cancellations' | 'webhooks';

export type ProviderHealth = 'ready' | 'degraded' | 'disabled';

export interface PaymentProviderDescriptor {
  id: string;
  name: string;
  method: PaymentMethod;
  environment: ProviderEnvironment;
  capabilities: ProviderCapability[];
  currencies: string[];
  countries: string[];
  status: ProviderHealth;
  testMode: boolean;
  implementation: 'mock' | 'connector';
  notes?: string;
}

export interface ProviderPaymentRequest {
  amount: number;
  currency: string;
  merchant: string;
  method: PaymentMethod;
  sessionId?: string;
  customer?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  details: Record<string, unknown>;
}

export interface ProviderPaymentResult {
  providerPaymentId: string;
  status: PaymentStatus;
  provider: string;
  actionRequired?: {
    type: 'redirect' | 'otp' | 'bank_instructions' | 'wallet_address';
    url?: string;
    message?: string;
    expiresAt?: string;
  };
  failureCode?: string;
  failureMessage?: string;
  raw?: Record<string, unknown>;
}

export interface ProviderRefundRequest {
  paymentId: string;
  amount?: number;
  currency: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderMutationResult {
  providerReference: string;
  status: PaymentStatus;
  raw?: Record<string, unknown>;
}

export interface PaymentProvider {
  descriptor: PaymentProviderDescriptor;
  createPayment(request: ProviderPaymentRequest): Promise<ProviderPaymentResult>;
  cancelPayment?(paymentId: string): Promise<ProviderMutationResult>;
  refundPayment?(request: ProviderRefundRequest): Promise<ProviderMutationResult>;
}
