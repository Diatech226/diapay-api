import type { MarketplaceCurrency, PayoutMethodType, PayoutStatus } from './Marketplace';

export interface Payout {
  id: string;
  vendorId?: string;
  walletId?: string;
  amount: number;
  currency: MarketplaceCurrency | string;
  method?: PayoutMethodType;
  status: PayoutStatus | 'paid' | 'in_transit';
  destination?: string | Record<string, unknown>;
  scheduledFor?: string;
  minimumThreshold?: number;
  arrivalDate?: string;
  createdAt?: string;
  updatedAt?: string;
}
