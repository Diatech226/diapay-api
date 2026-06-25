import { Request, Response } from 'express';
import { createApiKey, createApplication, createMerchant, createMerchantAdmin, developerState, listApiKeys, revokeApiKey, rotateApiKey } from '../services/developer-platform-store';
function handle(error: unknown, res: Response) { const status = typeof error === 'object' && error !== null && 'status' in error ? Number((error as { status: number }).status) : 500; res.status(status).json({ error: { message: error instanceof Error ? error.message : 'Internal server error' } }); }
export const listMerchants = (_: Request, res: Response) => res.json(Array.from(developerState.merchants.values()));
export const postMerchant = (req: Request, res: Response) => { try { res.status(201).json(createMerchant(req.body)); } catch (e) { handle(e, res); } };
export const listAdmins = (_: Request, res: Response) => res.json(Array.from(developerState.admins.values()));
export const postAdmin = (req: Request, res: Response) => { try { res.status(201).json(createMerchantAdmin(req.body)); } catch (e) { handle(e, res); } };
export const listApps = (_: Request, res: Response) => res.json(Array.from(developerState.applications.values()));
export const postApp = (req: Request, res: Response) => { try { res.status(201).json(createApplication(req.body)); } catch (e) { handle(e, res); } };
export const getApiKeys = (_: Request, res: Response) => res.json(listApiKeys());
export const postApiKey = (req: Request, res: Response) => { try { res.status(201).json(createApiKey(req.body)); } catch (e) { handle(e, res); } };
export const deleteApiKey = (req: Request, res: Response) => { try { res.json(revokeApiKey(req.params.id)); } catch (e) { handle(e, res); } };
export const rotateKey = (req: Request, res: Response) => { try { res.status(201).json(rotateApiKey(req.params.id)); } catch (e) { handle(e, res); } };
export const listLogs = (_: Request, res: Response) => res.json(developerState.logs);
