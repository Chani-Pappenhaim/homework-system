import { Request, Response } from 'express';
import * as settingsService from '../services/settings.service';
import { sendError } from '../utils/http';

export async function getSiteNames(_req: Request, res: Response) {
  res.json({ success: true, data: await settingsService.getSiteNames() });
}

export async function updateSiteNames(req: Request, res: Response) {
  try {
    res.json({ success: true, data: await settingsService.updateSiteNames(req.body ?? {}) });
  } catch (err) {
    sendError(res, err);
  }
}
