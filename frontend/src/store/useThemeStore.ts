import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { get, set, del } from 'idb-keyval';

const idbStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return (await get(name)) || null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await set(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await del(name);
  },
};

export type ThemeMode = 'light' | 'dark' | 'system';
export type ThemePreset = 'theme-slack' | 'theme-ocean' | 'theme-midnight' | 'theme-sunset';
export type FontFamily = 'inter' | 'cairo';

export interface ThemeSurfacePalette {
  appBg: string;
  surface: string;
  surfaceRaised: string;
  surfaceMuted: string;
  ink: string;
  inkMuted: string;
  line: string;
}

export interface ThemePresetData {
  labelKey: string;
  primaryColor: string;
  sidebarBg: string;
  sidebarHover: string;
  textColor: string;
  textMuted: string;
  textActive: string;
  dividerColor: string;
  light: ThemeSurfacePalette;
  dark: ThemeSurfacePalette;
}

// The controlled authored palette. Derived colors use color-mix so the product
// can support four complete themes without introducing ungoverned swatches.
const INK = '#17202B';
const PAPER = '#FBF8F1';
const PAPER_RAISED = '#FFFDF8';
const PAPER_MUTED = '#F2EEE5';
const INDIGO = '#4F46E5';
const INDIGO_STRONG = '#3730A3';
const SUCCESS = '#167A5B';
const WARNING = '#A86917';
const DANGER = '#B63A3A';
const INFO = '#35658C';
const LINE = '#DED8CC';
const WHITE = '#FFFFFF';

const lightSurfaces = (
  accent: string,
  tintAmount: number,
): ThemeSurfacePalette => ({
  appBg: `color-mix(in srgb, ${PAPER} ${100 - tintAmount}%, ${accent})`,
  surface: PAPER_RAISED,
  surfaceRaised: WHITE,
  surfaceMuted: `color-mix(in srgb, ${PAPER_MUTED} ${100 - tintAmount}%, ${accent})`,
  ink: INK,
  inkMuted: `color-mix(in srgb, ${INK} 66%, transparent)`,
  line: `color-mix(in srgb, ${LINE} ${100 - tintAmount}%, ${accent})`,
});

const darkSurfaces = (accent: string): ThemeSurfacePalette => ({
  appBg: `color-mix(in srgb, ${INK} 94%, ${accent})`,
  surface: `color-mix(in srgb, ${INK} 88%, ${PAPER})`,
  surfaceRaised: `color-mix(in srgb, ${INK} 82%, ${PAPER})`,
  surfaceMuted: `color-mix(in srgb, ${INK} 92%, ${PAPER})`,
  ink: PAPER,
  inkMuted: `color-mix(in srgb, ${PAPER} 68%, transparent)`,
  line: `color-mix(in srgb, ${PAPER} 16%, transparent)`,
});

export const THEME_PRESETS: Record<ThemePreset, ThemePresetData> = {
  'theme-slack': {
    labelKey: 'designSystem.themes.diwan',
    primaryColor: INDIGO,
    sidebarBg: INK,
    sidebarHover: `color-mix(in srgb, ${INK} 86%, ${WHITE})`,
    textColor: PAPER,
    textMuted: `color-mix(in srgb, ${PAPER} 68%, transparent)`,
    textActive: WHITE,
    dividerColor: `color-mix(in srgb, ${WHITE} 14%, transparent)`,
    light: lightSurfaces(INDIGO, 0),
    dark: darkSurfaces(INDIGO),
  },
  'theme-ocean': {
    labelKey: 'designSystem.themes.ocean',
    primaryColor: INFO,
    sidebarBg: `color-mix(in srgb, ${INK} 62%, ${INFO})`,
    sidebarHover: `color-mix(in srgb, ${INK} 48%, ${INFO})`,
    textColor: PAPER,
    textMuted: `color-mix(in srgb, ${PAPER} 68%, transparent)`,
    textActive: WHITE,
    dividerColor: `color-mix(in srgb, ${WHITE} 14%, transparent)`,
    light: lightSurfaces(INFO, 5),
    dark: darkSurfaces(INFO),
  },
  'theme-midnight': {
    labelKey: 'designSystem.themes.midnight',
    primaryColor: INDIGO,
    sidebarBg: `color-mix(in srgb, ${INK} 76%, ${INDIGO_STRONG})`,
    sidebarHover: `color-mix(in srgb, ${INK} 62%, ${INDIGO_STRONG})`,
    textColor: PAPER,
    textMuted: `color-mix(in srgb, ${PAPER} 68%, transparent)`,
    textActive: WHITE,
    dividerColor: `color-mix(in srgb, ${WHITE} 12%, transparent)`,
    light: lightSurfaces(INDIGO_STRONG, 4),
    dark: darkSurfaces(INDIGO_STRONG),
  },
  'theme-sunset': {
    labelKey: 'designSystem.themes.sunset',
    primaryColor: WARNING,
    sidebarBg: `color-mix(in srgb, ${INK} 72%, ${WARNING})`,
    sidebarHover: `color-mix(in srgb, ${INK} 58%, ${WARNING})`,
    textColor: PAPER,
    textMuted: `color-mix(in srgb, ${PAPER} 68%, transparent)`,
    textActive: WHITE,
    dividerColor: `color-mix(in srgb, ${WHITE} 14%, transparent)`,
    light: lightSurfaces(WARNING, 4),
    dark: darkSurfaces(WARNING),
  },
};

