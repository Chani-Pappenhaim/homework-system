import { Request, Response } from 'express';
import * as studentsService from '../services/students.service';
import { createStudentAccount } from '../services/groups.service';
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

/** A student outside any group — let into single lessons or courses by the teacher. */
export async function createStudent(req: Request, res: Response) {
  try {
    const { name, email, githubUsername } = req.body ?? {};
    const student = await createStudentAccount({ name: String(name ?? ''), email: String(email ?? ''), githubUsername });
    res.status(201).json({
      success: true,
      data: { student: { id: student.id, name: student.name, email: student.email, githubUsername: student.githubUsername } },
    });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function searchStudents(req: Request, res: Response) {
  try {
    const students = await studentsService.searchStudents(req.query.search as string | undefined);
    res.json({ success: true, data: { students } });
  } catch (err: any) {
    sendError(res, err);
  }
}
