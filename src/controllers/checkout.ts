import { Request, Response } from 'express';
import { cancelCheckoutSession, completeCheckoutSession, createCheckoutSession, getCheckoutSession, listCheckoutSessions, sandboxState } from '../services/checkout-store';

function handle(error: unknown, res: Response) {
  const status = typeof error === 'object' && error !== null && 'status' in error ? Number((error as { status: number }).status) : 500;
  const message = error instanceof Error ? error.message : 'Internal server error';
  res.status(status).json({ error: { message } });
}

export const createSession = async (req: Request, res: Response) => {
  try {
    const session = createCheckoutSession(req.body, {
      authorization: req.header('authorization') ?? undefined,
      'idempotency-key': req.header('idempotency-key') ?? undefined,
    });
    res.status(201).json(session);
  } catch (error) {
    handle(error, res);
  }
};

export const listSessions = async (req: Request, res: Response) => {
  try {
    res.json(listCheckoutSessions(req.query.merchant as string | undefined));
  } catch (error) {
    handle(error, res);
  }
};

export const retrieveSession = async (req: Request, res: Response) => {
  try {
    res.json(getCheckoutSession(req.params.id, req.query.merchant as string | undefined));
  } catch (error) {
    handle(error, res);
  }
};

export const completeSession = async (req: Request, res: Response) => {
  try {
    res.json(await completeCheckoutSession(req.params.id, req.body, req.body?.merchant as string | undefined));
  } catch (error) {
    handle(error, res);
  }
};

export const cancelSession = async (req: Request, res: Response) => {
  try {
    res.json(await cancelCheckoutSession(req.params.id, req.body?.merchant as string | undefined));
  } catch (error) {
    handle(error, res);
  }
};

export const publicConfig = async (_req: Request, res: Response) => {
  res.json({ apiBaseUrl: sandboxState.apiBaseUrl(), checkoutBaseUrl: process.env.DIAPAY_CHECKOUT_URL ?? 'http://localhost:3102' });
};
