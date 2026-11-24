"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import {
  CreditCard,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Power,
  Sliders,
  Lock,
  Eye,
  EyeOff,
  Zap,
  Globe,
  Trash2,
  Info,
} from "lucide-react";
import {
  MaskedGatewayConfig,
  PaymentGatewayProvider,
  GatewayEnvironment,
  PaymentPreferences,
} from "@/types/payment-gateway";

export function PaymentGatewaysSettings() {
  const [gateways, setGateways] = useState<MaskedGatewayConfig[]>([]);
  const [preferences, setPreferences] = useState<PaymentPreferences>({
    onlinePaymentsEnabled: true,
    defaultGateway: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal states
  const [configuringProvider, setConfiguringProvider] = useState<PaymentGatewayProvider | null>(null);
  const [disconnectingProvider, setDisconnectingProvider] = useState<PaymentGatewayProvider | null>(null);

  // Form states for config modal
  const [formEnv, setFormEnv] = useState<GatewayEnvironment>("TEST");
  const [formKeyId, setFormKeyId] = useState("");
  const [formKeySecret, setFormKeySecret] = useState("");
  const [formWebhookSecret, setFormWebhookSecret] = useState("");
  const [formIsEnabled, setFormIsEnabled] = useState(true);
  const [formIsDefault, setFormIsDefault] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  // Modal actions loading & feedback
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const fetchGateways = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/settings/payment-gateways");
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load payment gateway configurations");
      }
      setGateways(json.data.gateways || []);
      setPreferences(json.data.preferences || { onlinePaymentsEnabled: true, defaultGateway: null });
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGateways();
  }, [fetchGateways]);

  const handleOpenConfig = (gw: MaskedGatewayConfig) => {
    setConfiguringProvider(gw.provider);
    setFormEnv(gw.environment);
    setFormKeyId("");
    setFormKeySecret("");
    setFormWebhookSecret("");
    setFormIsEnabled(gw.isEnabled);
    setFormIsDefault(gw.isDefault);
    setShowSecret(false);
    setTestResult(null);
  };

  const handleTestModalConnection = async () => {
    if (!configuringProvider) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/settings/payment-gateways", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "TEST_CONNECTION",
          provider: configuringProvider,
          environment: formEnv,
          keyId: formKeyId || undefined,
          keySecret: formKeySecret || undefined,
        }),
      });
      const json = await res.json();
      setTestResult({
        success: Boolean(json.success),
        message: json.message || (json.success ? "Connection verified!" : "Verification failed"),
      });
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || "Connection test failed." });
    } finally {
      setIsTesting(false);
    }
  };

  const handleTestCardConnection = async (provider: PaymentGatewayProvider) => {
    setIsTesting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await fetch("/api/admin/settings/payment-gateways", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "TEST_CONNECTION",
          provider,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccessMessage(`${provider === "RAZORPAY" ? "Razorpay" : "Cashfree"}: ${json.message}`);
      } else {
        setError(`${provider === "RAZORPAY" ? "Razorpay" : "Cashfree"}: ${json.message}`);
      }
      await fetchGateways();
    } catch (err: any) {
      setError(err.message || "Connection test request failed.");
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configuringProvider) return;
    setIsSaving(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/settings/payment-gateways", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SAVE_CONFIG",
          provider: configuringProvider,
          environment: formEnv,
          keyId: formKeyId || undefined,
          keySecret: formKeySecret || undefined,
          webhookSecret: formWebhookSecret || undefined,
          isEnabled: formIsEnabled,
          isDefault: formIsDefault,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to save configuration");
      }
      setConfiguringProvider(null);
      setSuccessMessage(json.message || "Gateway configuration saved successfully.");
      await fetchGateways();
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || "Failed to save configuration." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!disconnectingProvider) return;
    setIsDisconnecting(true);
    try {
      const res = await fetch("/api/admin/settings/payment-gateways", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "DISCONNECT",
          provider: disconnectingProvider,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to disconnect gateway");
      }
      setDisconnectingProvider(null);
      setSuccessMessage(json.message || "Gateway disconnected.");
      await fetchGateways();
    } catch (err: any) {
      setError(err.message || "Disconnect failed.");
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleSetDefault = async (provider: PaymentGatewayProvider) => {
    try {
      const res = await fetch("/api/admin/settings/payment-gateways", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SET_DEFAULT",
          provider,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to set default gateway");
      }
      setSuccessMessage(json.message);
      await fetchGateways();
    } catch (err: any) {
      setError(err.message || "Failed to update default gateway.");
    }
  };

  const handleToggleOnlinePayments = async () => {
    const newValue = !preferences.onlinePaymentsEnabled;
    try {
      const res = await fetch("/api/admin/settings/payment-gateways", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_PREFERENCES",
          onlinePaymentsEnabled: newValue,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to update preferences");
      }
      setPreferences((prev) => ({ ...prev, onlinePaymentsEnabled: newValue }));
      setSuccessMessage(`Online fee collection has been ${newValue ? "enabled" : "disabled"}.`);
    } catch (err: any) {
      setError(err.message || "Failed to update payment preferences.");
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(id);
    setTimeout(() => setCopiedToken(null), 2500);
  };

  const razorpay = gateways.find((g) => g.provider === "RAZORPAY");
  const cashfree = gateways.find((g) => g.provider === "CASHFREE");

  return (
    <div className="space-y-6">
      {/* Alerts */}
      {successMessage && (
        <Alert variant="success" className="animate-in fade-in duration-300">
          <Check className="w-4 h-4 mr-2" />
          <span>{successMessage}</span>
        </Alert>
      )}

      {error && (
        <Alert variant="error" className="animate-in fade-in duration-300">
          <AlertCircle className="w-4 h-4 mr-2" />
          <span>{error}</span>
        </Alert>
      )}

      {/* Preferences & Status Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-base font-bold text-[#1E293B] flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#123B5A]" />
                Online Fee Collection Overview
              </CardTitle>
              <p className="text-xs text-[#64748B] mt-1">
                Student and parent fee payments settle directly into your institution's merchant account.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-[#334155]">Online Fee Payments:</span>
              <button
                type="button"
                onClick={handleToggleOnlinePayments}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  preferences.onlinePaymentsEnabled ? "bg-[#16A34A]" : "bg-[#CBD5E1]"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    preferences.onlinePaymentsEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
              <span
                className={`text-xs font-bold ${
                  preferences.onlinePaymentsEnabled ? "text-[#16A34A]" : "text-[#64748B]"
                }`}
              >
                {preferences.onlinePaymentsEnabled ? "ENABLED" : "PAUSED"}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl space-y-1">
              <span className="text-[#64748B] font-medium">Active Default Gateway</span>
              <div className="text-sm font-bold text-[#123B5A] flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-[#F5A000]" />
                {preferences.defaultGateway
                  ? preferences.defaultGateway === "RAZORPAY"
                    ? "Razorpay Payments"
                    : "Cashfree Payments"
                  : "None (Offline Only)"}
              </div>
            </div>

            <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl space-y-1">
              <span className="text-[#64748B] font-medium">Settlement Model</span>
              <div className="text-sm font-bold text-[#1E293B]">
                Direct Institution Settlement
              </div>
            </div>

            <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl space-y-1">
              <span className="text-[#64748B] font-medium">Credential Security</span>
              <div className="text-sm font-bold text-[#16A34A] flex items-center gap-1">
                <Lock className="w-3.5 h-3.5" />
                AES-256-GCM Encrypted
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gateway Cards Grid */}
      {loading ? (
        <div className="p-12 text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-[#123B5A] animate-spin mx-auto" />
          <p className="text-sm font-semibold text-[#1E293B]">Loading Gateway Configurations...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* RAZORPAY CARD */}
          <Card className="flex flex-col justify-between border-t-4 border-t-[#0C2340]">
            <div>
              <CardHeader className="pb-3 border-b border-[#F1F5F9]">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#0C2340] text-white flex items-center justify-center font-bold text-sm shadow-xs">
                      Rz
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base font-bold text-[#1E293B]">Razorpay</CardTitle>
                        {razorpay?.isDefault && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E0E7FF] text-[#3730A3] border border-[#C7D2FE]">
                            DEFAULT
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-[#64748B]">Card, UPI, Netbanking, Wallets</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                        razorpay?.connectionStatus === "CONNECTED"
                          ? "bg-[#DCFCE7] text-[#15803D] border-[#BBF7D0]"
                          : razorpay?.connectionStatus === "FAILED"
                          ? "bg-[#FEE2E2] text-[#B91C1C] border-[#FECACA]"
                          : razorpay?.connectionStatus === "DISABLED"
                          ? "bg-[#FEF3C7] text-[#B45309] border-[#FDE68A]"
                          : "bg-[#F1F5F9] text-[#64748B] border-[#CBD5E1]"
                      }`}
                    >
                      {razorpay?.connectionStatus || "NOT_CONFIGURED"}
                    </span>
                    <span className="px-2 py-0.5 rounded-lg text-xs font-semibold bg-[#F8FAFC] border border-[#CBD5E1] text-[#334155]">
                      {razorpay?.environment || "TEST"}
                    </span>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 pt-4 text-xs">
                {/* Credentials summary */}
                <div className="space-y-2 bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0]">
                  <div className="flex justify-between items-center">
                    <span className="text-[#64748B] font-medium">Key ID</span>
                    <span className="font-mono text-[#1E293B] font-semibold">
                      {razorpay?.maskedKeyId || "Not configured"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#64748B] font-medium">Key Secret</span>
                    <span className="font-mono text-[#64748B]">
                      {razorpay?.maskedSecret || "••••••••••••"}
                    </span>
                  </div>
                  {razorpay?.lastVerifiedAt && (
                    <div className="flex justify-between items-center pt-1 border-t border-[#E2E8F0] text-[11px] text-[#64748B]">
                      <span>Last Verified</span>
                      <span>{new Date(razorpay.lastVerifiedAt).toLocaleString()}</span>
                    </div>
                  )}
                </div>

                {/* Webhook Endpoint */}
                {razorpay && (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase text-[#475569] flex items-center justify-between">
                      <span>Webhook URL for Razorpay Dashboard</span>
                      <span className="text-[10px] text-[#16A34A] lowercase font-normal flex items-center gap-1">
                        <Check className="w-3 h-3" /> unpredictable token
                      </span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={razorpay.webhookUrl}
                        className="w-full text-xs font-mono bg-white border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 text-[#334155] select-all"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(razorpay.webhookUrl, "rzp_webhook")}
                        className="shrink-0"
                      >
                        {copiedToken === "rzp_webhook" ? (
                          <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {razorpay?.lastError && (
                  <div className="p-2.5 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-xs text-[#B91C1C] flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{razorpay.lastError}</span>
                  </div>
                )}
              </CardContent>
            </div>

            <CardFooter className="pt-4 border-t border-[#F1F5F9] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => razorpay && handleOpenConfig(razorpay)}
                >
                  <Sliders className="w-3.5 h-3.5 mr-1" />
                  {razorpay?.hasCredentials ? "Edit Configuration" : "Configure Razorpay"}
                </Button>

                {razorpay?.hasCredentials && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isTesting}
                    onClick={() => handleTestCardConnection("RAZORPAY")}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isTesting ? "animate-spin" : ""}`} />
                    Test Connection
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {razorpay?.hasCredentials && !razorpay.isDefault && razorpay.connectionStatus === "CONNECTED" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSetDefault("RAZORPAY")}
                    className="text-[#123B5A] text-xs font-semibold"
                  >
                    Set as Default
                  </Button>
                )}

                {razorpay?.hasCredentials && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDisconnectingProvider("RAZORPAY")}
                    className="text-[#DC2626] hover:bg-[#FEF2F2] text-xs font-semibold"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    Disconnect
                  </Button>
                )}
              </div>
            </CardFooter>
          </Card>

          {/* CASHFREE CARD */}
          <Card className="flex flex-col justify-between border-t-4 border-t-[#0070F3]">
            <div>
              <CardHeader className="pb-3 border-b border-[#F1F5F9]">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#0070F3] text-white flex items-center justify-center font-bold text-sm shadow-xs">
                      Cf
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base font-bold text-[#1E293B]">Cashfree Payments</CardTitle>
                        {cashfree?.isDefault && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E0E7FF] text-[#3730A3] border border-[#C7D2FE]">
                            DEFAULT
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-[#64748B]">Auto-collect, UPI, Netbanking, Cards</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                        cashfree?.connectionStatus === "CONNECTED"
                          ? "bg-[#DCFCE7] text-[#15803D] border-[#BBF7D0]"
                          : cashfree?.connectionStatus === "FAILED"
                          ? "bg-[#FEE2E2] text-[#B91C1C] border-[#FECACA]"
                          : cashfree?.connectionStatus === "DISABLED"
                          ? "bg-[#FEF3C7] text-[#B45309] border-[#FDE68A]"
                          : "bg-[#F1F5F9] text-[#64748B] border-[#CBD5E1]"
                      }`}
                    >
                      {cashfree?.connectionStatus || "NOT_CONFIGURED"}
                    </span>
                    <span className="px-2 py-0.5 rounded-lg text-xs font-semibold bg-[#F8FAFC] border border-[#CBD5E1] text-[#334155]">
                      {cashfree?.environment || "SANDBOX"}
                    </span>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 pt-4 text-xs">
                {/* Credentials summary */}
                <div className="space-y-2 bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0]">
                  <div className="flex justify-between items-center">
                    <span className="text-[#64748B] font-medium">App ID (Client ID)</span>
                    <span className="font-mono text-[#1E293B] font-semibold">
                      {cashfree?.maskedKeyId || "Not configured"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#64748B] font-medium">Secret Key</span>
                    <span className="font-mono text-[#64748B]">
                      {cashfree?.maskedSecret || "••••••••••••"}
                    </span>
                  </div>
                  {cashfree?.lastVerifiedAt && (
                    <div className="flex justify-between items-center pt-1 border-t border-[#E2E8F0] text-[11px] text-[#64748B]">
                      <span>Last Verified</span>
                      <span>{new Date(cashfree.lastVerifiedAt).toLocaleString()}</span>
                    </div>
                  )}
                </div>

                {/* Webhook Endpoint */}
                {cashfree && (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase text-[#475569] flex items-center justify-between">
                      <span>Webhook URL for Cashfree Dashboard</span>
                      <span className="text-[10px] text-[#16A34A] lowercase font-normal flex items-center gap-1">
                        <Check className="w-3 h-3" /> unpredictable token
                      </span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={cashfree.webhookUrl}
                        className="w-full text-xs font-mono bg-white border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 text-[#334155] select-all"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(cashfree.webhookUrl, "cf_webhook")}
                        className="shrink-0"
                      >
                        {copiedToken === "cf_webhook" ? (
                          <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {cashfree?.lastError && (
                  <div className="p-2.5 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-xs text-[#B91C1C] flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{cashfree.lastError}</span>
                  </div>
                )}
              </CardContent>
            </div>

            <CardFooter className="pt-4 border-t border-[#F1F5F9] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => cashfree && handleOpenConfig(cashfree)}
                >
                  <Sliders className="w-3.5 h-3.5 mr-1" />
                  {cashfree?.hasCredentials ? "Edit Configuration" : "Configure Cashfree"}
                </Button>

                {cashfree?.hasCredentials && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isTesting}
                    onClick={() => handleTestCardConnection("CASHFREE")}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isTesting ? "animate-spin" : ""}`} />
                    Test Connection
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {cashfree?.hasCredentials && !cashfree.isDefault && cashfree.connectionStatus === "CONNECTED" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSetDefault("CASHFREE")}
                    className="text-[#123B5A] text-xs font-semibold"
                  >
                    Set as Default
                  </Button>
                )}

                {cashfree?.hasCredentials && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDisconnectingProvider("CASHFREE")}
                    className="text-[#DC2626] hover:bg-[#FEF2F2] text-xs font-semibold"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    Disconnect
                  </Button>
                )}
              </div>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* Webhook Configuration Guide Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold text-[#1E293B] flex items-center gap-2">
            <Info className="w-4 h-4 text-[#F5A000]" />
            Webhook Integration & Event Subscription Guide
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs space-y-3 text-[#475569]">
          <p>
            Payment webhooks guarantee real-time fee settlement even if a student closes their browser window
            before redirecting back. Configure the webhook URL in your payment gateway merchant console with the following events:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl space-y-1.5">
              <span className="font-bold text-[#0C2340]">Razorpay Dashboard Events</span>
              <ul className="list-disc list-inside space-y-0.5 text-[#334155] font-mono text-[11px]">
                <li>order.paid</li>
                <li>payment.captured</li>
                <li>payment.failed</li>
              </ul>
            </div>
            <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl space-y-1.5">
              <span className="font-bold text-[#0070F3]">Cashfree Dashboard Events</span>
              <ul className="list-disc list-inside space-y-0.5 text-[#334155] font-mono text-[11px]">
                <li>PAYMENT_SUCCESS_WEBHOOK</li>
                <li>PAYMENT_FAILED_WEBHOOK</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CONFIGURATION MODAL */}
      {configuringProvider && (
        <Modal
          isOpen={Boolean(configuringProvider)}
          onClose={() => setConfiguringProvider(null)}
          title={`Configure ${configuringProvider === "RAZORPAY" ? "Razorpay" : "Cashfree"} Gateway`}
          description="Enter merchant credentials. Secrets are encrypted using AES-256-GCM before storage."
          maxWidth="md"
        >
          <form onSubmit={handleSaveConfig} className="space-y-4">
            {testResult && (
              <Alert variant={testResult.success ? "success" : "error"}>
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                ) : (
                  <AlertCircle className="w-4 h-4 mr-2" />
                )}
                <span>{testResult.message}</span>
              </Alert>
            )}

            {/* Environment Toggle */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#334155]">Gateway Environment</label>
              <div className="grid grid-cols-2 gap-2">
                {configuringProvider === "RAZORPAY" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setFormEnv("TEST")}
                      className={`p-2.5 rounded-lg border text-xs font-semibold cursor-pointer transition ${
                        formEnv === "TEST"
                          ? "border-[#123B5A] bg-[#EEF1F5] text-[#123B5A]"
                          : "border-[#CBD5E1] bg-white text-[#64748B]"
                      }`}
                    >
                      Test Mode (Sandbox)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormEnv("LIVE")}
                      className={`p-2.5 rounded-lg border text-xs font-semibold cursor-pointer transition ${
                        formEnv === "LIVE"
                          ? "border-[#123B5A] bg-[#EEF1F5] text-[#123B5A]"
                          : "border-[#CBD5E1] bg-white text-[#64748B]"
                      }`}
                    >
                      Live Production
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setFormEnv("SANDBOX")}
                      className={`p-2.5 rounded-lg border text-xs font-semibold cursor-pointer transition ${
                        formEnv === "SANDBOX"
                          ? "border-[#123B5A] bg-[#EEF1F5] text-[#123B5A]"
                          : "border-[#CBD5E1] bg-white text-[#64748B]"
                      }`}
                    >
                      Sandbox Mode
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormEnv("PRODUCTION")}
                      className={`p-2.5 rounded-lg border text-xs font-semibold cursor-pointer transition ${
                        formEnv === "PRODUCTION"
                          ? "border-[#123B5A] bg-[#EEF1F5] text-[#123B5A]"
                          : "border-[#CBD5E1] bg-white text-[#64748B]"
                      }`}
                    >
                      Production Mode
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Key ID / App ID */}
            <Input
              label={configuringProvider === "RAZORPAY" ? "Razorpay Key ID" : "Cashfree App ID (Client ID)"}
              placeholder={
                configuringProvider === "RAZORPAY"
                  ? "rzp_test_... or rzp_live_..."
                  : "cf_app_... or Client ID"
              }
              value={formKeyId}
              onChange={(e) => setFormKeyId(e.target.value)}
              helperText="Available in your payment gateway developer console API keys section"
            />

            {/* Key Secret / Secret Key */}
            <div className="relative">
              <Input
                label={configuringProvider === "RAZORPAY" ? "Razorpay Key Secret" : "Cashfree Secret Key"}
                type={showSecret ? "text" : "password"}
                placeholder="••••••••••••••••••••"
                value={formKeySecret}
                onChange={(e) => setFormKeySecret(e.target.value)}
                helperText="Leave blank to retain previously saved encrypted secret"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-8 text-[#94A3B8] hover:text-[#334155] cursor-pointer"
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Webhook Secret */}
            <Input
              label="Webhook Secret (Optional)"
              placeholder="Webhook signing secret"
              value={formWebhookSecret}
              onChange={(e) => setFormWebhookSecret(e.target.value)}
              helperText="Used to cryptographically verify incoming webhook notifications"
            />

            {/* Toggles */}
            <div className="space-y-3 pt-2 border-t border-[#F1F5F9]">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-[#334155]">
                <input
                  type="checkbox"
                  checked={formIsEnabled}
                  onChange={(e) => setFormIsEnabled(e.target.checked)}
                  className="rounded border-[#CBD5E1] text-[#123B5A] focus:ring-[#123B5A]"
                />
                <span>Enable this payment gateway for fee checkout</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-[#334155]">
                <input
                  type="checkbox"
                  checked={formIsDefault}
                  onChange={(e) => setFormIsDefault(e.target.checked)}
                  className="rounded border-[#CBD5E1] text-[#123B5A] focus:ring-[#123B5A]"
                />
                <span>Set as default gateway for student fee collection</span>
              </label>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-[#E2E8F0]">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isTesting || (!formKeyId && !formKeySecret)}
                onClick={handleTestModalConnection}
              >
                <Zap className={`w-3.5 h-3.5 mr-1 ${isTesting ? "animate-spin" : ""}`} />
                {isTesting ? "Verifying..." : "Test Connection"}
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfiguringProvider(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : "Save Configuration"}
                </Button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* DISCONNECT CONFIRMATION MODAL */}
      {disconnectingProvider && (
        <Modal
          isOpen={Boolean(disconnectingProvider)}
          onClose={() => setDisconnectingProvider(null)}
          title="Disconnect Payment Gateway"
          description="Are you sure you want to remove this gateway configuration?"
          maxWidth="sm"
        >
          <div className="space-y-4 text-xs">
            <p className="text-[#64748B]">
              Disconnecting {disconnectingProvider === "RAZORPAY" ? "Razorpay" : "Cashfree"} will remove its
              encrypted API keys and disable online student fee checkout through this channel.
            </p>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E2E8F0]">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDisconnectingProvider(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={isDisconnecting}
                onClick={handleDisconnect}
              >
                {isDisconnecting ? "Disconnecting..." : "Confirm Disconnect"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
