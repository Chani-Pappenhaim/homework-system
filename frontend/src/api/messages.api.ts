import api from './axios';
import type { MessageDetailDTO, MessageDTO, ReactionDTO, ThreadAudience } from '@/types';

type Wrapped<T> = { success: true; data: T };

/** Whom a reply is for: everyone in the thread (default), the teacher alone, or one student. */
export interface ReplyScope {
  scope?: 'ALL' | 'TEACHER';
  toStudentId?: string;
}

export const messagesApi = {
  send: (content: string, assignmentId?: string, subject?: string) =>
    api.post('/messages', { content, assignmentId, subject }),
  sendTeacher: (studentId: string, content: string, subject?: string) =>
    api.post('/messages/teacher', { studentId, content, subject }),

  /** The name the students' emails come from: hers, or the site's default while she chose none. */
  getEmailSettings: () =>
    api.get<{ success: true; data: EmailSettings }>('/messages/email-settings'),

  /** An empty name goes back to the site's default. */
  updateEmailSettings: (senderName: string) =>
    api.put<{ success: true; data: EmailSettings }>('/messages/email-settings', { senderName }),

  /** The hours (Israel time) in which students' notification emails wait until the release time. */
  getQuietHours: () =>
    api.get<{ success: true; data: QuietHours }>('/messages/quiet-hours'),

  updateQuietHours: (hours: QuietHours) =>
    api.put<{ success: true; data: QuietHours }>('/messages/quiet-hours', hours),

  /** One thread for the whole group: visible to every student, or as hidden copies. */
  sendToGroup: (groupId: string, content: string, audience: Exclude<ThreadAudience, 'DIRECT'>, subject?: string) =>
    api.post<Wrapped<{ id: string; sent: number }>>('/messages/teacher/group', { groupId, content, audience, subject }),
  getAll: () => api.get<Wrapped<{ messages: MessageDTO[] }>>('/messages'),
  getMine: () => api.get<Wrapped<{ messages: MessageDTO[] }>>('/messages/mine'),
  getThread: (id: string) => api.get<Wrapped<{ message: MessageDetailDTO }>>(`/messages/${id}`),
  getUnreadCount: () => api.get<Wrapped<{ count: number }>>('/messages/unread-count'),
  getUnreadReplyCount: () => api.get<Wrapped<{ count: number }>>('/messages/unread-replies-count'),
  markRead: (id: string) => api.patch(`/messages/${id}/read`),
  markUnread: (id: string) => api.patch(`/messages/${id}/unread`),
  markMineRead: (id: string) => api.patch(`/messages/${id}/mine-read`),
  markMineUnread: (id: string) => api.patch(`/messages/${id}/mine-unread`),
  reply: (id: string, reply: string, to: ReplyScope = {}) => api.post(`/messages/${id}/reply`, { reply, ...to }),
  studentReply: (id: string, reply: string, to: ReplyScope = {}) =>
    api.post(`/messages/${id}/student-reply`, { reply, ...to }),
  toggleReaction: (id: string, entryId: string, emoji: string) =>
    api.post<Wrapped<{ reactions: ReactionDTO[] }>>(`/messages/${id}/entries/${entryId}/reactions`, { emoji }),
  deleteReply: (id: string) => api.delete(`/messages/${id}/reply`),
  deleteMine: (id: string) => api.delete(`/messages/${id}/mine`),
  delete: (id: string) => api.delete(`/messages/${id}`),
};

/** Minutes past midnight, Israel time. Equal values mean no quiet hours. */
export interface QuietHours {
  startMinute: number;
  releaseMinute: number;
}

export interface EmailSettings {
  senderName: string | null;
  defaultSenderName: string;
}
