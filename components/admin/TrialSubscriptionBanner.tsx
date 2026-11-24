"use client";

import React from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Clock,
  Calendar,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  CreditCard,
} from "lucide-react";

export interface TrialSubscriptionData {
  hasSubscription: boolean;
  isTrial: boolean;
  status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "EXPIRED" | "CANCELED" | "SUSPENDED" | "NONE";
  statusLabel: string;
  planName: string;
  planCode: string;
  planPrice?: number;
  currency?: string;
  startsAt: string | null;
  endsAt: string | null;
  remainingDays: number;
  isExpired: boolean;
  canAccessErp: boolean;
  availablePlans?: Array<{
    id: string;
    code: string;
    name: string;
    price: number;
    currency: string;
    billingCycle: string;
  }>;
}

interface TrialSubscriptionBannerProps {
  subscription?: TrialSubscriptionData | null;
  loading?: boolean;
}

export const TrialSubscriptionBanner: React.FC<TrialSubscriptionBannerProps> = ({
  subscription,
  loading = false,
}) => {
  if (loading) {
    return (
      <div className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 animate-pulse">
        <div className="h-4 bg-[#E2E8F0] rounded w-1/4 mb-2"></div>
        <div className="h-6 bg-[#CBD5E1] rounded w-1/2"></div>
      </div>
    );
  }

  // If no subscription record, safe fallback
  if (!subscription || !subscription.hasSubscription) {
    return null;
  }

  // Format dates safely
  const formatDate = (isoString: string | null) => {
    if (!isoString) return "N/A";
    try {
      return new Date(isoString).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return isoString;
    }
  };

  const startDateFormatted = formatDate(subscription.startsAt);
  const expiryDateFormatted = formatDate(subscription.endsAt);

  // 1. EXPIRED TRIAL BANNER
  if (subscription.isExpired || subscription.status === "EXPIRED") {
    return (
      <Card className="border-[#F59E0B] bg-gradient-to-r from-[#FFFBEB] via-[#FEF3C7] to-[#FFFBEB] shadow-sm">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-[#F59E0B] text-white flex items-center justify-center shrink-0 shadow-xs">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-bold text-[#92400E]">
                    14-Day Free Trial Has Expired
                  </h3>
                  <Badge variant="destructive" className="bg-[#DC2626] text-white text-[10px] font-semibold">
                    Restricted Mode
                  </Badge>
                  <span className="text-xs text-[#B45309] font-medium">
                    (Expired on {expiryDateFormatted})
                  </span>
                </div>
                <p className="text-xs text-[#78350F] max-w-2xl leading-relaxed">
                  Your complimentary 14-day institutional trial has ended. Standard operational ERP mutations are temporarily restricted. Your historical data, academic records, and student rosters remain 100% secure.
                </p>
                <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px] text-[#92400E]">
                  <span><strong>Start Date:</strong> {startDateFormatted}</span>
                  <span>•</span>
                  <span><strong>Expiry Date:</strong> {expiryDateFormatted}</span>
                  <span>•</span>
                  <span><strong>Remaining Days:</strong> 0 days</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-end md:self-center">
              <Link href="/subscription">
                <Button className="bg-[#F5A000] hover:bg-[#D98E00] text-white font-bold text-xs h-9 px-4 shadow-sm">
                  <CreditCard className="w-4 h-4 mr-1.5" /> Upgrade / Activate Subscription
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 2. ACTIVE FREE TRIAL BANNER
  if (subscription.isTrial || subscription.status === "TRIALING") {
    const isUrgent = subscription.remainingDays <= 3;

    return (
      <Card className="border-[#123B5A]/20 bg-gradient-to-r from-[#123B5A] via-[#16466C] to-[#123B5A] text-white shadow-sm overflow-hidden">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-white/10 text-[#F5A000] flex items-center justify-center shrink-0 border border-white/10">
                <Sparkles className="w-5 h-5" />
              </div>

              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-bold text-white tracking-tight">
                    Current Subscription: {subscription.planName || "Free Trial"}
                  </h3>
                  <Badge className="bg-[#10B981] hover:bg-[#059669] text-white text-[10px] font-bold px-2 py-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-white mr-1.5 animate-pulse" />
                    Trial Active
                  </Badge>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${isUrgent ? "bg-[#EF4444] text-white" : "bg-[#F5A000]/30 text-[#FCD34D] border border-[#F5A000]/40"}`}>
                    <Clock className="w-3 h-3 inline mr-1" />
                    {subscription.remainingDays} {subscription.remainingDays === 1 ? "day" : "days"} remaining
                  </span>
                </div>

                <p className="text-xs text-[#94A3B8] max-w-2xl leading-relaxed">
                  Complimentary 14-day institutional trial active with full ERP operational access across academics, admissions, attendance, and campus management.
                </p>

                <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px] text-[#CBD5E1]">
                  <span><strong className="text-white">Trial Started:</strong> {startDateFormatted}</span>
                  <span>•</span>
                  <span><strong className="text-white">Trial Expiry:</strong> {expiryDateFormatted}</span>
                  <span>•</span>
                  <span><strong className="text-white">Status:</strong> {subscription.statusLabel || "Free Trial"}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start lg:self-center">
              <Link href="/subscription">
                <Button className="bg-[#F5A000] hover:bg-[#D98E00] text-white font-bold text-xs h-9 px-4 shadow-sm">
                  View Subscription & Upgrade <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 3. STANDARD PAID ACTIVE SUBSCRIPTION
  return (
    <Card className="border-[#E2E8F0] bg-[#F8FAFC] shadow-2xs">
      <CardContent className="p-3.5 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-[#10B981]" />
            <span className="font-semibold text-[#1E293B]">
              Active Plan: <strong>{subscription.planName}</strong>
            </span>
            <Badge variant="outline" className="text-[#10B981] border-[#10B981] text-[10px]">
              {subscription.statusLabel}
            </Badge>
          </div>
          <Link href="/subscription" className="text-[#F5A000] hover:underline font-semibold flex items-center gap-1">
            Manage Subscription <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
};
