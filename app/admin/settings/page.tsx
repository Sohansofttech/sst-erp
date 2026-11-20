"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useInstitution } from "@/lib/store";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import {
  Building2,
  Upload,
  Check,
  RotateCcw,
  Globe,
  Mail,
  Phone,
  Palette,
  ShieldCheck,
  Image as ImageIcon,
  MapPin,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Eye,
} from "lucide-react";
import {
  InstitutionThemeConfig,
  DEFAULT_INSTITUTION_THEME,
  PRESET_THEMES,
  isValidHex,
  normalizeHex,
  checkThemeAccessibility,
  getContrastRatio,
} from "@/lib/theme-utils";

export default function InstitutionSettingsPage() {
  const {
    profile,
    updateProfile,
    refreshProfile,
    isProfileLoading,
    profileError,
    theme: contextTheme,
    updateTheme,
    resetThemeToDefaults,
    resetToDefaults,
  } = useInstitution();

  // Active settings tab: "profile" | "address" | "appearance"
  const [activeTab, setActiveTab] = useState<"profile" | "address" | "appearance">("appearance");

  // Authoritative state derived from InstitutionProvider
  const isLoadingSettings = isProfileLoading;
  const settingsError = profileError;
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form states initialized from authoritative profile
  const [formData, setFormData] = useState(profile);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [themeSaveSuccess, setThemeSaveSuccess] = useState(false);
  const [logoPreview, setLogoPreview] = useState(profile.logoUrl || "");

  // Sync form data whenever profile is hydrated from the authoritative store
  useEffect(() => {
    setFormData(profile);
    if (profile.logoUrl) {
      setLogoPreview(profile.logoUrl);
    }
  }, [profile]);

  // Local theme state for live preview before saving
  const [currentTheme, setCurrentTheme] = useState<InstitutionThemeConfig>(() => {
    return contextTheme || profile.themeConfig || DEFAULT_INSTITUTION_THEME;
  });

  useEffect(() => {
    if (contextTheme) {
      setCurrentTheme(contextTheme);
    } else if (profile.themeConfig) {
      setCurrentTheme(profile.themeConfig);
    }
  }, [contextTheme, profile.themeConfig]);

  // Accessibility / Contrast analysis
  const accessibility = useMemo(() => {
    return checkThemeAccessibility(currentTheme);
  }, [currentTheme]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setLogoPreview(result);
        setFormData((prev) => ({ ...prev, logoUrl: result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveLogo = () => {
    setLogoPreview("");
    setFormData((prev) => ({ ...prev, logoUrl: "" }));
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData) return;

    if (isLoadingSettings) {
      alert("Settings are still loading. Please wait.");
      return;
    }

    // Protection check: Do not allow mock defaults to be saved as genuine settings
    if (formData.id === "inst-sst-01" || formData.email === "admin@sohansoft.in") {
      setSaveError("Security restriction: Hardcoded mock institution defaults cannot be saved as genuine settings.");
      return;
    }

    if (!formData.name?.trim() || !formData.code?.trim()) {
      setSaveError("Official Institution Name and Institutional Code are required.");
      return;
    }

    try {
      setIsSaving(true);
      setSaveError(null);
      setSaveSuccess(false);

      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to persist institution settings.");
      }

      updateProfile(formData);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      setSaveError(err.message || "Failed to update institution settings.");
    } finally {
      setIsSaving(false);
    }
  };

  // Theme property update handler
  const handleThemeColorChange = (key: keyof InstitutionThemeConfig, value: string) => {
    setCurrentTheme((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // Chart palette color update handler
  const handleChartColorChange = (index: number, value: string) => {
    setCurrentTheme((prev) => {
      const newPalette = [...prev.chartPalette];
      newPalette[index] = value;
      return {
        ...prev,
        chartPalette: newPalette,
      };
    });
  };

  // Apply a preset theme
  const applyPreset = (presetKey: string) => {
    const preset = PRESET_THEMES[presetKey];
    if (preset) {
      setCurrentTheme(preset.theme);
      updateTheme(preset.theme);
      setThemeSaveSuccess(true);
      setTimeout(() => setThemeSaveSuccess(false), 3000);
    }
  };

  // Save customized theme
  const handleSaveTheme = () => {
    // Validate all 9 properties
    const keys: (keyof InstitutionThemeConfig)[] = [
      "sidebarBackground",
      "primaryButtonColor",
      "activeSidebarNav",
      "workspaceBackground",
      "cardBackground",
      "primaryTextColor",
      "secondaryTextColor",
      "accentColor",
    ];

    for (const k of keys) {
      if (!isValidHex(currentTheme[k] as string)) {
        alert(`Invalid hex code for ${String(k)}: "${currentTheme[k]}". Please enter a valid hex color (e.g. #123B5A).`);
        return;
      }
    }

    for (let i = 0; i < currentTheme.chartPalette.length; i++) {
      if (!isValidHex(currentTheme.chartPalette[i])) {
        alert(`Invalid hex code for chart color #${i + 1}: "${currentTheme.chartPalette[i]}".`);
        return;
      }
    }

    const sanitized: InstitutionThemeConfig = {
      sidebarBackground: normalizeHex(currentTheme.sidebarBackground),
      primaryButtonColor: normalizeHex(currentTheme.primaryButtonColor),
      activeSidebarNav: normalizeHex(currentTheme.activeSidebarNav),
      workspaceBackground: normalizeHex(currentTheme.workspaceBackground),
      cardBackground: normalizeHex(currentTheme.cardBackground),
      primaryTextColor: normalizeHex(currentTheme.primaryTextColor),
      secondaryTextColor: normalizeHex(currentTheme.secondaryTextColor),
      chartPalette: currentTheme.chartPalette.map((c) => normalizeHex(c)),
      accentColor: normalizeHex(currentTheme.accentColor),
    };

    updateTheme(sanitized);
    setCurrentTheme(sanitized);
    setThemeSaveSuccess(true);
    setTimeout(() => setThemeSaveSuccess(false), 4000);
  };

  // Reset theme to defaults
  const handleResetTheme = () => {
    if (confirm("Reset theme back to official SST-ERP defaults (#123B5A Navy & #F5A000 Amber)?")) {
      resetThemeToDefaults();
      setCurrentTheme(DEFAULT_INSTITUTION_THEME);
      setThemeSaveSuccess(true);
      setTimeout(() => setThemeSaveSuccess(false), 3000);
    }
  };

  const institutionTypeOptions = [
    { value: "Engineering & Technology", label: "Engineering & Technology" },
    { value: "University", label: "State / Central / Deemed University" },
    { value: "Arts & Science", label: "Arts & Science College" },
    { value: "Polytechnic / Diploma", label: "Polytechnic / Diploma College" },
    { value: "Medical & Health Sciences", label: "Medical & Allied Health Sciences" },
    { value: "K-12 School", label: "K-12 Higher Secondary School" },
  ];

  const calendarTypeOptions = [
    { value: "Semester", label: "Semester-Based (Odd / Even Terms)" },
    { value: "Annual", label: "Annual / Yearly System" },
    { value: "Trimester", label: "Trimester (3 Terms / Year)" },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E2E8F0]">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#1E293B]">
            Institution Settings
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            Configure institutional profile, campus metadata, design system and theme branding.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm("Reset all settings and data back to initial default values?")) {
                resetToDefaults();
                window.location.reload();
              }
            }}
            leftIcon={<RotateCcw className="w-4 h-4 text-[#64748B]" />}
          >
            Reset All Data
          </Button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-[#E2E8F0] pb-px">
        <button
          type="button"
          onClick={() => setActiveTab("appearance")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 cursor-pointer ${
            activeTab === "appearance"
              ? "border-[#F5A000] text-[#F5A000] bg-white"
              : "border-transparent text-[#64748B] hover:text-[#1E293B] hover:bg-slate-50"
          }`}
        >
          <Palette className="w-4 h-4" />
          <span>Appearance / Branding (Theme)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("profile")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 cursor-pointer ${
            activeTab === "profile"
              ? "border-[#F5A000] text-[#F5A000] bg-white"
              : "border-transparent text-[#64748B] hover:text-[#1E293B] hover:bg-slate-50"
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Institution Identity</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("address")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 cursor-pointer ${
            activeTab === "address"
              ? "border-[#F5A000] text-[#F5A000] bg-white"
              : "border-transparent text-[#64748B] hover:text-[#1E293B] hover:bg-slate-50"
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>Campus Address & Contact</span>
        </button>
      </div>

      {/* TAB 1: APPEARANCE & THEME CUSTOMIZATION */}
      {activeTab === "appearance" && (
        <div className="space-y-6">
          {/* Theme Save Alert */}
          {themeSaveSuccess && (
            <Alert variant="success" className="animate-in fade-in duration-300">
              <Check className="w-4 h-4 mr-2" />
              Theme settings saved and applied dynamically across the portal!
            </Alert>
          )}

          {/* Preset Selector Bar */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between w-full">
                <div>
                  <CardTitle>Theme Presets & Multi-Tenant Profiles</CardTitle>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Select a curated institutional theme or customize each design token individually below.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleResetTheme}
                  leftIcon={<RefreshCw className="w-3.5 h-3.5 text-[#64748B]" />}
                >
                  Reset Defaults
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {Object.entries(PRESET_THEMES).map(([key, preset]) => {
                  const isCurrent =
                    currentTheme.sidebarBackground.toUpperCase() === preset.theme.sidebarBackground.toUpperCase() &&
                    currentTheme.primaryButtonColor.toUpperCase() === preset.theme.primaryButtonColor.toUpperCase();

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => applyPreset(key)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative ${
                        isCurrent
                          ? "border-[#F5A000] ring-2 ring-[#F5A000]/20 bg-amber-50/20"
                          : "border-[#E2E8F0] hover:border-[#CBD5E1] bg-white"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-2">
                        <span
                          className="w-5 h-5 rounded-full border border-black/10 shadow-xs"
                          style={{ backgroundColor: preset.theme.sidebarBackground }}
                        />
                        <span
                          className="w-5 h-5 rounded-full border border-black/10 shadow-xs"
                          style={{ backgroundColor: preset.theme.primaryButtonColor }}
                        />
                        <span
                          className="w-5 h-5 rounded-full border border-black/10 shadow-xs"
                          style={{ backgroundColor: preset.theme.accentColor }}
                        />
                        {isCurrent && (
                          <span className="ml-auto text-[10px] font-bold uppercase text-[#F5A000] bg-amber-100 px-1.5 py-0.5 rounded">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-bold text-[#1E293B]">{preset.name}</div>
                      <p className="text-[11px] text-[#64748B] mt-0.5 line-clamp-2">
                        {preset.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* 2-Column: Customizer (Left) vs Live Preview & Accessibility (Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* LEFT: 9 CUSTOMIZABLE COLOR TOKENS (7 COLS) */}
            <div className="lg:col-span-7 space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-[#F5A000]" />
                    <CardTitle>9 Customizable Theme Properties</CardTitle>
                  </div>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Live adjustments update the preview immediately. Click Save to persist across sessions.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* 1. Sidebar Background */}
                  <div className="p-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-[#1E293B]">
                        1. Sidebar Background
                      </label>
                      <span className="text-[11px] text-[#64748B]">Left vertical navigation bar</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={currentTheme.sidebarBackground}
                        onChange={(e) => handleThemeColorChange("sidebarBackground", e.target.value)}
                        className="w-10 h-10 rounded-lg cursor-pointer border border-[#CBD5E1] p-0.5 bg-white"
                      />
                      <Input
                        value={currentTheme.sidebarBackground}
                        onChange={(e) => handleThemeColorChange("sidebarBackground", e.target.value)}
                        placeholder="#123B5A"
                        className="font-mono text-xs uppercase"
                      />
                    </div>
                  </div>

                  {/* 2. Primary / Action Button */}
                  <div className="p-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-[#1E293B]">
                        2. Primary / Action Button
                      </label>
                      <span className="text-[11px] text-[#64748B]">Main call-to-action buttons</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={currentTheme.primaryButtonColor}
                        onChange={(e) => handleThemeColorChange("primaryButtonColor", e.target.value)}
                        className="w-10 h-10 rounded-lg cursor-pointer border border-[#CBD5E1] p-0.5 bg-white"
                      />
                      <Input
                        value={currentTheme.primaryButtonColor}
                        onChange={(e) => handleThemeColorChange("primaryButtonColor", e.target.value)}
                        placeholder="#F5A000"
                        className="font-mono text-xs uppercase"
                      />
                    </div>
                  </div>

                  {/* 3. Active Sidebar Nav */}
                  <div className="p-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-[#1E293B]">
                        3. Active Sidebar Nav
                      </label>
                      <span className="text-[11px] text-[#64748B]">Selected navigation route highlight</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={currentTheme.activeSidebarNav}
                        onChange={(e) => handleThemeColorChange("activeSidebarNav", e.target.value)}
                        className="w-10 h-10 rounded-lg cursor-pointer border border-[#CBD5E1] p-0.5 bg-white"
                      />
                      <Input
                        value={currentTheme.activeSidebarNav}
                        onChange={(e) => handleThemeColorChange("activeSidebarNav", e.target.value)}
                        placeholder="#F5A000"
                        className="font-mono text-xs uppercase"
                      />
                    </div>
                  </div>

                  {/* 4. Main Workspace Background */}
                  <div className="p-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-[#1E293B]">
                        4. Main Workspace Background
                      </label>
                      <span className="text-[11px] text-[#64748B]">Background of pages & dashboards</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={currentTheme.workspaceBackground}
                        onChange={(e) => handleThemeColorChange("workspaceBackground", e.target.value)}
                        className="w-10 h-10 rounded-lg cursor-pointer border border-[#CBD5E1] p-0.5 bg-white"
                      />
                      <Input
                        value={currentTheme.workspaceBackground}
                        onChange={(e) => handleThemeColorChange("workspaceBackground", e.target.value)}
                        placeholder="#EEF1F5"
                        className="font-mono text-xs uppercase"
                      />
                    </div>
                  </div>

                  {/* 5. Card Background */}
                  <div className="p-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-[#1E293B]">
                        5. Card Background
                      </label>
                      <span className="text-[11px] text-[#64748B]">Container background for data cards & tables</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={currentTheme.cardBackground}
                        onChange={(e) => handleThemeColorChange("cardBackground", e.target.value)}
                        className="w-10 h-10 rounded-lg cursor-pointer border border-[#CBD5E1] p-0.5 bg-white"
                      />
                      <Input
                        value={currentTheme.cardBackground}
                        onChange={(e) => handleThemeColorChange("cardBackground", e.target.value)}
                        placeholder="#FFFFFF"
                        className="font-mono text-xs uppercase"
                      />
                    </div>
                  </div>

                  {/* 6. Primary Text Color */}
                  <div className="p-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-[#1E293B]">
                        6. Primary Text
                      </label>
                      <span className="text-[11px] text-[#64748B]">Main headings, titles and content text</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={currentTheme.primaryTextColor}
                        onChange={(e) => handleThemeColorChange("primaryTextColor", e.target.value)}
                        className="w-10 h-10 rounded-lg cursor-pointer border border-[#CBD5E1] p-0.5 bg-white"
                      />
                      <Input
                        value={currentTheme.primaryTextColor}
                        onChange={(e) => handleThemeColorChange("primaryTextColor", e.target.value)}
                        placeholder="#1E293B"
                        className="font-mono text-xs uppercase"
                      />
                    </div>
                  </div>

                  {/* 7. Secondary Text Color */}
                  <div className="p-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-[#1E293B]">
                        7. Secondary Text
                      </label>
                      <span className="text-[11px] text-[#64748B]">Subtitles, timestamps and helper captions</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={currentTheme.secondaryTextColor}
                        onChange={(e) => handleThemeColorChange("secondaryTextColor", e.target.value)}
                        className="w-10 h-10 rounded-lg cursor-pointer border border-[#CBD5E1] p-0.5 bg-white"
                      />
                      <Input
                        value={currentTheme.secondaryTextColor}
                        onChange={(e) => handleThemeColorChange("secondaryTextColor", e.target.value)}
                        placeholder="#64748B"
                        className="font-mono text-xs uppercase"
                      />
                    </div>
                  </div>

                  {/* 8. Chart Color Palette (5 Colors) */}
                  <div className="p-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-[#1E293B]">
                        8. Chart Color Palette (5 Swatches)
                      </label>
                      <span className="text-[11px] text-[#64748B]">Data visualizations, metrics & graphs</span>
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      {currentTheme.chartPalette.map((color, idx) => (
                        <div key={idx} className="flex flex-col items-center gap-1">
                          <input
                            type="color"
                            value={color}
                            onChange={(e) => handleChartColorChange(idx, e.target.value)}
                            className="w-9 h-9 rounded-md cursor-pointer border border-[#CBD5E1] p-0.5 bg-white"
                          />
                          <span className="text-[10px] font-mono font-semibold text-[#1E293B]">
                            {color.toUpperCase()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 9. Institution Branding / Accent */}
                  <div className="p-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-[#1E293B]">
                        9. Institution Branding / Accent
                      </label>
                      <span className="text-[11px] text-[#64748B]">Logo emblem, badge icons & highlights</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={currentTheme.accentColor}
                        onChange={(e) => handleThemeColorChange("accentColor", e.target.value)}
                        className="w-10 h-10 rounded-lg cursor-pointer border border-[#CBD5E1] p-0.5 bg-white"
                      />
                      <Input
                        value={currentTheme.accentColor}
                        onChange={(e) => handleThemeColorChange("accentColor", e.target.value)}
                        placeholder="#F5A000"
                        className="font-mono text-xs uppercase"
                      />
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex items-center justify-between pt-4 border-t border-[#E2E8F0]">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleResetTheme}
                    leftIcon={<RotateCcw className="w-4 h-4" />}
                  >
                    Reset Defaults
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={handleSaveTheme}
                    leftIcon={<Check className="w-4 h-4" />}
                  >
                    Save Theme Changes
                  </Button>
                </CardFooter>
              </Card>
            </div>

            {/* RIGHT: LIVE INTERACTIVE PREVIEW & WCAG CONTRAST AUDIT (5 COLS) */}
            <div className="lg:col-span-5 space-y-6">
              {/* LIVE INTERACTIVE PREVIEW */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-[#F5A000]" />
                    <CardTitle>Live Interactive Preview</CardTitle>
                  </div>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Real-time rendering of sidebar, workspace, cards, and buttons.
                  </p>
                </CardHeader>
                <CardContent>
                  <div
                    className="rounded-xl border border-[#CBD5E1] overflow-hidden shadow-md"
                    style={{ backgroundColor: currentTheme.workspaceBackground }}
                  >
                    <div className="flex h-72">
                      {/* Mini Sidebar */}
                      <div
                        className="w-28 p-2.5 flex flex-col justify-between shrink-0 text-white"
                        style={{ backgroundColor: currentTheme.sidebarBackground }}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5 pb-2 border-b border-white/10">
                            <div
                              className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-black text-white"
                              style={{ backgroundColor: currentTheme.accentColor }}
                            >
                              SST
                            </div>
                            <span className="text-[10px] font-extrabold truncate">Apex ERP</span>
                          </div>

                          <div className="space-y-1">
                            <div
                              className="px-2 py-1 rounded text-[10px] font-bold text-white shadow-xs"
                              style={{ backgroundColor: currentTheme.activeSidebarNav }}
                            >
                              Dashboard
                            </div>
                            <div className="px-2 py-1 rounded text-[10px] text-white/80 hover:bg-white/10">
                              Students
                            </div>
                            <div className="px-2 py-1 rounded text-[10px] text-white/80 hover:bg-white/10">
                              Academics
                            </div>
                            <div className="px-2 py-1 rounded text-[10px] text-white/80 hover:bg-white/10">
                              Fees
                            </div>
                          </div>
                        </div>

                        <div className="text-[9px] text-white/60 pt-1 border-t border-white/10">
                          v2.0 • Admin
                        </div>
                      </div>

                      {/* Mini Main Workspace */}
                      <div className="flex-1 p-3 overflow-hidden flex flex-col gap-2.5">
                        {/* Top Mini Bar */}
                        <div className="flex items-center justify-between pb-1">
                          <div>
                            <div
                              className="text-xs font-extrabold"
                              style={{ color: currentTheme.primaryTextColor }}
                            >
                              Overview
                            </div>
                            <div
                              className="text-[9px]"
                              style={{ color: currentTheme.secondaryTextColor }}
                            >
                              Active Term 2026-27
                            </div>
                          </div>
                          <button
                            type="button"
                            className="px-2 py-1 rounded text-[10px] font-bold text-white shadow-xs cursor-default"
                            style={{ backgroundColor: currentTheme.primaryButtonColor }}
                          >
                            + Action
                          </button>
                        </div>

                        {/* Mini KPI Card */}
                        <div
                          className="p-2.5 rounded-lg border border-black/5 shadow-xs space-y-1.5"
                          style={{
                            backgroundColor: currentTheme.cardBackground,
                            color: currentTheme.primaryTextColor,
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className="text-[10px] font-medium"
                              style={{ color: currentTheme.secondaryTextColor }}
                            >
                              Active Students
                            </span>
                            <span
                              className="text-[9px] font-bold px-1.5 py-0.2 rounded"
                              style={{
                                backgroundColor: `${currentTheme.accentColor}25`,
                                color: currentTheme.accentColor,
                              }}
                            >
                              +12%
                            </span>
                          </div>
                          <div
                            className="text-base font-black leading-none"
                            style={{ color: currentTheme.primaryTextColor }}
                          >
                            1,250
                          </div>

                          {/* Mini Progress / Chart Bar */}
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex mt-2">
                            {currentTheme.chartPalette.map((c, i) => (
                              <div
                                key={i}
                                className="h-full flex-1"
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                        </div>

                        {/* Mini Secondary Card */}
                        <div
                          className="p-2 rounded-lg border border-black/5 shadow-xs flex items-center justify-between"
                          style={{
                            backgroundColor: currentTheme.cardBackground,
                            color: currentTheme.primaryTextColor,
                          }}
                        >
                          <div className="text-[10px]">Fee Collection</div>
                          <span
                            className="text-[10px] font-bold"
                            style={{ color: currentTheme.chartPalette[1] || currentTheme.accentColor }}
                          >
                            ₹ 1,25,500
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* WCAG 2.1 AA ACCESSIBILITY & CONTRAST ANALYSIS */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#16A34A]" />
                    <CardTitle>WCAG 2.1 AA Accessibility Audit</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {accessibility.isAccessible ? (
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-bold">Contrast Ratios Pass WCAG AA</div>
                        <p className="text-[11px] text-emerald-700 mt-0.5">
                          Text and background combinations have sufficient contrast (\(\ge 4.5:1\)) for all users.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-xs font-bold">Contrast Warnings Detected</div>
                          <p className="text-[11px] text-amber-800 mt-0.5">
                            Some color combinations fall below WCAG AA recommendations:
                          </p>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        {accessibility.warnings.map((w, idx) => (
                          <div
                            key={idx}
                            className="p-2 rounded border border-amber-200 bg-amber-50/50 text-[11px] flex items-center justify-between"
                          >
                            <span className="font-semibold text-amber-950">
                              {w.fieldA} on {w.fieldB}
                            </span>
                            <span className="font-mono font-bold text-amber-700">
                              {w.ratio}:1 (Min {w.minRequired}:1)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Contrast Metric Swatches */}
                  <div className="pt-2 border-t border-[#F1F5F9] space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-[#64748B]">Primary Text on Card:</span>
                      <span className="font-mono font-bold text-[#1E293B]">
                        {getContrastRatio(currentTheme.primaryTextColor, currentTheme.cardBackground)}:1
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#64748B]">White Text on Sidebar:</span>
                      <span className="font-mono font-bold text-[#1E293B]">
                        {getContrastRatio("#FFFFFF", currentTheme.sidebarBackground)}:1
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#64748B]">White Text on Button:</span>
                      <span className="font-mono font-bold text-[#1E293B]">
                        {getContrastRatio("#FFFFFF", currentTheme.primaryButtonColor)}:1
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Logo & Institutional Crest */}
              <Card>
                <CardHeader>
                  <CardTitle>Institutional Crest & Logo</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-[#CBD5E1] rounded-xl bg-[#F8FAFC]">
                    {logoPreview ? (
                      <div className="relative text-center space-y-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={logoPreview}
                          alt="Logo"
                          className="w-20 h-20 object-contain rounded-lg border border-[#E2E8F0] bg-white p-1 mx-auto"
                        />
                        <Button
                          type="button"
                          variant="danger"
                          size="xs"
                          onClick={handleRemoveLogo}
                        >
                          Remove Logo
                        </Button>
                      </div>
                    ) : (
                      <div className="text-center space-y-1">
                        <div
                          className="w-12 h-12 rounded-full flex items-center justify-center mx-auto text-white"
                          style={{ backgroundColor: currentTheme.accentColor }}
                        >
                          <ImageIcon className="w-6 h-6" />
                        </div>
                        <div className="text-xs text-[#1E293B] font-semibold">No logo uploaded</div>
                        <p className="text-[10px] text-[#64748B]">PNG, JPG or SVG (Max 1MB)</p>
                      </div>
                    )}

                    <label className="mt-3 cursor-pointer">
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        leftIcon={<Upload className="w-3.5 h-3.5" />}
                        onClick={() => document.getElementById("logo-file-input")?.click()}
                      >
                        Browse Image
                      </Button>
                      <input
                        id="logo-file-input"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleLogoUpload}
                      />
                    </label>
                  </div>

                  <Input
                    label="Or Public Image URL"
                    name="logoUrl"
                    placeholder="https://domain.com/logo.png"
                    value={formData.logoUrl || ""}
                    onChange={(e) => {
                      handleInputChange(e);
                      setLogoPreview(e.target.value);
                    }}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PROFILE & IDENTITY */}
      {activeTab === "profile" && (
        <div className="space-y-6">
          {isLoadingSettings && (
            <Card>
              <CardContent className="p-8 text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-[#F5A000] animate-spin mx-auto" />
                <p className="text-sm font-semibold text-[#1E293B]">Loading Institutional Profile...</p>
                <p className="text-xs text-[#64748B]">Retrieving verified settings from the server.</p>
              </CardContent>
            </Card>
          )}

          {settingsError && (
            <Alert variant="error">
              <div className="flex items-center justify-between w-full">
                <span>{settingsError}</span>
                <Button type="button" size="xs" variant="outline" onClick={() => refreshProfile()}>
                  <RefreshCw className="w-3 h-3 mr-1" /> Retry
                </Button>
              </div>
            </Alert>
          )}

          {saveError && (
            <Alert variant="error">
              <span>{saveError}</span>
            </Alert>
          )}

          {saveSuccess && (
            <Alert variant="success">
              <Check className="w-4 h-4 mr-2" />
              Institutional identity settings updated successfully.
            </Alert>
          )}

          {!isLoadingSettings && !settingsError && (
            <form onSubmit={handleSaveProfile} className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>General Institutional Metadata</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Official Institution Name"
                      name="name"
                      required
                      value={formData.name}
                      onChange={handleInputChange}
                    />

                    <Input
                      label="Institutional Code"
                      name="code"
                      required
                      value={formData.code}
                      onChange={handleInputChange}
                      helperText="University or board registration code"
                    />

                    <Select
                      label="Institution Category"
                      name="type"
                      value={formData.type}
                      onChange={handleInputChange}
                      options={institutionTypeOptions}
                    />

                    <Input
                      label="Established Year"
                      name="establishedYear"
                      type="number"
                      value={formData.establishedYear}
                      onChange={handleInputChange}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#F1F5F9]">
                    <Input
                      label="Affiliating Body / University"
                      name="affiliation"
                      value={formData.affiliation}
                      onChange={handleInputChange}
                    />

                    <Input
                      label="Accreditation & Approvals"
                      name="accreditation"
                      value={formData.accreditation}
                      onChange={handleInputChange}
                    />

                    <Select
                      label="Academic Term Model"
                      name="academicCalendarType"
                      value={formData.academicCalendarType}
                      onChange={handleInputChange}
                      options={calendarTypeOptions}
                    />

                    <Input
                      label="Billing Currency Symbol"
                      name="currencySymbol"
                      value={formData.currencySymbol}
                      onChange={handleInputChange}
                      helperText="Displayed in invoices, fee receipts, and accounting"
                    />
                  </div>
                </CardContent>
                <CardFooter className="pt-4 border-t border-[#E2E8F0]">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isSaving || isLoadingSettings}
                    leftIcon={isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  >
                    {isSaving ? "Saving..." : "Save Profile Changes"}
                  </Button>
                </CardFooter>
              </Card>
            </form>
          )}
        </div>
      )}

      {/* TAB 3: CAMPUS ADDRESS & CONTACT */}
      {activeTab === "address" && (
        <div className="space-y-6">
          {isLoadingSettings && (
            <Card>
              <CardContent className="p-8 text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-[#F5A000] animate-spin mx-auto" />
                <p className="text-sm font-semibold text-[#1E293B]">Loading Campus Contact Details...</p>
                <p className="text-xs text-[#64748B]">Retrieving verified address information from the server.</p>
              </CardContent>
            </Card>
          )}

          {settingsError && (
            <Alert variant="error">
              <div className="flex items-center justify-between w-full">
                <span>{settingsError}</span>
                <Button type="button" size="xs" variant="outline" onClick={() => refreshProfile()}>
                  <RefreshCw className="w-3 h-3 mr-1" /> Retry
                </Button>
              </div>
            </Alert>
          )}

          {saveError && (
            <Alert variant="error">
              <span>{saveError}</span>
            </Alert>
          )}

          {saveSuccess && (
            <Alert variant="success">
              <Check className="w-4 h-4 mr-2" />
              Campus contact and address details saved.
            </Alert>
          )}

          {!isLoadingSettings && !settingsError && (
            <form onSubmit={handleSaveProfile} className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Campus Physical Address</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    label="Address Line 1"
                    name="addressLine1"
                    required
                    value={formData.addressLine1}
                    onChange={handleInputChange}
                    placeholder="Building, Street, Landmark"
                  />

                  <Input
                    label="Address Line 2 (Optional)"
                    name="addressLine2"
                    value={formData.addressLine2 || ""}
                    onChange={handleInputChange}
                    placeholder="Area / Campus Extension"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Input
                      label="City"
                      name="city"
                      required
                      value={formData.city}
                      onChange={handleInputChange}
                    />

                    <Input
                      label="State / Province"
                      name="state"
                      required
                      value={formData.state}
                      onChange={handleInputChange}
                    />

                    <Input
                      label="Postal Code (PIN)"
                      name="postalCode"
                      required
                      value={formData.postalCode}
                      onChange={handleInputChange}
                    />

                    <Input
                      label="Country"
                      name="country"
                      required
                      value={formData.country}
                      onChange={handleInputChange}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Official Contact Points</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Administrative Email"
                      name="email"
                      type="email"
                      required
                      leftIcon={<Mail className="w-4 h-4" />}
                      value={formData.email}
                      onChange={handleInputChange}
                    />

                    <Input
                      label="Primary Telephone"
                      name="phone"
                      required
                      leftIcon={<Phone className="w-4 h-4" />}
                      value={formData.phone}
                      onChange={handleInputChange}
                    />

                    <Input
                      label="Alternate Mobile / Helpline"
                      name="alternatePhone"
                      leftIcon={<Phone className="w-4 h-4" />}
                      value={formData.alternatePhone || ""}
                      onChange={handleInputChange}
                    />

                    <Input
                      label="Official Website URL"
                      name="website"
                      type="url"
                      leftIcon={<Globe className="w-4 h-4" />}
                      value={formData.website}
                      onChange={handleInputChange}
                    />
                  </div>
                </CardContent>
                <CardFooter className="pt-4 border-t border-[#E2E8F0]">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isSaving || isLoadingSettings}
                    leftIcon={isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  >
                    {isSaving ? "Saving..." : "Save Contact Changes"}
                  </Button>
                </CardFooter>
              </Card>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
