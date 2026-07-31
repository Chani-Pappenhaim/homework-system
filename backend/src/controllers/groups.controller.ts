import { Request, Response } from 'express';
import * as groupsService from '../services/groups.service';
import { sendError } from '../utils/http';

export async function getGroups(_req: Request, res: Response) {
  const groups = await groupsService.getGroups();
  res.json({ success: true, data: { groups } });
}

export async function createGroup(req: Request, res: Response) {
  try {
    const group = await groupsService.createGroup(req.body);
    res.status(201).json({ success: true, data: { group } });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function getGroup(req: Request, res: Response) {
  const group = await groupsService.getGroupById(req.params.id as string);
  if (!group) { res.status(404).json({ success: false, error: 'Group not found' }); return; }
  res.json({ success: true, data: { group } });
}

export async function updateGroup(req: Request, res: Response) {
  try {
    const group = await groupsService.updateGroup(req.params.id as string, req.body);
    res.json({ success: true, data: { group } });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function deleteGroup(req: Request, res: Response) {
  try {
    await groupsService.deleteGroup(req.params.id as string);
    res.json({ success: true, data: null });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function addStudent(req: Request, res: Response) {
  try {
    const { name, email, githubUsername } = req.body;
    const student = await groupsService.addStudent(req.params.id as string, name, email, githubUsername);
    res.status(201).json({ success: true, data: { student } });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function removeStudent(req: Request, res: Response) {
  try {
    await groupsService.removeStudent(req.params.id as string, req.params.studentId as string);
    res.json({ success: true, data: null });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function removeStudents(req: Request, res: Response) {
  try {
    const result = await groupsService.removeStudents(req.params.id as string, req.body.studentIds ?? []);
    res.json({ success: true, data: result });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function updateStudent(req: Request, res: Response) {
  try {
    const student = await groupsService.updateStudent(req.params.id as string, req.params.studentId as string, req.body);
    res.json({ success: true, data: { student } });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function importStudents(req: Request, res: Response) {
  try {
    if (!req.file) { res.status(400).json({ success: false, error: 'No file uploaded' }); return; }
    const result = await groupsService.importStudents(req.params.id as string, req.file.buffer);
    res.json({ success: true, data: result });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function downloadImportTemplate(_req: Request, res: Response) {
  const buffer = await groupsService.buildStudentImportTemplate();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=students-import-template.xlsx');
  res.send(buffer);
}

export async function resetPassword(req: Request, res: Response) {
  try {
    await groupsService.resetStudentPassword(req.params.studentId as string);
    res.json({ success: true, data: null });
  } catch (err: any) {
    sendError(res, err);
  }
}

