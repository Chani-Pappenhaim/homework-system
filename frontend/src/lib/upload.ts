// Uploads a signed FormData payload straight to Cloudinary. Uses XMLHttpRequest
// instead of fetch() because fetch has no upload-progress event — XHR does.
// Every failure path is turned into a Hebrew message a user can act on, since
// this call bypasses our own backend and its normal error handling entirely.

export class UploadError extends Error {
  isUploadError = true;
  constructor(message: string) {
    super(message);
    this.name = 'UploadError';
  }
}

export interface CloudinaryUploadResult {
  secure_url: string;
  bytes?: number;
}

function messageFromCloudinaryError(raw: string): string {
  if (/file size too large|maximum file size|exceeds the maximum/i.test(raw)) {
    return 'ההעלאה נכשלה — הקובץ גדול מדי וחורג מהמכסה המותרת';
  }
  if (/quota|credit|plan storage|storage limit/i.test(raw)) {
    return 'ההעלאה נכשלה — נגמר מקום האחסון בחשבון האחסון (Cloudinary). יש לפנות למנהל המערכת';
  }
  return `ההעלאה נכשלה: ${raw}`;
}

export function uploadToCloudinary(
  url: string,
  form: FormData,
  onProgress?: (percent: number) => void,
): Promise<CloudinaryUploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new UploadError('התקבלה תגובה לא תקינה משרת האחסון'));
        }
        return;
      }

      // NetFree (and similar network-level content filters) answer blocked
      // requests with their own 418 page instead of letting the request
      // reach Cloudinary at all — this is a network/ISP block, not our bug.
      if (xhr.status === 418) {
        reject(new UploadError(
          'ההעלאה נחסמה על ידי סינון הרשת (כמו NetFree) ולא הגיעה בכלל לשרת האחסון. ' +
          'נסי מרשת אחרת, או בקשי ממי שמנהל/ת את הרשת לאשר גישה לדומיין api.cloudinary.com',
        ));
        return;
      }

      let message = `ההעלאה נכשלה (שגיאת שרת האחסון, קוד ${xhr.status})`;
      try {
        const body = JSON.parse(xhr.responseText);
        if (body?.error?.message) message = messageFromCloudinaryError(body.error.message);
      } catch {
        // Response body wasn't JSON (e.g. an HTML block page) — keep the generic status message.
      }
      reject(new UploadError(message));
    };

    xhr.onerror = () => {
      reject(new UploadError(
        'ההעלאה נכשלה — החיבור לשרת האחסון נותק באמצע. ייתכן שהרשת חוסמת חיבורים אליו ' +
        '(למשל סינון של ספק האינטרנט). נסי שוב, או ברשת אחרת',
      ));
    };

    xhr.send(form);
  });
}
