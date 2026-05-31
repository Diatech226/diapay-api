import { Request, Response } from 'express';
import { cancelDirectPayment, createDirectPayment, listWebhookEvents, refundDirectPayment, registerWebhookEndpoint, retrievePayment, sandboxState } from '../services/checkout-store';

function handle(error: unknown, res: Response) {
  const status = typeof error === 'object' && error !== null && 'status' in error ? Number((error as { status: number }).status) : 500;
  const message = error instanceof Error ? error.message : 'Internal server error';
  res.status(status).json({ error: { message } });
}

export const createPayment = async (req: Request, res: Response) => {
  try { res.status(201).json(await createDirectPayment(req.body, sandboxState.resolveMerchant(req.header('authorization') ?? undefined))); } catch (error) { handle(error, res); }
};
export const getPayment = async (req: Request, res: Response) => {
  try { res.json(retrievePayment(req.params.id)); } catch (error) { handle(error, res); }
};
export const cancelPayment = async (req: Request, res: Response) => {
  try { res.json(await cancelDirectPayment(req.params.id)); } catch (error) { handle(error, res); }
};
export const refundPayment = async (req: Request, res: Response) => {
  try { res.json(await refundDirectPayment(req.params.id, req.body)); } catch (error) { handle(error, res); }
};
export const createWebhook = async (req: Request, res: Response) => {
  try { res.status(201).json(registerWebhookEndpoint(req.body, sandboxState.resolveMerchant(req.header('authorization') ?? undefined))); } catch (error) { handle(error, res); }
};
export const listWebhookEventsController = async (_req: Request, res: Response) => res.json(listWebhookEvents());
export const listTransactions = async (_req: Request, res: Response) => res.json(Array.from(sandboxState.payments.values()).map((payment, index) => ({ ...payment, fee: Math.round(payment.amount * 0.018), net: Math.round(payment.amount * 0.982), id: `txn_${index + 1}` })));
export const getBalance = async (_req: Request, res: Response) => res.json({ available: 0, pending: 0, currency: 'XOF' });
export const createPayout = async (_req: Request, res: Response) => res.status(201).json({ id: 'po_mock_1', status: 'pending' });
export const listMethods = async (_req: Request, res: Response) => res.json(sandboxState.listPaymentMethods());
export const listProviderConfigs = async (_req: Request, res: Response) => res.json(sandboxState.listProviders());
