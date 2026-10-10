import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('bullmq', () => {
  class Queue { add = vi.fn(async () => ({})); }
  class Worker { on = vi.fn(); }
  class QueueEvents { on = vi.fn(); }
  return { Queue, Worker, QueueEvents };
});
vi.mock('../../src/services/attendance.service', () => ({
  getCourseAttendance: vi.fn(async () => ({ roster: [] })),
  createSession: vi.fn(),
  createSessionsFromLessons: vi.fn(),
  setExclusion: vi.fn(),
  importAttendance: vi.fn(async () => ({ saved: 1, skipped: 0, sessionsCreated: 0, errors: [] })),
  buildAttendanceTemplate: vi.fn(async () => Buffer.from('xlsx')),
  updateSession: vi.fn(),
  deleteSession: vi.fn(),
  saveRecords: vi.fn(async () => ({ saved: 1 })),
  addHomework: vi.fn(),
  renameHomework: vi.fn(),
  deleteHomework: vi.fn(),
  saveHomeworkMarks: vi.fn(),
  getMyAttendance: vi.fn(async () => []),
}));

import request from 'supertest';
import { createApp } from '../../src/app';
import { signAccessToken } from '../../src/utils/jwt';
import * as attendanceService from '../../src/services/attendance.service';

const app = createApp();
const student = `Bearer ${signAccessToken({ userId: 'stud1', role: 'STUDENT' })}`;
const admin = `Bearer ${signAccessToken({ userId: 'admin1', role: 'ADMIN' })}`;

beforeEach(() => vi.clearAllMocks());

describe('attendance routes', () => {
  it.each([
    ['get', '/api/courses/c1/attendance'],
    ['get', '/api/courses/c1/attendance/template'],
    ['post', '/api/courses/c1/attendance/sessions'],
    ['put', '/api/attendance/sessions/s1/records'],
    ['put', '/api/attendance/homework/h1/marks'],
    ['put', '/api/courses/c1/attendance/exclusions/stud2'],
  ] as const)('a student cannot %s %s', async (method, url) => {
    const res = await request(app)[method](url).set('Authorization', student).send({});
    expect(res.status).toBe(403);
  });

  it('a student reads only her own attendance', async () => {
    const res = await request(app).get('/api/attendance/me').set('Authorization', student);
    expect(res.status).toBe(200);
    expect(attendanceService.getMyAttendance).toHaveBeenCalledWith('stud1');
  });

  it('requires a signed-in user', async () => {
    expect((await request(app).get('/api/attendance/me')).status).toBe(401);
  });

  it('the teacher saves marks', async () => {
    const records = [{ studentId: 'stud1', status: 'PRESENT' }];
    const res = await request(app).put('/api/attendance/sessions/s1/records').set('Authorization', admin).send({ records });
    expect(res.status).toBe(200);
    expect(attendanceService.saveRecords).toHaveBeenCalledWith('s1', records);
  });

  it('serves the template as an xlsx download', async () => {
    const res = await request(app).get('/api/courses/c1/attendance/template').set('Authorization', admin);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toContain('attachment');
  });

  it('refuses an import with no file', async () => {
    const res = await request(app).post('/api/courses/c1/attendance/import').set('Authorization', admin);
    expect(res.status).toBe(400);
    expect(attendanceService.importAttendance).not.toHaveBeenCalled();
  });

  it('imports an uploaded sheet', async () => {
    const res = await request(app).post('/api/courses/c1/attendance/import').set('Authorization', admin)
      .attach('file', Buffer.from('xlsx'), 'attendance.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.data.saved).toBe(1);
  });
});
