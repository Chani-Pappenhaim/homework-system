import { Request, Response } from 'express';
import * as assignmentsService from '../services/assignments.service';

export async function getAssignments(req: Request, res: Response) {
  const assignments = await assignmentsService.getAssignments(req.params.lessonId as string);
  res.json({ success: true, data: { assignments } });
}

export async function createAssignment(req: Request, res: Response) {
  try {
    const assignment = await assignmentsService.createAssignment(req.params.lessonId as string, req.body);
    res.status(201).json({ success: true, data: { assignment } });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function updateAssignment(req: Request, res: Response) {
  try {
    const assignment = await assignmentsService.updateAssignment(req.params.id as string, req.body);
    res.json({ success: true, data: { assignment } });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function deleteAssignment(req: Request, res: Response) {
  try {
    await assignmentsService.deleteAssignment(req.params.id as string);
    res.json({ success: true, data: null });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function importAssignments(req: Request, res: Response) {
  try {
    if (!req.file) { res.status(400).json({ success: false, error: 'No file uploaded' }); return; }
    const result = await assignmentsService.importAssignments(req.file.buffer);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function getSubmissions(req: Request, res: Response) {
  try {
    const data = await assignmentsService.getAssignmentSubmissions(req.params.id as string);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

