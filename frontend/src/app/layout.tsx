import type { Metadata } from "next";
import { headers } from "next/headers";
import "@fontsource-variable/inter";
import "@fontsource-variable/cairo";
import "./globals.css";
import { AppThemeProvider } from "@/components/shared/ThemeProvider";
import GlobalModals from "@/components/GlobalModals";
import { LocalizationProvider } from "@/contexts/LocalizationContext";
import { EntitlementsProvider } from "@/contexts/EntitlementsContext";
import AuthNavigationBridge from "@/components/shared/AuthNavigationBridge";

// A per-request CSP nonce cannot be embedded in statically generated HTML.
// Force request-time rendering so Next.js can apply the nonce supplied by the
// proxy to every framework script and style tag.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Septimus Company OS",
  description: "Advanced Enterprise OS",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") || undefined;
  return (
    <html
      lang="ar"
      dir="rtl"
      suppressHydrationWarning
      className="antialiased"
    >
      <body className="h-screen w-screen overflow-hidden">
        <LocalizationProvider>
          <AppThemeProvider nonce={nonce}>
            <EntitlementsProvider>
              <AuthNavigationBridge />
              {children}
              <GlobalModals />
            </EntitlementsProvider>
          </AppThemeProvider>
        </LocalizationProvider>
      </body>
    </html>
  );
}
