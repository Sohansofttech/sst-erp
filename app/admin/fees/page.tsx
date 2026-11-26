"use client";

import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import {
  CreditCard,
  Plus,
  Search,
  CheckCircle,
  Clock,
  AlertCircle,
  FileText,
  DollarSign,
  TrendingUp,
  Receipt,
  Layers,
  Printer,
  ListChecks,
} from "lucide-react";
import { useInstitution } from "@/lib/store";
import { DepartmentStaffPanel } from "@/components/admin/DepartmentStaffPanel";

export default function FeesFinancePage() {
  const { students, academicYears } = useInstitution();
  const [directoryStudents, setDirectoryStudents] = useState<any[]>([]);
  const availableStudents = directoryStudents.length > 0 ? directoryStudents : students;
  const [invoices, setInvoices] = useState<any[]>([]);
  const [structures, setStructures] = useState<any[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [summary, setSummary] = useState({
    totalInvoices: 0,
    totalBilled: 0,
    totalCollected: 0,
    totalOutstanding: 0,
    totalOverdue: 0,
    totalRefunded: 0,
    collectionRate: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [activeTab, setActiveTab] = useState<
    "overview" | "invoices" | "structures" | "collection" | "receipts" | "concessions" | "refunds" | "team"
  >("invoices");
  const [editingStructureId, setEditingStructureId] = useState<string | null>(null);
  const [structureAcademicYearId, setStructureAcademicYearId] = useState("");
  const [structureSemester, setStructureSemester] = useState("1");
  const [structureError, setStructureError] = useState<string | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<any | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);

  // Concession & Refund & Structure state
  const [concessionInvoiceId, setConcessionInvoiceId] = useState("");
  const [concessionAmount, setConcessionAmount] = useState("");
  const [concessionReason, setConcessionReason] = useState("");
  const [refundPaymentId, setRefundPaymentId] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [structureName, setStructureName] = useState("");
  const [structureAmount, setStructureAmount] = useState("");

  // New Invoice Form
  const [invoiceStudentId, setInvoiceStudentId] = useState("");
  const [invoiceTitle, setInvoiceTitle] = useState("Semester 5 Tuition Fee");
  const [invoiceAmount, setInvoiceAmount] = useState("45000");
  const [invoiceDueDate, setInvoiceDueDate] = useState("2026-12-15");

  // Payment Form
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("UPI");

  const fetchFeeData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/fees");
      const json = await res.json();
      if (json.success && json.data) {
        setInvoices(json.data.invoices || []);
        setStructures(json.data.structures || []);
        setRefunds(json.data.refunds || []);
        if (json.data.summary) {
          setSummary(json.data.summary);
        }
      }
    } catch (err) {
      console.warn("Failed to load fee invoices from backend:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const tab = new URLSearchParams(window.location.search).get("tab");
      if (
        tab === "overview" ||
        tab === "invoices" ||
        tab === "structures" ||
        tab === "collection" ||
        tab === "receipts" ||
        tab === "concessions" ||
        tab === "refunds"
      ) {
        setActiveTab(tab);
      }
    }
    fetchFeeData();
    fetch("/api/admin/students/directory?take=200")
      .then((r) => r.json())
      .then((j) => {
        if (j.success && Array.isArray(j.data)) setDirectoryStudents(j.data);
      })
      .catch(() => {});
  }, []);

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceStudentId || !invoiceTitle || !invoiceAmount) return;

    try {
      const res = await fetch("/api/admin/fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: invoiceStudentId,
          title: invoiceTitle,
          totalAmount: invoiceAmount,
          dueDate: invoiceDueDate,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsInvoiceModalOpen(false);
        fetchFeeData();
      } else {
        alert(data.error || "Failed to create invoice.");
      }
    } catch (err: any) {
      alert(err.message || "Network error");
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice || !paymentAmount) return;

    try {
      const res = await fetch("/api/admin/fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "PAYMENT",
          invoiceId: selectedInvoice.id,
          studentId: selectedInvoice.studentId,
          amount: paymentAmount,
          paymentMethod,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsPaymentModalOpen(false);
        setSelectedInvoice(null);
        fetchFeeData();
      } else {
        alert(data.error || "Payment recording failed.");
      }
    } catch (err: any) {
      alert(err.message || "Network error");
    }
  };

  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch =
      inv.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) ||
      inv.title?.toLowerCase().includes(search.toLowerCase()) ||
      inv.student?.fullName?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#E2E8F0]">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#1E293B] tracking-tight">
            Fees & Finance
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            Manage fee structures, generate invoices, and record student fee payments.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setIsInvoiceModalOpen(true)}
          >
            Generate Fee Invoice
          </Button>
        </div>
      </div>

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-[#E2E8F0]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase">Total Invoiced</p>
              <h3 className="text-2xl font-bold text-[#1E293B] mt-1">
                ₹{summary.totalBilled.toLocaleString("en-IN")}
              </h3>
              <p className="text-[11px] text-[#64748B] mt-0.5">{summary.totalInvoices} total invoices</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#F5A000]/10 flex items-center justify-center text-[#F5A000]">
              <FileText className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E2E8F0]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase">Collected Amount</p>
              <h3 className="text-2xl font-bold text-[#16A34A] mt-1">
                ₹{summary.totalCollected.toLocaleString("en-IN")}
              </h3>
              <p className="text-[11px] text-[#16A34A] mt-0.5 font-medium">Verified by Backend</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#16A34A]/10 flex items-center justify-center text-[#16A34A]">
              <CheckCircle className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E2E8F0]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase">Outstanding Dues</p>
              <h3 className="text-2xl font-bold text-[#DC2626] mt-1">
                ₹{summary.totalOutstanding.toLocaleString("en-IN")}
              </h3>
              <p className="text-[11px] text-[#DC2626] mt-0.5 font-medium">Pending Realization</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#DC2626]/10 flex items-center justify-center text-[#DC2626]">
              <AlertCircle className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E2E8F0]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase">Collection Rate</p>
              <h3 className="text-2xl font-bold text-[#F5A000] mt-1">
                {summary.totalBilled > 0
                  ? Math.round((summary.totalCollected / summary.totalBilled) * 100)
                  : 0}
                %
              </h3>
              <p className="text-[11px] text-[#64748B] mt-0.5">Realization Ratio</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#123B5A]/10 flex items-center justify-center text-[#123B5A]">
              <TrendingUp className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Module Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#E2E8F0]">
        {[
          { id: "overview", label: "Overview", icon: TrendingUp },
          { id: "invoices", label: `Invoices (${invoices.length})`, icon: CreditCard },
          { id: "structures", label: `Fee Structures (${structures.length})`, icon: Layers },
          { id: "collection", label: "Fee Collection", icon: DollarSign },
          { id: "receipts", label: "Payments & Receipts", icon: Receipt },
          { id: "concessions", label: "Concessions", icon: FileText },
          { id: "refunds", label: `Refunds (${refunds.length})`, icon: AlertCircle },
          { id: "team", label: "Department Team", icon: ListChecks },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-3 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? "border-[#F5A000] text-[#F5A000]"
                  : "border-transparent text-[#64748B] hover:text-[#1E293B]"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold text-[#1E293B]">Finance &amp; Collection Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1.5 border-b border-[#F1F5F9]">
                <span className="text-[#64748B]">Total Billed</span>
                <span className="font-bold text-[#1E293B]">₹{(summary.totalBilled || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#F1F5F9]">
                <span className="text-[#64748B]">Total Collected</span>
                <span className="font-bold text-[#16A34A]">₹{(summary.totalCollected || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#F1F5F9]">
                <span className="text-[#64748B]">Total Outstanding</span>
                <span className="font-bold text-[#D97706]">₹{(summary.totalOutstanding || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#F1F5F9]">
                <span className="text-[#64748B]">Overdue Balance</span>
                <span className="font-bold text-[#DC2626]">₹{(summary.totalOverdue || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-[#64748B]">Refunds Processed</span>
                <span className="font-bold text-[#123B5A]">₹{(summary.totalRefunded || 0).toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold text-[#1E293B]">Accountant Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" onClick={() => setIsInvoiceModalOpen(true)}>
                Create Invoice
              </Button>
              <Button size="sm" variant="outline" onClick={() => setActiveTab("collection")}>
                Collect Payment
              </Button>
              <Button size="sm" variant="outline" onClick={() => setActiveTab("concessions")}>
                Apply Concession
              </Button>
              <Button size="sm" variant="outline" onClick={() => setActiveTab("refunds")}>
                Process Refund
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "collection" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold text-[#1E293B]">Fee Collection Queue (Pending &amp; Partial Invoices)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Outstanding</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.filter((inv) => inv.outstandingAmount > 0).length === 0 ? (
                  <TableEmpty colSpan={5} message="All invoices are settled." />
                ) : (
                  invoices
                    .filter((inv) => inv.outstandingAmount > 0)
                    .map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-mono text-xs font-bold">{inv.invoiceNumber}</TableCell>
                        <TableCell className="text-xs font-semibold">{inv.student?.fullName || "Student"}</TableCell>
                        <TableCell className="text-xs">{inv.title}</TableCell>
                        <TableCell className="text-xs font-bold text-[#DC2626]">
                          ₹{Number(inv.outstandingAmount || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => {
                              setSelectedInvoice(inv);
                              setPaymentAmount(String(inv.outstandingAmount));
                              setIsPaymentModalOpen(true);
                            }}
                          >
                            Record Payment
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {activeTab === "concessions" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold text-[#1E293B]">Apply Fee Concession / Scholarship</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!concessionInvoiceId || !concessionAmount || !concessionReason.trim()) return;
                const res = await fetch("/api/admin/fees", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    type: "CONCESSION",
                    invoiceId: concessionInvoiceId,
                    concessionAmount: parseFloat(concessionAmount),
                    reason: concessionReason,
                  }),
                });
                const j = await res.json();
                if (j.success) {
                  setConcessionAmount("");
                  setConcessionReason("");
                  fetchFeeData();
                } else {
                  alert(j.error || "Failed to apply concession.");
                }
              }}
            >
              <div>
                <label className="block text-[11px] font-bold text-[#64748B] mb-1">Invoice</label>
                <select
                  value={concessionInvoiceId}
                  onChange={(e) => setConcessionInvoiceId(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[#E2E8F0] bg-white"
                >
                  <option value="">Select Invoice...</option>
                  {invoices
                    .filter((i) => i.outstandingAmount > 0)
                    .map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoiceNumber} — {inv.student?.fullName} (Due ₹{inv.outstandingAmount})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#64748B] mb-1">Concession Amount (₹)</label>
                <Input
                  type="number"
                  min="1"
                  value={concessionAmount}
                  onChange={(e) => setConcessionAmount(e.target.value)}
                  placeholder="5000"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#64748B] mb-1">Reason / Approval Note</label>
                <Input
                  value={concessionReason}
                  onChange={(e) => setConcessionReason(e.target.value)}
                  placeholder="Merit Scholarship / Financial Aid"
                  required
                />
              </div>
              <Button type="submit" size="sm" variant="primary">
                Apply Concession
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {activeTab === "refunds" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold text-[#1E293B]">Process Fee Refund</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!refundPaymentId || !refundAmount || !refundReason.trim()) return;
                  const res = await fetch("/api/admin/fees", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      type: "REFUND",
                      paymentId: refundPaymentId,
                      amount: parseFloat(refundAmount),
                      reason: refundReason,
                    }),
                  });
                  const j = await res.json();
                  if (j.success) {
                    setRefundAmount("");
                    setRefundReason("");
                    fetchFeeData();
                  } else {
                    alert(j.error || "Failed to process refund.");
                  }
                }}
              >
                <div>
                  <label className="block text-[11px] font-bold text-[#64748B] mb-1">Payment Record</label>
                  <select
                    value={refundPaymentId}
                    onChange={(e) => setRefundPaymentId(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#E2E8F0] bg-white"
                  >
                    <option value="">Select Payment...</option>
                    {invoices.flatMap((inv) =>
                      (inv.payments || [])
                        .filter((p: any) => p.status === "SUCCESS")
                        .map((p: any) => (
                          <option key={p.id} value={p.id}>
                            {inv.invoiceNumber} — {inv.student?.fullName} (₹{p.amount} via {p.paymentMethod})
                          </option>
                        ))
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#64748B] mb-1">Refund Amount (₹)</label>
                  <Input
                    type="number"
                    min="1"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    placeholder="2000"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#64748B] mb-1">Reason</label>
                  <Input
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    placeholder="Overpayment / Withdrawal"
                    required
                  />
                </div>
                <Button type="submit" size="sm" variant="primary">
                  Process Refund
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold text-[#1E293B]">Refund Ledger ({refunds.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {refunds.length === 0 ? (
                    <TableEmpty colSpan={5} message="No refunds processed yet." />
                  ) : (
                    refunds.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs font-bold">{r.invoiceNumber}</TableCell>
                        <TableCell className="text-xs font-semibold">{r.studentName}</TableCell>
                        <TableCell className="text-xs font-bold text-[#DC2626]">
                          ₹{Number(r.amount || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs">{r.reason}</TableCell>
                        <TableCell className="text-xs text-[#64748B]">
                          {new Date(r.createdAt).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "invoices" && (
        <>
          {/* Filters & Search */}
          <Card className="border-[#E2E8F0]">
            <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  type="text"
                  placeholder="Search by invoice #, student, title..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-[#CBD5E1] rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#F5A000]"
                />
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto">
                {["ALL", "UNPAID", "PARTIAL", "PAID"].map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                      statusFilter === status
                        ? "bg-[#F5A000] text-white"
                        : "bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Invoices Table */}
          <Card className="border-[#E2E8F0]">
            <CardHeader className="p-4 border-b border-[#E2E8F0]">
              <CardTitle className="text-sm font-bold text-[#1E293B] flex items-center justify-between">
                <span>Fee Invoices Register</span>
                <span className="text-xs font-normal text-[#64748B]">
                  Showing {filteredInvoices.length} invoices
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#F8FAFC]">
                    <TableHead className="text-xs font-bold text-[#1E293B]">Invoice #</TableHead>
                    <TableHead className="text-xs font-bold text-[#1E293B]">Student</TableHead>
                    <TableHead className="text-xs font-bold text-[#1E293B]">Title</TableHead>
                    <TableHead className="text-xs font-bold text-[#1E293B]">Total (₹)</TableHead>
                    <TableHead className="text-xs font-bold text-[#1E293B]">Paid (₹)</TableHead>
                    <TableHead className="text-xs font-bold text-[#1E293B]">Due (₹)</TableHead>
                    <TableHead className="text-xs font-bold text-[#1E293B]">Due Date</TableHead>
                    <TableHead className="text-xs font-bold text-[#1E293B]">Status</TableHead>
                    <TableHead className="text-xs font-bold text-[#1E293B] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-sm text-[#64748B]">
                        Loading invoices from database...
                      </TableCell>
                    </TableRow>
                  ) : filteredInvoices.length === 0 ? (
                    <TableEmpty colSpan={9} message="No invoices found matching the selected filter." />
                  ) : (
                    filteredInvoices.map((inv) => (
                      <TableRow key={inv.id} className="hover:bg-[#F8FAFC]">
                        <TableCell className="font-mono text-xs font-bold text-[#123B5A] whitespace-nowrap">
                          {inv.invoiceNumber}
                        </TableCell>
                        <TableCell className="text-xs font-semibold text-[#1E293B]">
                          {inv.student?.fullName || "Student Record"}
                        </TableCell>
                        <TableCell className="text-xs text-[#64748B]">{inv.title}</TableCell>
                        <TableCell className="text-xs font-semibold text-[#1E293B]">
                          ₹{inv.totalAmount?.toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell className="text-xs font-semibold text-[#16A34A]">
                          ₹{inv.paidAmount?.toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell className="text-xs font-semibold text-[#DC2626]">
                          ₹{inv.outstandingAmount?.toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell className="text-xs text-[#64748B]">
                          {new Date(inv.dueDate).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              inv.status === "PAID"
                                ? "success"
                                : inv.status === "PARTIAL"
                                ? "warning"
                                : "destructive"
                            }
                          >
                            {inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                            {inv.status !== "PAID" && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs"
                                onClick={() => {
                                  setSelectedInvoice(inv);
                                  setPaymentAmount(String(inv.outstandingAmount));
                                  setIsPaymentModalOpen(true);
                                }}
                              >
                                Record Payment
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {activeTab === "team" && (
        <DepartmentStaffPanel departmentRole="ACCOUNTANT" departmentLabel="Accountant" />
      )}

      {activeTab === "structures" && (
        <div className="space-y-4">
          <Card className="border-[#E2E8F0]">
            <CardHeader>
              <CardTitle className="text-sm font-bold text-[#1E293B]">
                {editingStructureId ? "Edit Fee Structure" : "Create Fee Structure"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {structureError && (
                <div className="mb-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
                  {structureError}
                </div>
              )}
              <form
                className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setStructureError(null);
                  const parsedAmount = parseFloat(structureAmount);
                  if (!structureName.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
                    setStructureError("Structure name and a positive amount are required.");
                    return;
                  }
                  const res = await fetch("/api/admin/fees", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      type: "SAVE_STRUCTURE",
                      id: editingStructureId || undefined,
                      name: structureName.trim(),
                      amount: parsedAmount,
                      academicYearId: structureAcademicYearId || undefined,
                      semester: structureSemester ? parseInt(structureSemester, 10) : undefined,
                    }),
                  });
                  const json = await res.json();
                  if (json.success) {
                    setEditingStructureId(null);
                    setStructureName("");
                    setStructureAmount("");
                    fetchFeeData();
                  } else {
                    setStructureError(json.error || "Failed to save fee structure.");
                  }
                }}
              >
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-bold text-[#64748B] mb-1">Structure Name *</label>
                  <Input
                    value={structureName}
                    onChange={(e) => setStructureName(e.target.value)}
                    placeholder="B.Tech CSE Semester Tuition"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#64748B] mb-1">Amount (₹) *</label>
                  <Input
                    type="number"
                    min="1"
                    value={structureAmount}
                    onChange={(e) => setStructureAmount(e.target.value)}
                    placeholder="45000"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#64748B] mb-1">Academic Year</label>
                  <select
                    value={structureAcademicYearId}
                    onChange={(e) => setStructureAcademicYearId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#E2E8F0] bg-white"
                  >
                    <option value="">All / Current AY</option>
                    {academicYears.map((ay) => (
                      <option key={ay.id} value={ay.id}>
                        {ay.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" variant="primary">
                    {editingStructureId ? "Update" : "Save Structure"}
                  </Button>
                  {editingStructureId && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingStructureId(null);
                        setStructureName("");
                        setStructureAmount("");
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>

          {loading ? (
            <Card className="border-[#E2E8F0]">
              <CardContent className="p-6 text-center text-xs text-[#64748B]">
                Loading fee structures from database...
              </CardContent>
            </Card>
          ) : structures.length === 0 ? (
            <Card className="border-[#E2E8F0]">
              <CardContent className="p-6 text-center text-xs text-[#64748B]">
                No fee structures configured yet. Create your first fee structure above.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {structures.map((tmpl: any) => (
                <Card key={tmpl.id} className="border-[#E2E8F0]">
                  <CardHeader className="p-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#F5A000] bg-[#F5A000]/10 px-2 py-0.5 rounded">
                          {tmpl.semester ? `Semester ${tmpl.semester}` : "Institution Fee Structure"}
                        </span>
                        <h4 className="text-sm font-bold text-[#1E293B] mt-1">{tmpl.name}</h4>
                      </div>
                      <div className="text-right">
                        <div className="text-base font-extrabold text-[#123B5A]">
                          ₹{Number(tmpl.amount || 0).toLocaleString("en-IN")}
                        </div>
                        <div className="text-[10px] text-[#64748B]">
                          {academicYears.find((a) => a.id === tmpl.academicYearId)?.name || "General AY"}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    <div className="space-y-1.5">
                      {(tmpl.items || []).map((h: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-[#F8FAFC]">
                          <span className="text-[#334155]">{h.description}</span>
                          <span className="font-semibold text-[#1E293B]">
                            ₹{Number(h.amount || 0).toLocaleString("en-IN")}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingStructureId(tmpl.id);
                          setStructureName(tmpl.name || "");
                          setStructureAmount(String(tmpl.amount || ""));
                          setStructureAcademicYearId(tmpl.academicYearId || "");
                          setStructureSemester(tmpl.semester ? String(tmpl.semester) : "1");
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={async () => {
                          const dueDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
                          const res = await fetch("/api/admin/fees", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              type: "ASSIGN_STRUCTURE",
                              title: tmpl.name,
                              totalAmount: tmpl.amount,
                              dueDate,
                              academicYearId: tmpl.academicYearId || undefined,
                              items: tmpl.items,
                            }),
                          });
                          const j = await res.json();
                          if (j.success) {
                            alert(j.message || "Fee structure assigned to students.");
                            fetchFeeData();
                          } else {
                            alert(j.error || "Failed to assign fee structure.");
                          }
                        }}
                      >
                        Assign to Students
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "receipts" && (
        <Card className="border-[#E2E8F0]">
          <CardHeader className="p-4 border-b border-[#E2E8F0]">
            <CardTitle className="text-sm font-bold text-[#1E293B] flex items-center justify-between">
              <span>Verified Payment Receipts Register</span>
              <span className="text-xs font-normal text-[#64748B]">
                Forensic transaction receipts verified by backend
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#F8FAFC]">
                  <TableHead className="text-xs font-bold text-[#1E293B]">Receipt #</TableHead>
                  <TableHead className="text-xs font-bold text-[#1E293B]">Student</TableHead>
                  <TableHead className="text-xs font-bold text-[#1E293B]">Invoice #</TableHead>
                  <TableHead className="text-xs font-bold text-[#1E293B]">Amount Paid (₹)</TableHead>
                  <TableHead className="text-xs font-bold text-[#1E293B]">Payment Mode</TableHead>
                  <TableHead className="text-xs font-bold text-[#1E293B]">Transaction Ref</TableHead>
                  <TableHead className="text-xs font-bold text-[#1E293B]">Status</TableHead>
                  <TableHead className="text-xs font-bold text-[#1E293B] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.flatMap((inv) =>
                  (inv.payments || [])
                    .filter((p: any) => p.status === "SUCCESS")
                    .map((p: any) => {
                      const actualReceiptNo = p.receipt?.receiptNumber || null;
                      const receiptData = {
                        id: p.id,
                        receiptNumber: actualReceiptNo || "Receipt Unavailable",
                        hasOfficialReceipt: Boolean(actualReceiptNo),
                        invoiceNumber: inv.invoiceNumber,
                        studentName: inv.student?.fullName || "Student Record",
                        studentRoll: inv.student?.rollNumber || "N/A",
                        title: inv.title,
                        amount: p.amount,
                        paymentMethod: p.paymentMethod || "N/A",
                        transactionRef: p.transactionRef || "N/A",
                        date: p.receipt?.issuedDate || p.verifiedAt || p.createdAt || inv.dueDate,
                      };
                      return (
                        <TableRow key={receiptData.id} className="hover:bg-[#F8FAFC]">
                          <TableCell className="font-mono text-xs font-bold text-[#123B5A]">
                            {receiptData.hasOfficialReceipt ? (
                              receiptData.receiptNumber
                            ) : (
                              <span className="text-[#94A3B8] italic">Receipt Unavailable</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs font-semibold text-[#1E293B]">
                            {receiptData.studentName}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-[#64748B]">
                            {receiptData.invoiceNumber}
                          </TableCell>
                          <TableCell className="text-xs font-semibold text-[#16A34A]">
                            ₹{receiptData.amount?.toLocaleString("en-IN")}
                          </TableCell>
                          <TableCell className="text-xs text-[#334155]">
                            <span className="font-mono text-[11px] bg-[#F1F5F9] px-2 py-0.5 rounded">
                              {receiptData.paymentMethod}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-[#64748B]">
                            {receiptData.transactionRef}
                          </TableCell>
                          <TableCell>
                            <Badge variant={receiptData.hasOfficialReceipt ? "success" : "warning"}>
                              {receiptData.hasOfficialReceipt ? "VERIFIED" : "NO RECEIPT"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              disabled={!receiptData.hasOfficialReceipt}
                              leftIcon={<Printer className="w-3.5 h-3.5" />}
                              onClick={() => {
                                setSelectedReceipt(receiptData);
                                setIsReceiptModalOpen(true);
                              }}
                          >
                            Print Receipt
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Printable Receipt Modal */}
      <Modal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        title="Official Fee Payment Receipt"
      >
        {selectedReceipt && (
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-white border border-[#CBD5E1] rounded-lg space-y-3 font-sans">
              <div className="flex items-center justify-between border-b pb-3 border-[#E2E8F0]">
                <div>
                  <h4 className="text-sm font-extrabold text-[#123B5A]">SST ERP INSTITUTIONAL CASHIER</h4>
                  <p className="text-[10px] text-[#64748B]">Official Electronic Fee Payment Acknowledgement</p>
                </div>
                <Badge variant="success">PAYMENT SUCCESS</Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-[#64748B]">Receipt Number:</p>
                  <p className="font-mono font-bold text-[#1E293B]">{selectedReceipt.receiptNumber}</p>
                </div>
                <div>
                  <p className="text-[#64748B]">Invoice Reference:</p>
                  <p className="font-mono font-bold text-[#1E293B]">{selectedReceipt.invoiceNumber}</p>
                </div>
                <div>
                  <p className="text-[#64748B]">Student Name:</p>
                  <p className="font-semibold text-[#1E293B]">{selectedReceipt.studentName}</p>
                </div>
                <div>
                  <p className="text-[#64748B]">USN / Roll Number:</p>
                  <p className="font-mono font-semibold text-[#1E293B]">{selectedReceipt.studentRoll}</p>
                </div>
                <div>
                  <p className="text-[#64748B]">Payment Mode:</p>
                  <p className="font-semibold text-[#1E293B]">{selectedReceipt.paymentMethod}</p>
                </div>
                <div>
                  <p className="text-[#64748B]">Transaction Reference:</p>
                  <p className="font-mono text-[11px] text-[#1E293B]">{selectedReceipt.transactionRef}</p>
                </div>
              </div>

              <div className="p-3 bg-[#F8FAFC] rounded border border-[#E2E8F0] flex items-center justify-between">
                <span className="font-bold text-xs text-[#1E293B]">Total Amount Paid:</span>
                <span className="font-extrabold text-sm text-[#16A34A]">
                  ₹{selectedReceipt.amount?.toLocaleString("en-IN")}
                </span>
              </div>

              <p className="text-[10px] text-[#94A3B8] text-center italic">
                Computer-generated payment voucher. Certified by Institution Admin Accounts Desk.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsReceiptModalOpen(false)}>
                Close
              </Button>
              <Button variant="primary" leftIcon={<Printer className="w-4 h-4" />} onClick={() => window.print()}>
                Print Receipt Slip
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Invoice Modal */}
      <Modal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        title="Generate Student Fee Invoice"
      >
        <form onSubmit={handleCreateInvoice} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-[#1E293B] block mb-1">
              Select Student *
            </label>
            <select
              value={invoiceStudentId}
              onChange={(e) => setInvoiceStudentId(e.target.value)}
              required
              className="w-full text-xs p-2 border border-[#CBD5E1] rounded-lg bg-white"
            >
              <option value="">-- Choose Student --</option>
              {availableStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.rollNumber})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-[#1E293B] block mb-1">
              Invoice Title *
            </label>
            <Input
              value={invoiceTitle}
              onChange={(e) => setInvoiceTitle(e.target.value)}
              placeholder="e.g. Semester 5 Tuition Fee"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#1E293B] block mb-1">
                Total Amount (₹) *
              </label>
              <Input
                type="number"
                value={invoiceAmount}
                onChange={(e) => setInvoiceAmount(e.target.value)}
                placeholder="45000"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#1E293B] block mb-1">
                Due Date *
              </label>
              <Input
                type="date"
                value={invoiceDueDate}
                onChange={(e) => setInvoiceDueDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" type="button" onClick={() => setIsInvoiceModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Save & Generate Invoice
            </Button>
          </div>
        </form>
      </Modal>

      {/* Record Payment Modal */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title={`Record Payment for ${selectedInvoice?.invoiceNumber}`}
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          <div className="p-3 bg-[#F8FAFC] rounded-lg text-xs space-y-1">
            <p>
              <strong>Student:</strong> {selectedInvoice?.student?.fullName}
            </p>
            <p>
              <strong>Invoice Amount:</strong> ₹{selectedInvoice?.totalAmount?.toLocaleString("en-IN")}
            </p>
            <p className="text-[#DC2626]">
              <strong>Outstanding Due:</strong> ₹{selectedInvoice?.outstandingAmount?.toLocaleString("en-IN")}
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-[#1E293B] block mb-1">
              Payment Amount (₹) *
            </label>
            <Input
              type="number"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[#1E293B] block mb-1">
              Payment Mode *
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full text-xs p-2 border border-[#CBD5E1] rounded-lg bg-white"
            >
              <option value="UPI">UPI / QR Code</option>
              <option value="NET_BANKING">Net Banking (NEFT/RTGS)</option>
              <option value="CREDIT_CARD">Credit Card</option>
              <option value="DEBIT_CARD">Debit Card</option>
              <option value="CASH">Cash Counter</option>
              <option value="CHEQUE">Demand Draft / Cheque</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" type="button" onClick={() => setIsPaymentModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Confirm & Generate Receipt
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
