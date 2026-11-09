
/**
 * User Activity Tracking System
 * 
 * This module tracks user activity and manages "active"/"inactive" status.
 * It uses localStorage for persistence as requested for simplicity.
 */

export type UserStatus = 'active' | 'inactive';

export interface UserActivity {
  userId: string;
  email: string;
  lastActivityAt: number;
  status: UserStatus;
}

const STORAGE_KEY = 'user_activity_data';
const INACTIVITY_THRESHOLD_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Get all tracked users from storage
 */
export const getAllUserActivity = (): Record<string, UserActivity> => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch (e) {
    console.error('Error reading activity data', e);
    return {};
  }
};

/**
 * Save user activity data to storage
 */
const saveAllUserActivity = (data: Record<string, UserActivity>) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Error saving activity data', e);
  }
};

/**
 * Update the last activity timestamp for a user
 */
export const recordActivity = (userId: string, email: string) => {
  if (!userId) return;

  const users = getAllUserActivity();
  const now = Date.now();

  users[userId] = {
    userId,
    email,
    lastActivityAt: now,
    status: 'active' // Performing an action always makes the user active
  };

  saveAllUserActivity(users);
};

/**
 * Check if a user should be marked as inactive based on the 7-day rule
 */
export const processInactivity = () => {
  const users = getAllUserActivity();
  const now = Date.now();
  let changed = false;

  Object.keys(users).forEach(userId => {
    const user = users[userId];
    const daysSinceActivity = (now - user.lastActivityAt) / MS_PER_DAY;

    if (daysSinceActivity >= INACTIVITY_THRESHOLD_DAYS && user.status === 'active') {
      user.status = 'inactive';
      changed = true;
    }
  });

  if (changed) {
    saveAllUserActivity(users);
  }
};

/**
 * Get specific user activity
 */
export const getUserActivity = (userId: string): UserActivity | null => {
  const users = getAllUserActivity();
  return users[userId] || null;
};

/**
 * Returns true if a warning should be shown (inactive status)
 */
export const shouldShowInactivityWarning = (userId: string): boolean => {
  const user = getUserActivity(userId);
  return user ? user.status === 'inactive' : false;
};
