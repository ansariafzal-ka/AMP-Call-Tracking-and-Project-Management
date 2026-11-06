import React, { useState } from 'react';

interface AmpLogoProps {
  className?: string;
}

export const AmpLogo: React.FC<AmpLogoProps> = ({ className = '' }) => {
  const [imgError, setImgError] = useState(false);

  if (imgError) {
    return (
      <div
        className={`inline-flex items-center justify-center rounded-lg bg-gold px-2.5 py-1.5 text-xs font-bold tracking-wider text-white shrink-0 select-none ${className}`}
      >
        AMP
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center justify-center rounded-lg bg-white px-2 py-1 shadow-xs shrink-0 select-none ${className}`}
    >
      <img
        src="/amp-short-logo.png"
        alt="AMP"
        onError={() => setImgError(true)}
        className="h-7 w-auto object-contain"
      />
    </div>
  );
};
