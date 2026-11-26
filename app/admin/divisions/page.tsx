"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/alert";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/table";
import {
  Building2,
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  RefreshCw,
  Loader2,
  School,
  GraduationCap,
  BookOpen,
  Award,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  Star,
  Layers,
  Palette,
} from "lucide-react";

export type DivisionType = "MONTESSORI" | "SCHOOL" | "HIGHER_SECONDARY" | "COLLEGE" | "ACADEMY";
export type DivisionStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

export interface DivisionRecord {
  id: string;
  name: string;
  code: string;
  slug: string;
  type: DivisionType;
  status: DivisionStatus;
  isDefault: boolean;
  description?: string | null;
  logoUrl?: string | null;
  academicSettings?: {
    brandColor?: string;
    shortName?: string;
    tagline?: string;
    affiliationNumber?: string;
    boardOrUniversity?: string;
    termSystem?: string;
    gradingSystem?: string;
    [key: string]: any;
  } | null;
  createdAt: string;
  _count?: {
    classes: number;
    students: number;
    enrollments: number;
    feeInvoices: number;
    staffAssignments: number;
    memberships: number;
  };
}

const TYPE_CONFIG: Record<DivisionType, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  MONTESSORI: { label: "Montessori / Early", icon: Sparkles, color: "bg-purple-100 text-purple-800 border-purple-200" },
  SCHOOL: { label: "K-10 School", icon: School, color: "bg-blue-100 text-blue-800 border-blue-200" },
  HIGHER_SECONDARY: { label: "Higher Secondary (+1/+2)", icon: BookOpen, color: "bg-teal-100 text-teal-800 border-teal-200" },
  COLLEGE: { label: "Higher Education / College", icon: GraduationCap, color: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  ACADEMY: { label: "Vocational Academy", icon: Award, color: "bg-amber-100 text-amber-800 border-amber-200" },
};

