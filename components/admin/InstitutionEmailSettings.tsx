"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import {
  Mail,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  Power,
  Lock,
  Eye,
  EyeOff,
  Zap,
  Info,
  Server,
  ArrowRight,
  Send,
} from "lucide-react";
import {
  EmailProviderType,
  MaskedInstitutionEmailConfig,
  EmailVerificationStatus,
} from "@/types/email-infrastructure";

export function InstitutionEmailSettings() {
  const [config, setConfig] = useState<MaskedInstitutionEmailConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form states
  const [provider, setProvider] = useState<EmailProviderType>("SMTP");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderName, setSenderName] = useState("");
  const [replyToEmail, setReplyToEmail] = useState("");
  const [isEnabled, setIsEnabled] = useState(false);

  // SMTP form states
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUsername, setSmtpUsername] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // API form states
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  // Action states
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/settings/email");
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load email settings");
      }

      const data: MaskedInstitutionEmailConfig = json.data;
      setConfig(data);
      setProvider(data.provider || "SMTP");
      setSenderEmail(data.senderEmail || "");
      setSenderName(data.senderName || "");
      setReplyToEmail(data.replyToEmail || "");
      setIsEnabled(data.isEnabled || false);

      if (data.provider === "SMTP" && data.maskedCredentials) {
        const creds = data.maskedCredentials as any;
        setSmtpHost(creds.host || "");
        setSmtpPort(creds.port || 587);
        setSmtpSecure(Boolean(creds.secure));
        setSmtpUsername(creds.username || "");
      }
    } catch (err: any) {
      setError(err.message || "Failed to connect to email settings service");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      setError(null);
      setSuccessMessage(null);
      setTestResult(null);

      const payload: any = {
        provider,
        senderEmail,
        senderName,
        replyToEmail: replyToEmail || undefined,
        isEnabled,
      };

      if (provider === "SMTP") {
        payload.credentials = {
          host: smtpHost,
          port: Number(smtpPort),
          secure: smtpSecure,
          username: smtpUsername,
          password: smtpPassword || undefined,
        };
      } else {
        payload.credentials = {
          apiKey: apiKey || undefined,
        };
      }

      const res = await fetch("/api/admin/settings/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to save settings");
      }

      setConfig(json.data);
      setSuccessMessage("Email settings saved securely. Please test connection to verify sender authorization.");
      setSmtpPassword("");
      setApiKey("");
    } catch (err: any) {
      setError(err.message || "Failed to save email settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setIsTesting(true);
      setError(null);
      setTestResult(null);

      const res = await fetch("/api/admin/settings/email?action=test", {
        method: "POST",
      });

      const json = await res.json();
      setTestResult({
        success: json.success,
        message: json.message || (json.success ? "Connection verified successfully!" : "Connection test failed."),
      });

      if (json.data) {
        setConfig(json.data);
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || "Failed to execute connection test.",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleToggleActive = async () => {
    if (!config) return;
    try {
      setIsToggling(true);
      setError(null);

      const newEnabled = !config.isEnabled;
      const res = await fetch("/api/admin/settings/email?action=toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: newEnabled }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to update provider status");
      }

      setConfig(json.data);
      setIsEnabled(json.data.isEnabled);
      setSuccessMessage(json.data.isEnabled ? "Institution email delivery is active." : "Institution provider disabled. Central Sohan Softech fallback active.");
    } catch (err: any) {
      setError(err.message || "Failed to toggle status");
    } finally {
      setIsToggling(false);
    }
  };

  if (loading) {
    return (
      <Card className="border border-slate-200 shadow-sm">
        <CardContent className="flex items-center justify-center p-12">
          <RefreshCw className="h-6 w-6 animate-spin text-slate-400 mr-3" />
          <span className="text-sm font-medium text-slate-600">Loading email infrastructure configuration...</span>
        </CardContent>
      </Card>
    );
  }

  const status = config?.status || "NOT_CONFIGURED";

  return (
    <div className="space-y-6">
      {/* Option C Architecture Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-xl p-5 shadow-sm border border-slate-800">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="bg-amber-400 text-slate-950 text-[10px] font-bold px-2 py-0.5 rounded tracking-wide uppercase">
                Approved Architecture
              </span>
              <span className="text-xs text-slate-300 font-medium">Option C: Institution Provider + Central Fallback</span>
            </div>
            <h3 className="text-base font-bold text-white mt-1">Multi-Tenant Email Dispatch Engine</h3>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              When your institution sender is verified and enabled, emails are sent directly under your official address.
              If your provider is disabled or encounters an upstream outage, SST-ERP automatically routes delivery through
              the central Sohan Softech provider (<code className="text-amber-300 bg-slate-800/80 px-1 py-0.5 rounded">{config?.centralFallbackSender || "noreply@erp.sohansoft.in"}</code>) to ensure uninterrupted communications.
            </p>
          </div>
          <ShieldCheck className="h-10 w-10 text-emerald-400 shrink-0 ml-4 hidden sm:block opacity-90" />
        </div>
      </div>

      {/* Status Card */}
      <Card className="border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            {status === "VERIFIED" ? (
              <div className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            ) : status === "PENDING_VERIFICATION" ? (
              <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                <AlertCircle className="h-5 w-5" />
              </div>
            ) : status === "FAILED" ? (
              <div className="h-9 w-9 rounded-full bg-rose-100 flex items-center justify-center text-rose-600">
                <AlertCircle className="h-5 w-5" />
              </div>
            ) : (
              <div className="h-9 w-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-500">
                <Server className="h-5 w-5" />
              </div>
            )}
            <div>
              <div className="flex items-center space-x-2">
                <h4 className="text-sm font-bold text-slate-900">
                  {status === "VERIFIED"
                    ? "Verified & Authorized"
                    : status === "PENDING_VERIFICATION"
                    ? "Verification Required"
                    : status === "FAILED"
                    ? "Connection Test Failed"
                    : "Not Configured (Central Fallback Active)"}
                </h4>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    status === "VERIFIED"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : status === "PENDING_VERIFICATION"
                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                      : status === "FAILED"
                      ? "bg-rose-50 text-rose-700 border border-rose-200"
                      : "bg-slate-100 text-slate-600 border border-slate-200"
                  }`}
                >
                  {status}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {status === "VERIFIED"
                  ? `Active sender: ${config?.senderEmail} · Last verified: ${config?.lastVerifiedAt ? new Date(config.lastVerifiedAt).toLocaleString("en-IN") : "Recently"}`
                  : status === "PENDING_VERIFICATION"
                  ? "Settings have changed. You must perform a connection test to authorize sending."
                  : "Using central Sohan Softech sender until verified."}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {config?.hasCredentials && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={isTesting}
                className="text-xs h-8"
              >
                {isTesting ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Zap className="h-3.5 w-3.5 mr-1.5 text-amber-600" />}
                Test Connection
              </Button>
            )}

            {status === "VERIFIED" && config && (
              <Button
                type="button"
                variant={config.isEnabled ? "destructive" : "default"}
                size="sm"
                onClick={handleToggleActive}
                disabled={isToggling}
                className="text-xs h-8"
              >
                <Power className="h-3.5 w-3.5 mr-1.5" />
                {config.isEnabled ? "Disable Provider" : "Enable Provider"}
              </Button>
            )}
          </div>
        </div>

        {/* Feedback Banners */}
        {error && (
          <div className="p-4 bg-rose-50 border-b border-rose-200 text-xs text-rose-800 flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-4 bg-emerald-50 border-b border-emerald-200 text-xs text-emerald-800 flex items-center space-x-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        )}

        {testResult && (
          <div
            className={`p-4 border-b text-xs flex items-center space-x-2 ${
              testResult.success
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-rose-50 border-rose-200 text-rose-800"
            }`}
          >
            {testResult.success ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            )}
            <span>{testResult.message}</span>
          </div>
        )}

        {/* Configuration Form */}
        <form onSubmit={handleSave}>
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Provider Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Email Provider Type
                </label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as EmailProviderType)}
                  className="w-full text-xs h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="SMTP">SMTP (Standard Server / Exchange / Gmail Workspace)</option>
                  <option value="RESEND">Resend API (Dedicated Key)</option>
                  <option value="SENDGRID">SendGrid API</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Select your institutional email relay protocol.
                </p>
              </div>

              {/* Official Sender Address */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Official Sender Email Address <span className="text-rose-500">*</span>
                </label>
                <Input
                  type="email"
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  placeholder="e.g. notifications@yourinstitution.edu.in"
                  required
                  className="text-xs h-9"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Security Rule: Entering an address alone does NOT authorize sending without verification.
                </p>
              </div>

              {/* Sender Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Sender Display Name
                </label>
                <Input
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="e.g. Apex Institute Admissions & Examinations"
                  className="text-xs h-9"
                />
              </div>

              {/* Reply-To Email */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Reply-To Address (Optional)
                </label>
                <Input
                  type="email"
                  value={replyToEmail}
                  onChange={(e) => setReplyToEmail(e.target.value)}
                  placeholder="e.g. helpdesk@yourinstitution.edu.in"
                  className="text-xs h-9"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Recipient replies will be routed directly to this inbox.
                </p>
              </div>
            </div>

            {/* Provider-Specific Credentials */}
            {provider === "SMTP" ? (
              <div className="border-t border-slate-200 pt-5 space-y-4">
                <h5 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center">
                  <Lock className="h-3.5 w-3.5 text-slate-400 mr-1.5" />
                  SMTP Connection Credentials (AES-256-GCM Encrypted)
                </h5>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      SMTP Host
                    </label>
                    <Input
                      type="text"
                      value={smtpHost}
                      onChange={(e) => setSmtpHost(e.target.value)}
                      placeholder="e.g. smtp.gmail.com or mail.yourinstitution.edu"
                      className="text-xs h-9"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Port
                    </label>
                    <Input
                      type="number"
                      value={smtpPort}
                      onChange={(e) => setSmtpPort(parseInt(e.target.value, 10) || 587)}
                      placeholder="587"
                      className="text-xs h-9"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Username / Account
                    </label>
                    <Input
                      type="text"
                      value={smtpUsername}
                      onChange={(e) => setSmtpUsername(e.target.value)}
                      placeholder="e.g. notifications@yourinstitution.edu"
                      className="text-xs h-9"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-slate-700">
                        Password / App Key
                      </label>
                      {config?.hasCredentials && (
                        <span className="text-[10px] text-emerald-600 font-medium">
                          ✓ Key saved in encrypted storage
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={smtpPassword}
                        onChange={(e) => setSmtpPassword(e.target.value)}
                        placeholder={config?.hasCredentials ? "•••••••••••• (Leave blank to keep existing)" : "Enter SMTP password"}
                        className="text-xs h-9 pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="checkbox"
                    id="smtpSecure"
                    checked={smtpSecure}
                    onChange={(e) => setSmtpSecure(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <label htmlFor="smtpSecure" className="text-xs text-slate-700 font-medium">
                    Use SSL / TLS connection directly (Port 465)
                  </label>
                </div>
              </div>
            ) : (
              <div className="border-t border-slate-200 pt-5 space-y-4">
                <h5 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center">
                  <Lock className="h-3.5 w-3.5 text-slate-400 mr-1.5" />
                  API Provider Secret (AES-256-GCM Encrypted)
                </h5>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-700">
                      {provider} API Key
                    </label>
                    {config?.hasCredentials && (
                      <span className="text-[10px] text-emerald-600 font-medium">
                        ✓ API key stored securely
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      type={showApiKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={config?.hasCredentials ? "•••••••••••• (Leave blank to keep existing)" : "Enter API key"}
                      className="text-xs h-9 pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>

          <CardFooter className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">
              Credentials are never transmitted to unauthorized users or logged in plaintext.
            </span>
            <Button
              type="submit"
              size="sm"
              disabled={isSaving}
              className="bg-[#123B5A] hover:bg-[#0e2f49] text-white text-xs h-9 px-4"
            >
              {isSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Save Configuration
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
