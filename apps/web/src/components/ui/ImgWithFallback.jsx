'use client';

import { useState } from 'react';
import { PLACEHOLDER } from '@/lib/menu/format';
import { srcSetFor } from '@/lib/menu/imageSrc';

// Menu <img>: picks the right width from `srcset` (new uploads come in
// 320/640/1200 — lib/menu/imageSrc.js) using `sizes`. If that fails it tries
// the plain URL once, then shows a neutral placeholder pattern.
// priority: 'high' = first thing on screen (eager + high fetch priority),
// 'eager' = on the first screen, otherwise lazy.
export default function ImgWithFallback({ src, alt, className, style, loading, sizes, priority }) {
  // 0 = srcset, 1 = plain src, 2 = placeholder. Remembered per src, so a
  // reused instance given a new image starts again from the srcset.
  const [failure, setFailure] = useState({ src: null, stage: 0 });
  const stage = failure.src === src ? failure.stage : 0;
  const srcSet = stage === 0 && sizes ? srcSetFor(src) : undefined;
  const failed = stage === 2 || !src;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={failed ? PLACEHOLDER : src}
      srcSet={failed ? undefined : srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      className={className}
      style={style}
      decoding="async"
      loading={priority ? 'eager' : loading || 'lazy'}
      fetchPriority={priority === 'high' ? 'high' : undefined}
      onError={() => setFailure({ src, stage: stage === 0 && srcSet ? 1 : 2 })}
    />
  );
}
