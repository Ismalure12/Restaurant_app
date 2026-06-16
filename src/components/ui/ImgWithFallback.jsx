'use client';

import { useEffect, useState } from 'react';
import { PLACEHOLDER } from '@/lib/menu/format';

// <img> that swaps to a neutral placeholder pattern when the source fails to load.
export default function ImgWithFallback({ src, alt, className, style, loading }) {
  const [err, setErr] = useState(false);
  // Reset on src change so a reused instance doesn't keep showing the placeholder
  // for a subsequent, valid image.
  useEffect(() => setErr(false), [src]);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={err || !src ? PLACEHOLDER : src}
      alt={alt}
      className={className}
      style={style}
      loading={loading || 'lazy'}
      onError={() => setErr(true)}
    />
  );
}