export const DESIGN_SEMANTIC_COLORS = {
  success: SUCCESS,
  warning: WARNING,
  danger: DANGER,
  info: INFO,
} as const;

interface ThemeState {
  mode: ThemeMode;
  theme: ThemePreset;
  companyName: string;
  primaryColor: string;
  sidebarBg: string;
  sidebarHover: string;
  textColor: string;
  textMuted: string;
  textActive: string;
  dividerColor: string;
  fontFamily: FontFamily | string;
  logoUrl: string | null;
  faviconUrl: string | null;

  isAdvancedMode: boolean;
  customTopbarBg: string;
  customSidebarBg: string;
  customSidebarText: string;
  customAppBg: string;

  setMode: (mode: ThemeMode) => void;
  setTheme: (theme: ThemePreset) => void;
  setCompanyName: (name: string) => void;
  setPrimaryColor: (color: string) => void;
  setSidebarBg: (color: string) => void;
  setTextColor: (color: string) => void;
  setFontFamily: (font: FontFamily | string) => void;
  setLogoUrl: (url: string | null) => void;
  setFaviconUrl: (url: string | null) => void;
  setBrandIdentity: (companyName: string, logoUrl: string | null, primaryColor?: string, fontFamily?: FontFamily | string, sidebarBg?: string, faviconUrl?: string | null) => void;
  resetBrandIdentity: () => void;

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
      companyName: 'Septimus Workspace',
      primaryColor: defaultPreset.primaryColor,
      sidebarBg: defaultPreset.sidebarBg,
      sidebarHover: defaultPreset.sidebarHover,
      textColor: defaultPreset.textColor,
      textMuted: defaultPreset.textMuted,
      textActive: defaultPreset.textActive,
      dividerColor: defaultPreset.dividerColor,
      fontFamily: 'cairo',
      logoUrl: null,
      faviconUrl: null,

      isAdvancedMode: false,
      customTopbarBg: INK,
      customSidebarBg: INK,
      customSidebarText: PAPER,
      customAppBg: PAPER,

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
      setCompanyName: (companyName) => set({ companyName }),
      setPrimaryColor: (primaryColor) => set({ primaryColor }),
      setSidebarBg: (sidebarBg) => set({ sidebarBg }),
      setTextColor: (textColor) => set({ textColor }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
      setLogoUrl: (logoUrl) => set({ logoUrl }),
      setFaviconUrl: (faviconUrl) => set({ faviconUrl }),
      setBrandIdentity: (companyName, logoUrl, primaryColor, fontFamily, sidebarBg, faviconUrl) =>
        set((state) => ({
          companyName: companyName || state.companyName,
          logoUrl: logoUrl !== undefined ? logoUrl : state.logoUrl,
          ...(faviconUrl !== undefined ? { faviconUrl } : {}),
          ...(primaryColor ? { primaryColor } : {}),
          ...(fontFamily ? { fontFamily } : {}),
          ...(sidebarBg ? { sidebarBg } : {}),
        })),
      // Wipe the WORKSPACE-specific brand (name/logo/favicon/colors) back to
      // defaults — call on logout so the next account that signs in on this
      // device never inherits the previous workspace's identity. Device-level
      // preferences (mode, theme, fontFamily) are intentionally preserved.
      resetBrandIdentity: () =>
        set((state) => {
          const preset = THEME_PRESETS[state.theme];
          return {
          companyName: 'Septimus Workspace',
          logoUrl: null,
          faviconUrl: null,
          primaryColor: preset.primaryColor,
          sidebarBg: preset.sidebarBg,
          sidebarHover: preset.sidebarHover,
          textColor: preset.textColor,
          textMuted: preset.textMuted,
          textActive: preset.textActive,
          dividerColor: preset.dividerColor,
          customTopbarBg: preset.sidebarBg,
          customSidebarBg: preset.sidebarBg,
          customSidebarText: preset.textColor,
          customAppBg: preset.light.appBg,
          };
        }),

      setIsAdvancedMode: (isAdvancedMode) => set({ isAdvancedMode }),
      setCustomTopbarBg: (customTopbarBg) => set({ customTopbarBg }),
      setCustomSidebarBg: (customSidebarBg) => set({ customSidebarBg }),
      setCustomSidebarText: (customSidebarText) => set({ customSidebarText }),
      setCustomAppBg: (customAppBg) => set({ customAppBg }),
    }),
    {
      name: 'septimus-theme-storage',
      storage: createJSONStorage(() => idbStorage),
      version: 2,
      migrate: (persistedState) => {
        const state = persistedState as Partial<ThemeState>;
        const theme = state.theme && state.theme in THEME_PRESETS
          ? state.theme
          : 'theme-slack';
        const preset = THEME_PRESETS[theme];
        return {
          ...state,
          theme,
          primaryColor: state.primaryColor || preset.primaryColor,
          sidebarBg: state.sidebarBg || preset.sidebarBg,
          sidebarHover: preset.sidebarHover,
          textColor: preset.textColor,
          textMuted: preset.textMuted,
          textActive: preset.textActive,
          dividerColor: preset.dividerColor,
          customTopbarBg: state.customTopbarBg || preset.sidebarBg,
          customSidebarBg: state.customSidebarBg || preset.sidebarBg,
          customSidebarText: state.customSidebarText || preset.textColor,
          customAppBg: state.customAppBg || preset.light.appBg,
        };
      },
    }
  )
);
