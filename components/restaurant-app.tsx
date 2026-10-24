"use client";
import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { RestaurantStoreProvider } from "@/lib/restaurant-store";
import { AppRouter } from "./app-router";

export default function RestaurantApp() {
  const [mounted, setMounted] = useState(false);
  // The local demo store is browser-only; wait for hydration before rendering it.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  if (!mounted) return <main className="app-page min-h-screen" aria-busy="true" />;
  return <RestaurantStoreProvider><AppRouter /><Toaster position="top-center" richColors /></RestaurantStoreProvider>;
}
