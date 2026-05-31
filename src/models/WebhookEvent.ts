export type WebhookEventType =
  | 'checkout.session.completed'
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.cancelled'
  | 'payment.expired';

export interface WebhookDeliveryAttempt {
  id: string;
  endpointId: string;
  url: string;
  status: 'pending' | 'delivered' | 'failed';
  statusCode?: number;
  error?: string;
  signature: string;
  createdAt: string;
}

export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  merchant: string;
  payload: Record<string, unknown>;
  attempts: WebhookDeliveryAttempt[];
  createdAt: string;
  updatedAt: string;
}
