"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { AUTH_UNAUTHORIZED_EVENT } from "@/lib/apiClient";

export default function AuthNavigationBridge() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const handleUnauthorized = () => {
      if (pathname !== "/") {
        router.replace("/");
      }
      router.refresh();
    };

    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => {
      window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, [pathname, router]);

  return null;
}
