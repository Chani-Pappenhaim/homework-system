import { Request, Response } from 'express';
import * as aiUsageService from '../services/ai-usage.service';
import { aiAvailability } from '../services/ai-availability';
import { updateAiSettings } from '../services/settings.service';
import { sendError } from '../utils/http';

export async function getSummary(_req: Request, res: Response) {
  try {
    const summary = await aiUsageService.getSummary();
    res.json({ success: true, data: summary });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function getStorage(_req: Request, res: Response) {
  try {
    const storage = await aiUsageService.getStorageUsage();
    res.json({ success: true, data: storage });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function getAvailability(_req: Request, res: Response) {
  try {
    res.json({ success: true, data: await aiAvailability() });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function updateSettings(req: Request, res: Response) {
  try {
    const settings = await updateAiSettings(req.body ?? {});
    res.json({ success: true, data: settings });
  } catch (err: any) {
    sendError(res, err);
  }
}
