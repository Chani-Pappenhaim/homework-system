import { Request, Response } from 'express';
import * as studentsService from '../services/students.service';
import { sendError } from '../utils/http';

export async function searchStudents(req: Request, res: Response) {
  try {
    const students = await studentsService.searchStudents(req.query.search as string | undefined);
    res.json({ success: true, data: { students } });
  } catch (err: any) {
    sendError(res, err);
  }
}
