import api from './axios';

export type FileSource = 'lesson' | 'course';

export const filesApi = {
  /**
   * A link an online Office viewer can fetch from its own servers, without the
   * reader's session. The API path, valid for a few minutes only.
   */
  viewerLink: async (fileId: string, kind: FileSource): Promise<string> => {
    const { data } = await api.post<{ success: true; data: { url: string } }>('/files/viewer-link', { fileId, kind });
    return data.data.url;
  },
};
