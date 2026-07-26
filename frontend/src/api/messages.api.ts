import api from './axios';

export const messagesApi = {
  send: (content: string, assignmentId?: string) => api.post('/messages', { content, assignmentId }),
  getAll: () => api.get('/messages'),
  getMine: () => api.get('/messages/mine'),
  getUnreadCount: () => api.get('/messages/unread-count'),
  markRead: (id: string) => api.patch(`/messages/${id}/read`),
  reply: (id: string, reply: string) => api.post(`/messages/${id}/reply`, { reply }),
};
