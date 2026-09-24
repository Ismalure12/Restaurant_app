import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

// Menu and category images live in one S3 bucket. The bucket's policy must
// allow public GET on objects — the menu loads them straight from S3.
// S3_PUBLIC_URL (optional) swaps the bucket URL for a CDN/custom domain.
let client: S3Client | null = null;

function config() {
  const bucket = process.env.S3_BUCKET_NAME;
  const region = process.env.AWS_REGION;
  if (!bucket || !region) throw new Error('S3_BUCKET_NAME and AWS_REGION are required for image uploads');
  return { bucket, region };
}

// One client per process; the SDK reads AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY itself.
// 5 attempts (SDK default 3): a restaurant connection drops for a moment far
// more often than S3 is actually down.
function s3(region: string) {
  client ??= new S3Client({ region, maxAttempts: 5 });
  return client;
}

// Network-level failures (DNS, refused, reset, timed out): S3 was never
// reached, as opposed to S3 answering with an error.
const NETWORK_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ENETUNREACH', 'EHOSTUNREACH']);
export function isStorageUnreachable(err: unknown) {
  const e = err as { code?: string; name?: string } | null;
  return !!e && (NETWORK_CODES.has(String(e.code)) || e.name === 'TimeoutError');
}

/**
 * Can an anonymous browser load this URL? `denied` means the bucket blocks
 * public reads — the upload "worked" but the menu would show no picture.
 * `unknown` (timeout, network) never blocks an upload.
 */
export async function checkPublicRead(url: string): Promise<'ok' | 'denied' | 'unknown'> {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    if (res.ok) return 'ok';
    return res.status === 403 || res.status === 404 ? 'denied' : 'unknown';
  } catch (err) {
    console.warn('Public-read check for an upload could not run:', (err as Error)?.message);
    return 'unknown';
  }
}

export function publicUrl(key: string) {
  const { bucket, region } = config();
  const base = (process.env.S3_PUBLIC_URL || `https://${bucket}.s3.${region}.amazonaws.com`).replace(/\/+$/, '');
  return `${base}/${key}`;
}

/** Uploads a public, immutable object (keys are unique per upload) and returns its URL. */
export async function uploadPublicImage(key: string, body: Buffer, contentType: string) {
  const { bucket, region } = config();
  await s3(region).send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return publicUrl(key);
}

/**
 * Stores a PRIVATE object (database backups): encrypted at rest, never under
 * menu/ (the only public prefix), no public caching. BACKUP_S3_BUCKET puts
 * backups in their own bucket; by default they share the images bucket.
 */
export async function uploadPrivateObject(key: string, body: Buffer, contentType = 'application/octet-stream') {
  const { region } = config();
  const bucket = process.env.BACKUP_S3_BUCKET || config().bucket;
  if (key.startsWith('menu/')) throw new Error('Private objects must not go under the public menu/ prefix');
  await s3(region).send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    ServerSideEncryption: 'AES256',
  }));
  return { bucket, key };
}
