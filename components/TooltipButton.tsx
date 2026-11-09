
import React from 'react';

interface TooltipButtonProps {
    icon: any;
    onClick?: () => void;
    tip: string;
    className?: string;
    variant?: 'primary' | 'white' | 'danger';
}

const TooltipButton: React.FC<TooltipButtonProps> = ({ icon: Icon, onClick, tip, className = '', variant = 'white' }) => {
    const variants = {
        white: 'bg-white border-slate-200 text-slate-400 hover:text-slate-900 hover:border-slate-400',
        primary: 'bg-primary border-primary text-slate-900 hover:bg-yellow-400',
        danger: 'bg-white border-slate-200 text-slate-400 hover:text-red-600 hover:bg-red-50 hover:border-red-100'
    };

    return (
        <div className="relative group inline-block">
            <button
                onClick={onClick}
                className={`p-2.5 border rounded-md transition-all shadow-sm flex items-center justify-center ${variants[variant]} ${className}`}
            >
                <Icon className="w-4 h-4" />
            </button>
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 shadow-lg border border-slate-700">
                {tip}
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[4px] border-b-slate-800"></div>
            </div>
        </div>
    );
};

export default TooltipButton;