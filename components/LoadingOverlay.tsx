
import React from 'react';
import { Scan, FileSpreadsheet, CheckCircle2, Loader2 } from 'lucide-react';

interface LoadingOverlayProps {
  isLoading: boolean;
  message: string;
  subMessage?: string;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ isLoading, message, subMessage }) => {
  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-white p-8 rounded-xl shadow-2xl max-w-sm w-full text-center border border-slate-200 animate-in fade-in zoom-in-95 duration-300">
        <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
                <Scan className="w-8 h-8 text-slate-700 animate-pulse" />
            </div>
        </div>
        
        <h3 className="text-xl font-bold text-slate-900 mb-2">{message}</h3>
        <p className="text-sm text-slate-500 mb-6 font-medium animate-pulse">{subMessage || 'Please wait...'}</p>

        <div className="flex justify-center space-x-2">
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce delay-75"></div>
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce delay-150"></div>
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce delay-300"></div>
        </div>
      </div>
    </div>
  );
};

export default LoadingOverlay;
