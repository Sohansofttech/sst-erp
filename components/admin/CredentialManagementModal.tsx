"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import {
  KeyRound,
  Copy,
  Check,
  RotateCcw,
  UserCheck,
  UserX,
  AlertTriangle,
  GraduationCap,
  HeartHandshake,
  Send,
  ExternalLink,
  Mail,
} from "lucide-react";
import {
  isTeachingFacultyTitle,
  getPortalStatusBadgeConfig,
  getInvitationStatusBadgeConfig,
  PortalAccountStatus,
  InvitationStatus,
} from "@/lib/utils/credential-helpers";

export interface CredentialEntityInfo {
  id: string; // Internal record ID (studentId, staffId, guardianId)
  fullName: string;
  email?: string;
  role?: string;
  designation?: string;
  departmentName?: string;
  rollNumber?: string;
  admissionNumber?: string;
  employeeId?: string;
  guardianUniqueId?: string;
  relationship?: string;
  userId?: string;
  portalStatus?: PortalAccountStatus;
  portalAccess?: boolean;
  lastLoginAt?: string | null;
  // Parent-specific linked children
  linkedChildren?: Array<{
    id: string;
    fullName: string;
    rollNumber?: string;
    isVerified: boolean;
  }>;
}

export interface CredentialManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: "STUDENT" | "TEACHER" | "PARENT";
  entity: CredentialEntityInfo | null;
  onStatusUpdated?: (entityId: string, updatedStatus: PortalAccountStatus, userId?: string) => void;
}

