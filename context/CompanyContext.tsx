import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { migrateCustomersToParties } from '../utils/partiesMigration';
import { getActiveLicense, DEFAULT_LICENSE_KEY, ensureDefaultWorkspaceForLicense } from '../lib/licenseManager';

import { Company } from '../types';

interface CompanyContextType {
  activeCompany: Company | null;
  loading: boolean;
  setCompany: (company: Company) => Promise<void>;
  refresh: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export const CompanyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const activeLic = getActiveLicense();
      const licKey = activeLic?.license_key || DEFAULT_LICENSE_KEY;

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id || activeLic?.user_id;

      // Query all companies and filter strictly by account user_id
      const { data: userCompanies } = await supabase
        .from('companies')
        .select('*')
        .eq('is_deleted', false)
        .order('name');

      const filtered = (userCompanies || []).filter((c: any) => {
        if (!userId) return false;
        return c.user_id === userId || c.created_by === userId;
      });

      const storedId = localStorage.getItem('activeCompanyId');
      const validStoredCompany = storedId ? filtered.find((c: any) => c.id === storedId) : null;

      if (validStoredCompany) {
        setActiveCompany(validStoredCompany);
        localStorage.setItem('activeCompanyId', validStoredCompany.id);
        localStorage.setItem('activeCompanyName', validStoredCompany.name);
        setLoading(false);
        return;
      }

      if (filtered.length > 0) {
        const firstComp = filtered[0];
        setActiveCompany(firstComp);
        localStorage.setItem('activeCompanyId', firstComp.id);
        localStorage.setItem('activeCompanyName', firstComp.name);
      } else if (userId) {
        // If this user account has no workspaces yet, automatically ensure default workspace for this user
        const created = await ensureDefaultWorkspaceForLicense(licKey, userId);
        if (created) {
          setActiveCompany(created);
        } else {
          setActiveCompany(null);
        }
      } else {
        setActiveCompany(null);
      }
    } catch (err: any) {
      console.error('Context refresh error:', err);
    } finally {
      setLoading(false);
    }
  };

  const setCompany = async (company: Company) => {
    try {
      localStorage.setItem('activeCompanyId', company.id);
      localStorage.setItem('activeCompanyName', company.name);
      setActiveCompany(company);

      // Update profiles active_company_id
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (userId) {
        await supabase.from('profiles').upsert({
          id: `prof-${userId}`,
          user_id: userId,
          active_company_id: company.id,
          is_developer: false,
          created_at: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error('Context setCompany error:', err);
    }
  };

  useEffect(() => {
    refresh();
    const handleSettingsChanged = () => {
      refresh();
    };
    window.addEventListener('appSettingsChanged', handleSettingsChanged);
    return () => window.removeEventListener('appSettingsChanged', handleSettingsChanged);
  }, []);

  useEffect(() => {
    if (activeCompany?.id) {
      migrateCustomersToParties(activeCompany.id);
    }
  }, [activeCompany?.id]);

  return (
    <CompanyContext.Provider value={{ activeCompany, loading, setCompany, refresh }}>
      {children}
    </CompanyContext.Provider>
  );
};

export const useCompany = () => {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
};
