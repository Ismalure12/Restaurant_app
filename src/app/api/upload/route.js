import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getSession } from '@/lib/auth';
import sharp from 'sharp';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    if (!ALLOWED_TYPES.has(file.type))
      return NextResponse.json({ error: 'Invalid file type. Allowed: JPG, PNG, WebP' }, { status: 400 });

    if (file.size > 5 * 1024 * 1024)
      return NextResponse.json({ error: 'File too large. Max 5MB' }, { status: 400 });

    const raw = Buffer.from(await file.arrayBuffer());

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
      return NextResponse.json({ error: 'Invalid image file' }, { status: 400 });
    }

    const name = `menu/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.webp`;
    const blob = await put(name, optimized, { access: 'public', contentType: 'image/webp' });

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
