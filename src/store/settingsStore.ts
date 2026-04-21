import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getUserSettings, updateUserSettings, type UserSettings } from '@/lib/firebase/settings';
import { addPendingOp } from '@/lib/cache/indexedDB';
import { toast } from 'sonner';

function queueSettingsOffline(partial: Partial<UserSettings>) {
  const id = crypto.randomUUID();
  addPendingOp({ id, type: 'updateSettings', args: [partial], createdAt: Date.now() }).then(() => {
    window.dispatchEvent(new Event('pending-ops-changed'));
  }).catch((err) => {
    console.error('[settings] CRITICAL: Failed to queue offline settings:', err);
    toast.error('Failed to save settings locally', { duration: 5000 });
  });
  if (!navigator.onLine) {
    toast.info('Settings saved locally — will sync when online', { id: 'offline-settings' });
  }
}

interface SettingsState extends UserSettings {
  isLoading: boolean;
  error: string | null;
  fetchSettings: () => Promise<void>;
  updateHotkey: (key: string, value: string) => Promise<void>;
  setTheme: (theme: UserSettings['theme']) => Promise<void>;
  setCanvasTheme: (theme: string) => Promise<void>;
  setHybridEditorEnabled: (enabled: boolean) => Promise<void>;
}

const DEFAULT_HOTKEYS: Record<string, string> = {
  undo: 'mod+z',
  redo: 'mod+shift+z',
  copy: 'mod+c',
  paste: 'mod+v',
  selectAll: 'mod+a',
  fitView: 'mod+shift+h',
  resetZoom: 'mod+0',
  toggleMinimap: 'm',
  search: 'mod+p',
  toggleSidebar: 'mod+b',
  newNote: 'n',
  newV2Note: 'mod+n',
  toggleZenMode: 'z',
  toggleFocusMode: 'f',
  toggleDrawingMode: 'd',
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      hotkeys: DEFAULT_HOTKEYS,
      theme: 'system',
      canvasTheme: 'dots',
      enableHybridEditor: true,
      isLoading: false,
      error: null,
      _syncTimer: null as ReturnType<typeof setTimeout> | null,

      fetchSettings: async () => {
        set({ isLoading: true, error: null });
        try {
          const settings = await getUserSettings();
          set({ ...settings, isLoading: false });
        } catch (err) {
          set({ error: (err as Error).message, isLoading: false });
        }
      },

      _queueSync: (partial: Partial<UserSettings>) => {
        const { _syncTimer } = get() as any;
        if (_syncTimer) clearTimeout(_syncTimer);
        
        const timer = setTimeout(async () => {
          try {
            const currentSettings = get();
            const syncData: Partial<UserSettings> = {};
            if (partial.hotkeys) syncData.hotkeys = currentSettings.hotkeys;
            if (partial.theme) syncData.theme = currentSettings.theme;
            if (partial.canvasTheme) syncData.canvasTheme = currentSettings.canvasTheme;
            if (partial.enableHybridEditor !== undefined) syncData.enableHybridEditor = currentSettings.enableHybridEditor;
            
            await updateUserSettings(syncData);
          } catch {
            queueSettingsOffline(partial);
          }
        }, 1000);
        set({ _syncTimer: timer } as any);
      },

      updateHotkey: async (key, value) => {
        const nextHotkeys = { ...get().hotkeys, [key]: value };
        set({ hotkeys: nextHotkeys });
        (get() as any)._queueSync({ hotkeys: nextHotkeys });
      },

      setTheme: async (theme) => {
        set({ theme });
        (get() as any)._queueSync({ theme });
      },

      setCanvasTheme: async (canvasTheme) => {
        set({ canvasTheme });
        (get() as any)._queueSync({ canvasTheme });
      },

      setHybridEditorEnabled: async (enabled) => {
        set({ enableHybridEditor: enabled });
        (get() as any)._queueSync({ enableHybridEditor: enabled });
      },
    }),
    {
      name: 'ctxnote-settings',
      partialize: (state) => ({
        hotkeys: state.hotkeys,
        theme: state.theme,
        canvasTheme: state.canvasTheme,
        enableHybridEditor: state.enableHybridEditor,
      }),
    }
  )
);
