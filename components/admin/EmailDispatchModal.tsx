"use client";

import React, { useState, useEffect } from "react";
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
  const [emailType, setEmailType] = useState<"DIRECT" | "ANNOUNCEMENT" | "INVITATION">(initialType);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("ACADEMIC");

  // Recipient Directory State
  const [roleFilter, setRoleFilter] = useState<string>(
    initialRole || (allowedRoles && allowedRoles[0]) || "ALL"
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [recipientsList, setRecipientsList] = useState<RecipientOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loadingDirectory, setLoadingDirectory] = useState(false);
  const recipientCache = React.useRef<Map<string, RecipientOption>>(new Map());

  // Preview & Dispatch States
  const [previewMode, setPreviewMode] = useState(false);
  const [previewData, setPreviewData] = useState<{ subject: string; html: string; text: string } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deliveryResult, setDeliveryResult] = useState<{
    dispatchedCount: number;
    failedCount: number;
    transportMode?: "smtp" | "ethereal" | "simulated";
    previewUrl?: string;
    message: string;
    results?: Array<{ id: string; email: string; success: boolean; error?: string }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sync roleFilter when modal opens or initialRole changes
  useEffect(() => {
    if (initialRole) {
      setRoleFilter(initialRole);
    }
  }, [initialRole, isOpen]);

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

  // Fetch institution recipients directory
  useEffect(() => {
    if (!isOpen) return;
    setLoadingDirectory(true);
    fetch(`/api/admin/email?action=recipients&role=${roleFilter}&q=${encodeURIComponent(searchQuery)}`)
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
  }, [isOpen, roleFilter, searchQuery]);

  if (!isOpen) return null;

  // Handle Role Filter Change with Incompatible Selection Clearing
  const handleRoleChange = (newRole: string) => {
    setRoleFilter(newRole);
    if (newRole !== "ALL") {
      setSelectedIds((prev) => {
        return prev.filter((id) => {
          const recipient = recipientCache.current.get(id);
          if (!recipient) return false;
          const normalizedRole = recipient.role === "GUARDIAN" ? "PARENT" : recipient.role;
          return normalizedRole === newRole;
        });
      });
    }
  };

  const filteredIds = recipientsList.map((r) => r.id);
  const isAllFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));

  const toggleSelectAll = () => {
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

  const roleOptions: Array<{ value: EmailTargetRole; label: string }> = [
    { value: "ALL", label: "All Roles" },
    { value: "STUDENT", label: "Students Only" },
    { value: "TEACHER", label: "Faculty Only" },
    { value: "PARENT", label: "Guardians Only" },
    { value: "STAFF", label: "Staff Only" },
  ];

  const displayedRoleOptions =
    allowedRoles && allowedRoles.length > 0
      ? roleOptions.filter((opt) => allowedRoles.includes(opt.value))
      : roleOptions;

  const getRoleLabel = (val: string) => {
    switch (val) {
      case "STUDENT":
        return "Students Only";
      case "TEACHER":
        return "Faculty Only";
      case "PARENT":
        return "Guardians Only";
      case "STAFF":
        return "Staff Only";
      case "ALL":
        return "All Roles";
      default:
        return displayedRoleOptions.find((o) => o.value === val)?.label || val;
    }
  };

  const selectedRecipients = selectedIds
    .map((id) => recipientCache.current.get(id))
    .filter((r): r is RecipientOption => Boolean(r));

  const missingEmailRecipients = selectedRecipients.filter(
    (r) => !r.email || !r.email.trim()
  );
  const hasMissingEmail = missingEmailRecipients.length > 0;

  const searchPlaceholder =
    roleFilter === "STUDENT"
      ? "Search student name, email, roll number, or admission number..."
      : roleFilter === "TEACHER"
      ? "Search faculty name, email, employee ID, or department..."
      : roleFilter === "PARENT"
      ? "Search guardian name, email, phone, or linked student..."
      : "Search name, email, roll number, employee ID, or student...";

  const handleFetchPreview = async () => {
    try {
      setLoadingPreview(true);
      setError(null);
      const firstSelected = selectedRecipients[0];
      const previewRole = firstSelected?.role || roleFilter;
      const previewName = firstSelected?.name || "Sample Recipient";

      const defaultSubject =
        emailType === "INVITATION"
          ? `Welcome to Campus — Set Up Your ${
              previewRole === "TEACHER"
                ? "Faculty"
                : previewRole === "PARENT" || previewRole === "GUARDIAN"
                ? "Guardian"
                : "Student"
            } Portal Access`
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
    if (emailType !== "INVITATION" && (!title.trim() || !message.trim())) {
      setError("Please provide both a subject and message.");
      return;
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
              <h3 className="text-base font-bold text-white">Campus Email Dispatcher</h3>
              <p className="text-xs text-white/70">
                Institution-Scoped Communication & Credential Onboarding
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
              {deliveryResult.transportMode === "smtp" ? (
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
                onClick={() => {
                  setEmailType("DIRECT");
                  setPreviewMode(false);
                }}
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
                onClick={() => {
                  setEmailType("ANNOUNCEMENT");
                  setPreviewMode(false);
                }}
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
                onClick={() => {
                  setEmailType("INVITATION");
                  setPreviewMode(false);
                }}
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
                  {lockRole || displayedRoleOptions.length <= 1 ? (
                    <div className="inline-flex items-center px-3 py-1 rounded-lg bg-[#E2E8F0] text-xs font-semibold text-[#1E293B] border border-[#CBD5E1]">
                      <span>{getRoleLabel(roleFilter)}</span>
                    </div>
                  ) : (
                    <select
                      value={roleFilter}
                      onChange={(e) => handleRoleChange(e.target.value)}
                      className="text-xs px-2.5 py-1 rounded-lg border border-[#CBD5E1] bg-white text-[#334155] cursor-pointer"
                    >
                      {displayedRoleOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="text-xs text-[#123B5A] font-semibold hover:underline cursor-pointer"
                  >
                    {isAllFilteredSelected ? "Deselect Filtered" : "Select All Filtered"}
                  </button>
                </div>
              </div>

              {/* Recipient Search Filter */}
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

              {/* Recipient List Box */}
              <div className="max-h-40 overflow-y-auto border border-[#E2E8F0] rounded-xl divide-y divide-[#F1F5F9] bg-[#F8FAFC]">
                {loadingDirectory ? (
                  <div className="p-4 text-center text-xs text-[#64748B]">
                    Loading institution recipients...
                  </div>
                ) : recipientsList.length === 0 ? (
                  <div className="p-4 text-center text-xs text-[#64748B]">
                    No matching users found in this institution.
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
                    placeholder="e.g. Schedule for Upcoming Examinations"
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

            {/* Invitation Type Notice & Summary Card */}
            {emailType === "INVITATION" && (
              <div className="space-y-4">
                <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl p-4 text-xs text-[#1E3A8A] leading-relaxed">
                  <div className="font-bold mb-1 flex items-center gap-1.5 text-[#1D4ED8]">
                    <KeyRound className="w-4 h-4 text-[#2563EB]" />
                    Cryptographically Signed Credential Onboarding
                  </div>
                  <span>
                    This workflow generates an expiring, 24-hour setup link for each selected user.
                    <strong> SST-ERP guarantees that plaintext temporary passwords are never emailed. </strong>
                    Recipients will be provided their role-specific portal login URL and will set their own password upon first click.
                  </span>
                </div>

                {selectedRecipients.length === 1 ? (
                  <div className="border border-[#CBD5E1] rounded-xl p-4 bg-[#F8FAFC] space-y-3 shadow-xs">
                    <div className="text-xs font-bold uppercase tracking-wider text-[#334155] flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
                      <span className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-[#123B5A]" />
                        Invitation Recipient Summary
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#DBEAFE] text-[#1E40AF]">
                        {selectedRecipients[0].role}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[#64748B] block text-[11px] font-medium">Recipient Name</span>
                        <span className="font-semibold text-[#0F172A]">{selectedRecipients[0].name || "—"}</span>
                      </div>
                      <div>
                        <span className="text-[#64748B] block text-[11px] font-medium">Registered Email</span>
                        <span className={`font-mono text-[11px] ${!selectedRecipients[0].email ? "text-[#DC2626] font-bold" : "text-[#0F172A]"}`}>
                          {selectedRecipients[0].email || "Missing Email"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#64748B] block text-[11px] font-medium">Username / Login ID</span>
                        <span className="font-mono text-[11px] text-[#0F172A]">
                          {selectedRecipients[0].identifier || selectedRecipients[0].email || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#64748B] block text-[11px] font-medium">Portal Destination</span>
                        <span className="font-medium text-[#1E293B]">
                          {selectedRecipients[0].role === "TEACHER"
                            ? "Faculty Portal (/campus/[slug]/teacher)"
                            : selectedRecipients[0].role === "PARENT" || selectedRecipients[0].role === "GUARDIAN"
                            ? "Guardian Portal (/login)"
                            : "Student Portal (/login)"}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between text-[11px] text-[#64748B]">
                      <span>Email Subject: <span className="font-medium text-[#1E293B]">Welcome to Campus — Set Up Your Portal Access</span></span>
                      <span className="text-[#16A34A] font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Ready to Dispatch
                      </span>
                    </div>
                  </div>
                ) : selectedRecipients.length > 1 ? (
                  <div className="border border-[#CBD5E1] rounded-xl p-4 bg-[#F8FAFC] space-y-2 shadow-xs">
                    <div className="flex items-center justify-between text-xs font-bold text-[#334155] pb-2 border-b border-[#E2E8F0]">
                      <span className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-[#123B5A]" />
                        Bulk Credential Onboarding
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#E2E8F0] text-[#334155]">
                        {selectedRecipients.length} Selected
                      </span>
                    </div>
                    <p className="text-xs text-[#64748B] leading-relaxed">
                      Each selected user will receive a personalized invitation email with their individual 24-hour setup link, username, and role-specific login portal link.
                    </p>
                  </div>
                ) : (
                  <div className="border border-dashed border-[#CBD5E1] rounded-xl p-6 text-center text-xs text-[#64748B]">
                    Please select at least one recipient from the list above to review invitation details.
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
                disabled={submitting || selectedIds.length === 0 || hasMissingEmail}
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
                      : `Dispatch to ${selectedIds.length} Recipient${selectedIds.length === 1 ? "" : "s"}`}
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
