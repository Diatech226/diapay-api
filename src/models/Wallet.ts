import type { LedgerEntry, MarketplaceCurrency, WalletStatus, WalletType } from './Marketplace';

export interface Wallet {
  id: string;
  type: WalletType;
  owner: { id: string; type: 'merchant' | 'vendor' | 'platform' | 'escrow' | 'reserve'; name?: string };
  balance: number;
  availableBalance: number;
  pendingBalance: number;
  currency: MarketplaceCurrency;
  status: WalletStatus;
  ledgerEntries: Array<LedgerEntry['id']>;
  createdAt: string;
  updatedAt: string;
}
