"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Mail,
  Send,
  Eye,
  CheckCircle2,
  AlertCircle,
  X,
  Users,
  KeyRound,
  Megaphone,
  Search,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { useInstitution } from "@/lib/store";

export type EmailTargetRole = "ALL" | "STUDENT" | "TEACHER" | "PARENT" | "STAFF";

export interface PreselectedRecipient {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface EmailDispatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialType?: "DIRECT" | "ANNOUNCEMENT" | "INVITATION";
  initialRole?: EmailTargetRole;
  allowedRoles?: EmailTargetRole[];
  lockRole?: boolean;
  preselectedRecipients?: PreselectedRecipient[];
  onSuccess?: () => void;
}

interface RecipientOption {
  id: string;
  email: string;
  name: string;
  role: string;
  identifier?: string;
  department?: string;
  designation?: string;
  invitationStatus?: "ACTIVE" | "PENDING_SETUP" | "DISABLED";
  hasPassword?: boolean;
}

export const EmailDispatchModal: React.FC<EmailDispatchModalProps> = ({
  isOpen,
  onClose,
  initialType = "DIRECT",
  initialRole = "ALL",
  allowedRoles,
  lockRole = false,
  preselectedRecipients = [],
  onSuccess,
}) => {
  const { profile } = useInstitution();
  const institutionName = profile?.name || "Campus Administration";

  // Mode & Content States (Strictly independent variables)
  const [emailType, setEmailType] = useState<"DIRECT" | "ANNOUNCEMENT" | "INVITATION">(initialType);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("ACADEMIC");
  const [ccInput, setCcInput] = useState("");

  // Recipient Directory State (Strictly independent variables)
  const [roleFilter, setRoleFilter] = useState<string>(
    initialType === "INVITATION" ? "STUDENT" : initialRole || "ALL"
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [recipientsList, setRecipientsList] = useState<RecipientOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loadingDirectory, setLoadingDirectory] = useState(false);
  const recipientCache = useRef<Map<string, RecipientOption>>(new Map());

  // Preview & Dispatch States
  const [previewMode, setPreviewMode] = useState(false);
  const [previewData, setPreviewData] = useState<{ subject: string; html: string; text: string } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deliveryResult, setDeliveryResult] = useState<{
    dispatchedCount: number;
    failedCount: number;
    transportMode?: "resend" | "smtp" | "ethereal" | "simulated" | "unconfigured";
    previewUrl?: string;
    message: string;
    results?: Array<{ id: string; email: string; success: boolean; error?: string }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Active email provider status
  const [providerStatus, setProviderStatus] = useState<{
    mode: string;
    configured: boolean;
    from?: string;
    senderDomain?: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetch("/api/admin/email?action=status")
        .then((r) => r.json())
        .then((j) => {
          if (j?.success && j.data) {
            setProviderStatus(j.data);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  // Sync roleFilter when modal opens or initialRole changes
  useEffect(() => {
    if (initialType === "INVITATION") {
      setRoleFilter("STUDENT");
    } else if (initialRole) {
      setRoleFilter(initialRole);
    }
  }, [initialRole, initialType, isOpen]);

  // Sync preselected recipients on mount or prop update
  useEffect(() => {
    if (preselectedRecipients.length > 0) {
      preselectedRecipients.forEach((p) => {
        recipientCache.current.set(p.id, {
          id: p.id,
          name: p.name,
          email: p.email,
          role: p.role,
        });
      });
      setSelectedIds(preselectedRecipients.map((r) => r.id));
    }
  }, [preselectedRecipients]);

  // When switching modes, enforce student-only for Credential Setup Link, or release for Direct/Announcement
  const handleEmailTypeChange = (newType: "DIRECT" | "ANNOUNCEMENT" | "INVITATION") => {
    setEmailType(newType);
    setPreviewMode(false);
    setError(null);
    if (newType === "INVITATION") {
      setRoleFilter("STUDENT");
      // Prune non-students from selected recipients in Credential Setup mode
      setSelectedIds((prev) =>
        prev.filter((id) => {
          const r = recipientCache.current.get(id);
          return r ? r.role === "STUDENT" : false;
        })
      );
    }
  };

  // Effective role filter: Credential Setup Link is strictly restricted to STUDENT accounts
  const effectiveRole = emailType === "INVITATION" ? "STUDENT" : roleFilter;

  // Fetch institution recipients directory (searchQuery strictly filters directory without altering subject)
  useEffect(() => {
    if (!isOpen) return;
    setLoadingDirectory(true);
    fetch(`/api/admin/email?action=recipients&role=${effectiveRole}&q=${encodeURIComponent(searchQuery)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          data.data.forEach((r: RecipientOption) => {
            recipientCache.current.set(r.id, r);
          });
          setRecipientsList(data.data);
        }
      })
      .catch((err) => console.error("Failed to load recipients:", err))
      .finally(() => setLoadingDirectory(false));
  }, [isOpen, effectiveRole, searchQuery]);

  // Role Options without redundant "Students Only" chips
  const roleOptions: Array<{ value: EmailTargetRole; label: string }> = [
    { value: "ALL", label: "All Roles" },
    { value: "STUDENT", label: "Students" },
    { value: "TEACHER", label: "Faculty" },
    { value: "PARENT", label: "Guardians" },
    { value: "STAFF", label: "Staff" },
  ];

  const getRoleLabel = (val: string) => {
    switch (val) {
      case "STUDENT":
        return "Students";
      case "TEACHER":
        return "Faculty";
      case "PARENT":
        return "Guardians";
      case "STAFF":
        return "Staff";
      case "ALL":
        return "All Roles";
      default:
        return val;
    }
  };

  const selectedRecipients = useMemo(() => {
    return selectedIds
      .map((id) => recipientCache.current.get(id))
      .filter((r): r is RecipientOption => Boolean(r));
  }, [selectedIds]);

  // CC Parsing & Validation (allows external recipients, prevents duplicate with To)
  const ccAnalysis = useMemo(() => {
    if (!ccInput.trim()) {
      return { valid: [] as string[], invalid: [] as string[], duplicatesWithTo: [] as string[] };
    }
    const tokens = ccInput
      .split(/[,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const toEmailSet = new Set(
      selectedRecipients.map((r) => r.email?.trim().toLowerCase()).filter(Boolean)
    );

    const valid: string[] = [];
    const invalid: string[] = [];
    const duplicatesWithTo: string[] = [];
    const seen = new Set<string>();

    for (const token of tokens) {
      if (!emailRegex.test(token)) {
        invalid.push(token);
      } else if (toEmailSet.has(token)) {
        duplicatesWithTo.push(token);
      } else if (!seen.has(token)) {
        seen.add(token);
        valid.push(token);
      }
    }
    return { valid, invalid, duplicatesWithTo };
  }, [ccInput, selectedRecipients]);

  const filteredIds = useMemo(() => recipientsList.map((r) => r.id), [recipientsList]);

  const isAllFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));

  // Toggle selection for all currently filtered directory results
  const toggleSelectAll = () => {
    if (filteredIds.length === 0) return;
    if (isAllFilteredSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const toggleRecipient = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const missingEmailRecipients = selectedRecipients.filter(
    (r) => !r.email || !r.email.trim()
  );
  const hasMissingEmail = missingEmailRecipients.length > 0;

  const searchPlaceholder =
    effectiveRole === "STUDENT"
      ? "Search student name, email, roll number, or admission number..."
      : effectiveRole === "TEACHER"
      ? "Search faculty name, email, employee ID, or department..."
      : effectiveRole === "PARENT"
      ? "Search guardian name, email, phone, or linked student..."
      : "Search name, email, roll number, employee ID, or department...";

  // Preview Generation
  const handleFetchPreview = async () => {
    try {
      setLoadingPreview(true);
      setError(null);
      const firstSelected = selectedRecipients[0];
      const previewRole = firstSelected?.role || effectiveRole;
      const previewName = firstSelected?.name || "Sample Recipient";

      const defaultSubject =
        emailType === "INVITATION"
          ? `Welcome to ${institutionName} — Set Up Your Student Portal Access`
          : "Campus Notification";

      const params = new URLSearchParams({
        action: "preview",
        type: emailType,
        title: title || defaultSubject,
        message:
          message ||
          (emailType === "INVITATION"
            ? "Your campus administrator has invited you to set up your official portal credentials."
            : "Your message will appear here."),
        category,
        role: previewRole,
        recipientName: previewName,
      });

      const res = await fetch(`/api/admin/email?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setPreviewData(data.data);
        setPreviewMode(true);
      } else {
        setError(data.error || "Failed to generate preview.");
      }
    } catch {
      setError("Failed to fetch preview.");
    } finally {
      setLoadingPreview(false);
    }
  };

  // Dispatch Handler
  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.length === 0) {
      setError("Please select at least one recipient.");
      return;
    }
    if (hasMissingEmail) {
      setError(
        `Email address missing for: ${missingEmailRecipients
          .map((r) => r.name || r.id)
          .join(", ")}. Please update their profile before sending.`
      );
      return;
    }

    // Direct / Announcement requires Subject and Message
    if (emailType !== "INVITATION" && (!title.trim() || !message.trim())) {
      setError("Please provide both an email subject and message body.");
      return;
    }

    // CC Validation for Direct / Announcement
    let validCcList: string[] = [];
    if (emailType !== "INVITATION" && ccInput.trim()) {
      if (ccAnalysis.invalid.length > 0) {
        setError(`Invalid CC email address format: ${ccAnalysis.invalid.join(", ")}`);
        return;
      }
      if (ccAnalysis.duplicatesWithTo.length > 0) {
        setError(
          `Duplicate recipient detected: ${ccAnalysis.duplicatesWithTo.join(
            ", "
          )} is already in the primary To recipient list. Please remove from CC.`
        );
        return;
      }
      validCcList = ccAnalysis.valid;
    }

    try {
      setSubmitting(true);
      setError(null);
      setDeliveryResult(null);

      const action =
        emailType === "ANNOUNCEMENT"
          ? "SEND_ANNOUNCEMENT"
          : emailType === "INVITATION"
          ? "SEND_INVITATION"
          : "SEND_DIRECT";

      const res = await fetch("/api/admin/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          recipientIds: selectedIds,
          title: title || (emailType === "INVITATION" ? "Portal Access Invitation" : ""),
          message: message || (emailType === "INVITATION" ? "Automated Invitation" : ""),
          category,
          cc: validCcList.length > 0 ? validCcList : undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setDeliveryResult({
          dispatchedCount: data.dispatchedCount,
          failedCount: data.failedCount,
          transportMode: data.transportMode,
          previewUrl: data.previewUrl,
          message: data.message,
          results: data.results,
        });
        if (onSuccess) onSuccess();
      } else {
        setError(data.error || "Failed to dispatch emails.");
      }
    } catch {
      setError("Network error while dispatching emails.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-[#E2E8F0] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#123B5A] text-white flex items-center justify-between border-b border-[#F5A000]/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-white/10 text-[#F5A000]">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Campus Email Dispatcher</h3>
                {providerStatus?.mode === "resend" ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#DCFCE7] text-[#15803D]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A] animate-pulse" />
                    Resend Live
                  </span>
                ) : providerStatus?.mode === "smtp" ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#DCFCE7] text-[#15803D]">
                    SMTP Live
                  </span>
                ) : providerStatus?.mode === "ethereal" ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FEF3C7] text-[#B45309]">
                    Ethereal Demo
                  </span>
                ) : providerStatus && !providerStatus.configured ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FEF2F2] text-[#DC2626]">
                    Unconfigured
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-white/70">
                {institutionName} &bull; Communication & Credential Onboarding
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Delivery Result Success Card */}
        {deliveryResult ? (
          <div className="p-8 text-center space-y-4 my-auto">
            <CheckCircle2 className="w-14 h-14 text-[#16A34A] mx-auto animate-in zoom-in" />
            <h4 className="text-lg font-bold text-[#0F172A]">Email Dispatch Complete!</h4>
            <p className="text-sm text-[#475569] max-w-md mx-auto">{deliveryResult.message}</p>

            {/* Transport Mode Badge */}
            <div className="flex justify-center">
              {deliveryResult.transportMode === "resend" ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#DCFCE7] text-[#15803D] border border-[#86EFAC]">
                  <span className="w-2 h-2 rounded-full bg-[#16A34A] animate-pulse" />
                  Live Resend Delivery (Provider Accepted — Dispatched to authentic inbox)
                </div>
              ) : deliveryResult.transportMode === "smtp" ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#DCFCE7] text-[#15803D] border border-[#86EFAC]">
                  <span className="w-2 h-2 rounded-full bg-[#16A34A] animate-pulse" />
                  Live SMTP Delivery Mode (Sent to authentic inbox)
                </div>
              ) : deliveryResult.transportMode === "ethereal" ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]">
                  <span className="w-2 h-2 rounded-full bg-[#F59E0B]" />
                  Ethereal Demonstration Mode (Test Preview Only)
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#F1F5F9] text-[#475569] border border-[#CBD5E1]">
                  Local Sandbox Mode
                </div>
              )}
            </div>

            {deliveryResult.previewUrl && (
              <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl p-4 max-w-md mx-auto text-left">
                <div className="text-xs font-bold text-[#1D4ED8] mb-1 flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Ethereal Demonstration Preview Link:
                </div>
                <a
                  href={deliveryResult.previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#2563EB] hover:underline font-mono break-all inline-block mt-1"
                >
                  {deliveryResult.previewUrl}
                </a>
                <p className="text-[11px] text-[#64748B] mt-2">
                  Development note: In Ethereal mode, messages are captured in a virtual demonstration inbox. Click above to view the rendered HTML and verify delivery formatting.
                </p>
              </div>
            )}

            {/* Failed Recipients & Retry Option */}
            {deliveryResult.failedCount > 0 && (
              <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-xl p-4 max-w-md mx-auto text-left space-y-2">
                <div className="text-xs font-bold text-[#B91C1C] flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-[#DC2626]" />
                  {deliveryResult.failedCount} Failed Delivery Attempt(s):
                </div>
                <ul className="text-xs text-[#DC2626] list-disc list-inside space-y-1">
                  {deliveryResult.results
                    ?.filter((r) => !r.success)
                    .map((r) => (
                      <li key={r.id} className="truncate">
                        <span className="font-semibold">{r.email}</span>: {r.error || "Failed to dispatch"}
                      </li>
                    ))}
                </ul>
              </div>
            )}

            <div className="pt-4 flex justify-center gap-3">
              {deliveryResult.failedCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const failedIds =
                      deliveryResult.results?.filter((r) => !r.success).map((r) => r.id) || [];
                    setSelectedIds(failedIds);
                    setDeliveryResult(null);
                    setError(null);
                  }}
                  className="px-5 py-2.5 rounded-lg border border-[#DC2626] text-[#DC2626] text-sm font-semibold hover:bg-[#FEF2F2] transition cursor-pointer"
                >
                  Retry Failed ({deliveryResult.failedCount})
                </button>
              )}
              <button
                onClick={onClose}
                className="px-6 py-2.5 rounded-lg bg-[#123B5A] text-white text-sm font-semibold hover:bg-[#0F2F48] transition cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Email Type Tabs */}
            <div className="grid grid-cols-3 gap-2 bg-[#F1F5F9] p-1.5 rounded-xl border border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => handleEmailTypeChange("DIRECT")}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  emailType === "DIRECT"
                    ? "bg-white text-[#123B5A] shadow-xs"
                    : "text-[#64748B] hover:text-[#0F172A]"
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                Direct Email
              </button>
              <button
                type="button"
                onClick={() => handleEmailTypeChange("ANNOUNCEMENT")}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  emailType === "ANNOUNCEMENT"
                    ? "bg-white text-[#123B5A] shadow-xs"
                    : "text-[#64748B] hover:text-[#0F172A]"
                }`}
              >
                <Megaphone className="w-3.5 h-3.5" />
                Announcement Notice
              </button>
              <button
                type="button"
                onClick={() => handleEmailTypeChange("INVITATION")}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  emailType === "INVITATION"
                    ? "bg-white text-[#123B5A] shadow-xs"
                    : "text-[#64748B] hover:text-[#0F172A]"
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                Credential Setup Link
              </button>
            </div>

            {error && (
              <div className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] p-3 text-xs text-[#B91C1C] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {hasMissingEmail && (
              <div className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] p-3 text-xs text-[#B91C1C] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-[#DC2626] mt-0.5" />
                <div>
                  <span className="font-bold">Email address missing: </span>
                  {missingEmailRecipients.map((r) => r.name || r.id).join(", ")} does not have a registered email address. Please update profile before sending.
                </div>
              </div>
            )}

            {/* Recipient Selection Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-[#334155] flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-[#F5A000]" />
                  Recipients ({selectedIds.length} selected)
                </label>
                <div className="flex items-center gap-2">
                  {!lockRole && (allowedRoles?.length ?? 0) > 1 && (!initialRole || initialRole === "ALL") && emailType !== "INVITATION" && (
                    <select
                      value={roleFilter}
                      onChange={(e) => {
                        setRoleFilter(e.target.value);
                      }}
                      className="text-xs px-2.5 py-1 rounded-lg border border-[#CBD5E1] bg-white text-[#334155] cursor-pointer"
                    >
                      {roleOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}

                  {filteredIds.length > 0 && (
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="text-xs text-[#123B5A] font-semibold hover:underline cursor-pointer"
                    >
                      {isAllFilteredSelected
                        ? `Deselect All Filtered (${filteredIds.length})`
                        : `Select All Filtered (${filteredIds.length})`}
                    </button>
                  )}
                </div>
              </div>

              {/* Recipient Search Filter: Updates only searchQuery, never changes or populates subject */}
              <div className="relative">
                <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder={searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-[#CBD5E1] focus:outline-none focus:ring-1 focus:ring-[#123B5A]"
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-[#64748B] px-1">
                <span>
                  Showing {recipientsList.length} recipient{recipientsList.length === 1 ? "" : "s"}
                </span>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="text-[#2563EB] hover:underline"
                  >
                    Clear Search
                  </button>
                )}
              </div>

              {/* Recipient List Box */}
              <div className="max-h-40 overflow-y-auto border border-[#E2E8F0] rounded-xl divide-y divide-[#F1F5F9] bg-[#F8FAFC]">
                {loadingDirectory ? (
                  <div className="p-6 text-center text-xs text-[#64748B] flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-[#123B5A]" />
                    <span>Loading directory recipients...</span>
                  </div>
                ) : recipientsList.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <Users className="w-8 h-8 text-[#94A3B8] mx-auto" />
                    <p className="text-xs font-semibold text-[#334155]">
                      No matching recipients found in this institution
                    </p>
                    <p className="text-[11px] text-[#64748B]">
                      {searchQuery
                        ? `No recipients match "${searchQuery}".`
                        : "No active recipients found."}
                    </p>
                  </div>
                ) : (
                  recipientsList.map((rec) => (
                    <label
                      key={rec.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-white cursor-pointer transition text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(rec.id)}
                        onChange={() => toggleRecipient(rec.id)}
                        className="rounded border-[#CBD5E1] text-[#123B5A] focus:ring-[#123B5A]"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#0F172A] truncate">{rec.name}</span>
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#E2E8F0] text-[#334155]">
                            {rec.role}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-[#64748B] mt-0.5">
                          <span className="font-mono text-[11px] truncate">{rec.email}</span>
                          {rec.identifier && (
                            <>
                              <span className="text-[#CBD5E1]">&bull;</span>
                              <span className="text-[11px] text-[#475569] truncate font-medium">
                                {rec.identifier}
                              </span>
                            </>
                          )}
                          {rec.department && (
                            <>
                              <span className="text-[#CBD5E1]">&bull;</span>
                              <span className="text-[11px] text-[#475569] truncate">
                                {rec.department}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>

            {/* CC Recipients Section (Direct Email & Announcement Notice Only) */}
            {emailType !== "INVITATION" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#334155] flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-[#64748B]" />
                    CC Recipients (Optional)
                  </label>
                  <span className="text-[11px] text-[#64748B]">
                    External emails supported &bull; Separate with comma or semicolon
                  </span>
                </div>
                <input
                  type="text"
                  placeholder="e.g. dean@external-edu.org, registrar@sst-erp.edu"
                  value={ccInput}
                  onChange={(e) => {
                    setCcInput(e.target.value);
                    if (error) setError(null);
                  }}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[#CBD5E1] text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-[#123B5A]"
                />

                {/* Inline CC Validation Feedback */}
                {ccInput.trim() && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                    {ccAnalysis.valid.map((email) => (
                      <span
                        key={email}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#E2E8F0] text-[#334155] font-mono text-[10px]"
                      >
                        CC: {email}
                      </span>
                    ))}
                    {ccAnalysis.invalid.map((inv) => (
                      <span
                        key={inv}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FEE2E2] text-[#B91C1C] font-mono text-[10px]"
                      >
                        Invalid format: {inv}
                      </span>
                    ))}
                    {ccAnalysis.duplicatesWithTo.map((dup) => (
                      <span
                        key={dup}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E] font-mono text-[10px]"
                      >
                        Duplicate of To: {dup}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Email Content Inputs (Only for Direct & Announcement) */}
            {emailType !== "INVITATION" && (
              <div className="space-y-4">
                {emailType === "ANNOUNCEMENT" && (
                  <div>
                    <label className="block text-xs font-semibold text-[#334155] uppercase tracking-wider mb-1">
                      Notice Category
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-[#CBD5E1] bg-white text-[#0F172A]"
                    >
                      <option value="ACADEMIC">Academic</option>
                      <option value="EXAMINATION">Examination</option>
                      <option value="FEE">Fee Notice</option>
                      <option value="EVENT">Campus Event</option>
                      <option value="GENERAL">General Notice</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-[#334155] uppercase tracking-wider mb-1">
                    {emailType === "ANNOUNCEMENT" ? "Announcement Subject / Title" : "Email Subject"}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Schedule for Upcoming Semester Examinations"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#CBD5E1] text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-[#123B5A]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#334155] uppercase tracking-wider mb-1">
                    Message Body
                  </label>
                  <textarea
                    rows={4}
                    required
                    placeholder="Enter the official communication message to be delivered to recipients..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#CBD5E1] text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-[#123B5A] leading-relaxed"
                  />
                </div>
              </div>
            )}

            {/* Credential Setup Link Mode: Individual summary for each selected student */}
            {emailType === "INVITATION" && (
              <div className="space-y-4">
                <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl p-4 text-xs text-[#1E3A8A] leading-relaxed">
                  <div className="font-bold mb-1 flex items-center gap-1.5 text-[#1D4ED8]">
                    <KeyRound className="w-4 h-4 text-[#2563EB]" />
                    Cryptographically Signed Credential Onboarding &bull; {institutionName}
                  </div>
                  <span>
                    This workflow generates an expiring, 24-hour single-use setup link for each selected student.
                    <strong> Plaintext passwords are never generated, displayed, or emailed. </strong>
                    Students receive their official login URL and securely configure their own password upon first click.
                  </span>
                </div>

                {selectedRecipients.length === 0 ? (
                  <div className="border border-dashed border-[#CBD5E1] rounded-xl p-6 text-center text-xs text-[#64748B]">
                    Please select at least one student from the directory above to review credential setup details.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-[#334155] px-1">
                      <span>
                        Invitation Summaries ({selectedRecipients.length} Student{selectedRecipients.length === 1 ? "" : "s"} Selected)
                      </span>
                      <span className="text-[11px] font-normal text-[#64748B]">
                        Single-use link valid for 24 hours
                      </span>
                    </div>

                    <div className="max-h-60 overflow-y-auto space-y-3 pr-1">
                      {selectedRecipients.map((st) => {
                        const loginUrl =
                          typeof window !== "undefined"
                            ? `${window.location.origin}/login`
                            : "https://sst-erp.edu/login";
                        const setupPreviewUrl =
                          typeof window !== "undefined"
                            ? `${window.location.origin}/auth/setup-password?token=...`
                            : "https://sst-erp.edu/auth/setup-password?token=...";

                        const statusBadge =
                          st.invitationStatus === "ACTIVE"
                            ? { label: "Active Portal", variant: "bg-[#DCFCE7] text-[#15803D]" }
                            : st.invitationStatus === "DISABLED"
                            ? { label: "Account Disabled", variant: "bg-[#FEE2E2] text-[#B91C1C]" }
                            : { label: "Pending Setup", variant: "bg-[#FEF3C7] text-[#92400E]" };

                        return (
                          <div
                            key={st.id}
                            className="border border-[#CBD5E1] rounded-xl p-3.5 bg-[#F8FAFC] space-y-2.5 shadow-xs"
                          >
                            <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-[#0F172A] text-xs">
                                  {st.name || "Student"}
                                </span>
                                {st.identifier && (
                                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#E2E8F0] text-[#334155]">
                                    {st.identifier}
                                  </span>
                                )}
                              </div>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadge.variant}`}
                              >
                                {statusBadge.label}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-[#64748B] block text-[10px] font-medium uppercase tracking-wider">
                                  Registered Email
                                </span>
                                <span
                                  className={`font-mono text-[11px] ${
                                    !st.email ? "text-[#DC2626] font-bold" : "text-[#0F172A]"
                                  }`}
                                >
                                  {st.email || "Missing Email"}
                                </span>
                              </div>

                              <div>
                                <span className="text-[#64748B] block text-[10px] font-medium uppercase tracking-wider">
                                  Username / Login ID
                                </span>
                                <span className="font-mono text-[11px] text-[#0F172A]">
                                  {st.email || "—"}
                                </span>
                              </div>

                              <div>
                                <span className="text-[#64748B] block text-[10px] font-medium uppercase tracking-wider">
                                  Portal Destination & Login URL
                                </span>
                                <span className="text-[11px] text-[#1E293B]">
                                  Student Portal (
                                  <a
                                    href={loginUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[#2563EB] hover:underline font-mono text-[10px]"
                                  >
                                    {loginUrl}
                                  </a>
                                  )
                                </span>
                              </div>

                              <div>
                                <span className="text-[#64748B] block text-[10px] font-medium uppercase tracking-wider">
                                  Secure Setup Link
                                </span>
                                <span className="font-mono text-[10px] text-[#2563EB] bg-[#EFF6FF] px-1.5 py-0.5 rounded border border-[#BFDBFE] inline-block truncate max-w-full">
                                  {setupPreviewUrl} (24h expiry)
                                </span>
                              </div>
                            </div>

                            <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between text-[11px] text-[#64748B]">
                              <span>
                                Branding:{" "}
                                <span className="font-medium text-[#1E293B]">{institutionName}</span>
                              </span>
                              <span className="text-[#16A34A] font-semibold flex items-center gap-1 text-[10px]">
                                <CheckCircle2 className="w-3 h-3" /> Ready for Secure Invitation Dispatch
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Preview View Container */}
            {previewMode && previewData && (
              <div className="border border-[#CBD5E1] rounded-xl overflow-hidden bg-white shadow-xs">
                <div className="px-4 py-2.5 bg-[#F1F5F9] border-b border-[#E2E8F0] flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1E293B]">Live HTML Email Preview</span>
                  <button
                    type="button"
                    onClick={() => setPreviewMode(false)}
                    className="text-xs text-[#64748B] hover:text-[#0F172A]"
                  >
                    Hide Preview
                  </button>
                </div>
                <div className="p-4 bg-[#F8FAFC] max-h-56 overflow-y-auto">
                  <div className="text-xs font-bold text-[#334155] mb-2">
                    Subject: {previewData.subject}
                  </div>
                  <div
                    className="border border-[#E2E8F0] rounded-lg p-3 bg-white text-xs leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: previewData.html }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer Actions */}
        {!deliveryResult && (
          <div className="px-6 py-3.5 bg-[#F8FAFC] border-t border-[#E2E8F0] flex items-center justify-between">
            <button
              type="button"
              disabled={loadingPreview || submitting}
              onClick={handleFetchPreview}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#CBD5E1] bg-white text-xs font-semibold text-[#334155] hover:bg-[#F1F5F9] transition cursor-pointer disabled:opacity-50"
            >
              <Eye className="w-3.5 h-3.5 text-[#64748B]" />
              {loadingPreview ? "Generating Preview..." : "Preview Email"}
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-[#CBD5E1] text-xs font-semibold text-[#64748B] hover:bg-[#F1F5F9] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  submitting ||
                  selectedIds.length === 0 ||
                  hasMissingEmail ||
                  (emailType !== "INVITATION" &&
                    (ccAnalysis.invalid.length > 0 || ccAnalysis.duplicatesWithTo.length > 0))
                }
                onClick={handleSendEmail}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#123B5A] text-white text-xs font-semibold hover:bg-[#0F2F48] transition cursor-pointer disabled:opacity-50 shadow-xs"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {emailType === "INVITATION" ? "Issuing..." : "Sending..."}
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    {emailType === "INVITATION"
                      ? selectedIds.length === 1
                        ? "Send Credential Invitation"
                        : `Dispatch ${selectedIds.length} Invitations`
                      : `Dispatch to ${selectedIds.length} Recipient${selectedIds.length === 1 ? "" : "s"}${
                          ccAnalysis.valid.length > 0 ? ` (+${ccAnalysis.valid.length} CC)` : ""
                        }`}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
