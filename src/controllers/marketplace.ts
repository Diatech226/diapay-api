import { Request, Response } from 'express';
import { marketplaceService } from '../services/marketplace.service';

function handle(error: unknown, res: Response) {
  const status = typeof error === 'object' && error !== null && 'status' in error ? Number((error as { status: number }).status) : 500;
  const message = error instanceof Error ? error.message : 'Internal server error';
  res.status(status).json({ error: { message } });
}

export const createSplitPayment = (req: Request, res: Response) => {
  try { res.status(201).json(marketplaceService.processSplitPayment(req.body)); } catch (error) { handle(error, res); }
};

export const createVendor = (req: Request, res: Response) => {
  try { res.status(201).json(marketplaceService.createVendor(req.body)); } catch (error) { handle(error, res); }
};

export const listVendors = (_req: Request, res: Response) => res.json(Array.from(marketplaceService.vendors.values()));

export const getVendorWallet = (req: Request, res: Response) => {
  try {
    const vendor = marketplaceService.vendors.get(req.params.id);
    if (!vendor) throw Object.assign(new Error('Vendor not found'), { status: 404 });
    const wallet = marketplaceService.wallets.get(vendor.wallet);
    res.json({ vendor, wallet, ledgerEntries: wallet?.ledgerEntries.map((entryId) => marketplaceService.ledgerEntries.get(entryId)).filter(Boolean) ?? [] });
  } catch (error) { handle(error, res); }
};

export const createMarketplacePayout = (req: Request, res: Response) => {
  try { res.status(201).json(marketplaceService.createPayout(req.body)); } catch (error) { handle(error, res); }
};

export const releaseEscrow = (req: Request, res: Response) => {
  try { res.json(marketplaceService.releaseEscrow(req.body)); } catch (error) { handle(error, res); }
};

export const refundEscrow = (req: Request, res: Response) => {
  try { res.json(marketplaceService.refundEscrow(req.body)); } catch (error) { handle(error, res); }
};

export const getMarketplaceLedger = (_req: Request, res: Response) => res.json(marketplaceService.listLedger());
export const listMarketplaceWallets = (_req: Request, res: Response) => res.json(Array.from(marketplaceService.wallets.values()));
export const listEscrowHolds = (_req: Request, res: Response) => res.json(Array.from(marketplaceService.escrowHolds.values()));
export const listMarketplacePayouts = (_req: Request, res: Response) => res.json(Array.from(marketplaceService.payouts.values()));
export const getMarketplaceAnalytics = (_req: Request, res: Response) => res.json(marketplaceService.analytics());
export const listMarketplaceTimeline = (_req: Request, res: Response) => res.json(Array.from(marketplaceService.timeline.values()));
