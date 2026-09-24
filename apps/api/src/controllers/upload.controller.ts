import type { Request, Response } from 'express';
import multer from 'multer';
import { uploadPublicImage } from '../lib/storage/s3.js';
import sharp from 'sharp';
import prisma from '../lib/db/prisma.js';
import { requirePage } from '../lib/auth/auth.js';
import { errCode } from '../utils/errors.js';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;

// Stand-in for `request.formData()`. Next buffered the whole body; here the
// buffer is capped one byte past the 5MB rule so an oversized upload is
// stopped early yet still answered with the route's own "too large" message.
type UploadReq = Request & { uploadType?: string };

const parseForm = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES + 1 },
  // Remember the declared type before the size cap can abort the stream, so
  // the type check still runs before the size check (as in the JS).
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'file') (req as UploadReq).uploadType ??= file.mimetype;
    cb(null, true);
  },
}).any();

class FileTooLarge extends Error {
  constructor(readonly type: string | undefined) {
    super('file too large');
  }
}

function readForm(req: Request, res: Response): Promise<{ type?: string; size: number; buffer: Buffer } | null> {
  const ct = String(req.headers['content-type'] ?? '').toLowerCase();
  // formData() only understands these two encodings — anything else threw (→ 500).
  if (!ct.startsWith('multipart/form-data') && !ct.startsWith('application/x-www-form-urlencoded')) {
    return Promise.reject(new Error('Unsupported form content type'));
  }
  return new Promise((resolve, reject) => {
    parseForm(req, res, (err: unknown) => {
      if (errCode(err) === 'LIMIT_FILE_SIZE') return reject(new FileTooLarge((req as UploadReq).uploadType));
      if (err) return reject(err);
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      const file = files.find((f) => f.fieldname === 'file');
      if (file) return resolve({ type: file.mimetype, size: file.size, buffer: file.buffer });
      // A plain text `file` field: formData().get() returned a string, whose
      // `.type` is undefined → the route rejected it as an invalid type.
      const field = typeof req.body === 'object' && req.body ? (req.body as Record<string, unknown>).file : undefined;
      if (typeof field === 'string') return resolve({ type: undefined, size: field.length, buffer: Buffer.from(field) });
      resolve(null);
    });
  });
}

export async function uploadImage(req: Request, res: Response) {
  try {
    const auth = await requirePage(prisma, req, ['menu', 'categories'], 'act');
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    let file;
    try {
      file = await readForm(req, res);
    } catch (err) {
      if (!(err instanceof FileTooLarge)) throw err;
      if (!ALLOWED_TYPES.has(err.type as string))
        return res.status(400).json({ error: 'Invalid file type. Allowed: JPG, PNG, WebP' });
      return res.status(400).json({ error: 'File too large. Max 5MB' });
    }
    if (!file) return res.status(400).json({ error: 'No file provided' });

    if (!ALLOWED_TYPES.has(file.type as string))
      return res.status(400).json({ error: 'Invalid file type. Allowed: JPG, PNG, WebP' });

    if (file.size > MAX_BYTES)
      return res.status(400).json({ error: 'File too large. Max 5MB' });

    const raw = file.buffer;

    let optimized;
    try {
      optimized = await sharp(raw)
        .resize({ width: 1200, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
    } catch (sharpErr) {
      // sharp failing to decode means this isn't a real image (the client-declared
      // file.type can't be trusted). Reject rather than persist unvalidated bytes.
      console.error('Sharp processing failed, rejecting upload:', sharpErr);
      return res.status(400).json({ error: 'Invalid image file' });
    }

    const name = `menu/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.webp`;
    const url = await uploadPublicImage(name, optimized, 'image/webp');

    return res.json({ url });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
