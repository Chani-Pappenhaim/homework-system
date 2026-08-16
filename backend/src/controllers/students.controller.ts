import { Request, Response } from 'express';
import * as studentsService from '../services/students.service';
import { sendError } from '../utils/http';

export async function findByEmail(req: Request, res: Response) {
  try {
    const email = (req.query.email as string | undefined)?.trim();
    if (!email) { res.status(400).json({ success: false, error: 'Email required' }); return; }
    const student = await studentsService.findStudentByEmail(email);
    res.json({ success: true, data: { student } });
  } catch (err: any) {
    sendError(res, err);
  }
}
