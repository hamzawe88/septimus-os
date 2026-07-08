'use client';

import { useEffect, useState } from 'react';
import { useThemeStore } from '@/store/useThemeStore';
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const {
    mode, primaryColor, sidebarBg, sidebarHover,
    textColor, textMuted, textActive, dividerColor, fontFamily,
    isAdvancedMode, customTopbarBg, customSidebarBg, customSidebarText, customAppBg
  } = useThemeStore();
  const [mounted, setMounted] = useState(false);
  const { setTheme: setNextTheme, resolvedTheme } = useTheme();
    useEffect(() => {
     
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    // Sync Zustand mode with next-themes mode
    setNextTheme(mode);

    const root = document.documentElement;
    
    // ── Primary / Brand Colors ──
    if (primaryColor) {
      root.style.setProperty('--primary-hex', primaryColor);
      root.style.setProperty('--blue', primaryColor);
      root.style.setProperty('--sb-active-bg', primaryColor);
      root.style.setProperty('--blue-dark', primaryColor);
    }

    // ── Advanced Customization vs Preset Colors ──
    if (isAdvancedMode) {
      root.style.setProperty('--tb-bg', customTopbarBg, 'important');
      root.style.setProperty('--sb-bg', customSidebarBg, 'important');
      root.style.setProperty('--sb-text', customSidebarText, 'important');
      root.style.setProperty('--bg-primary', customAppBg, 'important');
      root.style.setProperty('--chat-bg', customAppBg, 'important');
    } else {
      // ── Sidebar & Topbar Colors (Presets) ──
      if (mode === 'dark' || resolvedTheme === 'dark') {
        root.style.removeProperty('--sb-bg');
        root.style.removeProperty('--tb-bg');
        root.style.removeProperty('--sb-hover');
        root.style.removeProperty('--sb-text');
        root.style.removeProperty('--sb-text-muted');
        root.style.removeProperty('--sb-text-active');
        root.style.removeProperty('--sb-divider');
        root.style.removeProperty('--bg-primary');
        root.style.removeProperty('--chat-bg');
      } else {
        if (sidebarBg) {
          root.style.setProperty('--sb-bg', sidebarBg);
          root.style.setProperty('--tb-bg', sidebarBg);
        }
        if (sidebarHover) {
          root.style.setProperty('--sb-hover', sidebarHover);
        }
        if (textColor) {
          root.style.setProperty('--sb-text', textColor);
        }
        if (textMuted) {
          root.style.setProperty('--sb-text-muted', textMuted);
        }
        if (textActive) {
          root.style.setProperty('--sb-text-active', textActive);
        }
        if (dividerColor) {
          root.style.setProperty('--sb-divider', dividerColor);
        }
      }
    }

    // ── Font Family ──
    const fontValue = fontFamily === 'cairo'
      ? 'var(--font-cairo), -apple-system, BlinkMacSystemFont, sans-serif'
      : 'var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif';
    root.style.setProperty('--font-sans', fontValue);
    root.style.fontFamily = fontValue;

  }, [
    mode, primaryColor, sidebarBg, sidebarHover, textColor, textMuted, textActive, 
    dividerColor, fontFamily, mounted, setNextTheme, resolvedTheme,
    isAdvancedMode, customTopbarBg, customSidebarBg, customSidebarText, customAppBg
  ]);
  
  if (!mounted) {
    return <>{children}</>;
  }

  return <>{children}</>;
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ThemeProvider>
        {children}
      </ThemeProvider>
    </NextThemesProvider>
  );
}

