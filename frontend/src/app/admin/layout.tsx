import { ReactNode } from "react";
import TopBar from "@/components/layout/TopBar";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh w-full flex-col bg-background text-foreground">
      <TopBar />
      <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
        {children}
      </div>
    </div>
  );
}
