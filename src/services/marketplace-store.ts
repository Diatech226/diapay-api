import crypto from 'crypto';
import type {
  BalanceSnapshot,
  CommissionRule,
  EscrowHold,
  LedgerAccount,
  LedgerEntry,
  MarketplaceCurrency,
  MarketplacePayment,
  MarketplacePayout,
  MarketplaceWallet,
  PayoutMethod,
  PayoutMethodType,
  SplitAllocation,
  SplitRule,
  VendorAccount,
  WalletType,
} from '../models/Marketplace';

const allowedCurrencies = new Set<MarketplaceCurrency>(['FCFA', 'XOF', 'USD', 'EUR', 'USDT']);
const wallets = new Map<string, MarketplaceWallet>();
const ledgerAccounts = new Map<string, LedgerAccount>();
const ledgerEntries: LedgerEntry[] = [];
const balanceSnapshots: BalanceSnapshot[] = [];
const vendors = new Map<string, VendorAccount>();
const marketplacePayments = new Map<string, MarketplacePayment>();
const escrows = new Map<string, EscrowHold>();
const payouts = new Map<string, MarketplacePayout>();

const platformOwner = { id: 'platform_diapay', type: 'platform' as const, name: 'Diapay Platform' };
const reserveOwner = { id: 'reserve_diapay', type: 'reserve' as const, name: 'Diapay Reserve' };
const escrowOwner = { id: 'escrow_diapay', type: 'escrow' as const, name: 'Diapay Escrow' };

