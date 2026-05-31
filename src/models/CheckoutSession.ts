export type CheckoutSessionStatus = 'created' | 'open' | 'completed' | 'cancelled' | 'expired';

export type CheckoutSessionItem = {
  name: string;
  quantity?: number;
  amount?: number;
};

export interface CheckoutSession {
  id: string;
  paymentSessionId: string;
  checkoutUrl: string;
  merchant: string;
  payment?: string;
  amount: number;
  currency: string;
  customer?: Record<string, unknown>;
  items: CheckoutSessionItem[];
  successUrl: string;
  cancelUrl: string;
  returnUrl: string;
  status: CheckoutSessionStatus;
  expiresAt: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
