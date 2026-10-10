import { Request, Response } from 'express';
import * as attendanceService from '../services/attendance.service';
import { sendError } from '../utils/http';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Every handler has the same shape: run the service, wrap its result, map errors.
function handle(run: (req: Request) => Promise<unknown>, status = 200) {
  return async (req: Request, res: Response) => {
    try {
      const data = await run(req);
      res.status(status).json({ success: true, data: data ?? null });
    } catch (err: any) {
      sendError(res, err);
    }
  };
}

const param = (req: Request, name: string) => req.params[name] as string;

export const getCourseAttendance = handle((req) => attendanceService.getCourseAttendance(param(req, 'id')));
export const createSession = handle(async (req) => ({ session: await attendanceService.createSession(param(req, 'id'), req.body ?? {}) }), 201);
export const createSessionsFromLessons = handle((req) => attendanceService.createSessionsFromLessons(param(req, 'id')), 201);
export const setExclusion = handle((req) =>
  attendanceService.setExclusion(param(req, 'id'), param(req, 'studentId'), Boolean(req.body?.excluded)));
export const importAttendance = handle((req) => attendanceService.importAttendance(param(req, 'id'), req.file!.buffer));

export async function downloadTemplate(req: Request, res: Response) {
  try {
    const buffer = await attendanceService.buildAttendanceTemplate(param(req, 'id'));
    res.setHeader('Content-Type', XLSX_TYPE);
    res.setHeader('Content-Disposition', 'attachment; filename=attendance-template.xlsx');
    res.send(buffer);
  } catch (err: any) {
    sendError(res, err);
  }
}

export const updateSession = handle(async (req) => ({ session: await attendanceService.updateSession(param(req, 'id'), req.body ?? {}) }));
export const deleteSession = handle((req) => attendanceService.deleteSession(param(req, 'id')));
export const saveRecords = handle((req) => attendanceService.saveRecords(param(req, 'id'), req.body?.records));
export const addHomework = handle(async (req) => ({ homework: await attendanceService.addHomework(param(req, 'id'), req.body?.title) }), 201);
export const renameHomework = handle(async (req) => ({ homework: await attendanceService.renameHomework(param(req, 'id'), req.body?.title) }));
export const deleteHomework = handle((req) => attendanceService.deleteHomework(param(req, 'id')));
export const saveHomeworkMarks = handle((req) => attendanceService.saveHomeworkMarks(param(req, 'id'), req.body?.marks));

export const getMyAttendance = handle(async (req) => ({ courses: await attendanceService.getMyAttendance(req.user!.userId) }));
