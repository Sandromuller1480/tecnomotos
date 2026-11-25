'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils/cn';

interface ProductImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackLabel?: string;
  fallbackClassName?: string;
}

export function ProductImage({
  src,
  alt,
  className,
  fallbackLabel = 'Sem imagem cadastrada',
  fallbackClassName
}: ProductImageProps) {
  const imageSrc = useMemo(() => {
    const cleanUrl = src?.trim();
    return cleanUrl ? encodeURI(cleanUrl) : null;
  }, [src]);

  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = imageSrc !== null && failedSrc === imageSrc;

  if (!imageSrc || failed) {
    return (
      <div className={cn(
        'h-full w-full flex items-center justify-center text-[10px] font-mono uppercase tracking-widest text-brand-grey text-center px-2',
        fallbackClassName
      )}>
        {fallbackLabel}
      </div>
    );
  }

  return (
    <img
      src={imageSrc}
      alt={alt}
      className={cn('h-full w-full object-contain select-none', className)}
      onError={() => setFailedSrc(imageSrc)}
    />
  );
}
