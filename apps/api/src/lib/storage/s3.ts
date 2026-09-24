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
function s3(region: string) {
  client ??= new S3Client({ region });
  return client;
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
