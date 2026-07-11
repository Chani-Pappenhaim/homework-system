import { Request, Response } from 'express';
import * as aiUsageService from '../services/ai-usage.service';

export async function getSummary(_req: Request, res: Response) {
  try {
    const summary = await aiUsageService.getSummary();
    res.json({ success: true, data: summary });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}
