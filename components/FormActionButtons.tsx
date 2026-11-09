import React from 'react';
import { Loader2 } from 'lucide-react';

export interface FormActionButtonsProps {
  // Top Primary Button (Solid Blue)
  primaryText?: string;
  primaryOnClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  primaryType?: 'button' | 'submit';
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  primaryIcon?: React.ReactNode;

  // Middle Left Button (White Outline)
  secondaryLeftText?: string;
  secondaryLeftOnClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  secondaryLeftType?: 'button' | 'submit';
  secondaryLeftDisabled?: boolean;
  secondaryLeftLoading?: boolean;
  secondaryLeftIcon?: React.ReactNode;
  showSecondaryLeft?: boolean;

  // Middle Right Button (White Outline)
  secondaryRightText?: string;
  secondaryRightOnClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  secondaryRightType?: 'button' | 'submit';
  secondaryRightDisabled?: boolean;
  secondaryRightLoading?: boolean;
  secondaryRightIcon?: React.ReactNode;
  showSecondaryRight?: boolean;

  // Bottom Action (Centered Red Text)
  discardText?: string;
  discardOnClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  discardDisabled?: boolean;

  // Container customization
  className?: string;
  maxWidth?: string; // e.g. "max-w-md", "max-w-sm", etc.
}

export const FormActionButtons: React.FC<FormActionButtonsProps> = ({
  primaryText = 'Save & Print',
  primaryOnClick,
  primaryType = 'submit',
  primaryDisabled = false,
  primaryLoading = false,
  primaryIcon,

  secondaryLeftText = 'Save & New',
  secondaryLeftOnClick,
  secondaryLeftType = 'button',
  secondaryLeftDisabled = false,
  secondaryLeftLoading = false,
  secondaryLeftIcon,
  showSecondaryLeft = true,

  secondaryRightText = 'Print Preview',
  secondaryRightOnClick,
  secondaryRightType = 'button',
  secondaryRightDisabled = false,
  secondaryRightLoading = false,
  secondaryRightIcon,
  showSecondaryRight = true,

  discardText = 'Discard',
  discardOnClick,
  discardDisabled = false,

  className = '',
  maxWidth = 'max-w-md',
}) => {
  return (
    <div className={`w-full ${maxWidth} mx-auto pt-6 pb-2 space-y-2.5 sm:space-y-3 ${className}`}>
      {/* 1. Top Primary Action Bar (Solid Blue) */}
      <button
        type={primaryType}
        onClick={primaryOnClick}
        disabled={primaryDisabled || primaryLoading}
        title={`${primaryText} (Shortcut: Ctrl + S)`}
        className="w-full px-4 py-2 bg-primary hover:bg-primary-dark active:scale-[0.98] text-white font-medium text-xs rounded shadow-sm transition-all duration-150 flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
      >
        {primaryLoading ? (
          <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
        ) : (
          primaryIcon && <span className="mr-1.5">{primaryIcon}</span>
        )}
        <span>{primaryText}</span>
        <kbd className="hidden sm:inline text-[10px] text-blue-200 ml-1.5 font-mono font-normal tracking-tight">Ctrl+S</kbd>
      </button>

      {/* 2. Middle Row Split Actions (Side-by-side White Outline Buttons) */}
      {(showSecondaryLeft || showSecondaryRight) && (
        <div className={`grid ${showSecondaryLeft && showSecondaryRight ? 'grid-cols-2' : 'grid-cols-1'} gap-2.5 sm:gap-3 w-full`}>
          {showSecondaryLeft && (
            <button
              type={secondaryLeftType}
              onClick={secondaryLeftOnClick}
              disabled={secondaryLeftDisabled || secondaryLeftLoading}
              title={`${secondaryLeftText} (Shortcut: Ctrl + Shift + S)`}
              className="w-full px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-medium text-xs rounded hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-[0.98] transition-all duration-150 shadow-2xs flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              {secondaryLeftLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                secondaryLeftIcon && <span className="mr-1.5">{secondaryLeftIcon}</span>
              )}
              <span className="truncate">{secondaryLeftText}</span>
              <kbd className="hidden md:inline text-[9px] text-slate-400 dark:text-slate-500 font-mono font-normal">Ctrl+⇧+S</kbd>
            </button>
          )}

          {showSecondaryRight && (
            <button
              type={secondaryRightType}
              onClick={secondaryRightOnClick}
              disabled={secondaryRightDisabled || secondaryRightLoading}
              title={secondaryRightText.toLowerCase().includes('print') ? `${secondaryRightText} (Shortcut: Ctrl + P)` : secondaryRightText}
              className="w-full px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-medium text-xs rounded hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-[0.98] transition-all duration-150 shadow-2xs flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              {secondaryRightLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                secondaryRightIcon && <span className="mr-1.5">{secondaryRightIcon}</span>
              )}
              <span className="truncate">{secondaryRightText}</span>
              {secondaryRightText.toLowerCase().includes('print') && (
                <kbd className="hidden md:inline text-[9px] text-slate-400 dark:text-slate-500 font-mono font-normal">Ctrl+P</kbd>
              )}
            </button>
          )}
        </div>
      )}

      {/* 3. Bottom Centered Discard Action (Red Text) */}
      {discardOnClick && (
        <div className="text-center pt-0.5">
          <button
            type="button"
            onClick={discardOnClick}
            disabled={discardDisabled}
            className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-sm font-medium hover:underline py-1 px-3 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {discardText}
          </button>
        </div>
      )}
    </div>
  );
};

export default FormActionButtons;
