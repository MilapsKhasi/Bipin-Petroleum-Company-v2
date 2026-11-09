import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
}

const Logo: React.FC<LogoProps> = ({ className = '', size = 40 }) => {
  return (
    <div 
      className={`relative flex items-center justify-center rounded-lg overflow-hidden bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-1 shadow-sm shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 240 160" className="w-full h-full object-contain" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="leafGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#16a34a" />
            <stop offset="50%" stopColor="#22c55e" />
            <stop offset="85%" stopColor="#4ade80" />
            <stop offset="100%" stopColor="#0284c7" />
          </linearGradient>
          <linearGradient id="bpcBlue" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0c60b0" />
            <stop offset="100%" stopColor="#074482" />
          </linearGradient>
        </defs>

        {/* bpc text */}
        <g transform="translate(10, 122)">
          <text x="0" y="0" fill="url(#bpcBlue)" fontFamily="Georgia, 'Times New Roman', serif" fontSize="108" fontWeight="bold" fontStyle="italic">b</text>
          <text x="58" y="0" fill="url(#bpcBlue)" fontFamily="Georgia, 'Times New Roman', serif" fontSize="108" fontWeight="bold" fontStyle="italic">p</text>
          <text x="126" y="0" fill="url(#bpcBlue)" fontFamily="Georgia, 'Times New Roman', serif" fontSize="108" fontWeight="bold" fontStyle="italic">c</text>
        </g>

        {/* Stem from p to leaf */}
        <path d="M 134 68 Q 142 58 152 48" stroke="url(#bpcBlue)" strokeWidth="4" strokeLinecap="round" fill="none" />

        {/* Green leaf */}
        <g transform="translate(144, 12) rotate(-5)">
          <path d="M 8 48 C 2 28, 16 8, 44 2 C 58 20, 52 42, 30 52 C 20 56, 12 54, 8 48 Z" fill="url(#leafGrad)" />
          <path d="M 14 42 C 20 28, 30 18, 40 10" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.9" />
        </g>
      </svg>
    </div>
  );
};

export default Logo;
