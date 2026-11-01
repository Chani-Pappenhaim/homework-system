// Mirror the backend's limits in messages.service.ts.
export const MAX_MESSAGE_LENGTH = 5000;
export const MAX_SUBJECT_LENGTH = 120;

// Mirrors the backend's MAX_IMPORT_BYTES (middleware/upload.ts): the largest file a text field can be filled from.
export const MAX_CONTENT_FILE_BYTES = 5 * 1024 * 1024;
