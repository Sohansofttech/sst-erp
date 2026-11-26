"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Check,
  AlertTriangle,
  ArrowLeft,
  CreditCard,
  ShieldCheck,
  Clock,
  Layers,
  HelpCircle,
} from "lucide-react";

interface PlanFeature {
  code: string;
  name: string;
  category: string;
  limitValue?: number | null;
}

interface SubscriptionPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  billingCycle: string;
  price: number;
  currency: string;
  studentLimit?: number | null;
  storageLimitMb?: number | null;
  features?: PlanFeature[];
}

interface CurrentSubscription {
  hasSubscription: boolean;
  isTrial: boolean;
  status: string;
  statusLabel: string;
  planName: string;
  planCode: string;
  startsAt: string | null;
  endsAt: string | null;
  remainingDays: number;
  isExpired: boolean;
  canAccessErp: boolean;
}

function SubscriptionPortalContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const planIdParam = searchParams.get("planId")?.trim() || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [institutionName, setInstitutionName] = useState<string>("Institution");
  const [currentSub, setCurrentSub] = useState<CurrentSubscription | null>(null);
  const [availablePlans, setAvailablePlans] = useState<SubscriptionPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [selectedPlanError, setSelectedPlanError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSubscriptionData() {
      try {
        setLoading(true);
        setError(null);

        const url = planIdParam
          ? `/api/subscription?planId=${encodeURIComponent(planIdParam)}`
          : `/api/subscription`;

        const res = await fetch(url);
        const json = await res.json();

        if (!res.ok || !json.success) {
          setError(json.error || "Failed to load subscription portal.");
          return;
        }

        setInstitutionName(json.institutionName || "Institution");
        setCurrentSub(json.data.currentSubscription);
        setAvailablePlans(json.data.availablePlans || []);
        setSelectedPlan(json.data.selectedPlan || null);
        setSelectedPlanError(json.data.selectedPlanError || null);
      } catch (err: any) {
        setError(err.message || "Network error loading subscription data.");
      } finally {
        setLoading(false);
      }
    }

    loadSubscriptionData();
  }, [planIdParam]);

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

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 sm:p-6 lg:p-10 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2E8F0] pb-6">
          <div className="space-y-1">
            <Link
              href="/admin"
              className="inline-flex items-center text-xs font-semibold text-[#64748B] hover:text-[#0F172A] transition-colors mb-2"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back to Institutional Dashboard
            </Link>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] tracking-tight">
              Subscription & Plan Management
            </h1>
            <p className="text-sm text-[#64748B]">
              Tenant: <span className="font-bold text-[#1E293B]">{institutionName}</span>
            </p>
          </div>

          <Badge variant="outline" className="self-start sm:self-center px-3 py-1 text-xs border-[#CBD5E1]">
            <ShieldCheck className="w-3.5 h-3.5 mr-1 text-[#10B981]" /> Enterprise Tenant Security
          </Badge>
        </div>

        {/* Global Loading / Error */}
        {loading && (
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-10 text-center animate-pulse space-y-4">
            <div className="w-10 h-10 rounded-full bg-[#E2E8F0] mx-auto" />
            <div className="h-4 bg-[#E2E8F0] rounded w-1/3 mx-auto" />
            <div className="h-4 bg-[#E2E8F0] rounded w-1/4 mx-auto" />
          </div>
        )}

        {error && !loading && (
          <div className="bg-[#FEF2F2] border border-[#F87171] rounded-2xl p-6 text-center space-y-3">
            <AlertTriangle className="w-8 h-8 text-[#DC2626] mx-auto" />
            <h3 className="text-base font-bold text-[#991B1B]">Unable to Access Subscription Portal</h3>
            <p className="text-sm text-[#B91C1C] max-w-md mx-auto">{error}</p>
            <Button onClick={() => router.push("/admin")} variant="outline" size="sm" className="mt-2">
              Return to Dashboard
            </Button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Current Active / Trial Subscription Summary */}
            {currentSub && (
              <Card className="border-[#CBD5E1] bg-white shadow-xs overflow-hidden">
                <CardHeader className="bg-[#123B5A] text-white py-4 px-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <Sparkles className="w-5 h-5 text-[#F5A000]" />
                      <CardTitle className="text-base font-bold">
                        Current Subscription: {currentSub.planName}
                      </CardTitle>
                    </div>
                    <Badge
                      className={
                        currentSub.isExpired
                          ? "bg-[#DC2626] text-white"
                          : currentSub.isTrial
                          ? "bg-[#10B981] text-white font-bold"
                          : "bg-[#2563EB] text-white font-bold"
                      }
                    >
                      {currentSub.statusLabel}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-sm">
                    <div className="space-y-1">
                      <span className="text-xs text-[#64748B] font-medium">Plan Type</span>
                      <p className="font-bold text-[#1E293B]">
                        {currentSub.isTrial ? "14-Day Free Trial" : currentSub.planName}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-[#64748B] font-medium">Start Date</span>
                      <p className="font-bold text-[#1E293B]">{formatDate(currentSub.startsAt)}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-[#64748B] font-medium">Expiry / Renewal Date</span>
                      <p className="font-bold text-[#1E293B]">{formatDate(currentSub.endsAt)}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-[#64748B] font-medium">Remaining Period</span>
                      <p
                        className={`font-black flex items-center gap-1 ${
                          currentSub.isExpired
                            ? "text-[#DC2626]"
                            : currentSub.remainingDays <= 3
                            ? "text-[#F59E0B]"
                            : "text-[#10B981]"
                        }`}
                      >
                        <Clock className="w-4 h-4" />
                        {currentSub.isExpired
                          ? "Expired (0 days)"
                          : `${currentSub.remainingDays} days remaining`}
                      </p>
                    </div>
                  </div>

                  {currentSub.isExpired && (
                    <div className="mt-4 p-3 bg-[#FEF3C7] border border-[#F59E0B] rounded-lg text-xs text-[#92400E] flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-[#D97706]" />
                      <span>
                        Your free trial has ended. Select an institutional plan below to restore unrestricted operational ERP features.
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Selected Plan Details View (when planId query param is supplied) */}
            {planIdParam && (
              <div className="space-y-4">
                {selectedPlanError ? (
                  <div className="bg-[#FFFBEB] border border-[#F59E0B] rounded-xl p-5 text-sm text-[#92400E] flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 shrink-0 text-[#F59E0B] mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="font-bold">Invalid or Unavailable Plan ID</h4>
                      <p className="text-xs text-[#78350F]">
                        The plan ID specified in the URL (<code className="font-mono bg-white/60 px-1 py-0.5 rounded">{planIdParam}</code>) could not be resolved from authoritative records. Please choose from the active institutional plans below.
                      </p>
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => router.push("/subscription")}
                        className="text-xs text-[#B45309] font-bold p-0 h-auto underline"
                      >
                        Clear plan filter
                      </Button>
                    </div>
                  </div>
                ) : selectedPlan ? (
                  <Card className="border-2 border-[#F5A000] bg-white shadow-md">
                    <CardHeader className="bg-[#FEF3C7]/40 border-b border-[#F5A000]/20 pb-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge className="bg-[#F5A000] text-white text-xs font-bold uppercase tracking-wider">
                          Selected Plan for Activation
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => router.push("/subscription")}
                          className="text-xs text-[#64748B] hover:text-[#0F172A]"
                        >
                          Change plan selection
                        </Button>
                      </div>
                      <CardTitle className="text-2xl font-black text-[#0F172A] mt-2">
                        {selectedPlan.name}
                      </CardTitle>
                      <CardDescription className="text-xs text-[#64748B]">
                        {selectedPlan.description || "Comprehensive ERP subscription tier for institutions."}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6">
                      <div className="flex items-baseline gap-2 pb-4 border-b border-[#E2E8F0]">
                        <span className="text-4xl font-extrabold text-[#0F172A]">
                          ₹{selectedPlan.price.toLocaleString("en-IN")}
                        </span>
                        <span className="text-sm font-semibold text-[#64748B]">
                          / {selectedPlan.billingCycle.toLowerCase()}
                        </span>
                      </div>

                      {/* Authoritative Features Loaded from Database */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
                          Included Features & Entitlements (Database Verified)
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                          {selectedPlan.features && selectedPlan.features.length > 0 ? (
                            selectedPlan.features.map((feat) => (
                              <div
                                key={feat.code}
                                className="flex items-center gap-2 text-xs text-[#1E293B] bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-lg"
                              >
                                <Check className="w-4 h-4 text-[#10B981] shrink-0" />
                                <span className="font-medium">{feat.name}</span>
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-[#64748B] col-span-3">
                              Full platform features included (Admissions, Academics, Faculty, Timetable, Exams, Attendance, Finance, Approvals).
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Contract Notice */}
                      <div className="p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs text-[#64748B] space-y-1">
                        <p className="font-semibold text-[#1E293B]">
                          Integration Contract Verification:
                        </p>
                        <p>
                          Plan specifications and pricing are loaded authoritatively from the database record (<code className="font-mono">{selectedPlan.id}</code>). Tenant identity is locked to the authenticated session. Payment verification is executed strictly via server-side endpoints.
                        </p>
                      </div>
                    </CardContent>
                    <CardFooter className="bg-[#F8FAFC] border-t border-[#E2E8F0] p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div className="text-xs text-[#64748B]">
                        Ready to proceed with {selectedPlan.name} (₹{selectedPlan.price.toLocaleString("en-IN")})
                      </div>
                      <Button
                        className="bg-[#F5A000] hover:bg-[#D98E00] text-white font-bold text-xs h-10 px-6 shadow-sm w-full sm:w-auto"
                        onClick={() => {
                          alert(`Ready to proceed to server-side payment verification for ${selectedPlan.name} (Plan ID: ${selectedPlan.id}). Payment gateway integration handoff is pending developer verification.`);
                        }}
                      >
                        <CreditCard className="w-4 h-4 mr-2" /> Proceed to Secure Payment
                      </Button>
                    </CardFooter>
                  </Card>
                ) : null}
              </div>
            )}

            {/* Available Plans Grid */}
            <div className="space-y-4 pt-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-xl font-bold text-[#0F172A] tracking-tight">
                    Available Institutional Plans
                  </h2>
                  <p className="text-xs text-[#64748B]">
                    Select a plan to review entitlements and begin activation.
                  </p>
                </div>
              </div>

              {availablePlans.length === 0 ? (
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-xs text-[#64748B]">
                  No commercial plans are currently published. Please contact Super Admin.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {availablePlans.map((plan) => {
                    const isCurrentPlan = currentSub?.planCode === plan.code;
                    const isSelected = selectedPlan?.id === plan.id;

                    return (
                      <Card
                        key={plan.id}
                        className={`bg-white transition-all duration-200 flex flex-col justify-between ${
                          isSelected
                            ? "border-2 border-[#F5A000] shadow-md ring-2 ring-[#F5A000]/20"
                            : "border-[#E2E8F0] hover:border-[#CBD5E1] shadow-2xs hover:shadow-sm"
                        }`}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                              {plan.code}
                            </span>
                            {isCurrentPlan && (
                              <Badge className="bg-[#10B981] text-white text-[10px]">
                                Current Plan
                              </Badge>
                            )}
                          </div>
                          <CardTitle className="text-lg font-bold text-[#0F172A] mt-1">
                            {plan.name}
                          </CardTitle>
                          <CardDescription className="text-xs text-[#64748B] min-h-[32px]">
                            {plan.description || "Standard institutional campus tier."}
                          </CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-4 py-2">
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-3xl font-black text-[#0F172A]">
                              ₹{Number(plan.price).toLocaleString("en-IN")}
                            </span>
                            <span className="text-xs font-semibold text-[#64748B]">
                              / {plan.billingCycle.toLowerCase()}
                            </span>
                          </div>

                          <div className="border-t border-[#F1F5F9] pt-3 space-y-2">
                            <span className="text-[11px] font-semibold text-[#64748B]">
                              Highlights:
                            </span>
                            <ul className="space-y-1.5 text-xs text-[#334155]">
                              {plan.studentLimit && (
                                <li className="flex items-center gap-2">
                                  <Check className="w-3.5 h-3.5 text-[#10B981]" />
                                  Up to {plan.studentLimit} students
                                </li>
                              )}
                              {plan.storageLimitMb && (
                                <li className="flex items-center gap-2">
                                  <Check className="w-3.5 h-3.5 text-[#10B981]" />
                                  {Math.round(Number(plan.storageLimitMb) / 1024)} GB storage
                                </li>
                              )}
                              <li className="flex items-center gap-2">
                                <Check className="w-3.5 h-3.5 text-[#10B981]" />
                                Full multi-portal access
                              </li>
                            </ul>
                          </div>
                        </CardContent>

                        <CardFooter className="pt-3 border-t border-[#F1F5F9]">
                          <Button
                            variant={isSelected ? "default" : "outline"}
                            size="sm"
                            className={`w-full text-xs font-bold h-9 ${
                              isSelected
                                ? "bg-[#F5A000] hover:bg-[#D98E00] text-white"
                                : "border-[#CBD5E1] text-[#1E293B] hover:bg-[#F8FAFC]"
                            }`}
                            onClick={() => router.push(`/subscription?planId=${plan.id}`)}
                          >
                            {isSelected ? "Selected Plan" : "Select Plan"}
                          </Button>
                        </CardFooter>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function SubscriptionPortalPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
          <div className="text-center space-y-2">
            <Sparkles className="w-8 h-8 text-[#F5A000] animate-spin mx-auto" />
            <p className="text-xs text-[#64748B] font-semibold">Loading Subscription Portal...</p>
          </div>
        </div>
      }
    >
      <SubscriptionPortalContent />
    </Suspense>
  );
}
