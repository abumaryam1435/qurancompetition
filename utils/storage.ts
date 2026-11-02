/**
 * Safe Storage utility to protect Safari on iOS against QuotaExceededError
 * in Private Browsing mode.
 */

export const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      return window.localStorage.getItem(key);
    } catch (e) {
      console.warn(`[SafeStorage] Failed to get item ${key}:`, e);
      return null;
    }
  },

  setItem: (key: string, value: string): void => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(key, value);
    } catch (e) {
      console.warn(`[SafeStorage] Failed to set item ${key} (Safari Private Browsing quota?):`, e);
    }
  },

  removeItem: (key: string): void => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.removeItem(key);
    } catch (e) {
      console.warn(`[SafeStorage] Failed to remove item ${key}:`, e);
    }
  }
};
