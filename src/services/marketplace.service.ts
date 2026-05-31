import { randomUUID } from 'crypto';
import type { BalanceSnapshot, CommissionRule, Currency, EscrowHold, LedgerAccount, LedgerEntry, MarketplacePayout, MarketplaceWallet, PayoutMethodType, SplitAllocation, SplitInstruction, SplitPayment, TimelineEvent, VendorAccount } from '../models/Marketplace';

type CreateVendorPayload = Partial<Pick<VendorAccount, 'businessName' | 'country' | 'currencies' | 'payoutMethods' | 'commissions' | 'capabilities' | 'kycStatus'>>;
type SplitPaymentPayload = { amount: number; currency?: Currency; merchantId?: string; paymentId?: string; splits?: SplitInstruction[]; commission?: { amount?: number; percentage?: number }; diapayFee?: { amount?: number; percentage?: number }; reserve?: { amount?: number; percentage?: number }; escrow?: { enabled?: boolean; autoReleaseAt?: string } };

type PayoutPayload = { vendorId?: string; walletId?: string; amount: number; currency?: Currency; method?: PayoutMethodType; destination?: string; schedule?: 'manual' | 'automatic' | 'scheduled'; threshold?: number };

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 14)}`;

function assertPositiveInteger(value: unknown, field: string) {
  if (!Number.isInteger(value) || Number(value) <= 0) throw Object.assign(new Error(`${field} must be a positive integer in the smallest currency unit`), { status: 400 });
}

export class MarketplaceService {
  readonly wallets = new Map<string, MarketplaceWallet>();
  readonly ledgerAccounts = new Map<string, LedgerAccount>();
  readonly ledgerEntries = new Map<string, LedgerEntry>();
  readonly balanceSnapshots = new Map<string, BalanceSnapshot>();
  readonly vendors = new Map<string, VendorAccount>();
  readonly splitPayments = new Map<string, SplitPayment>();
  readonly escrowHolds = new Map<string, EscrowHold>();
  readonly payouts = new Map<string, MarketplacePayout>();
  readonly timeline = new Map<string, TimelineEvent>();

  platformWallet: MarketplaceWallet;
  diapayFeeWallet: MarketplaceWallet;
  reserveWallet: MarketplaceWallet;
  escrowWallet: MarketplaceWallet;

  constructor() {
    this.platformWallet = this.createWallet('platform_wallet', 'platform', 'platform_diamarket', 'Diamarket Platform', 'XOF');
    this.diapayFeeWallet = this.createWallet('merchant_wallet', 'platform', 'platform_diapay_fees', 'Diapay Fees', 'XOF');
    this.reserveWallet = this.createWallet('reserve_wallet', 'reserve', 'reserve_global', 'Global Reserve', 'XOF');
    this.escrowWallet = this.createWallet('escrow_wallet', 'escrow', 'escrow_global', 'Global Escrow', 'XOF');
    this.seed();
  }

  createWallet(type: MarketplaceWallet['type'], ownerType: MarketplaceWallet['owner']['type'], ownerId: string, ownerName: string, currency: Currency) {
    const account: LedgerAccount = { id: id('lacct'), ownerId, ownerType, type: ownerType === 'platform' ? 'revenue' : ownerType === 'escrow' ? 'escrow' : ownerType === 'reserve' ? 'reserve' : 'liability', currency, normalBalance: ownerType === 'platform' ? 'credit' : 'credit', createdAt: now() };
    const wallet: MarketplaceWallet = { id: id('wlt'), type, balance: 0, availableBalance: 0, pendingBalance: 0, currency, status: 'active', owner: { id: ownerId, type: ownerType, name: ownerName }, ledgerAccountId: account.id, ledgerEntries: [], createdAt: now(), updatedAt: now() };
    this.ledgerAccounts.set(account.id, account);
    this.wallets.set(wallet.id, wallet);
    return wallet;
  }

  seed() {
    const vendor = this.createVendor({ businessName: 'Atelier Baoulé', country: 'CI', currencies: ['XOF', 'EUR', 'USD'], kycStatus: 'verified', payoutMethods: [{ id: 'pm_momo_atelier', type: 'mobile_money', label: 'Orange Money CI', destination: '+2250700000000', currency: 'XOF', country: 'CI', default: true }] });
    this.createVendor({ businessName: 'Sahel Electronics', country: 'SN', currencies: ['XOF', 'USDT'], kycStatus: 'pending', payoutMethods: [{ id: 'pm_bank_sahel', type: 'bank_transfer', label: 'Ecobank SN', destination: 'SN08••••9910', currency: 'XOF', country: 'SN', default: true }] });
    this.processSplitPayment({ amount: 100000, currency: 'XOF', merchantId: 'merchant_demo', splits: [{ vendorId: vendor.id, percentage: 85, holdInEscrow: true }], commission: { percentage: 10 }, diapayFee: { percentage: 5 }, escrow: { enabled: true } });
  }

  createVendor(payload: CreateVendorPayload) {
    const vendorId = id('vnd');
    const currency = payload.currencies?.[0] ?? 'XOF';
    const wallet = this.createWallet('vendor_wallet', 'vendor', vendorId, payload.businessName ?? 'Vendor Account', currency);
    const commission: CommissionRule = { id: id('com'), scope: 'vendor', percentage: 10, vendorId, priority: 100, active: true };
    const vendor: VendorAccount = { id: vendorId, businessName: payload.businessName ?? 'Vendor Account', country: payload.country ?? 'CI', currencies: payload.currencies ?? ['XOF'], payoutMethods: payload.payoutMethods ?? [], wallet: wallet.id, kycStatus: payload.kycStatus ?? 'pending', commissions: payload.commissions?.length ? payload.commissions : [commission], capabilities: payload.capabilities ?? ['payments', 'escrow', 'payouts', 'refunds', 'multi_currency'], createdAt: now(), updatedAt: now() };
    this.vendors.set(vendor.id, vendor);
    return vendor;
  }

  processSplitPayment(payload: SplitPaymentPayload) {
    assertPositiveInteger(payload.amount, 'amount');
    const currency = payload.currency ?? 'XOF';
    const paymentId = payload.paymentId ?? id('pay_market');
    const transactionId = id('txn_split');
    const events: TimelineEvent[] = [];
    const addEvent = (type: TimelineEvent['type'], message: string, metadata?: Record<string, unknown>) => {
      const event = { id: id('evt'), paymentId, type, message, metadata, createdAt: now() };
      this.timeline.set(event.id, event);
      events.push(event);
    };

    addEvent('payment_created', `Payment ${paymentId} created for ${payload.amount} ${currency}`);
    addEvent('payment_authorized', 'Payment authorized by sandbox provider');
    addEvent('payment_captured', 'Funds captured and ready for marketplace split');

    const instructions = [...(payload.splits ?? [])].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
    let allocated = 0;
    const allocations: SplitAllocation[] = [];
    for (const split of instructions) {
      const vendor = split.vendorId ? this.vendors.get(split.vendorId) : undefined;
      const walletId = split.walletId ?? vendor?.wallet;
      if (!walletId || !this.wallets.has(walletId)) throw Object.assign(new Error(`Unknown wallet/vendor for split ${split.label ?? split.vendorId ?? 'unlabelled'}`), { status: 400 });
      const amount = split.amount ?? Math.floor(payload.amount * ((split.percentage ?? 0) / 100));
      if (amount <= 0) continue;
      allocated += amount;
      allocations.push({ id: id('alloc'), vendorId: vendor?.id ?? split.vendorId, walletId, label: split.label ?? vendor?.businessName ?? 'Vendor split', amount, currency, type: 'vendor', status: split.holdInEscrow || payload.escrow?.enabled ? 'held' : 'available', priority: split.priority ?? 100 });
    }

    const commissionAmount = payload.commission?.amount ?? Math.floor(payload.amount * ((payload.commission?.percentage ?? 10) / 100));
    const feeAmount = payload.diapayFee?.amount ?? Math.floor(payload.amount * ((payload.diapayFee?.percentage ?? 5) / 100));
    const reserveAmount = payload.reserve?.amount ?? Math.floor(payload.amount * ((payload.reserve?.percentage ?? 0) / 100));
    const fallbackAmount = payload.amount - allocated - commissionAmount - feeAmount - reserveAmount;

    allocations.push({ id: id('alloc'), walletId: this.platformWallet.id, label: 'Marketplace commission', amount: commissionAmount, currency, type: 'marketplace_commission', status: 'available', priority: 900 });
    allocations.push({ id: id('alloc'), walletId: this.diapayFeeWallet.id, label: 'Diapay fee', amount: feeAmount, currency, type: 'diapay_fee', status: 'available', priority: 910 });
    if (reserveAmount > 0) allocations.push({ id: id('alloc'), walletId: this.reserveWallet.id, label: 'Risk reserve', amount: reserveAmount, currency, type: 'reserve', status: 'held', priority: 920 });
    if (fallbackAmount > 0) allocations.push({ id: id('alloc'), walletId: this.platformWallet.id, label: 'Fallback split remainder', amount: fallbackAmount, currency, type: 'fallback', status: 'available', priority: 999 });
    if (fallbackAmount < 0) throw Object.assign(new Error('Split allocation exceeds payment amount'), { status: 400 });

    const escrowHolds: EscrowHold[] = [];
    for (const allocation of allocations) {
      const targetWalletId = allocation.status === 'held' ? this.escrowWallet.id : allocation.walletId;
      this.applyLedgerEntry(transactionId, targetWalletId, allocation.status === 'held' ? 'reserve' : allocation.type === 'diapay_fee' ? 'fee' : 'credit', 'credit', allocation.amount, currency, allocation.label, { allocationId: allocation.id, beneficiaryWalletId: allocation.walletId });
      if (allocation.status === 'held') {
        const hold: EscrowHold = { id: id('esc'), paymentId, allocationId: allocation.id, walletId: allocation.walletId, amount: allocation.amount, currency, status: 'held', autoReleaseAt: payload.escrow?.autoReleaseAt, createdAt: now(), updatedAt: now() };
        this.escrowHolds.set(hold.id, hold);
        escrowHolds.push(hold);
        addEvent('escrow_held', `${allocation.amount} ${currency} held in escrow`, { escrowId: hold.id, walletId: allocation.walletId });
      }
    }

    addEvent('split_processed', `${allocations.length} marketplace allocations created`, { allocations: allocations.map((item) => ({ walletId: item.walletId, amount: item.amount, type: item.type })) });
    addEvent('wallet_updated', 'Wallet balances updated from immutable ledger entries');

    const split: SplitPayment = { id: id('sp'), paymentId, merchantId: payload.merchantId ?? 'merchant_demo', amount: payload.amount, currency, status: 'processed', allocations, escrowHolds, timeline: events, createdAt: now(), updatedAt: now() };
    this.splitPayments.set(split.id, split);
    return split;
  }

  releaseEscrow(payload: { escrowId?: string; paymentId?: string; amount?: number }) {
    const hold = payload.escrowId ? this.escrowHolds.get(payload.escrowId) : Array.from(this.escrowHolds.values()).find((item) => item.paymentId === payload.paymentId && item.status === 'held');
    if (!hold) throw Object.assign(new Error('Escrow hold not found'), { status: 404 });
    const amount = payload.amount ?? hold.amount;
    assertPositiveInteger(amount, 'amount');
    if (amount > hold.amount) throw Object.assign(new Error('Release amount exceeds escrow hold'), { status: 400 });
    const transactionId = id('txn_release');
    this.applyLedgerEntry(transactionId, this.escrowWallet.id, 'debit', 'debit', amount, hold.currency, 'Escrow release debit', { escrowId: hold.id });
    this.applyLedgerEntry(transactionId, hold.walletId, 'credit', 'credit', amount, hold.currency, 'Escrow release to vendor wallet', { escrowId: hold.id });
    hold.amount -= amount;
    hold.status = hold.amount === 0 ? 'released' : 'held';
    hold.releasedAt = now();
    hold.updatedAt = now();
    this.addTimeline(hold.paymentId, 'wallet_updated', `Escrow released ${amount} ${hold.currency}`, { escrowId: hold.id });
    return hold;
  }

  refundEscrow(payload: { escrowId?: string; paymentId?: string; amount?: number; reason?: string }) {
    const hold = payload.escrowId ? this.escrowHolds.get(payload.escrowId) : Array.from(this.escrowHolds.values()).find((item) => item.paymentId === payload.paymentId && item.status === 'held');
    if (!hold) throw Object.assign(new Error('Escrow hold not found'), { status: 404 });
    const amount = payload.amount ?? hold.amount;
    assertPositiveInteger(amount, 'amount');
    if (amount > hold.amount) throw Object.assign(new Error('Refund amount exceeds escrow hold'), { status: 400 });
    this.applyLedgerEntry(id('txn_refund'), this.escrowWallet.id, 'refund', 'debit', amount, hold.currency, 'Escrow refund to buyer', { escrowId: hold.id, reason: payload.reason });
    hold.amount -= amount;
    hold.status = hold.amount === 0 ? 'refunded' : 'held';
    hold.refundedAt = now();
    hold.updatedAt = now();
    this.addTimeline(hold.paymentId, 'refund_processed', `Escrow refunded ${amount} ${hold.currency}`, { escrowId: hold.id, reason: payload.reason });
    return hold;
  }

  createPayout(payload: PayoutPayload) {
    assertPositiveInteger(payload.amount, 'amount');
    const vendor = payload.vendorId ? this.vendors.get(payload.vendorId) : undefined;
    const walletId = payload.walletId ?? vendor?.wallet;
    if (!walletId) throw Object.assign(new Error('walletId or vendorId is required'), { status: 400 });
    const wallet = this.wallets.get(walletId);
    if (!wallet) throw Object.assign(new Error('Wallet not found'), { status: 404 });
    if (wallet.availableBalance < payload.amount) throw Object.assign(new Error('Insufficient available balance for payout'), { status: 400 });
    const transactionId = id('txn_payout');
    this.applyLedgerEntry(transactionId, wallet.id, 'payout', 'debit', payload.amount, payload.currency ?? wallet.currency, 'Payout debit from vendor wallet');
    const payout: MarketplacePayout = { id: id('po'), vendorId: vendor?.id ?? payload.vendorId, walletId: wallet.id, amount: payload.amount, currency: payload.currency ?? wallet.currency, method: payload.method ?? 'mobile_money', destination: payload.destination ?? vendor?.payoutMethods.find((method) => method.default)?.destination ?? 'sandbox_destination', status: 'completed', schedule: payload.schedule ?? 'manual', threshold: payload.threshold, createdAt: now(), updatedAt: now(), completedAt: now() };
    this.payouts.set(payout.id, payout);
    this.addTimeline(undefined, 'payout_created', `Payout ${payout.id} created`, { payoutId: payout.id, walletId: wallet.id });
    this.addTimeline(undefined, 'payout_completed', `Payout ${payout.id} completed`, { payoutId: payout.id });
    return payout;
  }

  listLedger() {
    return { accounts: Array.from(this.ledgerAccounts.values()), entries: Array.from(this.ledgerEntries.values()), balanceSnapshots: Array.from(this.balanceSnapshots.values()) };
  }

  analytics() {
    const splits = Array.from(this.splitPayments.values());
    const payouts = Array.from(this.payouts.values());
    return {
      totalVolume: splits.reduce((sum, item) => sum + item.amount, 0),
      generatedCommissions: this.platformWallet.availableBalance,
      payoutsCompleted: payouts.filter((item) => item.status === 'completed').reduce((sum, item) => sum + item.amount, 0),
      vendorBalances: Array.from(this.vendors.values()).map((vendor) => ({ vendorId: vendor.id, businessName: vendor.businessName, wallet: this.wallets.get(vendor.wallet) })),
      escrowBalance: this.escrowWallet.balance,
      platformRevenue: this.platformWallet.balance + this.diapayFeeWallet.balance,
      currencies: ['XOF', 'USD', 'EUR', 'USDT'],
      fxReady: true,
    };
  }

  private applyLedgerEntry(transactionId: string, walletId: string, type: LedgerEntry['type'], direction: LedgerEntry['direction'], amount: number, currency: Currency, description: string, metadata?: Record<string, unknown>) {
    const wallet = this.wallets.get(walletId);
    if (!wallet) throw Object.assign(new Error(`Wallet ${walletId} not found`), { status: 404 });
    const entry: LedgerEntry = { id: id('le'), transactionId, accountId: wallet.ledgerAccountId, walletId, type, direction, amount, currency, description, metadata, createdAt: now() };
    this.ledgerEntries.set(entry.id, entry);
    wallet.ledgerEntries.push(entry.id);
    if (direction === 'credit') {
      wallet.balance += amount;
      if (type === 'reserve') wallet.pendingBalance += amount; else wallet.availableBalance += amount;
    } else {
      wallet.balance -= amount;
      wallet.availableBalance = Math.max(0, wallet.availableBalance - amount);
      wallet.pendingBalance = type === 'refund' || type === 'debit' ? Math.max(0, wallet.pendingBalance - amount) : wallet.pendingBalance;
    }
    wallet.updatedAt = now();
    this.balanceSnapshots.set(id('bs'), { id: id('bs'), walletId, balance: wallet.balance, availableBalance: wallet.availableBalance, pendingBalance: wallet.pendingBalance, currency: wallet.currency, ledgerEntryId: entry.id, createdAt: now() });
    return entry;
  }

  private addTimeline(paymentId: string | undefined, type: TimelineEvent['type'], message: string, metadata?: Record<string, unknown>) {
    const event: TimelineEvent = { id: id('evt'), paymentId, type, message, metadata, createdAt: now() };
    this.timeline.set(event.id, event);
    return event;
  }
}

export const marketplaceService = new MarketplaceService();
