
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, ShieldCheck, ArrowRight } from 'lucide-react';

const ModeSelection = () => {
  const navigate = useNavigate();

  const handleSelectMode = (mode: 'education' | 'licensed') => {
    localStorage.setItem('selectedMode', mode);
    window.dispatchEvent(new Event('appSettingsChanged'));
    navigate('/companies');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-semibold text-slate-900 mb-4 tracking-tight">Choose Experience</h1>
          <p className="text-slate-500 font-medium text-lg">Select a mode to initialize your workspace</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Education Mode */}
          <div 
            onClick={() => handleSelectMode('education')}
            className="bg-white rounded-md p-10 border border-slate-200 shadow-sm cursor-pointer transition-all hover:border-primary flex flex-col items-center text-center group"
          >
            <div className="w-16 h-16 bg-amber-50 rounded-md flex items-center justify-center mb-8 border border-slate-100 group-hover:bg-primary transition-colors">
              <GraduationCap className="w-8 h-8 text-amber-500 group-hover:text-slate-900" />
            </div>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">Education Mode</h2>
            <p className="text-slate-500 text-sm leading-relaxed mb-10">
              Perfect for learning and exploring features with sample data limitations.
            </p>
            <div className="mt-auto w-full py-4 bg-slate-50 rounded-md font-semibold group-hover:bg-primary transition-colors flex items-center justify-center border border-slate-100 text-sm">
              Start Learning <ArrowRight className="ml-2 w-4 h-4" />
            </div>
          </div>

          {/* Licensed Mode */}
          <div 
            onClick={() => handleSelectMode('licensed')}
            className="bg-white rounded-md p-10 border border-slate-200 shadow-sm cursor-pointer transition-all hover:border-primary flex flex-col items-center text-center group"
          >
            <div className="w-16 h-16 bg-slate-900 rounded-md flex items-center justify-center mb-8 border border-slate-800 group-hover:bg-primary transition-colors">
              <ShieldCheck className="w-8 h-8 text-primary group-hover:text-slate-900" />
            </div>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">Licensed Mode</h2>
            <p className="text-slate-500 text-sm leading-relaxed mb-10">
              Professional access with full data security, analytics, and unlimited records.
            </p>
            <div className="mt-auto w-full py-4 bg-slate-50 rounded-md font-semibold group-hover:bg-primary transition-colors flex items-center justify-center border border-slate-100 text-sm">
              Activate License <ArrowRight className="ml-2 w-4 h-4" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModeSelection;
