import React, { useState } from 'react';

interface AmpLogoProps {
  className?: string;
  white?: boolean;
}

export const AmpLogo: React.FC<AmpLogoProps> = ({ className = '', white = false }) => {
  const [imgError, setImgError] = useState(false);

  if (imgError) {
    return (
      <div
        className={`inline-flex items-center justify-center rounded-lg bg-gold px-2 py-1 text-xs font-black tracking-wider text-white shrink-0 select-none ${className}`}
      >
        AMP
      </div>
    );
  }

  const hasHeight = /\bh-/.test(className);
  const defaultHeight = hasHeight ? '' : 'h-6';
  const hasWidth = /\bw-/.test(className);
  const defaultWidth = hasWidth ? '' : 'w-auto';

  return (
    <img
      src="/amp-short-logo.png"
      alt="AMP Logo"
      onError={() => setImgError(true)}
      style={white ? { filter: 'brightness(0) invert(1)' } : undefined}
      className={`object-contain select-none shrink-0 ${defaultHeight} ${defaultWidth} ${className}`.trim()}
    />
  );
};
