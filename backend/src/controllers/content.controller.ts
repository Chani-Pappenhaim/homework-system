import { Request, Response } from 'express';
import { sendError } from '../utils/http';
import { fileToMarkdown } from '../utils/content-convert';
import { fixMulterFilename } from '../utils/storage';

export async function convert(req: Request, res: Response) {
  try {
    const markdown = await fileToMarkdown(fixMulterFilename(req.file!.originalname), req.file!.buffer);
    res.json({ success: true, data: { markdown } });
  } catch (err: any) {
    sendError(res, err);
  }
}