export default function DivisionsManagementPage() {
  const [divisions, setDivisions] = useState<DivisionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDivision, setEditingDivision] = useState<DivisionRecord | null>(null);

  // Form fields
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [slug, setSlug] = useState("");
  const [type, setType] = useState<DivisionType>("COLLEGE");
  const [status, setStatus] = useState<DivisionStatus>("ACTIVE");
  const [isDefault, setIsDefault] = useState(false);
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [brandColor, setBrandColor] = useState("#2563eb");
  const [shortName, setShortName] = useState("");
  const [tagline, setTagline] = useState("");
  const [affiliationNumber, setAffiliationNumber] = useState("");
  const [boardOrUniversity, setBoardOrUniversity] = useState("");
  const [termSystem, setTermSystem] = useState("SEMESTER");

  // Delete/Archive confirmation modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [divisionToDelete, setDivisionToDelete] = useState<DivisionRecord | null>(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);

  const fetchDivisions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/divisions");
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load divisions.");
      }
      setDivisions(json.data || []);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred while fetching divisions.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDivisions();
  }, [fetchDivisions]);

  const handleOpenCreateModal = () => {
    setEditingDivision(null);
    setName("");
    setCode("");
    setSlug("");
    setType("COLLEGE");
    setStatus("ACTIVE");
    setIsDefault(divisions.length === 0);
    setDescription("");
    setLogoUrl("");
    setBrandColor("#2563eb");
    setShortName("");
    setTagline("");
    setAffiliationNumber("");
    setBoardOrUniversity("");
    setTermSystem("SEMESTER");
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (div: DivisionRecord) => {
    setEditingDivision(div);
    setName(div.name);
    setCode(div.code);
    setSlug(div.slug);
    setType(div.type);
    setStatus(div.status);
    setIsDefault(div.isDefault);
    setDescription(div.description || "");
    setLogoUrl(div.logoUrl || "");
    setBrandColor(div.academicSettings?.brandColor || "#2563eb");
    setShortName(div.academicSettings?.shortName || "");
    setTagline(div.academicSettings?.tagline || "");
    setAffiliationNumber(div.academicSettings?.affiliationNumber || "");
    setBoardOrUniversity(div.academicSettings?.boardOrUniversity || "");
    setTermSystem(div.academicSettings?.termSystem || (div.type === "COLLEGE" ? "SEMESTER" : "TERM"));
    setIsModalOpen(true);
  };

  const handleSaveDivision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Division name is required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    const payload = {
      name: name.trim(),
      code: code.trim() || undefined,
      slug: slug.trim() || undefined,
      type,
      status,
      isDefault,
      description: description.trim() || null,
      logoUrl: logoUrl.trim() || null,
      academicSettings: {
        brandColor,
        shortName: shortName.trim() || undefined,
        tagline: tagline.trim() || undefined,
        affiliationNumber: affiliationNumber.trim() || undefined,
        boardOrUniversity: boardOrUniversity.trim() || undefined,
        termSystem,
      },
    };

    try {
      const url = editingDivision ? `/api/admin/divisions/${editingDivision.id}` : "/api/admin/divisions";
      const method = editingDivision ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to save division.");
      }

      setSuccessMessage(editingDivision ? "Division updated successfully." : "Division created successfully.");
      setIsModalOpen(false);
      await fetchDivisions();
    } catch (err: any) {
      setError(err.message || "Failed to save division.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (div: DivisionRecord) => {
    const nextStatus = div.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/admin/divisions/${div.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to update division status.");
      }
      setSuccessMessage(`Division "${div.name}" is now ${nextStatus}.`);
      await fetchDivisions();
    } catch (err: any) {
      setError(err.message || "Failed to toggle status.");
    }
  };

  const handleSetDefault = async (div: DivisionRecord) => {
    if (div.isDefault) return;
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/admin/divisions/${div.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to set default division.");
      }
      setSuccessMessage(`"${div.name}" set as the default educational division.`);
      await fetchDivisions();
    } catch (err: any) {
      setError(err.message || "Failed to set default division.");
    }
  };

  const handleConfirmDelete = async (forceArchive = false) => {
    if (!divisionToDelete) return;
    setIsSubmitting(true);
    setDeleteErrorMessage(null);

    try {
      const res = await fetch(`/api/admin/divisions/${divisionToDelete.id}${forceArchive ? "?archive=true" : ""}`, {
        method: "DELETE",
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        if (json.requiresArchival) {
          setDeleteErrorMessage(json.error);
          return;
        }
        throw new Error(json.error || "Failed to delete division.");
      }

      setSuccessMessage(json.message || "Division deleted/archived successfully.");
      setDeleteModalOpen(false);
      setDivisionToDelete(null);
      await fetchDivisions();
    } catch (err: any) {
      setDeleteErrorMessage(err.message || "Operation failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <Building2 className="h-6 w-6 text-indigo-600" />
            Educational Divisions
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure schools, colleges, and specialized academic wings under your institution.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchDivisions}
            disabled={isLoading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            onClick={handleOpenCreateModal}
            size="sm"
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Plus className="h-4 w-4" />
            Add Division
          </Button>
        </div>
      </div>

      {/* Global Alerts */}
      {error && (
        <Alert variant="error" className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span>{error}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setError(null)}>Dismiss</Button>
        </Alert>
      )}

      {successMessage && (
        <Alert variant="success" className="border-green-200 bg-green-50 text-green-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span>{successMessage}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setSuccessMessage(null)}>Dismiss</Button>
        </Alert>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-white border-gray-200 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500">Total Divisions</p>
              <p className="text-2xl font-bold text-gray-900">{divisions.length}</p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Layers className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-200 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500">Active Divisions</p>
              <p className="text-2xl font-bold text-green-600">
                {divisions.filter((d) => d.status === "ACTIVE").length}
              </p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center text-green-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-200 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500">Default Division</p>
              <p className="text-sm font-semibold text-gray-900 truncate max-w-[140px]">
                {divisions.find((d) => d.isDefault)?.name || "None"}
              </p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
              <Star className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-200 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500">Division Types</p>
              <p className="text-2xl font-bold text-purple-600">
                {new Set(divisions.map((d) => d.type)).size}
              </p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
              <Sparkles className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Divisions Table */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader className="p-4 border-b border-gray-100 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold text-gray-900">
            Registered Divisions ({divisions.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center flex flex-col items-center justify-center text-gray-500">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mb-2" />
              <p className="text-sm">Loading divisions...</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>Division Name & Details</TableHead>
                  <TableHead>Code & Slug</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Linked Records</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {divisions.length === 0 ? (
                  <TableEmpty
                    colSpan={7}
                    message="No divisions configured. Create your first educational division (e.g. School, College, or Academy) to get started."
                  />
                ) : (
                  divisions.map((div) => {
                    const typeInfo = TYPE_CONFIG[div.type] || {
                      label: div.type,
                      icon: Building2,
                      color: "bg-gray-100 text-gray-800",
                    };
                    const IconComp = typeInfo.icon;
                    const branding = div.academicSettings || {};

                    return (
                      <TableRow key={div.id} className="hover:bg-gray-50/80 transition-colors">
                        <TableCell className="pl-4">
                          <div
                            className="w-3 h-8 rounded-full"
                            style={{ backgroundColor: branding.brandColor || "#cbd5e1" }}
                            title={`Brand Color: ${branding.brandColor || "Default"}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900">{div.name}</span>
                            {div.isDefault && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                                <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                                Default
                              </span>
                            )}
                          </div>
                          {div.description && (
                            <p className="text-xs text-gray-500 truncate max-w-sm">{div.description}</p>
                          )}
                          {branding.tagline && (
                            <p className="text-xs italic text-gray-400 truncate max-w-sm">"{branding.tagline}"</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-mono text-xs font-bold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded w-max">
                              {div.code}
                            </span>
                            <span className="font-mono text-xs text-gray-400">/{div.slug}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${typeInfo.color}`}>
                            <IconComp className="h-3.5 w-3.5" />
                            {typeInfo.label}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={div.status === "ACTIVE" ? "default" : div.status === "ARCHIVED" ? "destructive" : "secondary"}
                            className="text-xs capitalize"
                          >
                            {div.status.toLowerCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs text-gray-600 space-y-0.5">
                            <div>
                              <strong>{div._count?.classes ?? 0}</strong> classes ·{" "}
                              <strong>{div._count?.students ?? 0}</strong> students
                            </div>
                            <div className="text-gray-400">
                              {div._count?.enrollments ?? 0} enrollments · {div._count?.feeInvoices ?? 0} invoices
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <div className="flex items-center justify-end gap-1">
                            {!div.isDefault && div.status === "ACTIVE" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSetDefault(div)}
                                title="Set as default division"
                                className="h-8 px-2 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                              >
                                <Star className="h-3.5 w-3.5 mr-1" />
                                Set Default
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleStatus(div)}
                              title={div.status === "ACTIVE" ? "Deactivate division" : "Activate division"}
                              className="h-8 px-2 text-xs text-gray-600 hover:text-gray-900"
                            >
                              {div.status === "ACTIVE" ? "Deactivate" : "Activate"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenEditModal(div)}
                              title="Edit division"
                              className="h-8 w-8 p-0 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setDivisionToDelete(div);
                                setDeleteErrorMessage(null);
                                setDeleteModalOpen(true);
                              }}
                              title="Delete or Archive division"
                              className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Division Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingDivision ? "Edit Educational Division" : "Create Educational Division"}
        description={
          editingDivision
            ? "Update division details, academic type, and sub-branding."
            : "Register a new educational wing (e.g. School, College, or Academy) under this institution."
        }
        maxWidth="xl"
      >
        <form onSubmit={handleSaveDivision} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Division Name */}
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-gray-700">Division Name *</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Apex High School Wing, Apex College of Technology"
                required
              />
            </div>

            {/* Division Code */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-700">Division Code</label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. SCH-01, ENG-01 (Auto-generated if empty)"
                className="font-mono"
              />
              <span className="text-[11px] text-gray-400">Unique alphanumeric code within your institution.</span>
            </div>

            {/* Division Slug */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-700">URL Slug</label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                placeholder="e.g. apex-school, apex-engineering"
                className="font-mono text-xs"
              />
              <span className="text-[11px] text-gray-400">Used for deep-linking and division switcher routing.</span>
            </div>

            {/* Division Type */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-700">Educational Type *</label>
              <select
                value={type}
                onChange={(e) => {
                  const newType = e.target.value as DivisionType;
                  setType(newType);
                  if (newType === "COLLEGE") setTermSystem("SEMESTER");
                  else if (newType === "SCHOOL") setTermSystem("TERM");
                  else if (newType === "MONTESSORI") setTermSystem("MILESTONE");
                }}
                className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="MONTESSORI">Montessori / Early Childhood (Playgroup, Nursery, KG)</option>
                <option value="SCHOOL">K-10 School (Grades 1 through 10)</option>
                <option value="HIGHER_SECONDARY">Higher Secondary (+1/+2, PUC, Grades 11-12)</option>
                <option value="COLLEGE">Higher Education / College (UG, PG, Semesters)</option>
                <option value="ACADEMY">Vocational / Short-term Academy</option>
              </select>
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-700">Operational Status *</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as DivisionStatus)}
                className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ACTIVE">ACTIVE — Accepting students & academic operations</option>
                <option value="INACTIVE">INACTIVE — Temporarily hidden from registration</option>
                <option value="ARCHIVED">ARCHIVED — Historical records preserved</option>
              </select>
            </div>

            {/* Default Division Checkbox */}
            <div className="md:col-span-2 flex items-center gap-2 pt-1 pb-1">
              <input
                type="checkbox"
                id="isDefault"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="isDefault" className="text-xs font-medium text-gray-700 cursor-pointer">
                Set as Default Division (Used as initial landing context for new staff and students)
              </label>
            </div>

            {/* Description */}
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-gray-700">Description / Overview</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Optional summary of this educational division..."
                className="w-full p-2.5 rounded-md border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Sub-Branding & Academic Settings Section */}
          <div className="border-t border-gray-200 pt-4 mt-4">
            <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Palette className="h-4 w-4 text-indigo-600" />
              Sub-Branding & Academic Configuration
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700">Brand Color Accent</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="h-10 w-12 rounded border border-gray-300 cursor-pointer p-0.5"
                  />
                  <Input
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    placeholder="#2563eb"
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700">Short Name / Monogram</label>
                <Input
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value)}
                  placeholder="e.g. AHS, ACT, AMW"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700">Affiliation / Board / University</label>
                <Input
                  value={boardOrUniversity}
                  onChange={(e) => setBoardOrUniversity(e.target.value)}
                  placeholder="e.g. CBSE, ICSE, VTU, State Board"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700">Academic Term System</label>
                <select
                  value={termSystem}
                  onChange={(e) => setTermSystem(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="SEMESTER">Semester System (College / Higher Ed)</option>
                  <option value="TERM">Term System: Term 1, Term 2, Term 3 (School)</option>
                  <option value="ANNUAL">Annual Academic Year</option>
                  <option value="MILESTONE">Developmental Milestones (Montessori)</option>
                </select>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-semibold text-gray-700">Motto / Tagline</label>
                <Input
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="e.g. Nurturing Tomorrow's Leaders"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-semibold text-gray-700">Division Logo URL</label>
                <Input
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://example.com/branding/school-wing-logo.png"
                />
              </div>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[100px]"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin mx-auto" />
              ) : editingDivision ? (
                "Save Changes"
              ) : (
                "Create Division"
              )}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete / Archive Confirmation Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setDivisionToDelete(null);
          setDeleteErrorMessage(null);
        }}
        title="Delete or Archive Division"
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure you want to remove <strong>"{divisionToDelete?.name}"</strong>?
          </p>

          {deleteErrorMessage ? (
            <Alert variant="warning">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span className="font-semibold text-xs">Safe Deletion Policy Triggered</span>
                </div>
                <p className="text-xs">{deleteErrorMessage}</p>
                <div className="pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleConfirmDelete(true)}
                    disabled={isSubmitting}
                    className="w-full bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100"
                  >
                    Archive Division Instead (Preserves Records)
                  </Button>
                </div>
              </div>
            </Alert>
          ) : (
            <p className="text-xs text-gray-500">
              Note: If this division contains active student enrolments, classes, or fee invoices,
              the system will automatically safeguard them and archive the division instead.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDeleteModalOpen(false);
                setDivisionToDelete(null);
                setDeleteErrorMessage(null);
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleConfirmDelete(false)}
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete Division"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
