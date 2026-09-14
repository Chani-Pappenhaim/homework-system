import multer from 'multer';

// Without a fileSize limit, multer buffers the entire upload into memory
// (multer.memoryStorage()) before a route ever sees it — a single huge
// request can exhaust the process's memory. Two tiers, matched to what each
// route actually expects:
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // lesson/course/submission file attachments
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024; // excel/markdown imports

export const uploadAttachment = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES },
});

export const uploadImport = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMPORT_BYTES },
});
