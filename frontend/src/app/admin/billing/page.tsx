import React from "react";
import BillingDashboard from "@/components/billing/BillingDashboard";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Subscription & Quotas | Septimus OS Admin",
  description: "Manage tenant subscriptions, feature tiers, quota usage, and Stripe billing invoices.",
};

export default function AdminBillingPage() {
  return (
    <div className="min-h-full bg-gray-950 text-white rounded-2xl p-6 border border-white/10 shadow-xl">
      <BillingDashboard />
    </div>
  );
}
