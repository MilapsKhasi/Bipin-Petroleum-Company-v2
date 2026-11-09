import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  KeyRound, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  HardDrive, 
  Loader2, 
  Mail, 
  ArrowLeft,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import Logo from '../components/Logo';
import { 
  findLicenseByUserEmail,
  validateLicenseKey, 
  setActiveLicense,
  normalizeLicenseKey,
  LicenseRecord
} from '../lib/licenseManager';
import { supabase } from '../lib/supabase';
import { useCompany } from '../context/CompanyContext';
import { User } from '../types';

type AuthStep = 'email' | 'license';

const Auth: React.FC = () => {
  const [step, setStep] = useState<AuthStep>('email');
  
  // Step 1: Email state
  const [emailInput, setEmailInput] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  
  // Matched User & License
  const [matchedUser, setMatchedUser] = useState<User | null>(null);
  const [matchedLicense, setMatchedLicense] = useState<LicenseRecord | null>(null);

  // Step 2: License state
  const [licenseInput, setLicenseInput] = useState('');
  const [licenseLoading, setLicenseLoading] = useState(false);
  const [licenseError, setLicenseError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  const navigate = useNavigate();
  const { refresh: refreshCompany } = useCompany();

  // Handle email search & lookup
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = (emailInput || '').trim();
    if (!cleanEmail) {
      setEmailError('Please enter your registered email address.');
      return;
    }

    setEmailLoading(true);
    setEmailError(null);

    try {
      const res = await findLicenseByUserEmail(cleanEmail);
      if (!res.success || !res.license) {
        setEmailError(res.message || 'No registered license found for this email address.');
        setEmailLoading(false);
        return;
      }

      setMatchedUser(res.user || null);
      setMatchedLicense(res.license);
      // Automatically populate license key from database 'license_key' column
      setLicenseInput(res.license.license_key || '');
      setStep('license');
      setLicenseError(null);
    } catch (err: any) {
      console.error('Email lookup error:', err);
      setEmailError(err?.message || 'Failed to verify email address.');
    } finally {
      setEmailLoading(false);
    }
  };

  // Handle license activation
  const handleActivateLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = (licenseInput || '').trim();
    if (!trimmed) {
      setLicenseError('Please enter your license key to proceed.');
      return;
    }

    setLicenseLoading(true);
    setLicenseError(null);
    setSuccessMsg(null);

    try {
      const result = await validateLicenseKey(trimmed);
      
      if (!result.valid || !result.license) {
        setLicenseError(result.message || 'Invalid license key. Please check and try again.');
        setLicenseLoading(false);
        return;
      }

      // If we have matched user, ensure license retains that user_id
      const finalLicense = {
        ...result.license,
        user_id: matchedUser?.id || result.license.user_id,
      };

      // Store license and create active session
      await setActiveLicense(finalLicense);
      
      const email = matchedUser?.email || `${normalizeLicenseKey(finalLicense.license_key).toLowerCase()}@offline.bipinpetroleum.com`;
      await supabase.auth.signInWithPassword({ email, userId: finalLicense.user_id });

      await refreshCompany();

      setSuccessMsg('License verified successfully. Redirecting to workspaces...');

      setTimeout(() => {
        navigate('/companies', { replace: true });
      }, 400);
    } catch (err: any) {
      console.error('License verification error:', err);
      setLicenseError(err?.message || 'Failed to verify license key.');
    } finally {
      setLicenseLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F8FC] flex flex-col items-center justify-center p-4 sm:p-6 font-sans text-slate-900 selection:bg-primary/20">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-xs p-6 sm:p-8 space-y-6">
        
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <Logo size={48} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Bipin Petroleum Co.
          </h1>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Powered by ZenterPrime
          </p>
        </div>

        {/* STEP 1: ENTER REGISTERED EMAIL */}
        {step === 'email' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            {/* Info Box */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-4 space-y-2">
              <div className="flex items-center space-x-2 text-slate-700">
                <Mail className="w-4 h-4 text-primary shrink-0" />
                <span className="text-xs font-bold uppercase tracking-wider">Account Authorization</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Enter your registered email address to find your account and retrieve your authorized license key automatically.
              </p>
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="registered-email-input" className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                  Registered Email Address
                </label>
                <div className="relative">
                  <input
                    id="registered-email-input"
                    type="email"
                    value={emailInput}
                    onChange={(e) => {
                      setEmailInput(e.target.value);
                      if (emailError) setEmailError(null);
                    }}
                    placeholder="e.g. bhushanmehta1992@gmail.com"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-slate-300 focus:border-primary focus:ring-1 focus:ring-primary rounded-lg text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400"
                    autoFocus
                    disabled={emailLoading}
                    required
                  />
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
                </div>
              </div>

              {emailError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <span>{emailError}</span>
                </div>
              )}

              <button
                id="find-license-btn"
                type="submit"
                disabled={emailLoading || !emailInput.trim()}
                className="w-full py-2.5 px-4 bg-primary hover:bg-primary-dark text-white text-sm font-bold rounded-lg transition-all flex items-center justify-center space-x-2 shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {emailLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Looking up license...</span>
                  </>
                ) : (
                  <>
                    <span>Find License Key</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Manual Switch */}
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => {
                  setLicenseInput('');
                  setMatchedUser(null);
                  setMatchedLicense(null);
                  setStep('license');
                }}
                className="text-xs text-primary hover:underline font-medium inline-flex items-center space-x-1 cursor-pointer"
              >
                <span>Or enter license key manually</span>
                <KeyRound className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: VERIFIED LICENSE KEY CONFIRMATION */}
        {step === 'license' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            
            {/* Matched Account Banner if found via email */}
            {matchedUser ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-emerald-800 font-bold text-xs">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Registered Account Found</span>
                  </div>
                  <span className="px-2 py-0.5 bg-emerald-200 text-emerald-800 text-[10px] font-bold rounded uppercase tracking-wider">
                    {matchedLicense?.edition || 'Enterprise'}
                  </span>
                </div>
                <p className="text-xs text-emerald-700 font-medium">
                  {matchedUser.email}
                </p>
                <div className="flex items-center space-x-1 text-[11px] text-emerald-600 pt-0.5">
                  <Sparkles className="w-3 h-3" />
                  <span>License key loaded automatically from your account.</span>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-4 space-y-2">
                <div className="flex items-center space-x-2 text-slate-700">
                  <KeyRound className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-xs font-bold uppercase tracking-wider">Product License Authorization</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Enter your product license key to unlock your offline workspaces, ledgers, and transactions.
                </p>
              </div>
            )}

            {/* License Form */}
            <form onSubmit={handleActivateLicense} className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="license-input-field" className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                    License Key
                  </label>
                  {matchedUser && (
                    <span className="text-[11px] font-medium text-emerald-600 flex items-center space-x-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Auto-Matched</span>
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    id="license-input-field"
                    type="text"
                    value={licenseInput || ''}
                    onChange={(e) => {
                      setLicenseInput((e.target.value || '').toUpperCase());
                      if (licenseError) setLicenseError(null);
                    }}
                    placeholder="LC-XXXX-XXXX-XXXX"
                    className={`w-full px-3.5 py-2.5 bg-white border ${
                      matchedUser ? 'border-emerald-300 bg-emerald-50/20' : 'border-slate-300'
                    } focus:border-primary focus:ring-1 focus:ring-primary rounded-lg text-sm font-mono tracking-wider uppercase text-slate-900 outline-none transition-all placeholder:text-slate-400`}
                    autoFocus={!matchedUser}
                    disabled={licenseLoading}
                  />
                </div>
              </div>

              {licenseError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <span>{licenseError}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg flex items-start space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{successMsg}</span>
                </div>
              )}

              <button
                id="unlock-workspace-btn"
                type="submit"
                disabled={licenseLoading || !(licenseInput || '').trim()}
                className="w-full py-2.5 px-4 bg-primary hover:bg-primary-dark text-white text-sm font-bold rounded-lg transition-all flex items-center justify-center space-x-2 shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {licenseLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying License...</span>
                  </>
                ) : (
                  <>
                    <span>Unlock & Enter Workspaces</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Back to email lookup */}
            <div className="pt-1 text-center">
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setLicenseError(null);
                }}
                className="text-xs text-slate-500 hover:text-slate-800 font-medium inline-flex items-center space-x-1 cursor-pointer transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Change Email / Back to Lookup</span>
              </button>
            </div>
          </div>
        )}

        {/* Offline Badge Footer */}
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center space-x-2">
            <HardDrive className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-medium">100% Offline Mode (IndexedDB)</span>
          </div>
          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 font-bold rounded text-[10px] uppercase tracking-wider">
            Ready
          </span>
        </div>

      </div>
    </div>
  );
};

export default Auth;
