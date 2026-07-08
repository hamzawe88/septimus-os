import type { Metadata } from "next";
import { Inter, Cairo } from "next/font/google";
import "./globals.css";
import { AppThemeProvider } from "@/components/shared/ThemeProvider";
import GlobalModals from "@/components/GlobalModals";
import { LocalizationProvider } from "@/contexts/LocalizationContext";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["latin", "arabic"],
});

export const metadata: Metadata = {
  title: "Septimus Company OS",
  description: "Advanced Enterprise OS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${cairo.variable} antialiased`}
    >
      <body className="h-screen w-screen overflow-hidden">
        <LocalizationProvider>
          <AppThemeProvider>
            {children}
            <GlobalModals />
          </AppThemeProvider>
        </LocalizationProvider>
      </body>
    </html>
  );
}
