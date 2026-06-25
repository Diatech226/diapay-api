import crypto from 'crypto';

export type MerchantRole = 'owner' | 'admin' | 'developer' | 'finance' | 'support' | 'viewer';
export type Environment = 'test' | 'live';

type Status = 'active' | 'pending' | 'disabled' | 'revoked';
export interface Merchant { id: string; name: string; businessName: string; country: string; currency: string; status: Status; ownerId: string; createdAt: string }
export interface MerchantAdmin { id: string; merchantId: string; name: string; email: string; role: MerchantRole; status: Status; lastLoginAt?: string }
export interface Application { id: string; merchantId: string; name: string; environment: Environment; allowedOrigins: string[]; successUrl: string; cancelUrl: string; webhookUrl?: string; status: Status }
export interface ApiKey { id: string; merchantId: string; name: string; prefix: string; environment: Environment; scopes: string[]; keyHash: string; status: Status; lastUsedAt?: string; createdAt: string; rotatedAt?: string }

const merchants = new Map<string, Merchant>();
const admins = new Map<string, MerchantAdmin>();
const applications = new Map<string, Application>();
const apiKeys = new Map<string, ApiKey>();
const logs: Array<{ id: string; merchantId: string; level: string; message: string; createdAt: string; metadata?: Record<string, unknown> }> = [];
function now() { return new Date().toISOString(); }
function id(prefix: string) { return `${prefix}_${crypto.randomBytes(10).toString('hex')}`; }
function hash(value: string) { return crypto.createHash('sha256').update(value).digest('hex'); }
function sanitize(key: ApiKey) { const { keyHash, ...safe } = key; return safe; }
export function seedMerchant() {
  if (merchants.size) return Array.from(merchants.values())[0];
  const merchant = createMerchant({ name: 'Diapay Demo', businessName: 'Diapay Sandbox Merchant', country: 'BF', currency: 'XOF', ownerId: 'user_owner_demo' });
  createMerchantAdmin({ merchantId: merchant.id, name: 'Owner Demo', email: 'owner@diapay.test', role: 'owner' });
  createApplication({ merchantId: merchant.id, name: 'Diamarket Sandbox', environment: 'test', allowedOrigins: ['http://localhost:3000'], successUrl: 'https://example.com/success', cancelUrl: 'https://example.com/cancel', webhookUrl: 'https://example.com/webhook' });
  return merchant;
}
export function createMerchant(payload: Partial<Merchant>) {
  const created: Merchant = { id: id('mrc'), name: payload.name ?? String(payload.businessName ?? 'Merchant'), businessName: payload.businessName ?? payload.name ?? 'Merchant', country: payload.country ?? 'BF', currency: (payload.currency ?? 'XOF').toUpperCase(), status: 'active', ownerId: payload.ownerId ?? 'user_demo', createdAt: now() };
  merchants.set(created.id, created); logs.push({ id: id('log'), merchantId: created.id, level: 'info', message: 'merchant.created', createdAt: now() }); return created;
}
export function createMerchantAdmin(payload: Partial<MerchantAdmin>) {
  const merchant = payload.merchantId ? merchants.get(payload.merchantId) : seedMerchant(); if (!merchant) throw Object.assign(new Error('merchant not found'), { status: 404 });
  const admin: MerchantAdmin = { id: id('adm'), merchantId: merchant.id, name: payload.name ?? 'Merchant Admin', email: payload.email ?? 'admin@diapay.test', role: payload.role ?? 'admin', status: 'active', lastLoginAt: payload.lastLoginAt };
  admins.set(admin.id, admin); return admin;
}
export function createApplication(payload: Partial<Application>) {
  const merchant = payload.merchantId ? merchants.get(payload.merchantId) : seedMerchant(); if (!merchant) throw Object.assign(new Error('merchant not found'), { status: 404 });
  const app: Application = { id: id('app'), merchantId: merchant.id, name: payload.name ?? 'Sandbox app', environment: payload.environment ?? 'test', allowedOrigins: payload.allowedOrigins ?? [], successUrl: payload.successUrl ?? 'https://example.com/success', cancelUrl: payload.cancelUrl ?? 'https://example.com/cancel', webhookUrl: payload.webhookUrl, status: 'active' };
  applications.set(app.id, app); return app;
}
export function createApiKey(payload: Partial<ApiKey> & { type?: 'public' | 'secret' }) {
  const merchant = payload.merchantId ? merchants.get(payload.merchantId) : seedMerchant(); if (!merchant) throw Object.assign(new Error('merchant not found'), { status: 404 }); const environment = payload.environment ?? 'test'; const type = payload.type ?? 'secret';
  const secret = `${type === 'public' ? 'pk' : 'sk'}_${environment}_${crypto.randomBytes(24).toString('hex')}`;
  const key: ApiKey = { id: id('key'), merchantId: merchant.id, name: payload.name ?? `${environment} ${type} key`, prefix: secret.slice(0, 16), environment, scopes: payload.scopes ?? ['checkout:write', 'payments:read', 'webhooks:write'], keyHash: hash(secret), status: 'active', createdAt: now() };
  apiKeys.set(key.id, key); return { ...sanitize(key), secret };
}
export function listApiKeys() { seedMerchant(); return Array.from(apiKeys.values()).map(sanitize); }
export function revokeApiKey(id: string) { const key = apiKeys.get(id); if (!key) throw Object.assign(new Error('api key not found'), { status: 404 }); key.status = 'revoked'; return sanitize(key); }
export function rotateApiKey(idValue: string) { const old = apiKeys.get(idValue); if (!old) throw Object.assign(new Error('api key not found'), { status: 404 }); old.status = 'revoked'; old.rotatedAt = now(); return createApiKey({ merchantId: old.merchantId, name: old.name, environment: old.environment, scopes: old.scopes, type: old.prefix.startsWith('pk_') ? 'public' : 'secret' }); }
export const developerState = { merchants, admins, applications, apiKeys, logs };
seedMerchant();
