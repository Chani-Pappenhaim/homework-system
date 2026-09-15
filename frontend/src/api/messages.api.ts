import api from './axios';
import type { MessageDTO } from '@/types';

export const messagesApi = {
  send: (content: string, assignmentId?: string) => api.post('/messages', { content, assignmentId }),
  sendTeacher: (studentId: string, content: string, assignmentId?: string) =>
    api.post('/messages/teacher', { studentId, content, assignmentId }),
  getAll: () => api.get<{ success: true; data: { messages: MessageDTO[] } }>('/messages'),
  getMine: () => api.get<{ success: true; data: { messages: MessageDTO[] } }>('/messages/mine'),
  getUnreadCount: () => api.get<{ success: true; data: { count: number } }>('/messages/unread-count'),
  getUnreadReplyCount: () => api.get<{ success: true; data: { count: number } }>('/messages/unread-replies-count'),
  markRead: (id: string) => api.patch(`/messages/${id}/read`),
  markMineRead: (id: string) => api.patch(`/messages/${id}/mine-read`),
  markReplySeen: (id: string) => api.patch(`/messages/${id}/reply-seen`),
  markReplySeenByTeacher: (id: string) => api.patch(`/messages/${id}/reply-seen-by-teacher`),
  reply: (id: string, reply: string) => api.post(`/messages/${id}/reply`, { reply }),
  studentReply: (id: string, reply: string) => api.post(`/messages/${id}/student-reply`, { reply }),
  deleteReply: (id: string) => api.delete(`/messages/${id}/reply`),
  deleteMine: (id: string) => api.delete(`/messages/${id}/mine`),
  delete: (id: string) => api.delete(`/messages/${id}`),
};
