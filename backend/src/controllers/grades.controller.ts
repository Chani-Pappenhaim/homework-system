import { Request, Response } from 'express';
import * as gradesService from '../services/grades.service';
import * as settingsService from '../services/settings.service';
import { sendError } from '../utils/http';
import { dayRangeQuery } from '../utils/date-range';

/** The report filters from the query string — the same for the table and its export. */
function reportFilters(req: Request): gradesService.ReportFilters {
  const id = (name: string) => req.query[name] as string | undefined;
  return { groupId: id('groupId'), courseId: id('courseId'), studentId: id('studentId'), ...dayRangeQuery(req.query) };
}

export async function getLatePolicy(_req: Request, res: Response) {
  try {
    res.json({ success: true, data: await settingsService.getLatePolicy() });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function updateLatePolicy(req: Request, res: Response) {
  try {
    res.json({ success: true, data: await settingsService.updateLatePolicy(req.body ?? {}) });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function gradeSubmission(req: Request, res: Response) {
  try {
    const grade = await gradesService.gradeSubmission(req.params.id as string, req.user!.userId, req.body);
    res.json({ success: true, data: { grade } });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function getReport(req: Request, res: Response) {
  try {
    const report = await gradesService.getReport(reportFilters(req));
    res.json({ success: true, data: { report } });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function exportReport(req: Request, res: Response) {
  try {
    const buffer = await gradesService.exportReport(reportFilters(req));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=grades.xlsx');
    res.send(buffer);
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function getPending(_req: Request, res: Response) {
  const data = await gradesService.getPendingGrades();
  res.json({ success: true, data });
}

