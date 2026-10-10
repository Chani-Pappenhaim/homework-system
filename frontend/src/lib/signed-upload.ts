// Direct browser-to-Cloudinary upload followed by registering the stored file
// with the backend. The upload is tagged as pending (the backend signs the
// tags), so a file that never gets registered is eventually swept away. When
// registration is refused, the file is discarded right away instead of
// waiting for that sweep.

import api from '@/api/axios';
import { uploadToCloudinary, type CloudinaryUploadResult } from './upload';

export interface UploadSignature {
  apiKey: string;
  cloudName: string;
  timestamp: number;
  signature: string;
  folder: string;
  tags?: string;
  allowedFormats?: string;
}

/** Every signed param must be sent exactly as the backend signed it. */
export function buildSignedForm(file: File, sig: UploadSignature): FormData {
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', sig.apiKey);
  form.append('timestamp', String(sig.timestamp));
  form.append('signature', sig.signature);
  form.append('folder', sig.folder);
  if (sig.tags) form.append('tags', sig.tags);
  if (sig.allowedFormats) form.append('allowed_formats', sig.allowedFormats);
  return form;
}

export async function uploadSignedThenRegister<T>(
  sig: UploadSignature,
  file: File,
  resourceType: 'auto' | 'video',
  register: (uploaded: CloudinaryUploadResult) => Promise<T>,
  onProgress?: (percent: number) => void,
): Promise<T> {
  const uploaded = await uploadToCloudinary(
    `https://api.cloudinary.com/v1_1/${sig.cloudName}/${resourceType}/upload`,
    buildSignedForm(file, sig),
    onProgress,
  );
  try {
    return await register(uploaded);
  } catch (err) {
    // Only an actual refusal proves the file was not saved. Without a
    // response the backend may still be saving it, so the sweep decides.
    if ((err as { response?: unknown })?.response) {
      api.post('/files/discard-upload', { url: uploaded.secure_url }).catch(() => {});
    }
    throw err;
  }
}
