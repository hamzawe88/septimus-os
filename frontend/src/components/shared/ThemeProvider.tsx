'use client';

import { useEffect, useState } from 'react';
import {
  DESIGN_SEMANTIC_COLORS,
  THEME_PRESETS,
  useThemeStore,
} from '@/store/useThemeStore';
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const {
    theme: colorTheme,
    primaryColor, sidebarBg, sidebarHover,
    textColor, textMuted, textActive, dividerColor, fontFamily,
    isAdvancedMode, customTopbarBg, customSidebarBg, customSidebarText, customAppBg,
    companyName, logoUrl, faviconUrl
  } = useThemeStore();
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    const preset = THEME_PRESETS[colorTheme];
    const surfaces = resolvedTheme === 'dark' ? preset.dark : preset.light;
    const effectivePrimary = primaryColor || preset.primaryColor;

    // Brand and semantic colors.
    root.style.setProperty('--primary-hex', effectivePrimary);
    root.style.setProperty('--blue', effectivePrimary);
    root.style.setProperty('--sb-active-bg', effectivePrimary);
    root.style.setProperty('--blue-dark', effectivePrimary);
    root.style.setProperty('--primary', effectivePrimary);
    root.style.setProperty('--ring', effectivePrimary);
    root.style.setProperty('--success', DESIGN_SEMANTIC_COLORS.success);
    root.style.setProperty('--warning', DESIGN_SEMANTIC_COLORS.warning);
    root.style.setProperty('--destructive', DESIGN_SEMANTIC_COLORS.danger);
    root.style.setProperty('--info', DESIGN_SEMANTIC_COLORS.info);

    // A preset owns the whole application canvas, not navigation alone.
    root.style.setProperty('--background', surfaces.appBg);
    root.style.setProperty('--foreground', surfaces.ink);
    root.style.setProperty('--card', surfaces.surface);
    root.style.setProperty('--card-foreground', surfaces.ink);
    root.style.setProperty('--popover', surfaces.surfaceRaised);
    root.style.setProperty('--popover-foreground', surfaces.ink);
    root.style.setProperty('--muted', surfaces.surfaceMuted);
    root.style.setProperty('--muted-foreground', surfaces.inkMuted);
    root.style.setProperty('--secondary', surfaces.surfaceMuted);
    root.style.setProperty('--secondary-foreground', surfaces.ink);
    root.style.setProperty('--accent', surfaces.surfaceMuted);
    root.style.setProperty('--accent-foreground', surfaces.ink);
    root.style.setProperty('--border', surfaces.line);
    root.style.setProperty('--input', surfaces.line);
    root.style.setProperty('--bg-primary', surfaces.appBg);
    root.style.setProperty('--bg-secondary', surfaces.surfaceMuted);
    root.style.setProperty('--chat-bg', surfaces.surface);
    root.style.setProperty('--chat-hover-bg', surfaces.surfaceMuted);
    root.style.setProperty('--chat-text', surfaces.ink);
    root.style.setProperty('--text-primary', surfaces.ink);
    root.style.setProperty('--text-secondary', surfaces.inkMuted);
    root.style.setProperty('--border-color', surfaces.line);
    root.style.setProperty('--border-strong', surfaces.line);

    if (isAdvancedMode) {
      root.style.setProperty('--tb-bg', customTopbarBg);
      root.style.setProperty('--sb-bg', customSidebarBg);
      root.style.setProperty('--sb-text', customSidebarText);
      root.style.setProperty('--background', customAppBg);
      root.style.setProperty('--bg-primary', customAppBg);
    } else {
      root.style.setProperty('--sb-bg', sidebarBg || preset.sidebarBg);
      root.style.setProperty('--tb-bg', sidebarBg || preset.sidebarBg);
      root.style.setProperty('--sb-hover', sidebarHover || preset.sidebarHover);
      root.style.setProperty('--sb-text', textColor || preset.textColor);
      root.style.setProperty('--sb-text-muted', textMuted || preset.textMuted);
      root.style.setProperty('--sb-text-active', textActive || preset.textActive);
      root.style.setProperty('--tb-text', textActive || preset.textActive);
      root.style.setProperty('--sb-divider', dividerColor || preset.dividerColor);
    }

    const fontValue = fontFamily === 'cairo'
      ? 'var(--font-cairo), -apple-system, BlinkMacSystemFont, sans-serif'
      : 'var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif';
    root.style.setProperty('--font-sans', fontValue);
    root.style.fontFamily = fontValue;

  }, [
    colorTheme,
    primaryColor, sidebarBg, sidebarHover, textColor, textMuted, textActive,
    dividerColor, fontFamily, mounted, resolvedTheme,
    isAdvancedMode, customTopbarBg, customSidebarBg, customSidebarText, customAppBg
  ]);

  useEffect(() => {
    if (!mounted || typeof document === 'undefined') return;

    if (companyName) {
      document.title = `${companyName} | Septimus OS`;
    }

    const targetFavicon = faviconUrl || logoUrl || '/favicon.ico';
    
    let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = targetFavicon;

    let shortcutLink = document.querySelector("link[rel='shortcut icon']") as HTMLLinkElement | null;
    if (!shortcutLink) {
      shortcutLink = document.createElement('link');
      shortcutLink.rel = 'shortcut icon';
      document.head.appendChild(shortcutLink);
    }
    shortcutLink.href = targetFavicon;
  }, [faviconUrl, logoUrl, companyName, mounted]);

  if (!mounted) {
    return <>{children}</>;
  }

  return <>{children}</>;
}

export function AppThemeProvider({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  return (
    <NextThemesProvider nonce={nonce} attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <ThemeProvider>
        {children}
      </ThemeProvider>
    </NextThemesProvider>
  );
}
