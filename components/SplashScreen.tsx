import React from 'react';
import Logo from './Logo';

interface SplashScreenProps {
  isExiting: boolean;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ isExiting }) => {
  return (
    <div className={`fixed inset-0 z-[1000] bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center transition-opacity duration-700 ease-in-out font-['Poppins'] ${isExiting ? 'opacity-0' : 'opacity-100'}`}>
      <div className="relative z-10 flex flex-col items-center animate-in zoom-in-95 duration-1000 p-6 text-center">
        <Logo size={100} className="mb-6 rounded-[20px] shadow-lg shadow-primary/20" />
        <div className="text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white tracking-tight mb-2 font-['Poppins']">
            Bipin Petroleum Co.
          </h1>
          <p className="text-sm font-semibold text-primary dark:text-blue-400 tracking-[0.25em] uppercase font-['Poppins'] mt-1">
            Powered by ZenterPrime
          </p>
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;