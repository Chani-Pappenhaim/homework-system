import api from './axios';
import type { MessageDTO } from '@/types';

export const messagesApi = {
  send: (content: string, assignmentId?: string) => api.post('/messages', { content, assignmentId }),
  sendTeacher: (studentId: string, content: string, assignmentId?: string) =>
    api.post('/messages/teacher', { studentId, content, assignmentId }),

  /** The name the students' emails come from: hers, or the site's default while she chose none. */
  getEmailSettings: () =>
    api.get<{ success: true; data: EmailSettings }>('/messages/email-settings'),

  /** An empty name goes back to the site's default. */
  updateEmailSettings: (senderName: string) =>
    api.put<{ success: true; data: EmailSettings }>('/messages/email-settings', { senderName }),

  /** The same message to every student of the group, each in her own conversation. */
  sendToGroup: (groupId: string, content: string) =>
    api.post<{ success: true; data: { sent: number } }>('/messages/teacher/group', { groupId, content }),
  getAll: () => api.get<{ success: true; data: { messages: MessageDTO[] } }>('/messages'),
  getMine: () => api.get<{ success: true; data: { messages: MessageDTO[] } }>('/messages/mine'),
  getUnreadCount: () => api.get<{ success: true; data: { count: number } }>('/messages/unread-count'),
  getUnreadReplyCount: () => api.get<{ success: true; data: { count: number } }>('/messages/unread-replies-count'),
  markRead: (id: string) => api.patch(`/messages/${id}/read`),
  markMineRead: (id: string) => api.patch(`/messages/${id}/mine-read`),
  reply: (id: string, reply: string) => api.post(`/messages/${id}/reply`, { reply }),
  studentReply: (id: string, reply: string) => api.post(`/messages/${id}/student-reply`, { reply }),
  deleteReply: (id: string) => api.delete(`/messages/${id}/reply`),
  deleteMine: (id: string) => api.delete(`/messages/${id}/mine`),
  delete: (id: string) => api.delete(`/messages/${id}`),
};

export interface EmailSettings {
  senderName: string | null;
  defaultSenderName: string;
}
