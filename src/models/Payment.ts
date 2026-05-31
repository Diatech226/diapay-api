export type PaymentStatus = 'requires_action' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'expired' | 'refunded';
export type PaymentMethod = 'mobile-money' | 'bank-card' | 'bank-transfer' | 'crypto' | 'mock';

export interface Payment {
  id: string;
  sessionId?: string;
  merchant: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  provider: string;
  providerPaymentId?: string;
  actionRequired?: {
    type: 'redirect' | 'otp' | 'bank_instructions' | 'wallet_address';
    url?: string;
    message?: string;
    expiresAt?: string;
  };
  failureCode?: string;
  failureMessage?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
