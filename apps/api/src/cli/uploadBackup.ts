// Off-site copy of a database backup. Runs inside the api image, so the
// server needs nothing installed — it reuses the AWS SDK and the .env
// credentials the image already has (scripts/backup-db.sh):
//   docker compose run --rm -T --no-deps api node dist/cli/uploadBackup.js <file name> < <dump>
// Reads the dump from stdin, stores it PRIVATE and encrypted at
// s3://<BACKUP_S3_BUCKET or S3_BUCKET_NAME>/backups/<file name>, prints where.
// Exit 1 on any failure, so the cron log shows it.
import { uploadPrivateObject } from '../lib/storage/s3.js';

const MAX_BYTES = 1024 * 1024 * 1024; // 1 GB — a restaurant's dump is a few MB
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

export async function readAll(stream: NodeJS.ReadableStream, max = MAX_BYTES): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += b.length;
    if (size > max) throw new Error(`backup is larger than ${Math.round(max / 1024 / 1024)} MB`);
    chunks.push(b);
  }
  return Buffer.concat(chunks);
}

export async function uploadBackup(name: string | undefined, input: NodeJS.ReadableStream) {
  if (!name || !NAME_RE.test(name)) throw new Error('usage: uploadBackup.js <file name> < dump  (letters, digits, . _ - only)');
  const body = await readAll(input);
  if (!body.length) throw new Error('nothing on stdin — the dump is empty');
  return uploadPrivateObject(`backups/${name}`, body);
}

// Run only as a script (tests import the functions).
if (process.argv[1] && /uploadBackup\.(js|ts)$/.test(process.argv[1])) {
  uploadBackup(process.argv[2], process.stdin).then(
    ({ bucket, key }) => { console.log(`uploaded s3://${bucket}/${key}`); },
    (err) => { console.error(`S3 backup upload FAILED: ${(err as Error)?.message ?? err}`); process.exitCode = 1; },
  );
}
