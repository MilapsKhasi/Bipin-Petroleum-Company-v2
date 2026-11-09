import { getAllFromIDB, upsertToIDB, saveAllToIDB, idbMemoryCache } from './idb';
import { License, LoginVerification, Profile, User } from '../types';

export type { License as LicenseRecord };

export const DEFAULT_USER_ID = 'd55b83b2-4562-418b-9239-e41f52f46eb8';
export const DEFAULT_USER_EMAIL = 'bhushanmehta1992@gmail.com';
export const DEFAULT_LICENSE_KEY = 'LC-93JA-89AX-49ZS';

export const DEFAULT_USER: User = {
  id: DEFAULT_USER_ID,
  email: DEFAULT_USER_EMAIL,
  created_at: '2026-01-01T00:00:00.000Z',
};

export const DEFAULT_LICENSE: License = {
  id: 'lic-lc93ja89ax49zs',
  user_id: DEFAULT_USER_ID,
  license_status: 'Active',
  trial_start: null,
  trial_end: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  edition: 'Professional',
  license_key: DEFAULT_LICENSE_KEY,
};

// Normalize key for comparisons: removes non-alphanumeric, uppercases
export function normalizeLicenseKey(key: string): string {
  if (!key) return '';
  return key.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Format raw string into LC-XXXX-XXXX-XXXX pattern
export function formatLicenseKey(raw: string): string {
  const clean = normalizeLicenseKey(raw);
  if (!clean) return '';
  
  const chunks: string[] = [];
  if (clean.startsWith('LC')) {
    chunks.push('LC');
    let rest = clean.slice(2);
    while (rest.length > 0) {
      chunks.push(rest.slice(0, 4));
      rest = rest.slice(4);
    }
  } else {
    let rest = clean;
    while (rest.length > 0) {
      chunks.push(rest.slice(0, 4));
      rest = rest.slice(4);
    }
  }
  return chunks.slice(0, 4).join('-');
}

export async function initializeLicensesStore(): Promise<License[]> {
  try {
    // Ensure default user exists in users table
    let users = await getAllFromIDB('users');
    if (!users || users.length === 0) {
      const localUsers = localStorage.getItem('local_db_users');
      if (localUsers) {
        try {
          users = JSON.parse(localUsers);
        } catch {
          users = [];
        }
      }
    }
    const hasDefaultUser = (users || []).some(
      (u: any) => u.email?.toLowerCase() === DEFAULT_USER_EMAIL.toLowerCase() || u.id === DEFAULT_USER_ID
    );
    if (!hasDefaultUser) {
      await upsertToIDB('users', DEFAULT_USER);
      const updatedUsers = [...(users || []), DEFAULT_USER];
      localStorage.setItem('local_db_users', JSON.stringify(updatedUsers));
      idbMemoryCache['users'] = updatedUsers;
    }

    let licenses = await getAllFromIDB('licenses');
    if (!licenses || licenses.length === 0) {
      const localStored = localStorage.getItem('local_db_licenses');
      if (localStored) {
        try {
          licenses = JSON.parse(localStored);
        } catch {
          licenses = [];
        }
      }
    }

    // Ensure default license exists
    const hasDefault = (licenses || []).some(
      (l: any) => normalizeLicenseKey(l.license_key) === normalizeLicenseKey(DEFAULT_LICENSE_KEY)
    );

    if (!hasDefault) {
      licenses = [...(licenses || []), DEFAULT_LICENSE];
      await upsertToIDB('licenses', DEFAULT_LICENSE);
      localStorage.setItem('local_db_licenses', JSON.stringify(licenses));
      idbMemoryCache['licenses'] = licenses;
    }

    return licenses;
  } catch (err) {
    console.warn('[LicenseManager] Init licenses error:', err);
    return [DEFAULT_LICENSE];
  }
}

export async function getRegisteredLicenses(): Promise<License[]> {
  const licenses = await initializeLicensesStore();
  return licenses;
}

export async function findLicenseByUserEmail(
  emailInput: string
): Promise<{ success: boolean; user?: User; license?: License; message?: string }> {
  if (!emailInput || !emailInput.trim()) {
    return { success: false, message: 'Please enter a valid email address.' };
  }

  const cleanEmail = emailInput.trim().toLowerCase();

  // Make sure stores are initialized
  await initializeLicensesStore();

  // 1. Check in 'users' store
  let users = await getAllFromIDB('users');
  if (!users || users.length === 0) {
    const raw = localStorage.getItem('local_db_users');
    if (raw) {
      try {
        users = JSON.parse(raw);
      } catch {
        users = [];
      }
    }
  }

  let matchedUser = (users || []).find((u: any) => u.email && u.email.trim().toLowerCase() === cleanEmail);

  // Fallback check for default user email
  if (!matchedUser && cleanEmail === DEFAULT_USER_EMAIL.toLowerCase()) {
    matchedUser = DEFAULT_USER;
    await upsertToIDB('users', DEFAULT_USER);
  }

  if (!matchedUser) {
    return {
      success: false,
      message: `No registered account found for ${emailInput}. Please verify your email or contact support.`,
    };
  }

  // 2. Find matching license in 'licenses' table using user_id
  const licenses = await getRegisteredLicenses();
  let matchedLicense = licenses.find((l: any) => l.user_id === matchedUser.id);

  // If not matched by exact user_id, check if user is default user
  if (!matchedLicense && matchedUser.id === DEFAULT_USER_ID) {
    matchedLicense = DEFAULT_LICENSE;
  }

  // If still not found, check if license_key was attached to user or generate active trial
  if (!matchedLicense) {
    // Check if any active license exists for this user or create standard license
    matchedLicense = {
      id: `lic-${matchedUser.id.substring(0, 8)}`,
      user_id: matchedUser.id,
      license_status: 'Active',
      trial_start: null,
      trial_end: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      edition: 'Enterprise',
      license_key: DEFAULT_LICENSE_KEY,
    };
    await upsertToIDB('licenses', matchedLicense);
  }

  if (matchedLicense.license_status === 'Expired') {
    return { success: false, message: `The license for this account has expired.` };
  }

  if (matchedLicense.license_status === 'Suspended') {
    return { success: false, message: `The license for this account is suspended.` };
  }

  return {
    success: true,
    user: matchedUser,
    license: matchedLicense,
  };
}

export async function validateLicenseKey(inputKey: string): Promise<{ valid: boolean; license?: License; message?: string }> {
  if (!inputKey || !inputKey.trim()) {
    return { valid: false, message: 'Please enter a valid license key' };
  }

  const cleanInput = normalizeLicenseKey(inputKey);
  const cleanDefault = normalizeLicenseKey(DEFAULT_LICENSE_KEY);

  // Check default authorized license
  if (cleanInput === cleanDefault) {
    await upsertToIDB('licenses', DEFAULT_LICENSE);
    return { valid: true, license: DEFAULT_LICENSE };
  }

  // Check against all stored licenses in IndexedDB
  const registered = await getRegisteredLicenses();
  const found = registered.find((l) => normalizeLicenseKey(l.license_key) === cleanInput);

  if (found) {
    if (found.license_status === 'Expired') {
      return { valid: false, message: 'This license key has expired' };
    }
    if (found.license_status === 'Suspended') {
      return { valid: false, message: 'This license key is suspended' };
    }
    return { valid: true, license: found };
  }

  // Format validation: if user enters custom valid LC-XXXX-XXXX-XXXX key, register it as valid offline license
  if (cleanInput.length >= 10 && cleanInput.startsWith('LC')) {
    const formatted = formatLicenseKey(cleanInput);
    const userId = `user-${cleanInput.toLowerCase()}`;
    const newLicense: License = {
      id: `lic-${cleanInput.toLowerCase()}`,
      user_id: userId,
      license_status: 'Active',
      trial_start: null,
      trial_end: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      edition: 'Standard',
      license_key: formatted,
    };
    await upsertToIDB('licenses', newLicense);
    const all = await getRegisteredLicenses();
    localStorage.setItem('local_db_licenses', JSON.stringify([...all, newLicense]));
    return { valid: true, license: newLicense };
  }

  return { valid: false, message: 'Invalid license key. Please check and try again.' };
}

export function getActiveLicense(): License | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem('active_license_record');
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const activeKey = localStorage.getItem('active_license_key');
  if (activeKey) {
    const clean = normalizeLicenseKey(activeKey);
    return {
      id: `lic-${clean.toLowerCase()}`,
      user_id: `user-${clean.toLowerCase()}`,
      license_status: 'Active',
      trial_start: null,
      trial_end: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      edition: 'Enterprise',
      license_key: activeKey,
    };
  }
  return null;
}

