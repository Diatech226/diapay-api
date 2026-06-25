import crypto from 'crypto';
import type { CheckoutSession, CheckoutSessionStatus } from '../models/CheckoutSession';
import type { Payment, PaymentMethod } from '../models/Payment';
import type { WebhookEndpoint } from '../models/WebhookEndpoint';
import type { WebhookDeliveryAttempt, WebhookEvent, WebhookEventType } from '../models/WebhookEvent';
import { getProvider, listPaymentMethods, listProviders } from '../providers';

const sessions = new Map<string, CheckoutSession>();
const payments = new Map<string, Payment>();
const idempotency = new Map<string, string>();
const webhookEndpoints = new Map<string, WebhookEndpoint>();
const webhookEvents: WebhookEvent[] = [];
const allowedCurrencies = new Set(['XOF', 'USD', 'EUR', 'GHS', 'NGN', 'USDC']);

const defaultMerchant = 'Diapay Sandbox Merchant';

function now() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

function apiBaseUrl() {
  return process.env.DIAPAY_API_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 5100}`;
}

function checkoutBaseUrl() {
  return process.env.DIAPAY_CHECKOUT_URL ?? 'http://localhost:3102';
}

function resolveMerchant(auth?: string) {
  if (!auth?.startsWith('Bearer ')) return defaultMerchant;
  const token = auth.slice('Bearer '.length);
  if (token.startsWith('sk_')) return token.replace(/^sk_(test|live)_/, 'merchant_').slice(0, 48);
  return defaultMerchant;
}

function validateAmountCurrency(amount: unknown, currency: unknown) {
  if (!Number.isInteger(amount) || Number(amount) <= 0) {
    throw Object.assign(new Error('amount must be a positive integer in the smallest currency unit'), { status: 400 });
  }
  if (typeof currency !== 'string' || !allowedCurrencies.has(currency.toUpperCase())) {
    throw Object.assign(new Error(`currency must be one of ${Array.from(allowedCurrencies).join(', ')}`), { status: 400 });
  }
}

function ensureOpen(session: CheckoutSession) {
  refreshExpiry(session);
  if (session.status !== 'created' && session.status !== 'open') {
    throw Object.assign(new Error(`checkout session is ${session.status}`), { status: 409 });
  }
}

function refreshExpiry(session: CheckoutSession) {
  if ((session.status === 'created' || session.status === 'open') && new Date(session.expiresAt).getTime() <= Date.now()) {
    session.status = 'expired';
    session.updatedAt = now();
    void emitWebhook('payment.expired', session.merchant, { checkoutSession: session, payment: session.payment ? payments.get(session.payment) : undefined });
  }
  return session;
}

export function listCheckoutSessions(merchant?: string) {
  return Array.from(sessions.values()).map(refreshExpiry).filter((session) => !merchant || session.merchant === merchant);
}

export function getCheckoutSession(sessionId: string, merchant?: string) {
  const session = sessions.get(sessionId);
  if (!session) throw Object.assign(new Error('checkout session not found'), { status: 404 });
  if (merchant && session.merchant !== merchant) throw Object.assign(new Error('checkout session does not belong to merchant'), { status: 403 });
  return refreshExpiry(session);
}

export function createCheckoutSession(payload: Record<string, unknown>, headers: Record<string, string | undefined>) {
  const key = headers['idempotency-key'];
  if (key && idempotency.has(key)) return getCheckoutSession(idempotency.get(key)!);

  validateAmountCurrency(payload.amount, payload.currency);
  if (typeof payload.successUrl !== 'string' || typeof payload.cancelUrl !== 'string') {
    throw Object.assign(new Error('successUrl and cancelUrl are required'), { status: 400 });
  }

  const created = now();
  const sessionId = id('cs_test');
  const session: CheckoutSession = {
    id: sessionId,
    paymentSessionId: sessionId,
    checkoutUrl: `${checkoutBaseUrl()}/checkout/${sessionId}`,
    merchant: typeof payload.merchant === 'string' ? payload.merchant : resolveMerchant(headers.authorization),
    amount: Number(payload.amount),
    currency: String(payload.currency).toUpperCase(),
    customer: typeof payload.customer === 'object' && payload.customer !== null ? payload.customer as Record<string, unknown> : undefined,
    items: Array.isArray(payload.items) ? payload.items as CheckoutSession['items'] : [],
    successUrl: payload.successUrl,
    cancelUrl: payload.cancelUrl,
    returnUrl: typeof payload.returnUrl === 'string' ? payload.returnUrl : payload.successUrl,
    status: 'open',
    expiresAt: typeof payload.expiresAt === 'string' ? payload.expiresAt : new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    metadata: typeof payload.metadata === 'object' && payload.metadata !== null ? payload.metadata as Record<string, unknown> : {},
    createdAt: created,
    updatedAt: created,
  };
  sessions.set(sessionId, session);
  if (key) idempotency.set(key, sessionId);
  return session;
}


export async function completeCheckoutSession(sessionId: string, payload: Record<string, unknown>, merchant?: string) {
  const session = getCheckoutSession(sessionId, merchant);
  ensureOpen(session);
  const method = (payload.method as PaymentMethod) ?? 'bank-card';
  const provider = getProvider(method);
  const result = await provider.createPayment({
    amount: session.amount,
    currency: session.currency,
    merchant: session.merchant,
    method,
    sessionId,
    customer: session.customer,
    metadata: session.metadata,
    details: payload,
  });
  const timestamp = now();
  const payment: Payment = {
    id: id('pay_test'),
    sessionId,
    merchant: session.merchant,
    amount: session.amount,
    currency: session.currency,
    method,
    status: result.status,
    provider: result.provider,
    providerPaymentId: result.providerPaymentId,
    actionRequired: result.actionRequired,
    failureCode: result.failureCode,
    failureMessage: result.failureMessage,
    metadata: session.metadata,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  payments.set(payment.id, payment);
  session.payment = payment.id;
  session.status = result.status === 'succeeded' ? 'completed' : result.status === 'expired' ? 'expired' : 'open';
  session.updatedAt = timestamp;

  if (payment.status === 'succeeded') {
    await emitWebhook('checkout.session.completed', session.merchant, { checkoutSession: session, payment });
    await emitWebhook('payment.paid', session.merchant, { payment, checkoutSession: session });
  } else if (payment.status === 'failed') {
    await emitWebhook('payment.failed', session.merchant, { payment, checkoutSession: session });
  } else if (payment.status === 'expired') {
    await emitWebhook('payment.expired', session.merchant, { payment, checkoutSession: session });
  }
  return { session, payment };
}

export async function cancelCheckoutSession(sessionId: string, merchant?: string) {
  const session = getCheckoutSession(sessionId, merchant);
  if (session.status === 'completed') throw Object.assign(new Error('completed checkout session cannot be cancelled'), { status: 409 });
  if (session.status !== 'cancelled') {
    session.status = 'cancelled';
    session.updatedAt = now();
    await emitWebhook('payment.cancelled', session.merchant, { checkoutSession: session, payment: session.payment ? payments.get(session.payment) : undefined });
  }
  return session;
}

export async function createDirectPayment(payload: Record<string, unknown>, merchant = defaultMerchant) {
  validateAmountCurrency(payload.amount, payload.currency);
  const timestamp = now();
  const method = (payload.method as PaymentMethod) ?? 'mock';
  const provider = getProvider(method);
  const result = await provider.createPayment({
    amount: Number(payload.amount),
    currency: String(payload.currency).toUpperCase(),
    merchant,
    method,
    customer: typeof payload.customer === 'object' && payload.customer !== null ? payload.customer as Record<string, unknown> : undefined,
    metadata: typeof payload.metadata === 'object' && payload.metadata !== null ? payload.metadata as Record<string, unknown> : {},
    details: payload,
  });
  const payment: Payment = {
    id: id('pay_test'),
    merchant,
    amount: Number(payload.amount),
    currency: String(payload.currency).toUpperCase(),
    method,
    status: result.status,
    provider: result.provider,
    providerPaymentId: result.providerPaymentId,
    actionRequired: result.actionRequired,
    failureCode: result.failureCode,
    failureMessage: result.failureMessage,
    metadata: typeof payload.metadata === 'object' && payload.metadata !== null ? payload.metadata as Record<string, unknown> : {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  payments.set(payment.id, payment);
  return payment;
}

export function retrievePayment(id: string) {
  const payment = payments.get(id);
  if (!payment) throw Object.assign(new Error('payment not found'), { status: 404 });
  return payment;
}

export async function cancelDirectPayment(id: string) {
  const payment = retrievePayment(id);
  const provider = getProvider(payment.method);
  const result = provider.cancelPayment ? await provider.cancelPayment(payment.providerPaymentId ?? payment.id) : { status: 'cancelled' as const };
  payment.status = result.status;
  payment.updatedAt = now();
  return payment;
}

export async function refundDirectPayment(id: string, payload: Record<string, unknown> = {}) {
  const payment = retrievePayment(id);
  const provider = getProvider(payment.method);
  const result = provider.refundPayment
    ? await provider.refundPayment({
      paymentId: payment.providerPaymentId ?? payment.id,
      amount: typeof payload.amount === 'number' ? payload.amount : payment.amount,
      currency: payment.currency,
      reason: typeof payload.reason === 'string' ? payload.reason : undefined,
      metadata: typeof payload.metadata === 'object' && payload.metadata !== null ? payload.metadata as Record<string, unknown> : undefined,
    })
    : { status: 'refunded' as const };
  payment.status = result.status;
  payment.updatedAt = now();
  return payment;
}

export function registerWebhookEndpoint(payload: Record<string, unknown>, merchant = defaultMerchant) {
  if (typeof payload.url !== 'string') throw Object.assign(new Error('url is required'), { status: 400 });
  const timestamp = now();
  const endpoint: WebhookEndpoint = {
    id: id('we_test'),
    merchant,
    url: payload.url,
    events: Array.isArray(payload.events) ? payload.events.map(String) : ['payment.paid', 'payment.failed', 'checkout.session.completed'],
    secret: id('whsec_test'),
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  webhookEndpoints.set(endpoint.id, endpoint);
  return endpoint;
}

export function listWebhookEvents(merchant?: string) {
  return webhookEvents.filter((event) => !merchant || event.merchant === merchant);
}

async function emitWebhook(type: WebhookEventType, merchant: string, data: Record<string, unknown>) {
  const timestamp = now();
  const event: WebhookEvent = { id: id('evt_test'), type, merchant, payload: { id: id('evt_payload'), type, data, created: timestamp }, attempts: [], createdAt: timestamp, updatedAt: timestamp };
  webhookEvents.unshift(event);

  const endpoints = Array.from(webhookEndpoints.values()).filter((endpoint) => endpoint.merchant === merchant && endpoint.status === 'active' && endpoint.events.includes(type));
  await Promise.all(endpoints.map(async (endpoint) => {
    const body = JSON.stringify(event.payload);
    const timestampSeconds = Math.floor(Date.now() / 1000);
    const digest = crypto.createHmac('sha256', endpoint.secret).update(`${timestampSeconds}.${body}`).digest('hex');
    const signature = `t=${timestampSeconds},v1=${digest}`;
    const attempt: WebhookDeliveryAttempt = { id: id('del_test'), endpointId: endpoint.id, url: endpoint.url, status: 'pending', signature, createdAt: now() };
    event.attempts.push(attempt);
    try {
      const response = await fetch(endpoint.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Diapay-Signature': signature, 'Diapay-Timestamp': String(timestampSeconds) }, body });
      attempt.status = response.ok ? 'delivered' : 'failed';
      attempt.statusCode = response.status;
    } catch (error) {
      attempt.status = 'failed';
      attempt.error = error instanceof Error ? error.message : 'delivery failed';
    }
  }));
  event.updatedAt = now();
  return event;
}

export const sandboxState = { apiBaseUrl, sessions, payments, webhookEndpoints, webhookEvents, resolveMerchant, listProviders, listPaymentMethods };
