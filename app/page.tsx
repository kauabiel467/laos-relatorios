import { Suspense } from "react";
import { DashboardApp } from "@/components/dashboard/dashboard-app";

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg" />}>
      <DashboardApp />
    </Suspense>
  );
}
