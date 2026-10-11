"use client";

import { Toaster } from "sonner";
import { useTheme } from "@/hooks/use-theme";

export function Notifications() {
  const { dark } = useTheme();
  return (
    <Toaster
      theme={dark ? "dark" : "light"}
      position="bottom-right"
      closeButton
      richColors
      offset={24}
      mobileOffset={{ bottom: 20, left: 16, right: 16 }}
      toastOptions={{
        duration: 3500,
        style: { fontFamily: "var(--font-sans)", borderRadius: 12 },
      }}
    />
  );
}
