export type WalletType = 'merchant_wallet' | 'vendor_wallet' | 'platform_wallet' | 'escrow_wallet' | 'reserve_wallet';
export type WalletStatus = 'active' | 'frozen' | 'closed';
export type Currency = 'XOF' | 'USD' | 'EUR' | 'USDT' | string;
export type LedgerEntryType = 'debit' | 'credit' | 'fee' | 'reserve' | 'refund' | 'payout' | 'reversal';
export type LedgerAccountType = 'asset' | 'liability' | 'revenue' | 'expense' | 'reserve' | 'escrow';
export type EscrowStatus = 'held' | 'released' | 'refunded' | 'disputed';
export type PayoutMethodType = 'mobile_money' | 'bank_transfer' | 'crypto';
export type MarketplacePayoutStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'reversed';
export type KycStatus = 'not_started' | 'pending' | 'verified' | 'rejected';
export type TimelineEventType = 'payment_created' | 'payment_authorized' | 'payment_captured' | 'split_processed' | 'wallet_updated' | 'escrow_held' | 'payout_created' | 'payout_completed' | 'refund_processed';

export interface LedgerAccount {
  id: string;
  ownerId: string;
  ownerType: 'merchant' | 'vendor' | 'platform' | 'escrow' | 'reserve';
  type: LedgerAccountType;
  currency: Currency;
  normalBalance: 'debit' | 'credit';
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  transactionId: string;
  accountId: string;
  walletId?: string;
  type: LedgerEntryType;
  direction: 'debit' | 'credit';
  amount: number;
  currency: Currency;
  description: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface BalanceSnapshot {
  id: string;
  walletId: string;
  balance: number;
  availableBalance: number;
  pendingBalance: number;
  currency: Currency;
  ledgerEntryId: string;
  createdAt: string;
}

export interface MarketplaceWallet {
  id: string;
  type: WalletType;
  balance: number;
  availableBalance: number;
  pendingBalance: number;
  currency: Currency;
  status: WalletStatus;
  owner: { id: string; type: 'merchant' | 'vendor' | 'platform' | 'escrow' | 'reserve'; name?: string };
  ledgerAccountId: string;
  ledgerEntries: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PayoutMethod {
  id: string;
  type: PayoutMethodType;
  label: string;
  destination: string;
  currency: Currency;
  country?: string;
  default?: boolean;
}

export interface CommissionRule {
  id: string;
  scope: 'platform' | 'category' | 'vendor' | 'country' | 'dynamic';
  fixedAmount?: number;
  percentage?: number;
  currency?: Currency;
  category?: string;
  vendorId?: string;
  country?: string;
  priority: number;
  active: boolean;
}

export interface VendorAccount {
  id: string;
  businessName: string;
  country: string;
  currencies: Currency[];
  payoutMethods: PayoutMethod[];
  wallet: string;
  kycStatus: KycStatus;
  commissions: CommissionRule[];
  capabilities: Array<'payments' | 'escrow' | 'payouts' | 'refunds' | 'multi_currency'>;
  createdAt: string;
  updatedAt: string;
}

export interface SplitInstruction {
  vendorId?: string;
  walletId?: string;
  label?: string;
  amount?: number;
  percentage?: number;
  priority?: number;
  fallback?: boolean;
  category?: string;
  country?: string;
  holdInEscrow?: boolean;
}

export interface SplitAllocation {
  id: string;
  vendorId?: string;
  walletId: string;
  label: string;
  amount: number;
  currency: Currency;
  type: 'vendor' | 'marketplace_commission' | 'diapay_fee' | 'reserve' | 'fallback';
  status: 'pending' | 'available' | 'held' | 'paid_out' | 'refunded';
  priority: number;
}

export interface EscrowHold {
  id: string;
  paymentId: string;
  allocationId: string;
  walletId: string;
  amount: number;
  currency: Currency;
  status: EscrowStatus;
  autoReleaseAt?: string;
  releasedAt?: string;
  refundedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplacePayout {
  id: string;
  vendorId?: string;
  walletId: string;
  amount: number;
  currency: Currency;
  method: PayoutMethodType;
  destination: string;
  status: MarketplacePayoutStatus;
  schedule: 'manual' | 'automatic' | 'scheduled';
  threshold?: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface TimelineEvent {
  id: string;
  paymentId?: string;
  type: TimelineEventType;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface SplitPayment {
  id: string;
  paymentId: string;
  merchantId: string;
  amount: number;
  currency: Currency;
  status: 'processed' | 'partially_refunded' | 'refunded';
  allocations: SplitAllocation[];
  escrowHolds: EscrowHold[];
  timeline: TimelineEvent[];
  createdAt: string;
  updatedAt: string;
}
