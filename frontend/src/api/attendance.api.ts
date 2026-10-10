import api from './axios';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'EXCUSED';

export interface RosterStudent {
  id: string;
  name: string;
  email: string;
  /** 'group' — in the course's group; 'access' — let in personally. */
  source: 'group' | 'access';
  excluded: boolean;
}

export interface AttendanceRecordDTO { studentId: string; status: AttendanceStatus; note: string | null }

export interface AttendanceSessionDTO {
  id: string;
  date: string;
  title: string | null;
  lessonId: string | null;
  records: AttendanceRecordDTO[];
  homework: { id: string; title: string; doneBy: string[] }[];
}

export interface AttendanceLessonDTO {
  id: string;
  topic: string;
  lessonDate: string | null;
  hidden: boolean;
  assignments: { id: string; title: string; deadline: string | null; submittedBy: string[] }[];
}

export interface CourseAttendanceDTO {
  course: { id: string; name: string };
  roster: RosterStudent[];
  lessons: AttendanceLessonDTO[];
  sessions: AttendanceSessionDTO[];
}

export interface ImportResult { saved: number; skipped: number; sessionsCreated: number; errors: string[] }

export interface MyAttendanceCourse {
  courseId: string;
  courseName: string;
  summary: { present: number; absent: number; excused: number; sessions: number };
  sessions: {
    id: string;
    date: string;
    title: string | null;
    status: AttendanceStatus | null;
    homework: { id: string; title: string; kind: 'site' | 'extra'; done: boolean }[];
  }[];
}

type Ok<T> = { success: true; data: T };
type SessionInput = { date?: string; lessonId?: string | null; title?: string | null };

export const attendanceApi = {
  getCourse: (courseId: string) =>
    api.get<Ok<CourseAttendanceDTO>>(`/courses/${courseId}/attendance`),

  createSession: (courseId: string, data: SessionInput) =>
    api.post<Ok<{ session: Omit<AttendanceSessionDTO, 'records' | 'homework'> }>>(`/courses/${courseId}/attendance/sessions`, data),

  createSessionsFromLessons: (courseId: string) =>
    api.post<Ok<{ created: number; undated: number }>>(`/courses/${courseId}/attendance/sessions/from-lessons`),

  updateSession: (sessionId: string, data: SessionInput) =>
    api.patch(`/attendance/sessions/${sessionId}`, data),

  deleteSession: (sessionId: string) =>
    api.delete(`/attendance/sessions/${sessionId}`),

  saveRecords: (sessionId: string, records: { studentId: string; status: AttendanceStatus | null; note?: string | null }[]) =>
    api.put(`/attendance/sessions/${sessionId}/records`, { records }),

  addHomework: (sessionId: string, title: string) =>
    api.post<Ok<{ homework: { id: string; title: string } }>>(`/attendance/sessions/${sessionId}/homework`, { title }),

  renameHomework: (homeworkId: string, title: string) =>
    api.patch(`/attendance/homework/${homeworkId}`, { title }),

  deleteHomework: (homeworkId: string) =>
    api.delete(`/attendance/homework/${homeworkId}`),

  saveHomeworkMarks: (homeworkId: string, marks: { studentId: string; done: boolean }[]) =>
    api.put(`/attendance/homework/${homeworkId}/marks`, { marks }),

  setExclusion: (courseId: string, studentId: string, excluded: boolean) =>
    api.put(`/courses/${courseId}/attendance/exclusions/${studentId}`, { excluded }),

  downloadTemplate: (courseId: string) =>
    api.get(`/courses/${courseId}/attendance/template`, { responseType: 'blob' }),

  importFile: (courseId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<Ok<ImportResult>>(`/courses/${courseId}/attendance/import`, form);
  },

  getMine: () =>
    api.get<Ok<{ courses: MyAttendanceCourse[] }>>('/attendance/me'),
};
