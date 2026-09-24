import { MESSAGES } from './apiError';

// Same rules as POST /api/upload — checked here first so a wrong file fails
// instantly instead of after the whole upload.
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const fail = (kind, message, extra = {}) => Object.assign(new Error(message), { kind, ...extra });

/** A person-safe reason this file can't be uploaded, or null. */
export function imageFileProblem(file) {
  if (!IMAGE_TYPES.includes(file?.type)) return 'Invalid file type. Allowed: JPG, PNG, WebP';
  if (file.size > MAX_IMAGE_BYTES) return 'File too large. Max 5MB';
  return null;
}

/**
 * Upload one menu/category image to POST /api/upload and resolve with its URL.
 * XMLHttpRequest, not fetch: fetch can't report upload progress, and on a
 * restaurant connection a 4 MB photo can take a while — the person should see
 * it moving. `onProgress(0..1)` reports bytes sent; at 1 the server is still
 * optimising and storing the image.
 */
export function uploadImage(file, { onProgress, timeoutMs = 120_000 } = {}) {
  const problem = imageFileProblem(file);
  if (problem) return Promise.reject(fail('validation', problem));

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    xhr.timeout = timeoutMs;
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    xhr.onerror = () => reject(fail(navigator.onLine === false ? 'offline' : 'unreachable', navigator.onLine === false ? MESSAGES.offline : MESSAGES.unreachable));
    xhr.ontimeout = () => reject(fail('timeout', MESSAGES.timeout));
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* a proxy's HTML error page — handled below by status */ }
      if (xhr.status >= 200 && xhr.status < 300 && data?.url) return resolve(data.url);
      const apiMessage = typeof data?.error === 'string' ? data.error : null;
      const code = data?.code ?? null;
      if (xhr.status === 401) return reject(fail('auth', MESSAGES.auth, { status: 401 }));
      if (xhr.status === 403) return reject(fail('forbidden', MESSAGES.forbidden, { status: 403 }));
      // The API's own words for its 4xx and for storage problems it named (STORAGE_*).
      if (apiMessage && (xhr.status < 500 || String(code).startsWith('STORAGE_'))) {
        return reject(fail(xhr.status < 500 ? 'validation' : 'storage', apiMessage, { status: xhr.status, code }));
      }
      if (xhr.status >= 200 && xhr.status < 300) return reject(fail('server', 'The upload did not return an image. Please try again.'));
      reject(fail(data ? 'server' : 'unreachable', data ? MESSAGES.server : MESSAGES.unreachable, { status: xhr.status }));
    };
    const fd = new FormData();
    fd.append('file', file);
    xhr.send(fd);
  });
}
