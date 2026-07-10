import { Request, Response } from 'express';
import * as groupsService from '../services/groups.service';

export async function getGroups(_req: Request, res: Response) {
  const groups = await groupsService.getGroups();
  res.json({ success: true, data: { groups } });
}

export async function createGroup(req: Request, res: Response) {
  try {
    const group = await groupsService.createGroup(req.body);
    res.status(201).json({ success: true, data: { group } });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
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
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function addStudent(req: Request, res: Response) {
  try {
    const { name, email, githubUsername } = req.body;
    const student = await groupsService.addStudent(req.params.id as string, name, email, githubUsername);
    res.status(201).json({ success: true, data: { student } });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function removeStudent(req: Request, res: Response) {
  try {
    await groupsService.removeStudent(req.params.id as string, req.params.studentId as string);
    res.json({ success: true, data: null });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function importStudents(req: Request, res: Response) {
  try {
    if (!req.file) { res.status(400).json({ success: false, error: 'No file uploaded' }); return; }
    const result = await groupsService.importStudents(req.params.id as string, req.file.buffer);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function resetPassword(req: Request, res: Response) {
  try {
    await groupsService.resetStudentPassword(req.params.studentId as string);
    res.json({ success: true, data: null });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

