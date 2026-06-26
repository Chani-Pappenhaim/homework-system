import { Request, Response } from 'express';
import * as gradesService from '../services/grades.service';

export async function gradeSubmission(req: Request, res: Response) {
  try {
    const grade = await gradesService.gradeSubmission(req.params.id as string, req.user!.userId, req.body);
    res.json({ success: true, data: { grade } });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function getReport(req: Request, res: Response) {
  const report = await gradesService.getReport({
    groupId: req.query.groupId as string | undefined,
    courseId: req.query.courseId as string | undefined,
  });
  res.json({ success: true, data: { report } });
}

export async function exportReport(req: Request, res: Response) {
  try {
    const buffer = await gradesService.exportReport({
      groupId: req.query.groupId as string | undefined,
      courseId: req.query.courseId as string | undefined,
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=grades.xlsx');
    res.send(buffer);
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function getPending(_req: Request, res: Response) {
  const data = await gradesService.getPendingGrades();
  res.json({ success: true, data });
}

