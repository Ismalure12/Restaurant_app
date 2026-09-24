'use client';

import { useEffect, useRef, useState } from 'react';
import { uploadImage } from '@/lib/uploadImage';
import { Icon, ProgressBar, cx } from '@/components/admin/ui';

/**
 * The one image picker for the back office (dish photo, category cover).
 * Shows what is happening the whole time: the chosen photo at once, a real
 * progress bar while it uploads, "Optimising…" while the server converts and
 * stores it, then the STORED image itself — so a picture that can't load on
 * the menu shows up here, before anyone saves. Errors stay inline, next to the
 * field. `onBusyChange` lets the form hold its Save button meanwhile.
 */
export default function ImageUploadField({ value, onChange, onBusyChange, title = 'Upload image', changeTitle = 'Change image', hint = 'JPG, PNG or WebP · up to 5 MB', className }) {
  const [phase, setPhase] = useState('idle'); // idle · uploading · processing · done · error
  const [pct, setPct] = useState(0);
  const [error, setError] = useState('');
  const [localPreview, setLocalPreview] = useState(null); // blob: URL of the chosen file while it uploads
  const [broken, setBroken] = useState(false); // the stored image failed to load
  const blobRef = useRef(null);

  const busy = phase === 'uploading' || phase === 'processing';
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => () => { if (blobRef.current) URL.revokeObjectURL(blobRef.current); }, []);

  const setBlob = (url) => {
    if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    blobRef.current = url;
    setLocalPreview(url);
  };

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // picking the same file again must fire onChange again
    if (!file) return;
    setError(''); setBroken(false); setPct(0);
    setBlob(URL.createObjectURL(file));
    setPhase('uploading');
    try {
      const url = await uploadImage(file, {
        onProgress: (p) => { setPct(Math.round(p * 100)); if (p >= 1) setPhase('processing'); },
      });
      onChange(url);
      setBlob(null); // from now on show the stored image, not the local copy
      setPhase('done');
    } catch (err) {
      setBlob(null);
      setError(err?.message || 'Could not upload the image. Please try again.');
      setPhase('error');
    }
  };

  const shown = localPreview || value || null;
  const heading = phase === 'uploading' ? `Uploading… ${pct}%`
    : phase === 'processing' ? 'Optimising and saving the image…'
    : shown ? changeTitle : title;
  const sub = phase === 'uploading' ? 'Keep this window open until it finishes'
    : phase === 'processing' ? 'Almost done'
    : phase === 'done' && !broken ? 'Uploaded — it goes on the menu when you save'
    : hint;

  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label
        className={cx(
          'flex items-center gap-3 rounded-[10px] border border-dashed px-3.5 py-3 transition-colors',
          phase === 'error' || broken ? 'border-mq-danger-line bg-mq-danger-bg' : 'border-mq-line-2 bg-mq-cream',
          busy ? 'cursor-wait' : 'cursor-pointer hover:border-mq-focus hover:bg-mq-soft',
        )}
        aria-busy={busy}
      >
        <span className="relative w-14 h-14 flex-none">
          {shown && !(broken && !localPreview)
            // eslint-disable-next-line @next/next/no-img-element -- local blob preview / uploaded S3 URL of any size
            ? <img
                src={shown}
                alt=""
                onError={() => { if (!localPreview) setBroken(true); }}
                onLoad={() => { if (!localPreview) setBroken(false); }}
                className={cx('w-14 h-14 rounded-[10px] object-cover border border-mq-line', busy && 'opacity-60')}
              />
            : <span className="grid place-items-center w-14 h-14 rounded-[10px] bg-white border border-mq-line text-mq-cta">
                <Icon name={broken ? 'alert' : 'upload'} size={20} stroke={1.9} />
              </span>}
          {busy && (
            <span className="absolute inset-0 grid place-items-center" aria-hidden="true">
              <span className="w-6 h-6 rounded-full border-[2.5px] border-white/80 border-t-mq-primary animate-spin motion-reduce:animate-none" />
            </span>
          )}
          {phase === 'done' && !broken && (
            <span className="absolute -right-1 -bottom-1 grid place-items-center w-5 h-5 rounded-full bg-mq-ok text-white ring-2 ring-white" aria-hidden="true">
              <Icon name="check" size={12} stroke={3} />
            </span>
          )}
        </span>
        <span className="flex flex-col gap-1 min-w-0 flex-1">
          <span className="text-[13.5px] font-semibold text-mq-ink" aria-live="polite">{heading}</span>
          {busy
            ? <ProgressBar pct={phase === 'processing' ? 100 : pct} tone={phase === 'processing' ? 'bg-mq-primary animate-mq-pulse motion-reduce:animate-none' : 'bg-mq-primary'} className="max-w-[260px]" />
            : null}
          <span className="text-xs text-mq-on-tint">{sub}</span>
        </span>
        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={pick} disabled={busy} />
      </label>
      {phase === 'error' && error && (
        <p role="alert" className="m-0 flex items-start gap-1.5 text-[12.5px] text-mq-danger-ink">
          <Icon name="alert" size={14} stroke={2} className="mt-px flex-none" />
          <span>Couldn’t upload the image. {error}</span>
        </p>
      )}
      {broken && !localPreview && phase !== 'error' && (
        <p role="alert" className="m-0 flex items-start gap-1.5 text-[12.5px] text-mq-danger-ink">
          <Icon name="alert" size={14} stroke={2} className="mt-px flex-none" />
          <span>This image can’t be displayed, so customers won’t see it on the menu. Upload it again, or check the image storage settings.</span>
        </p>
      )}
    </div>
  );
}
