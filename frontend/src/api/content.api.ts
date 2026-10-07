import api from './axios';

/** File types a text field can be filled from — the backend converts them to Markdown. */
export const CONTENT_FILE_ACCEPT = '.md,.markdown,.txt,.html,.htm,.docx';

export const contentApi = {
  toMarkdown: async (file: File): Promise<string> => {
    const form = new FormData();
    form.append('file', file);
    const { data } = await api.post<{ success: true; data: { markdown: string } }>('/content/convert', form);
    return data.data.markdown;
  },
};
