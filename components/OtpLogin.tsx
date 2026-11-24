"use client";

import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { normalizeIndianMobile } from "@/lib/auth/mobile";

type OtpPortalRole = "STUDENT" | "TEACHER" | "ADMIN" | "SUPER_ADMIN";

type OtpLoginProps = {
  role: OtpPortalRole;
  institutionCode?: string;
};

type OtpResponse = {
  success: boolean;
  error?: string;
  message?: string;
  registrationPending?: boolean;
  challengeId?: string;
  otpLength?: number;
  otpExpiry?: number;
  data?: {
    token?: string;
    redirectUrl?: string;
    user?: {
      institutionName?: string;
      activeChildId?: string;
    };
  };
};

const roleDestinations: Record<OtpPortalRole, string> = {
  STUDENT: "/dashboard",
  TEACHER: "/teacher",
  ADMIN: "/admin",
  SUPER_ADMIN: "/super-admin",
};

export default function OtpLogin({ role, institutionCode }: OtpLoginProps) {
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [otpLength, setOtpLength] = useState(6);
  const [otpExpiry, setOtpExpiry] = useState(5);
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState<"send" | "verify" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  const normalizedMobile = normalizeIndianMobile(mobile);

  const requestOtp = async () => {
    if (!normalizedMobile) {
      throw new Error("Enter a valid 10-digit Indian mobile number.");
    }

    const response = await fetch("/api/auth/otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile: normalizedMobile, role }),
    });
    const result = await response.json() as OtpResponse;
    if (!response.ok || !result.success) {
      throw new Error(result.error || "Unable to send OTP.");
    }
    const responseOtpLength = result.otpLength;
    const responseOtpExpiry = result.otpExpiry;
    if (
      typeof result.challengeId !== "string" ||
      !result.challengeId ||
      typeof responseOtpLength !== "number" ||
      !Number.isInteger(responseOtpLength) ||
      responseOtpLength < 4 ||
      responseOtpLength > 10 ||
      typeof responseOtpExpiry !== "number" ||
      !Number.isFinite(responseOtpExpiry) ||
      responseOtpExpiry < 1
    ) {
      throw new Error("OTP request did not return valid challenge details.");
    }

    setChallengeId(result.challengeId);
    setOtp("");
    setOtpLength(responseOtpLength);
    setOtpExpiry(responseOtpExpiry);
    setCountdown(60);
    setMessage(`OTP sent. It expires in ${responseOtpExpiry} minutes.`);
  };

  const handleSendOtp = async () => {
    setLoading("send");
    setError("");
    setMessage("");
    try {
      await requestOtp();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to send OTP.");
    } finally {
      setLoading(null);
    }
  };

  const handleVerifyOtp = async () => {
    if (!normalizedMobile) {
      setError("Enter a valid 10-digit Indian mobile number.");
      return;
    }
    if (!new RegExp(`^\\d{${otpLength}}$`).test(otp)) {
      setError(`Enter the ${otpLength}-digit OTP.`);
      return;
    }

    setLoading("verify");
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          mobile: normalizedMobile,
          otp,
          role,
          challengeId,
          institutionCode: institutionCode?.trim() || undefined,
        }),
      });
      const result = await response.json() as OtpResponse;
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to verify OTP.");
      }

      if (result.registrationPending) {
        setChallengeId("");
        setOtp("");
        setCountdown(0);
        setMessage(result.message || "Your number has been verified. Registration is pending; no portal access was granted.");
        return;
      }

      if (result.data?.token) {
        localStorage.setItem("erp_token", result.data.token);
      }
      if (result.data?.user) {
        localStorage.setItem("erp_user", JSON.stringify(result.data.user));
        if (result.data.user.institutionName) {
          localStorage.setItem("erp_institution_name", result.data.user.institutionName);
        }
        if (result.data.user.activeChildId) {
          localStorage.setItem("erp_active_child_id", result.data.user.activeChildId);
          document.cookie = `erp_active_child=${result.data.user.activeChildId}; path=/; max-age=86400`;
        } else {
          localStorage.removeItem("erp_active_child_id");
          document.cookie = "erp_active_child=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        }
      }

      const requestedDestination = result.data?.redirectUrl;
      const destination =
        typeof requestedDestination === "string" &&
        requestedDestination.startsWith("/") &&
        !requestedDestination.startsWith("//")
          ? requestedDestination
          : roleDestinations[role];
      window.location.assign(destination);
    } catch (verificationError) {
      setError(verificationError instanceof Error ? verificationError.message : "Unable to verify OTP.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="otp-mobile" className="block text-xs font-bold text-[#202936] uppercase tracking-wider mb-1.5">
          Mobile Number
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#788391]">
            <Smartphone className="w-4 h-4" />
          </div>
          <input
            id="otp-mobile"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={16}
            value={mobile}
            onChange={(event) => {
              setMobile(event.target.value.replace(/[^\d+\s()-]/g, ""));
              setChallengeId("");
              setOtp("");
              setCountdown(0);
              setError("");
              setMessage("");
            }}
            placeholder="10-digit Indian mobile number"
            className="w-full pl-10 pr-3.5 py-2.5 text-xs sm:text-sm bg-[#F8FAFC] border border-[#E5E9EF] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123B5A]"
          />
        </div>
        {mobile && !normalizedMobile && (
          <p role="alert" className="mt-1 text-[11px] font-medium text-red-600">
            Enter a valid 10-digit Indian mobile number.
          </p>
        )}
      </div>

      {challengeId && (
        <div>
          <label htmlFor="otp-code" className="block text-xs font-bold text-[#202936] uppercase tracking-wider mb-1.5">
            {otpLength}-Digit OTP
          </label>
          <input
            id="otp-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={otpLength}
            value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, otpLength))}
            placeholder={`Enter ${otpLength}-digit OTP`}
            className="w-full px-3.5 py-2.5 text-center tracking-[0.6em] text-sm bg-[#F8FAFC] border border-[#E5E9EF] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123B5A]"
          />
          <p className="mt-1 text-[10px] text-[#94A3B8]">OTP expires in {otpExpiry} minutes.</p>
        </div>
      )}

      {error && <p role="alert" className="text-xs font-semibold text-red-600">{error}</p>}
      {message && <p role="status" className="text-xs font-semibold text-emerald-700">{message}</p>}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={handleSendOtp}
          disabled={loading !== null || !normalizedMobile || countdown > 0}
          className="py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-[#123B5A] hover:bg-[#0D2B42] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading === "send"
            ? "Sending OTP..."
            : challengeId
              ? countdown > 0
                ? `Resend code in ${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, "0")}`
                : "Resend OTP"
              : "Send OTP"}
        </button>
        {challengeId && (
          <>
            <button
              type="button"
              onClick={handleVerifyOtp}
              disabled={loading !== null}
              className="py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-[#F5A000] hover:bg-[#DE9100] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading === "verify" ? "Verifying OTP..." : "Verify & Sign In"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
