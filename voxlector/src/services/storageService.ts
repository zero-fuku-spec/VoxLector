// ============================================================
// VoxLector AI — Storage Service
// Capacitor Preferences with localStorage fallback
// ============================================================

const isNative = () => typeof (window as any).Capacitor !== 'undefined';

export const storageService = {
  async set(key: string, value: unknown): Promise<void> {
    const serialized = JSON.stringify(value);
    if (isNative()) {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.set({ key, value: serialized });
    } else {
      localStorage.setItem(`vox_${key}`, serialized);
    }
  },

  async get<T>(key: string, defaultValue: T): Promise<T> {
    try {
      let raw: string | null = null;
      if (isNative()) {
        const { Preferences } = await import('@capacitor/preferences');
        const result = await Preferences.get({ key });
        raw = result.value;
      } else {
        raw = localStorage.getItem(`vox_${key}`);
      }
      if (raw === null) return defaultValue;
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
  },

  async remove(key: string): Promise<void> {
    if (isNative()) {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.remove({ key });
    } else {
      localStorage.removeItem(`vox_${key}`);
    }
  },

  async clear(): Promise<void> {
    if (isNative()) {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.clear();
    } else {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('vox_'));
      keys.forEach(k => localStorage.removeItem(k));
    }
  },

  // ── API Keys: stored separately (more sensitive) ──────────
  async setApiKey(provider: string, key: string): Promise<void> {
    // Encrypt basic obfuscation before storing (real encryption needs native plugin)
    const encoded = btoa(unescape(encodeURIComponent(key)));
    await storageService.set(`apikey_${provider}`, encoded);
  },

  async getApiKey(provider: string): Promise<string> {
    const encoded = await storageService.get<string>(`apikey_${provider}`, '');
    if (!encoded) return '';
    try {
      return decodeURIComponent(escape(atob(encoded)));
    } catch {
      return '';
    }
  },
};
