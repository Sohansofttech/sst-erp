"use client";

import React, { useState } from "react";
import { Lock, Eye, EyeOff, ShieldCheck, AlertCircle, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/shared/Button";

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  isMandatory?: boolean;
}

export function ChangePasswordModal({
  isOpen,
  onClose,
  isMandatory = false,
}: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  // Strength calculations
  const minLength = newPassword.length >= 8;
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasLower = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(newPassword);
  const matches = newPassword && newPassword === confirmPassword;

  let strengthScore = 0;
  if (minLength) strengthScore++;
  if (hasUpper && hasLower) strengthScore++;
  if (hasNumber && hasSpecial) strengthScore++;
  if (newPassword.length >= 12) strengthScore++;

  const strengthLabels = ["Very Weak", "Weak", "Fair", "Strong", "Very Strong"];
  const strengthColors = ["bg-rose-500", "bg-rose-400", "bg-amber-500", "bg-emerald-500", "bg-emerald-600"];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!currentPassword) {
      setErrorMessage("Please enter your current password.");
      return;
    }

    if (!newPassword) {
      setErrorMessage("Please enter a new password.");
      return;
    }

    if (!minLength || !hasUpper || !hasLower || !hasNumber || !hasSpecial) {
      setErrorMessage("New password does not meet the complexity requirements.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("New password and confirmation do not match.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error || "Failed to change password. Please check your current password.");
        return;
      }

      setSuccessMessage(data.message || "Password updated successfully!");
      setTimeout(() => {
        onClose();
        window.location.reload();
      }, 1500);
    } catch {
      setErrorMessage("Network error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-md bg-white rounded-2xl border border-[#E5E9EF] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#E5E9EF] bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-[#F5A000] flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#202936]">
                {isMandatory ? "Action Required: Update Password" : "Change Password"}
              </h3>
              <p className="text-xs text-[#788391]">
                {isMandatory
                  ? "Your current password is a default/breached password. Set a secure one now."
                  : "Protect your account with a unique, strong password."}
              </p>
            </div>
          </div>
          {!isMandatory && (
            <button
              onClick={onClose}
              className="p-1 text-[#788391] hover:text-[#202936] rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Current Password */}
          <div>
            <label className="block text-xs font-bold text-[#202936] mb-1.5">
              Current Password
            </label>
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="w-full h-10 px-3.5 pr-10 text-xs rounded-xl border border-[#E5E9EF] bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F5A000]/30 focus:border-[#F5A000] text-[#202936]"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#788391] hover:text-[#202936] cursor-pointer"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div>
            <label className="block text-xs font-bold text-[#202936] mb-1.5">
              New Strong Password
            </label>
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 chars, uppercase, number & symbol"
                className="w-full h-10 px-3.5 pr-10 text-xs rounded-xl border border-[#E5E9EF] bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F5A000]/30 focus:border-[#F5A000] text-[#202936]"
                required
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#788391] hover:text-[#202936] cursor-pointer"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Strength Meter Bar */}
            {newPassword.length > 0 && (
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#788391]">Strength:</span>
                  <span className="font-bold text-[#202936]">{strengthLabels[strengthScore]}</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex gap-1">
                  {[1, 2, 3, 4].map((step) => (
                    <div
                      key={step}
                      className={`h-full flex-1 transition-all rounded-full ${
                        strengthScore >= step ? strengthColors[strengthScore] : "bg-slate-200"
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Password Requirements Checklist */}
          <div className="p-3 bg-[#EEF1F5]/60 rounded-xl border border-[#E5E9EF] space-y-1 text-[11px] text-[#788391]">
            <p className="font-semibold text-[#202936] mb-1">Password Requirements:</p>
            <div className="grid grid-cols-2 gap-1">
              <span className={`flex items-center gap-1.5 ${minLength ? "text-emerald-600 font-semibold" : ""}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${minLength ? "bg-emerald-500" : "bg-slate-400"}`} />
                At least 8 characters
              </span>
              <span className={`flex items-center gap-1.5 ${hasUpper && hasLower ? "text-emerald-600 font-semibold" : ""}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${hasUpper && hasLower ? "bg-emerald-500" : "bg-slate-400"}`} />
                Upper & lower case
              </span>
              <span className={`flex items-center gap-1.5 ${hasNumber ? "text-emerald-600 font-semibold" : ""}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${hasNumber ? "bg-emerald-500" : "bg-slate-400"}`} />
                At least 1 number
              </span>
              <span className={`flex items-center gap-1.5 ${hasSpecial ? "text-emerald-600 font-semibold" : ""}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${hasSpecial ? "bg-emerald-500" : "bg-slate-400"}`} />
                At least 1 symbol
              </span>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-xs font-bold text-[#202936] mb-1.5">
              Confirm New Password
            </label>
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full h-10 px-3.5 pr-10 text-xs rounded-xl border border-[#E5E9EF] bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F5A000]/30 focus:border-[#F5A000] text-[#202936]"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#788391] hover:text-[#202936] cursor-pointer"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {confirmPassword.length > 0 && !matches && (
              <p className="text-[11px] text-rose-600 mt-1">Passwords do not match.</p>
            )}
          </div>

          {/* Submit Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            {!isMandatory && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={isLoading}
              >
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isLoading}
              disabled={isLoading || !minLength || !matches}
              icon={<ShieldCheck className="w-3.5 h-3.5" />}
            >
              Update Password
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

