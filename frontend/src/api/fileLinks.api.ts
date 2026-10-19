import api from './axios';

export type FileHolder = 'lesson' | 'course';

/** A file stored elsewhere on the site, which a lesson or course can show without uploading it again. */
export interface LinkableFile {
  source: FileHolder;
  id: string;
  name: string;
  sizeBytes: string | null;
  courseName: string;
  lessonTopic: string | null;
}

export const fileLinksApi = {
  list: (target: FileHolder, targetId: string) =>
    api.get<{ success: true; data: { files: LinkableFile[] } }>(`/${target}s/${targetId}/files/linkable`),

  link: (target: FileHolder, targetId: string, file: Pick<LinkableFile, 'source' | 'id'>) =>
    api.post(`/${target}s/${targetId}/files/link`, { source: file.source, fileId: file.id }),
};
