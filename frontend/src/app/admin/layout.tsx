import { ReactNode } from "react";
import TopBar from "@/components/layout/TopBar";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col h-screen w-full bg-[#f8fafc] ">
      <TopBar />
      <div className="flex-1 overflow-auto p-8">
        {children}
      </div>
    </div>
  );
}
