export interface WebhookEndpoint {
  id: string;
  merchant: string;
  url: string;
  events: string[];
  secret: string;
  status: 'active' | 'paused';
  createdAt: string;
  updatedAt: string;
}
