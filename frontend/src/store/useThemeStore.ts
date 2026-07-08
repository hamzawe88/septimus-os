import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ThemePreset = 'theme-slack' | 'theme-ocean' | 'theme-midnight' | 'theme-sunset';
export type FontFamily = 'inter' | 'cairo';

interface ThemePresetData {
  primaryColor: string;
  sidebarBg: string;
  sidebarHover: string;
  textColor: string;
  textMuted: string;
  textActive: string;
  dividerColor: string;
}

export const THEME_PRESETS: Record<ThemePreset, ThemePresetData> = {
  'theme-slack': {
    primaryColor: '#1164A3',
    sidebarBg: '#3F0E40',
    sidebarHover: '#350D36',
    textColor: '#D1D2D3',
    textMuted: '#ABABAD',
    textActive: '#FFFFFF',
    dividerColor: 'rgba(255,255,255,0.1)',
  },
  'theme-ocean': {
    primaryColor: '#0369a1',
    sidebarBg: '#0c4a6e',
    sidebarHover: '#0a3d5c',
    textColor: '#bae6fd',
    textMuted: '#7dd3fc',
    textActive: '#FFFFFF',
    dividerColor: 'rgba(255,255,255,0.1)',
  },
  'theme-midnight': {
    primaryColor: '#6366f1',
    sidebarBg: '#1e1b4b',
    sidebarHover: '#1a1740',
    textColor: '#c7d2fe',
    textMuted: '#a5b4fc',
    textActive: '#FFFFFF',
    dividerColor: 'rgba(255,255,255,0.08)',
  },
  'theme-sunset': {
    primaryColor: '#ea580c',
    sidebarBg: '#431407',
    sidebarHover: '#3a1106',
    textColor: '#fed7aa',
    textMuted: '#fdba74',
    textActive: '#FFFFFF',
    dividerColor: 'rgba(255,255,255,0.1)',
  },
};

interface ThemeState {
  mode: ThemeMode;
  theme: ThemePreset;
  primaryColor: string;
  sidebarBg: string;
  sidebarHover: string;
  textColor: string;
  textMuted: string;
  textActive: string;
  dividerColor: string;
  fontFamily: FontFamily;
  logoUrl: string | null;

  isAdvancedMode: boolean;
  customTopbarBg: string;
  customSidebarBg: string;
  customSidebarText: string;
  customAppBg: string;

  setMode: (mode: ThemeMode) => void;
  setTheme: (theme: ThemePreset) => void;
  setPrimaryColor: (color: string) => void;
  setSidebarBg: (color: string) => void;
  setTextColor: (color: string) => void;
  setFontFamily: (font: FontFamily) => void;
  setLogoUrl: (url: string | null) => void;

  setIsAdvancedMode: (advanced: boolean) => void;
  setCustomTopbarBg: (bg: string) => void;
  setCustomSidebarBg: (bg: string) => void;
  setCustomSidebarText: (color: string) => void;
  setCustomAppBg: (bg: string) => void;
}

const defaultPreset = THEME_PRESETS['theme-slack'];

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'light',
      theme: 'theme-slack',
      primaryColor: defaultPreset.primaryColor,
      sidebarBg: defaultPreset.sidebarBg,
      sidebarHover: defaultPreset.sidebarHover,
      textColor: defaultPreset.textColor,
      textMuted: defaultPreset.textMuted,
      textActive: defaultPreset.textActive,
      dividerColor: defaultPreset.dividerColor,
      fontFamily: 'cairo',
      logoUrl: null,

      isAdvancedMode: false,
      customTopbarBg: '#3F0E40',
      customSidebarBg: '#3F0E40',
      customSidebarText: '#D1D2D3',
      customAppBg: '#F8F8F8',

      setMode: (mode) => set({ mode }),
      setTheme: (theme) => {
        const p = THEME_PRESETS[theme];
        set({
          theme,
          primaryColor: p.primaryColor,
          sidebarBg: p.sidebarBg,
          sidebarHover: p.sidebarHover,
          textColor: p.textColor,
          textMuted: p.textMuted,
          textActive: p.textActive,
          dividerColor: p.dividerColor,
        });
      },
      setPrimaryColor: (primaryColor) => set({ primaryColor }),
      setSidebarBg: (sidebarBg) => set({ sidebarBg }),
      setTextColor: (textColor) => set({ textColor }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
      setLogoUrl: (logoUrl) => set({ logoUrl }),

      setIsAdvancedMode: (isAdvancedMode) => set({ isAdvancedMode }),
      setCustomTopbarBg: (customTopbarBg) => set({ customTopbarBg }),
      setCustomSidebarBg: (customSidebarBg) => set({ customSidebarBg }),
      setCustomSidebarText: (customSidebarText) => set({ customSidebarText }),
      setCustomAppBg: (customAppBg) => set({ customAppBg }),
    }),
    {
      name: 'septimus-theme-storage',
    }
  )
);