export const CredentialManagementModal: React.FC<CredentialManagementModalProps> = ({
  isOpen,
  onClose,
  entityType,
  entity,
  onStatusUpdated,
}) => {
  // Action in progress
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Confirmation view state
  const [confirmAction, setConfirmAction] = useState<"RESET" | "DISABLE" | "ENABLE" | null>(null);

  // Temporary credentials view state (Single display only)
  const [issuedCredentials, setIssuedCredentials] = useState<{
    email: string;
    temporaryPassword: string;
    mustChangePassword: boolean;
    role: string;
  } | null>(null);

  const [copied, setCopied] = useState(false);

  // Live status state
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const handleRetry = () => {
    setRetryKey((prev) => prev + 1);
  };

  const [resendingInvitation, setResendingInvitation] = useState(false);
  const [invitationPreviewUrl, setInvitationPreviewUrl] = useState<string | null>(null);

  const [liveData, setLiveData] = useState<{
    hasAccount: boolean;
    isActive: boolean;
    status: string;
    invitationStatus?: InvitationStatus;
    userId: string | null;
    email: string | null;
    lastLoginAt: string | null;
    role: string | null;
    isTeachingFaculty?: boolean;
    totalLinkedChildren?: number;
    verifiedCount?: number;
    unverifiedCount?: number;
    verifiedChildren?: Array<{
      linkId: string;
      studentId: string;
      fullName: string;
      rollNumber?: string;
      relationship?: string;
      canAccessPortal?: boolean;
    }>;
  } | null>(null);

  // Fetch live credential status when modal opens or entity changes
  useEffect(() => {
    if (!isOpen || !entity) {
      return;
    }

    const controller = new AbortController();
    const currentEntityId = entity.id;
    const currentEntityType = entityType;

    setLiveLoading(true);
    setLiveError(null);
    setLiveData(null); // Wipe stale data from previous entity immediately
    setIssuedCredentials(null);
    setConfirmAction(null);
    setErrorMessage("");
    setSuccessMessage("");

    fetch(
      `/api/admin/credentials?type=status&entityType=${currentEntityType}&entityId=${encodeURIComponent(
        currentEntityId
      )}&designation=${encodeURIComponent(entity.designation || "")}&role=${encodeURIComponent(
        entity.role || ""
      )}`,
      { signal: controller.signal }
    )
      .then(async (res) => {
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((json) => {
        if (controller.signal.aborted) return;
        if (json.success && json.data) {
          setLiveData(json.data);
          setLiveError(null);
          // Sync with parent table if live account status is known
          if (json.data.hasAccount && onStatusUpdated) {
            const resolvedStatus: PortalAccountStatus = json.data.isActive ? "ACTIVE" : "DISABLED";
            if (entity.portalStatus !== resolvedStatus || entity.userId !== json.data.userId) {
              onStatusUpdated(currentEntityId, resolvedStatus, json.data.userId || undefined);
            }
          }
        } else {
          setLiveError("Unable to verify account status. Please retry.");
          setLiveData(null);
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.warn("Live credential status check:", err.message);
        setLiveError("Unable to verify account status. Please retry.");
        setLiveData(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLiveLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [isOpen, entity?.id, entityType, retryKey]);

  if (!entity) return null;

  // Faculty Teaching Eligibility
  const isFacultyEligible =
    liveData?.isTeachingFaculty !== undefined
      ? liveData.isTeachingFaculty
      : entityType === "TEACHER"
      ? isTeachingFacultyTitle(entity.designation, entity.role)
      : true;

  // Parent Verified Relationships
  const verifiedChildren =
    liveData?.verifiedChildren && liveData.verifiedChildren.length > 0
      ? liveData.verifiedChildren
      : entityType === "PARENT"
      ? (entity.linkedChildren || []).filter((c) => c.isVerified)
      : [];
  const hasVerifiedRelationship =
    liveData?.verifiedCount !== undefined
      ? liveData.verifiedCount > 0
      : entityType === "PARENT"
      ? (entity.linkedChildren || []).some((c) => c.isVerified)
      : true;

  // Derive display status strictly from live database response
  let currentStatus: PortalAccountStatus | null = null;
  if (liveData) {
    if (liveData.status === "PENDING_SETUP") {
      currentStatus = "PENDING_SETUP";
    } else if (!liveData.hasAccount) {
      currentStatus = "NOT_CREATED";
    } else if (liveData.isActive) {
      currentStatus = "ACTIVE";
    } else {
      currentStatus = "DISABLED";
    }

    if (entityType === "TEACHER" && !isFacultyEligible) {
      currentStatus = "INELIGIBLE";
    } else if (entityType === "PARENT" && !hasVerifiedRelationship) {
      currentStatus = "UNVERIFIED";
    }
  }

  const statusBadge = currentStatus
    ? getPortalStatusBadgeConfig(currentStatus)
    : liveError
    ? {
        label: "Verification Unavailable",
        variant: "error" as const,
        description: liveError,
      }
    : {
        label: "Checking...",
        variant: "neutral" as const,
        description: "Verifying live account status with server.",
      };

  // Reset local state when modal closes
  const handleModalClose = () => {
    setLiveData(null);
    setLiveLoading(false);
    setLiveError(null);
    setIssuedCredentials(null);
    setConfirmAction(null);
    setErrorMessage("");
    setSuccessMessage("");
    setCopied(false);
    setRetryKey(0);
    setResendingInvitation(false);
    setInvitationPreviewUrl(null);
    onClose();
  };

  // Copy temporary credentials to clipboard
  const handleCopyCredentials = () => {
    if (!issuedCredentials) return;
    const textToCopy = `Portal Login Credentials\nUsername: ${issuedCredentials.email}\nTemporary Password: ${issuedCredentials.temporaryPassword}\nPortal URL: ${window.location.origin}/login\nNote: You will be required to change this password on first login.`;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  // Execute Issue Credentials
  const handleIssueCredentials = async () => {
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const payload: Record<string, any> = {
        action: "ISSUE",
        entityType,
      };

      if (entityType === "STUDENT") {
        payload.studentId = entity.id;
      } else if (entityType === "TEACHER") {
        payload.teacherId = entity.id;
        payload.employeeId = entity.employeeId;
        payload.fullName = entity.fullName;
        payload.email = liveData?.email || entity.email;
        payload.designation = entity.designation;
        payload.department = entity.departmentName;
      } else if (entityType === "PARENT") {
        payload.guardianAccountId = entity.id;
        payload.fullName = entity.fullName;
        payload.email = liveData?.email || entity.email;
        payload.relationship = entity.relationship;
        payload.studentIds = (entity.linkedChildren || []).map((c) => c.id);
      }

      const res = await fetch("/api/admin/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to generate portal credentials.");
      }

      setIssuedCredentials({
        email: json.data.email,
        temporaryPassword: json.data.temporaryPassword,
        mustChangePassword: json.data.mustChangePassword,
        role: json.data.role,
      });

      setLiveData({
        hasAccount: true,
        isActive: true,
        status: "ACTIVE",
        userId: json.data.userId,
        email: json.data.email,
        lastLoginAt: null,
        role: json.data.role,
        isTeachingFaculty: entityType === "TEACHER" ? isFacultyEligible : undefined,
      });

      if (onStatusUpdated) {
        onStatusUpdated(entity.id, "ACTIVE", json.data.userId);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "An error occurred while issuing credentials.");
    } finally {
      setLoading(false);
    }
  };

  // Execute Resend Setup Invitation
  const handleResendInvitation = async () => {
    setResendingInvitation(true);
    setErrorMessage("");
    setSuccessMessage("");
    setInvitationPreviewUrl(null);

    try {
      const res = await fetch("/api/admin/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "RESEND_INVITATION",
          entityType,
          entityId: entity.id,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to resend setup invitation.");
      }

      setSuccessMessage(json.message || "Invitation email resent successfully.");
      if (json.data?.previewUrl) {
        setInvitationPreviewUrl(json.data.previewUrl);
      }
      setLiveData((prev) =>
        prev
          ? { ...prev, invitationStatus: "SENT" }
          : null
      );
    } catch (err: any) {
      setErrorMessage(err.message || "An error occurred while resending invitation.");
    } finally {
      setResendingInvitation(false);
    }
  };

  // Execute Password Reset
  const handleResetPassword = async () => {
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const activeUserId = liveData?.userId || entity.userId;
      if (!activeUserId) {
        throw new Error("Unable to identify account user ID for password reset. Please try again.");
      }

      const payload: Record<string, any> = {
        action: "RESET",
        entityType,
        userId: activeUserId,
      };

      if (entityType === "STUDENT") payload.studentId = entity.id;
      if (entityType === "TEACHER") payload.teacherId = entity.id;
      if (entityType === "PARENT") payload.guardianAccountId = entity.id;

      const res = await fetch("/api/admin/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to reset password.");
      }

      setIssuedCredentials({
        email: liveData?.email || entity.email || "",
        temporaryPassword: json.data.temporaryPassword,
        mustChangePassword: true,
        role: entityType,
      });

      setConfirmAction(null);

      setLiveData((prev) =>
        prev
          ? { ...prev, hasAccount: true, isActive: true, status: "ACTIVE" }
          : {
              hasAccount: true,
              isActive: true,
              status: "ACTIVE",
              userId: activeUserId,
              email: entity.email || null,
              lastLoginAt: null,
              role: entityType,
            }
      );

      if (onStatusUpdated) {
        onStatusUpdated(entity.id, "ACTIVE", activeUserId);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "An error occurred while resetting password.");
    } finally {
      setLoading(false);
    }
  };

  // Execute Toggle Portal Access (Enable / Disable)
  const handleToggleAccess = async (enable: boolean) => {
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const activeUserId = liveData?.userId || entity.userId;
      if (!activeUserId) {
        throw new Error("Unable to identify account user ID to update access. Please try again.");
      }

      const payload: Record<string, any> = {
        action: "TOGGLE_ACCESS",
        entityType,
        userId: activeUserId,
        isActive: enable,
      };

      if (entityType === "STUDENT") payload.studentId = entity.id;
      if (entityType === "TEACHER") payload.teacherId = entity.id;
      if (entityType === "PARENT") payload.guardianAccountId = entity.id;

      const res = await fetch("/api/admin/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to update portal access status.");
      }

      setSuccessMessage(json.message);
      setConfirmAction(null);

      const newStatus: PortalAccountStatus = enable ? "ACTIVE" : "DISABLED";
      setLiveData((prev) =>
        prev
          ? { ...prev, isActive: enable, status: enable ? "ACTIVE" : "SUSPENDED" }
          : {
              hasAccount: true,
              isActive: enable,
              status: enable ? "ACTIVE" : "SUSPENDED",
              userId: activeUserId,
              email: entity.email || null,
              lastLoginAt: null,
              role: entityType,
            }
      );

      if (onStatusUpdated) {
        onStatusUpdated(entity.id, newStatus, activeUserId);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "An error occurred while updating portal access.");
    } finally {
      setLoading(false);
    }
  };

  const getRoleHeader = () => {
    if (entityType === "STUDENT") return "Student Portal Access";
    if (entityType === "TEACHER") return "Faculty Portal Access";
    return "Parent Portal Access";
  };

  const getPortalDestination = () => {
    if (entityType === "TEACHER") return "/campus/[slug]/teacher (Faculty Portal)";
    if (entityType === "PARENT") return "/dashboard (Parent Dashboard via /login)";
    return "/dashboard (Student Dashboard via /login)";
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleModalClose}
      title={getRoleHeader()}
      description={`Manage login credentials and authorization status for ${entity.fullName}.`}
      maxWidth="md"
    >
      <div className="space-y-4">
        {/* Live Status Error Alert with Retry */}
        {liveError && (
          <div className="p-3 rounded-xl bg-[#FEE2E2] border border-[#FECACA] flex items-center justify-between gap-3 text-xs text-[#991B1B] animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#DC2626] shrink-0" />
              <span className="font-semibold">Unable to verify account status. Please retry.</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              disabled={liveLoading}
              leftIcon={<RotateCcw className="w-3.5 h-3.5 text-[#DC2626]" />}
              className="text-xs text-[#DC2626] border-[#FECACA] hover:bg-white shrink-0"
            >
              {liveLoading ? "Retrying..." : "Retry"}
            </Button>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <Alert variant="error" className="text-xs">
            {errorMessage}
          </Alert>
        )}

        {/* Success Alert */}
        {successMessage && (
          <Alert variant="success" className="text-xs">
            {successMessage}
          </Alert>
        )}

        {/* ------------------------------------------------------------- */}
        {/* 1. SINGLE-DISPLAY TEMPORARY CREDENTIALS VIEW                 */}
        {/* ------------------------------------------------------------- */}
        {issuedCredentials ? (
          <div className="space-y-4 animate-in fade-in zoom-in-95">
            <div className="p-4 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] space-y-3">
              <div className="flex items-center gap-2 text-[#123B5A]">
                <KeyRound className="w-5 h-5 text-[#F5A000]" />
                <h4 className="font-bold text-sm text-[#123B5A]">
                  Temporary Portal Credentials Generated
                </h4>
              </div>

              <p className="text-xs text-[#1E293B] leading-relaxed">
                Provide these credentials securely to{" "}
                <span className="font-bold">{entity.fullName}</span>. For account security, the
                temporary password is shown only once and cannot be retrieved later.
              </p>

              {/* Monospace Credentials Card */}
              <div className="bg-white p-3 rounded-lg border border-[#CBD5E1] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[#64748B]">Username / Email:</span>
                  <span className="font-mono text-xs font-bold text-[#1E293B]">
                    {issuedCredentials.email}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-[#F1F5F9] pt-2">
                  <span className="text-[11px] font-semibold text-[#64748B]">
                    Temporary Password:
                  </span>
                  <span className="font-mono text-sm font-black text-[#123B5A] bg-[#FEF3C7] px-2 py-0.5 rounded border border-[#FDE68A]">
                    {issuedCredentials.temporaryPassword}
                  </span>
                </div>
              </div>

              {/* Single Display & First Login Warning */}
              <div className="p-2.5 rounded-lg bg-[#FEF3C7] border border-[#FDE68A] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
                <div className="text-[11px] text-[#92400E] leading-normal">
                  <span className="font-bold">Mandatory Security Requirement:</span> The user will
                  be forced to change this temporary password immediately upon their first login
                  before accessing any student, faculty, or parent features.
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleCopyCredentials}
                  leftIcon={copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  className="flex-1"
                >
                  {copied ? "Copied to Clipboard!" : "Copy Credentials"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleModalClose}
                  className="text-xs"
                >
                  Done & Close
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* ------------------------------------------------------------- */}
            {/* 2. CONFIRMATION PROMPTS                                       */}
            {/* ------------------------------------------------------------- */}
            {confirmAction === "RESET" ? (
              <div className="p-4 rounded-xl bg-[#FEF3C7] border border-[#FDE68A] space-y-3 animate-in fade-in">
                <div className="flex items-center gap-2 text-[#92400E]">
                  <RotateCcw className="w-4 h-4" />
                  <h4 className="font-bold text-xs">Confirm Password Reset</h4>
                </div>
                <p className="text-xs text-[#92400E] leading-relaxed">
                  Are you sure you want to reset credentials for{" "}
                  <span className="font-bold">{entity.fullName}</span>?
                  <br />
                  <span className="font-semibold underline mt-1 block">
                    All active sessions across all devices will be immediately terminated.
                  </span>
                  A new high-entropy temporary password will be generated.
                </p>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmAction(null)}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleResetPassword}
                    disabled={loading}
                    leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                  >
                    {loading ? "Resetting..." : "Yes, Reset Credentials"}
                  </Button>
                </div>
              </div>
            ) : confirmAction === "DISABLE" ? (
              <div className="p-4 rounded-xl bg-[#FEE2E2] border border-[#FECACA] space-y-3 animate-in fade-in">
                <div className="flex items-center gap-2 text-[#991B1B]">
                  <UserX className="w-4 h-4" />
                  <h4 className="font-bold text-xs">Confirm Portal Access Suspension</h4>
                </div>
                <p className="text-xs text-[#991B1B] leading-relaxed">
                  Suspend portal access for <span className="font-bold">{entity.fullName}</span>?
                  The user will be blocked from logging into the portal and any active sessions will
                  be rejected immediately.
                </p>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmAction(null)}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleToggleAccess(false)}
                    disabled={loading}
                    leftIcon={<UserX className="w-3.5 h-3.5" />}
                  >
                    {loading ? "Suspending..." : "Confirm Suspend Access"}
                  </Button>
                </div>
              </div>
            ) : confirmAction === "ENABLE" ? (
              <div className="p-4 rounded-xl bg-[#DCFCE7] border border-[#BBF7D0] space-y-3 animate-in fade-in">
                <div className="flex items-center gap-2 text-[#166534]">
                  <UserCheck className="w-4 h-4" />
                  <h4 className="font-bold text-xs">Re-enable Portal Access</h4>
                </div>
                <p className="text-xs text-[#166534] leading-relaxed">
                  Restore portal access for <span className="font-bold">{entity.fullName}</span>?
                  The user will be permitted to log in with their existing credentials.
                </p>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmAction(null)}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="teal"
                    size="sm"
                    onClick={() => handleToggleAccess(true)}
                    disabled={loading}
                    leftIcon={<UserCheck className="w-3.5 h-3.5" />}
                  >
                    {loading ? "Re-enabling..." : "Confirm Re-enable"}
                  </Button>
                </div>
              </div>
            ) : null}

            {/* ------------------------------------------------------------- */}
            {/* 3. ENTITY PROFILE & CREDENTIAL STATUS OVERVIEW                */}
            {/* ------------------------------------------------------------- */}
            <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-bold text-[#1E293B]">{entity.fullName}</h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    {entity.rollNumber && (
                      <span className="font-mono text-[11px] text-[#64748B]">
                        Roll: {entity.rollNumber}
                      </span>
                    )}
                    {entity.employeeId && (
                      <span className="font-mono text-[11px] text-[#64748B]">
                        Emp ID: {entity.employeeId}
                      </span>
                    )}
                    {entity.guardianUniqueId && (
                      <span className="font-mono text-[11px] text-[#64748B]">
                        Guardian ID: {entity.guardianUniqueId}
                      </span>
                    )}
                    {(liveData?.designation || entity.designation) && (
                      <span className="text-[11px] text-[#64748B]">
                        • {liveData?.designation || entity.designation}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1">
                  {liveLoading ? (
                    <Badge variant="neutral" size="md" className="animate-pulse">
                      Checking Status...
                    </Badge>
                  ) : (
                    <Badge variant={statusBadge.variant} size="md">
                      {statusBadge.label}
                    </Badge>
                  )}
                  {liveData?.invitationStatus && (
                    <Badge
                      variant={getInvitationStatusBadgeConfig(liveData.invitationStatus).variant}
                      size="sm"
                    >
                      {getInvitationStatusBadgeConfig(liveData.invitationStatus).label}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs border-t border-[#E2E8F0] pt-2.5">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#64748B] block">
                    Registered Email
                  </span>
                  <span className="font-semibold text-[#1E293B] truncate block">
                    {liveData?.email || entity.email || "No email registered"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#64748B] block">
                    Portal Destination
                  </span>
                  <span className="font-semibold text-[#1E293B] truncate block text-[11px]">
                    {getPortalDestination()}
                  </span>
                </div>
              </div>

              {(liveData?.lastLoginAt || entity.lastLoginAt) && (
                <div className="text-[11px] text-[#64748B] border-t border-[#E2E8F0] pt-2 flex items-center justify-between">
                  <span>Last portal activity:</span>
                  <span className="font-semibold text-[#1E293B]">
                    {new Date((liveData?.lastLoginAt || entity.lastLoginAt)!).toLocaleString()}
                  </span>
                </div>
              )}

              {invitationPreviewUrl && (
                <div className="p-2.5 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-between gap-2 text-xs text-[#1E40AF]">
                  <div className="flex items-center gap-1.5 truncate">
                    <Mail className="w-3.5 h-3.5 shrink-0 text-[#2563EB]" />
                    <span className="truncate">Preview setup invitation:</span>
                  </div>
                  <a
                    href={invitationPreviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#2563EB] hover:underline shrink-0"
                  >
                    Open Preview <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>

            {/* ------------------------------------------------------------- */}
            {/* 4. FACULTY TEACHING ELIGIBILITY GUARD                         */}
            {/* ------------------------------------------------------------- */}
            {entityType === "TEACHER" && !isFacultyEligible && (
              <div className="p-3 rounded-xl bg-[#FEE2E2] border border-[#FECACA] flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5" />
                <div className="text-xs text-[#991B1B] leading-relaxed">
                  <span className="font-bold">Portal Access Ineligible:</span> Staff designation{" "}
                  <span className="font-semibold">&apos;{entity.designation}&apos;</span> is classified
                  as non-teaching administration. Under institutional access policy, only eligible
                  teaching faculty may be provisioned with TEACHER portal credentials.
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* 5. PARENT LINKED CHILDREN & VERIFICATION STATUS               */}
            {/* ------------------------------------------------------------- */}
            {entityType === "PARENT" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1E293B] flex items-center gap-1.5">
                    <HeartHandshake className="w-3.5 h-3.5 text-[#14B8A6]" />
                    Linked Students ({entity.linkedChildren?.length || 0})
                  </span>
                  <span className="text-[11px] text-[#64748B]">
                    {verifiedChildren.length} verified
                  </span>
                </div>

                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {entity.linkedChildren && entity.linkedChildren.length > 0 ? (
                    entity.linkedChildren.map((child) => (
                      <div
                        key={child.id}
                        className={`p-2 rounded-lg border text-xs flex items-center justify-between ${
                          child.isVerified
                            ? "bg-[#DCFCE7]/40 border-[#BBF7D0]"
                            : "bg-[#FEF3C7]/40 border-[#FDE68A]"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <GraduationCap className="w-3.5 h-3.5 text-[#64748B]" />
                          <div>
                            <span className="font-semibold text-[#1E293B] block">
                              {child.fullName}
                            </span>
                            {child.rollNumber && (
                              <span className="font-mono text-[10px] text-[#64748B]">
                                Roll: {child.rollNumber}
                              </span>
                            )}
                          </div>
                        </div>

                        {child.isVerified ? (
                          <Badge variant="success" size="sm">
                            Verified
                          </Badge>
                        ) : (
                          <Badge variant="warning" size="sm">
                            Unverified
                          </Badge>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="p-3 text-center text-xs text-[#64748B] bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                      No student records linked to this guardian.
                    </div>
                  )}
                </div>

                {!hasVerifiedRelationship && (
                  <div className="p-2.5 rounded-lg bg-[#FEF3C7] border border-[#FDE68A] flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
                    <p className="text-[11px] text-[#92400E] leading-relaxed">
                      <span className="font-bold">Credential Issuance Blocked:</span> At least one
                      parent-student relationship must be verified by the institution before parent
                      portal credentials can be issued.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* 6. CREDENTIAL ACTION CONTROLS                                 */}
            {/* ------------------------------------------------------------- */}
            <div className="pt-2 border-t border-[#E2E8F0] space-y-2">
              {liveLoading ? (
                <Button
                  variant="outline"
                  className="w-full text-xs text-[#64748B]"
                  disabled={true}
                >
                  <RotateCcw className="w-3.5 h-3.5 animate-spin mr-2" />
                  Verifying Account Status...
                </Button>
              ) : liveError || !currentStatus ? (
                <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-[#DC2626] font-medium">
                      Status check temporarily unavailable.
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRetry}
                      leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                      className="text-xs"
                    >
                      Retry Verification
                    </Button>
                  </div>
                  <Button
                    variant="primary"
                    className="w-full text-xs"
                    onClick={handleIssueCredentials}
                    disabled={loading}
                    leftIcon={<KeyRound className="w-3.5 h-3.5" />}
                  >
                    Direct Issue / Recover Credentials
                  </Button>
                </div>
              ) : currentStatus === "PENDING_SETUP" ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="primary"
                      className="w-full text-xs"
                      onClick={handleResendInvitation}
                      disabled={resendingInvitation || loading}
                      leftIcon={<Send className="w-3.5 h-3.5" />}
                    >
                      {resendingInvitation ? "Resending..." : "Resend Invitation"}
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full text-xs"
                      onClick={handleIssueCredentials}
                      disabled={loading || resendingInvitation || !isFacultyEligible || !hasVerifiedRelationship}
                      leftIcon={<KeyRound className="w-3.5 h-3.5 text-[#F5A000]" />}
                    >
                      {loading ? "Generating..." : "Generate Password"}
                    </Button>
                  </div>
                </div>
              ) : currentStatus === "NOT_CREATED" || currentStatus === "UNVERIFIED" ? (
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={handleIssueCredentials}
                  disabled={loading || !isFacultyEligible || !hasVerifiedRelationship}
                  leftIcon={<KeyRound className="w-4 h-4" />}
                >
                  {loading ? "Generating Credentials..." : "Issue Portal Credentials"}
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setConfirmAction("RESET")}
                      disabled={loading || confirmAction !== null}
                      leftIcon={<RotateCcw className="w-3.5 h-3.5 text-[#D97706]" />}
                      className="text-xs"
                    >
                      Reset Password
                    </Button>

                    {currentStatus === "ACTIVE" ? (
                      <Button
                        variant="outline"
                        onClick={() => setConfirmAction("DISABLE")}
                        disabled={loading || confirmAction !== null}
                        leftIcon={<UserX className="w-3.5 h-3.5 text-[#DC2626]" />}
                        className="text-xs text-[#DC2626] hover:bg-[#FEE2E2]"
                      >
                        Suspend Access
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => setConfirmAction("ENABLE")}
                        disabled={loading || confirmAction !== null}
                        leftIcon={<UserCheck className="w-3.5 h-3.5 text-[#16A34A]" />}
                        className="text-xs text-[#16A34A] hover:bg-[#DCFCE7]"
                      >
                        Re-enable Access
                      </Button>
                    )}
                  </div>

                  <Button
                    variant="outline"
                    className="w-full text-xs text-[#1E3A8A] border-[#BFDBFE] hover:bg-[#EFF6FF]"
                    onClick={handleResendInvitation}
                    disabled={resendingInvitation || loading}
                    leftIcon={<Send className="w-3.5 h-3.5 text-[#2563EB]" />}
                  >
                    {resendingInvitation ? "Resending Invitation..." : "Resend Password Setup Invitation"}
                  </Button>
                </div>
              )}

              <p className="text-[11px] text-[#64748B] text-center pt-1">
                Unified security: All accounts enforce live status checks, session invalidation on
                password change, and tenant isolation.
              </p>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