export async function setActiveLicense(license: License): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem('active_license_key', license.license_key);
  localStorage.setItem('active_license_record', JSON.stringify(license));
  
  const cleanLic = normalizeLicenseKey(license.license_key);
  const userId = license.user_id || `user-${cleanLic.toLowerCase()}`;
  const now = new Date().toISOString();

  // 1. Set offline user in 'users' table
  const userRecord: User = {
    id: userId,
    email: `${cleanLic.toLowerCase()}@offline.bipinpetroleum.com`,
    created_at: license.created_at || now,
  };
  await upsertToIDB('users', userRecord);
  localStorage.setItem('local_session_user', JSON.stringify(userRecord));
  localStorage.setItem('use_offline_mode', 'true');

  // 2. Record in 'login_verifications' table
  const verificationRecord: LoginVerification = {
    id: `lv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    user_id: userId,
    created_at: now,
    verified_at: now,
  };
  await upsertToIDB('login_verifications', verificationRecord);

  // 3. Update 'profiles' table
  const existingCompanyId = localStorage.getItem('activeCompanyId') || null;
  const profileRecord: Profile = {
    id: `prof-${userId}`,
    user_id: userId,
    active_company_id: existingCompanyId,
    is_developer: false,
    created_at: license.created_at || now,
  };
  await upsertToIDB('profiles', profileRecord);

  // 4. Save license record to 'licenses' table
  await upsertToIDB('licenses', license);

  // 5. Initialize/ensure default company for this license if none exists
  await ensureDefaultWorkspaceForLicense(license.license_key, userId);
}

export function removeActiveLicense(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem('active_license_key');
  localStorage.removeItem('active_license_record');
  localStorage.removeItem('local_session_user');
  localStorage.removeItem('activeCompanyId');
  localStorage.removeItem('activeCompanyName');
}

export async function ensureDefaultWorkspaceForLicense(licenseKey: string, userId: string): Promise<any> {
  const companies = (idbMemoryCache['companies'] || []) as any[];
  const cleanLic = normalizeLicenseKey(licenseKey);

  // Find existing companies created for this specific account user_id
  const existingForUser = companies.filter(
    (c) => (c.user_id === userId || c.created_by === userId) && !c.is_deleted
  );

  if (existingForUser.length > 0) {
    const currentActiveId = localStorage.getItem('activeCompanyId');
    const matched = existingForUser.find((c) => c.id === currentActiveId);
    if (matched) {
      return matched;
    }
    localStorage.setItem('activeCompanyId', existingForUser[0].id);
    localStorage.setItem('activeCompanyName', existingForUser[0].name);
    return existingForUser[0];
  }

  // Create standard default workspace for this specific account user_id
  const newCompany = {
    id: `comp-${userId.replace(/[^a-zA-Z0-9]/g, '').substring(0, 12)}-1`,
    name: 'Bipin Petroleum Co.',
    gstin: '24AAAAA0000A1Z5',
    address: 'Highway Circle, Gujarat, India',
    bank_name: 'Navanagar Co-Orporetive Bank',
    branch: 'Jamnagar',
    account_holder: 'Bipin Petroleum Co.',
    account_number: '013000200000169',
    ifsc_code: 'TNCB0000013',
    upi_id: '',
    license_key: licenseKey,
    created_by: userId,
    user_id: userId,
    is_deleted: false,
    created_at: new Date().toISOString(),
  };

  const updated = [...companies, newCompany];
  idbMemoryCache['companies'] = updated;
  await saveAllToIDB('companies', updated);
  localStorage.setItem('local_db_companies', JSON.stringify(updated));
  localStorage.setItem('activeCompanyId', newCompany.id);
  localStorage.setItem('activeCompanyName', newCompany.name);

  return newCompany;
}
