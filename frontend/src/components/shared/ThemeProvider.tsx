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

    // Resolve the effective appearance: 'system' follows the OS preference.
    const isDark = mode === 'dark' ||
      (mode === 'system' && typeof window !== 'undefined' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    setNextTheme(isDark ? 'dark' : 'light');

    const root = document.documentElement;
    root.classList.toggle('dark', isDark);
    root.classList.toggle('light', !isDark);
    
    // ── Primary / Brand Colors ──
    const effectivePrimary = primaryColor || '#1164A3';
    root.style.setProperty('--primary-hex', effectivePrimary);
    root.style.setProperty('--blue', effectivePrimary);
    root.style.setProperty('--sb-active-bg', effectivePrimary);
    root.style.setProperty('--blue-dark', effectivePrimary);
    root.style.setProperty('--primary', effectivePrimary);
    root.style.setProperty('--primary-foreground', '#ffffff');

    // ── Advanced Customization vs Preset Colors ──
    if (isAdvancedMode) {
      root.style.setProperty('--tb-bg', customTopbarBg, 'important');
      root.style.setProperty('--sb-bg', customSidebarBg, 'important');
      root.style.setProperty('--sb-text', customSidebarText, 'important');
      root.style.setProperty('--bg-primary', customAppBg, 'important');
      root.style.setProperty('--chat-bg', customAppBg, 'important');
    } else {
      // ── Sidebar & Topbar Colors (Presets) ──
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
      root.style.setProperty('--bg-primary', '#FFFFFF');
      root.style.setProperty('--chat-bg', '#FFFFFF');
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
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <ThemeProvider>
        {children}
      </ThemeProvider>
    </NextThemesProvider>
  );
}