function now() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${crypto.randomBytes(10).toString('hex')}`;
}

function assertAmount(amount: unknown, field = 'amount') {
  if (!Number.isInteger(amount) || Number(amount) <= 0) {
    throw Object.assign(new Error(`${field} must be a positive integer in the smallest currency unit`), { status: 400 });
  }
}

function normalizeCurrency(value: unknown): MarketplaceCurrency {
  const currency = String(value ?? 'FCFA').toUpperCase() as MarketplaceCurrency;
  if (!allowedCurrencies.has(currency)) {
    throw Object.assign(new Error(`currency must be one of ${Array.from(allowedCurrencies).join(', ')}`), { status: 400 });
  }
  return currency;
}

function createWallet(type: WalletType, owner: MarketplaceWallet['owner'], currency: MarketplaceCurrency): MarketplaceWallet {
  const timestamp = now();
  const wallet: MarketplaceWallet = {
    id: id(type.replace('_wallet', 'w')),
    type,
    owner,
    balance: 0,
    availableBalance: 0,
    pendingBalance: 0,
    currency,
    status: 'active',
    ledgerEntries: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ledgerAccountId: '',
  };
  wallets.set(wallet.id, wallet);
  const ledgerAccountId = id('la');
  wallet.ledgerAccountId = ledgerAccountId;
  ledgerAccounts.set(wallet.id, {
    id: ledgerAccountId,
    walletId: wallet.id,
    ownerId: owner.id,
    ownerType: owner.type,
    type: type === 'platform_wallet' ? 'revenue' : type === 'escrow_wallet' ? 'escrow' : type === 'reserve_wallet' ? 'reserve' : 'liability',
    currency,
    status: 'active',
    createdAt: timestamp,
  });
  return wallet;
}

function ensureSystemWallet(type: 'platform_wallet' | 'reserve_wallet' | 'escrow_wallet', currency: MarketplaceCurrency) {
  const owner = type === 'platform_wallet' ? platformOwner : type === 'reserve_wallet' ? reserveOwner : escrowOwner;
  const existing = Array.from(wallets.values()).find((wallet) => wallet.type === type && wallet.currency === currency && wallet.owner.id === owner.id);
  return existing ?? createWallet(type, owner, currency);
}

function getWallet(walletId: string) {
  const wallet = wallets.get(walletId);
  if (!wallet) throw Object.assign(new Error('wallet not found'), { status: 404 });
  return wallet;
}

function applyWalletMovement(walletId: string, amount: number, movement: 'available_credit' | 'available_debit' | 'pending_credit' | 'pending_debit' | 'pending_to_available') {
  const wallet = getWallet(walletId);
  if (movement === 'available_credit') wallet.availableBalance += amount;
  if (movement === 'available_debit') wallet.availableBalance -= amount;
  if (movement === 'pending_credit') wallet.pendingBalance += amount;
  if (movement === 'pending_debit') wallet.pendingBalance -= amount;
  if (movement === 'pending_to_available') {
    wallet.pendingBalance -= amount;
    wallet.availableBalance += amount;
  }
  wallet.balance = wallet.availableBalance + wallet.pendingBalance;
  wallet.updatedAt = now();
  if (wallet.availableBalance < 0 || wallet.pendingBalance < 0 || wallet.balance < 0) {
    throw Object.assign(new Error(`wallet ${wallet.id} has insufficient funds`), { status: 409 });
  }
  return wallet;
}

function recordEntry(entry: Omit<LedgerEntry, 'id' | 'createdAt'>) {
  const created: LedgerEntry = { id: id('le'), createdAt: now(), ...entry };
  ledgerEntries.push(created);
  const wallet = getWallet(created.walletId!);
  wallet.ledgerEntries.push(created.id);
  balanceSnapshots.push({
    id: id('bs'),
    walletId: wallet.id,
    currency: wallet.currency,
    balance: wallet.balance,
    availableBalance: wallet.availableBalance,
    pendingBalance: wallet.pendingBalance,
    ledgerEntryId: created.id,
    createdAt: created.createdAt,
  });
  return created;
}

function postDoubleEntry(params: {
  transactionId: string;
  debitWalletId: string;
  creditWalletId: string;
  amount: number;
  currency: MarketplaceCurrency;
  type: LedgerEntry['type'];
  description: string;
  metadata?: Record<string, unknown>;
}) {
  assertAmount(params.amount);
  const debitWallet = getWallet(params.debitWalletId);
  const creditWallet = getWallet(params.creditWalletId);
  if (debitWallet.currency !== params.currency || creditWallet.currency !== params.currency) {
    throw Object.assign(new Error('ledger currency mismatch'), { status: 409 });
  }
  return [
    recordEntry({ transactionId: params.transactionId, accountId: ledgerAccounts.get(debitWallet.id)!.id, walletId: debitWallet.id, type: params.type, direction: 'debit', amount: params.amount, currency: params.currency, description: params.description, metadata: params.metadata }),
    recordEntry({ transactionId: params.transactionId, accountId: ledgerAccounts.get(creditWallet.id)!.id, walletId: creditWallet.id, type: params.type, direction: 'credit', amount: params.amount, currency: params.currency, description: params.description, metadata: params.metadata }),
  ];
}

function createTimeline(type: string, data?: Record<string, unknown>) {
  return { type, at: now(), data };
}

function resolveCommission(amount: number, payload: Record<string, unknown>, vendor?: VendorAccount) {
  const commission = typeof payload.commission === 'object' && payload.commission !== null ? payload.commission as Record<string, unknown> : {};
  const vendorRule = vendor?.commissions.filter((rule) => rule.active).sort((a, b) => a.priority - b.priority)[0];
  const fixed = Number(commission.fixedAmount ?? vendorRule?.fixedAmount ?? 0);
  const pct = Number(commission.percentage ?? vendorRule?.percentage ?? 10);
  return Math.max(0, Math.round(fixed + amount * (pct / 100)));
}

function computeVendorSplits(amount: number, currency: MarketplaceCurrency, splitRules: SplitRule[]) {
  const sorted = [...splitRules].sort((a, b) => a.priority - b.priority);
  let allocated = 0;
  const allocations: Array<{ rule: SplitRule; amount: number }> = [];
  for (const rule of sorted.filter((item) => item.type !== 'fallback')) {
    const ruleAmount = rule.type === 'fixed' ? Number(rule.amount ?? 0) : Math.round(amount * (Number(rule.percentage ?? 0) / 100));
    if (ruleAmount <= 0) continue;
    allocations.push({ rule, amount: Math.min(ruleAmount, amount - allocated) });
    allocated += ruleAmount;
    if (allocated >= amount) break;
  }
  const fallback = sorted.find((item) => item.type === 'fallback');
  if (fallback && allocated < amount) allocations.push({ rule: fallback, amount: amount - allocated });
  const total = allocations.reduce((sum, item) => sum + item.amount, 0);
  if (total > amount) throw Object.assign(new Error(`split rules exceed ${amount} ${currency}`), { status: 400 });
  return allocations;
}

export function createVendorAccount(payload: Record<string, unknown>) {
  if (typeof payload.businessName !== 'string' || !payload.businessName.trim()) {
    throw Object.assign(new Error('businessName is required'), { status: 400 });
  }
  const currencies = Array.isArray(payload.currencies) && payload.currencies.length > 0
    ? payload.currencies.map(normalizeCurrency)
    : [normalizeCurrency(payload.currency)];
  const timestamp = now();
  const vendorId = id('vendor');
  const wallet = createWallet('vendor_wallet', { id: vendorId, type: 'vendor', name: payload.businessName }, currencies[0]);
  const payoutMethods = Array.isArray(payload.payoutMethods) ? payload.payoutMethods.map((method, index) => {
    const value = method as Record<string, unknown>;
    return {
      id: typeof value.id === 'string' ? value.id : id('pmethod'),
      type: (value.type as PayoutMethodType) ?? 'mobile_money',
      label: String(value.label ?? `Payout method ${index + 1}`),
      country: typeof value.country === 'string' ? value.country : typeof payload.country === 'string' ? payload.country : undefined,
      currency: normalizeCurrency(value.currency ?? currencies[0]),
      details: typeof value.details === 'object' && value.details !== null ? value.details as Record<string, unknown> : {},
      active: value.active !== false,
    } satisfies PayoutMethod;
  }) : [];
  const vendor: VendorAccount = {
    id: vendorId,
    businessName: payload.businessName,
    country: typeof payload.country === 'string' ? payload.country : 'CI',
    currencies,
    payoutMethods,
    wallet: wallet.id,
    kycStatus: 'pending',
    commissions: Array.isArray(payload.commissions) ? payload.commissions.map((rule, index) => ({ ...(rule as Partial<CommissionRule>), id: (rule as Partial<CommissionRule>).id ?? id('comm'), name: (rule as Partial<CommissionRule>).name ?? `Commission ${index + 1}`, priority: (rule as Partial<CommissionRule>).priority ?? index + 1, active: (rule as Partial<CommissionRule>).active ?? true } as CommissionRule)) : [{ id: id('comm'), name: 'Default marketplace commission', percentage: 10, priority: 100, active: true }],
    capabilities: Array.isArray(payload.capabilities) ? payload.capabilities as VendorAccount['capabilities'] : ['payments', 'payouts', 'refunds', 'escrow'],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  vendors.set(vendor.id, vendor);
  return vendor;
}

export function getVendorWallet(vendorId: string) {
  const vendor = vendors.get(vendorId);
  if (!vendor) throw Object.assign(new Error('vendor not found'), { status: 404 });
  return getWallet(vendor.wallet);
}

function ensureDemoVendor(currency: MarketplaceCurrency) {
  const existing = Array.from(vendors.values()).find((vendor) => vendor.currencies.includes(currency));
  if (existing) return existing;
  return createVendorAccount({ businessName: 'Demo Marketplace Vendor', country: 'CI', currencies: [currency], payoutMethods: [{ type: 'mobile_money', label: 'Wave CI', currency, details: { phone: '+2250700000000' } }] });
}

export async function createSplitPayment(payload: Record<string, unknown>, merchant: string) {
  assertAmount(payload.amount);
  const currency = normalizeCurrency(payload.currency);
  const amount = Number(payload.amount);
  const timestamp = now();
  const platformWallet = ensureSystemWallet('platform_wallet', currency);
  const reserveWallet = ensureSystemWallet('reserve_wallet', currency);
  const escrowWallet = ensureSystemWallet('escrow_wallet', currency);
  const merchantWallet = createWallet('merchant_wallet', { id: merchant, type: 'merchant', name: merchant }, currency);

  applyWalletMovement(merchantWallet.id, amount, 'available_credit');
  postDoubleEntry({ transactionId: id('txn_payment'), debitWalletId: platformWallet.id, creditWalletId: merchantWallet.id, amount, currency, type: 'credit', description: 'Marketplace payment captured', metadata: { merchant } });

  const requestedRules = Array.isArray(payload.splits) ? payload.splits as SplitRule[] : [];
  const defaultSplitRules: SplitRule[] = [{ id: 'default_vendor_split', type: 'percentage', percentage: 85, priority: 1, vendorId: ensureDemoVendor(currency).id }, { id: 'fallback_platform_split', type: 'fallback', priority: 99 }];
  const splitRules: SplitRule[] = requestedRules.length > 0 ? requestedRules : defaultSplitRules;
  const vendorSplits = computeVendorSplits(amount, currency, splitRules);
  const allocations: SplitAllocation[] = [];
  const escrowMode = payload.escrow !== false;

  for (const item of vendorSplits) {
    const vendor = item.rule.vendorId ? vendors.get(item.rule.vendorId) : ensureDemoVendor(currency);
    if (!vendor) throw Object.assign(new Error(`vendor ${item.rule.vendorId} not found`), { status: 404 });
    const vendorWallet = getWallet(vendor.wallet);
    const commission = Math.min(resolveCommission(item.amount, payload, vendor), item.amount);
    const diapayFee = Math.min(Math.round(item.amount * 0.05), item.amount - commission);
    const reserve = Math.max(0, Math.round(item.amount * Number(payload.reserveRate ?? 0) / 100));
    const vendorNet = item.amount - commission - diapayFee - reserve;

    for (const [destinationType, wallet, allocationAmount, ledgerType] of [
      ['vendor', vendorWallet, vendorNet, escrowMode ? 'reserve' : 'credit'],
      ['platform', platformWallet, commission, 'fee'],
      ['diapay_fee', platformWallet, diapayFee, 'fee'],
      ['reserve', reserveWallet, reserve, 'reserve'],
    ] as const) {
      if (allocationAmount <= 0) continue;
      applyWalletMovement(merchantWallet.id, allocationAmount, 'available_debit');
      applyWalletMovement(wallet.id, allocationAmount, destinationType === 'vendor' && escrowMode ? 'pending_credit' : 'available_credit');
      postDoubleEntry({ transactionId: id('txn_split'), debitWalletId: merchantWallet.id, creditWalletId: wallet.id, amount: allocationAmount, currency, type: ledgerType, description: `${destinationType} allocation`, metadata: { ruleId: item.rule.id, vendorId: vendor.id } });
      allocations.push({ id: id('alloc'), destinationType, vendorId: destinationType === 'vendor' ? vendor.id : undefined, walletId: wallet.id, amount: allocationAmount, currency, status: destinationType === 'vendor' && escrowMode ? 'held' : 'available', ruleId: item.rule.id });
    }
  }

  const escrowAllocations = allocations.filter((allocation) => allocation.status === 'held');
  const escrow = escrowAllocations.length > 0 ? (() => {
    const heldAmount = escrowAllocations.reduce((sum, allocation) => sum + allocation.amount, 0);
    applyWalletMovement(escrowWallet.id, heldAmount, 'pending_credit');
    postDoubleEntry({ transactionId: id('txn_escrow'), debitWalletId: platformWallet.id, creditWalletId: escrowWallet.id, amount: heldAmount, currency, type: 'reserve', description: 'Escrow hold mirror entry', metadata: { allocations: escrowAllocations.map((allocation) => allocation.id) } });
    const hold: EscrowHold = { id: id('esc'), marketplacePaymentId: '', walletId: escrowWallet.id, amount: heldAmount, releasedAmount: 0, refundedAmount: 0, currency, status: 'held', releaseMode: payload.autoRelease === true ? 'auto' : 'manual', autoReleaseAt: typeof payload.autoReleaseAt === 'string' ? payload.autoReleaseAt : undefined, allocations: escrowAllocations.map((allocation) => allocation.id), createdAt: timestamp, updatedAt: timestamp };
    escrows.set(hold.id, hold);
    return hold;
  })() : undefined;

  const marketplacePayment: MarketplacePayment = {
    id: id('mpay'),
    paymentId: id('pay_marketplace'),
    merchant,
    amount,
    currency,
    splitRules,
    allocations,
    escrowId: escrow?.id,
    timeline: [
      createTimeline('payment_created', { amount, currency }),
      createTimeline('payment_authorized'),
      createTimeline('payment_captured'),
      createTimeline('split_processed', { allocations: allocations.length }),
      createTimeline('wallet_updated'),
      ...(escrow ? [createTimeline('escrow_held', { escrowId: escrow.id })] : []),
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  if (escrow) escrow.marketplacePaymentId = marketplacePayment.id;
  marketplacePayments.set(marketplacePayment.id, marketplacePayment);
  return marketplacePayment;
}

export function releaseEscrow(payload: Record<string, unknown>) {
  const escrowId = String(payload.escrowId ?? '');
  const escrow = escrows.get(escrowId);
  if (!escrow) throw Object.assign(new Error('escrow not found'), { status: 404 });
  const amount = Number(payload.amount ?? (escrow.amount - (escrow.releasedAmount ?? 0) - (escrow.refundedAmount ?? 0)));
  assertAmount(amount);
  if (amount > escrow.amount - (escrow.releasedAmount ?? 0) - (escrow.refundedAmount ?? 0)) throw Object.assign(new Error('release amount exceeds escrow remainder'), { status: 409 });
  const payment = marketplacePayments.get(escrow.marketplacePaymentId!);
  const heldAllocations = payment?.allocations.filter((allocation) => (escrow.allocations ?? []).includes(allocation.id) && allocation.status === 'held') ?? [];
  let remaining = amount;
  for (const allocation of heldAllocations) {
    const release = Math.min(allocation.amount, remaining);
    if (release <= 0) continue;
    applyWalletMovement(allocation.walletId, release, 'pending_to_available');
    applyWalletMovement(escrow.walletId, release, 'pending_debit');
    postDoubleEntry({ transactionId: id('txn_release'), debitWalletId: escrow.walletId, creditWalletId: allocation.walletId, amount: release, currency: escrow.currency, type: 'credit', description: 'Escrow release to vendor', metadata: { escrowId, allocationId: allocation.id } });
    allocation.status = release === allocation.amount ? 'available' : 'held';
    remaining -= release;
  }
  escrow.releasedAmount = (escrow.releasedAmount ?? 0) + amount;
  escrow.status = (escrow.releasedAmount ?? 0) + (escrow.refundedAmount ?? 0) >= escrow.amount ? 'released' : 'held';
  escrow.updatedAt = now();
  payment?.timeline.push(createTimeline('wallet_updated'), createTimeline('escrow_released', { escrowId, amount }));
  if (payment) payment.updatedAt = now();
  return escrow;
}

export function refundEscrow(payload: Record<string, unknown>) {
  const escrowId = String(payload.escrowId ?? '');
  const escrow = escrows.get(escrowId);
  if (!escrow) throw Object.assign(new Error('escrow not found'), { status: 404 });
  const amount = Number(payload.amount ?? (escrow.amount - (escrow.releasedAmount ?? 0) - (escrow.refundedAmount ?? 0)));
  assertAmount(amount);
  applyWalletMovement(escrow.walletId, amount, 'pending_debit');
  escrow.refundedAmount = (escrow.refundedAmount ?? 0) + amount;
  escrow.status = (escrow.releasedAmount ?? 0) + (escrow.refundedAmount ?? 0) >= escrow.amount ? 'refunded' : 'held';
  escrow.updatedAt = now();
  const payment = marketplacePayments.get(escrow.marketplacePaymentId!);
  payment?.timeline.push(createTimeline('refund_processed', { escrowId, amount }));
  postDoubleEntry({ transactionId: id('txn_refund'), debitWalletId: escrow.walletId, creditWalletId: ensureSystemWallet('reserve_wallet', escrow.currency).id, amount, currency: escrow.currency, type: 'refund', description: 'Escrow refund reserved for customer return', metadata: { escrowId } });
  return escrow;
}

export function createMarketplacePayout(payload: Record<string, unknown>) {
  const vendorId = String(payload.vendorId ?? '');
  const vendor = vendors.get(vendorId);
  if (!vendor) throw Object.assign(new Error('vendor not found'), { status: 404 });
  const wallet = getWallet(vendor.wallet);
  const amount = Number(payload.amount ?? wallet.availableBalance);
  assertAmount(amount);
  const threshold = Number(payload.minimumThreshold ?? 0);
  if (threshold > 0 && wallet.availableBalance < threshold) throw Object.assign(new Error('wallet balance is below minimum payout threshold'), { status: 409 });
  applyWalletMovement(wallet.id, amount, 'available_debit');
  const reserveWallet = ensureSystemWallet('reserve_wallet', wallet.currency);
  applyWalletMovement(reserveWallet.id, amount, 'available_credit');
  postDoubleEntry({ transactionId: id('txn_payout'), debitWalletId: wallet.id, creditWalletId: reserveWallet.id, amount, currency: wallet.currency, type: 'payout', description: 'Vendor payout created', metadata: { vendorId } });
  const payout: MarketplacePayout = {
    id: id('po_market'),
    vendorId,
    walletId: wallet.id,
    amount,
    currency: wallet.currency,
    method: (payload.method as PayoutMethodType) ?? vendor.payoutMethods[0]?.type ?? 'mobile_money',
    status: payload.scheduledFor ? 'pending' : 'processing',
    scheduledFor: typeof payload.scheduledFor === 'string' ? payload.scheduledFor : undefined,
    minimumThreshold: threshold || undefined,
    destination: typeof payload.destination === 'string' ? payload.destination : JSON.stringify(payload.destination ?? vendor.payoutMethods[0]?.details ?? {}),
    createdAt: now(),
    updatedAt: now(),
  };
  payouts.set(payout.id, payout);
  const payment = Array.from(marketplacePayments.values()).find((item) => item.allocations.some((allocation) => allocation.vendorId === vendorId));
  payment?.timeline.push(createTimeline('payout_created', { payoutId: payout.id }), createTimeline('payout_completed', { simulated: true }));
  payout.status = 'completed';
  payout.updatedAt = now();
  return payout;
}

export function listMarketplaceLedger() {
  const ledgerByTransaction = ledgerEntries.reduce<Record<string, { debit: number; credit: number }>>((acc, entry) => {
    acc[entry.transactionId] ??= { debit: 0, credit: 0 };
    acc[entry.transactionId][entry.direction] += entry.amount;
    return acc;
  }, {});
  return { ledgerAccounts: Array.from(ledgerAccounts.values()), ledgerEntries, balanceSnapshots, integrity: Object.entries(ledgerByTransaction).map(([transactionId, totals]) => ({ transactionId, ...totals, balanced: totals.debit === totals.credit })) };
}

export function listMarketplaceState() {
  const walletList = Array.from(wallets.values());
  return {
    wallets: walletList,
    vendors: Array.from(vendors.values()),
    escrows: Array.from(escrows.values()),
    payouts: Array.from(payouts.values()),
    marketplacePayments: Array.from(marketplacePayments.values()),
    analytics: {
      totalVolume: Array.from(marketplacePayments.values()).reduce((sum, payment) => sum + payment.amount, 0),
      commissionsGenerated: ledgerEntries.filter((entry) => entry.type === 'fee' && entry.direction === 'credit').reduce((sum, entry) => sum + entry.amount, 0),
      payoutsCompleted: Array.from(payouts.values()).filter((payout) => payout.status === 'completed').reduce((sum, payout) => sum + payout.amount, 0),
      vendorBalances: walletList.filter((wallet) => wallet.type === 'vendor_wallet').reduce((sum, wallet) => sum + wallet.balance, 0),
      escrowBalances: walletList.filter((wallet) => wallet.type === 'escrow_wallet').reduce((sum, wallet) => sum + wallet.balance, 0),
      platformRevenue: walletList.filter((wallet) => wallet.type === 'platform_wallet').reduce((sum, wallet) => sum + wallet.availableBalance, 0),
    },
  };
}

ensureSystemWallet('platform_wallet', 'FCFA');
ensureSystemWallet('reserve_wallet', 'FCFA');
ensureSystemWallet('escrow_wallet', 'FCFA');
ensureDemoVendor('FCFA');

export const marketplaceState = { wallets, ledgerAccounts, ledgerEntries, balanceSnapshots, vendors, marketplacePayments, escrows, payouts };
