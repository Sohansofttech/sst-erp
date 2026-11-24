"use client";

import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import {
  ShieldCheck,
  UserCheck,
  UserX,
  Plus,
  Search,
  Clock,
  Car,
  Building,
  Phone,
  FileText,
  CheckCircle,
  LogOut,
  QrCode,
  Users,
} from "lucide-react";
import { useInstitution } from "@/lib/store";

export default function GateManagementPage() {
  const { students } = useInstitution();
  const [activeTab, setActiveTab] = useState<"visitors" | "student_logs">("visitors");
  const [visitors, setVisitors] = useState<any[]>([]);
  const [studentLogs, setStudentLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Visitor Modal
  const [isVisitorModalOpen, setIsVisitorModalOpen] = useState(false);
  const [visitorName, setVisitorName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [idProofType, setIdProofType] = useState("Aadhaar Card");
  const [idProofNumber, setIdProofNumber] = useState("");
  const [organization, setOrganization] = useState("");
  const [purpose, setPurpose] = useState("Parent / Guardian Meeting");
  const [hostName, setHostName] = useState("Dr. Ramesh Sharma (Principal)");
  const [hostDepartment, setHostDepartment] = useState("Administration");
  const [gateName, setGateName] = useState("Main Security Gate");
  const [vehicleNumber, setVehicleNumber] = useState("");

  // Pass Detail Modal
  const [selectedPass, setSelectedPass] = useState<any | null>(null);

  // Student Log Modal
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [logType, setLogType] = useState<"ENTRY" | "EXIT">("ENTRY");
  const [studentGateName, setStudentGateName] = useState("Main Gate");

  const fetchVisitors = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/gate-management?tab=visitors");
      const json = await res.json();
      if (json.success && json.data) {
        setVisitors(json.data);
      }
    } catch (err) {
      console.warn("Failed to load visitor passes:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentLogs = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/gate-management?tab=campus_logs");
      const json = await res.json();
      if (json.success && json.data) {
        setStudentLogs(json.data);
      }
    } catch (err) {
      console.warn("Failed to load student movement logs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "visitors") {
      fetchVisitors();
    } else {
      fetchStudentLogs();
    }
  }, [activeTab]);

  const handleRegisterVisitor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!visitorName || !phoneNumber || !purpose || !hostName) return;

    try {
      const res = await fetch("/api/admin/gate-management", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitorName,
          phoneNumber,
          idProofType,
          idProofNumber,
          organization,
          purpose,
          hostName,
          hostDepartment,
          gateName,
          vehicleNumber,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsVisitorModalOpen(false);
        setVisitorName("");
        setPhoneNumber("");
        setIdProofNumber("");
        setOrganization("");
        setVehicleNumber("");
        fetchVisitors();
        setSelectedPass(data.data);
      } else {
        alert(data.error || "Failed to register visitor.");
      }
    } catch (err: any) {
      alert(err.message || "Network error.");
    }
  };

  const handleCheckout = async (passId: string) => {
    try {
      const res = await fetch("/api/admin/gate-management", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passId }),
      });
      const data = await res.json();
      if (data.success) {
        fetchVisitors();
      } else {
        alert(data.error || "Failed to checkout visitor.");
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleStudentLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId) return;

    try {
      const res = await fetch("/api/admin/gate-management", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "CAMPUS_STUDENT_LOG",
          studentId: selectedStudentId,
          logType,
          gateName: studentGateName,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsStudentModalOpen(false);
        fetchStudentLogs();
      } else {
        alert(data.error || "Failed to log student movement.");
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Metrics
  const activeVisitorsCount = visitors.filter((v) => v.status === "CHECKED_IN").length;
  const totalToday = visitors.length;
  const checkedOutCount = visitors.filter((v) => v.status === "CHECKED_OUT").length;

  const filteredVisitors = visitors.filter((v) => {
    const matchSearch =
      v.visitorName?.toLowerCase().includes(search.toLowerCase()) ||
      v.passNumber?.toLowerCase().includes(search.toLowerCase()) ||
      v.hostName?.toLowerCase().includes(search.toLowerCase()) ||
      v.vehicleNumber?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "ALL" || v.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#E2E8F0]">
        <div>
          <h1 className="text-2xl font-bold text-[#1E293B]">Gate Management</h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Real-time campus perimeter monitoring, visitor badge pass generation, and entry/exit logs.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            onClick={() => setIsStudentModalOpen(true)}
            variant="outline"
            className="flex items-center gap-2 border-[#CBD5E1] text-[#1E293B] hover:bg-[#F1F5F9] text-xs h-9"
          >
            <Users className="w-4 h-4 text-[#F5A000]" />
            <span>Log Student Transit</span>
          </Button>
          <Button
            onClick={() => setIsVisitorModalOpen(true)}
            className="flex items-center gap-2 bg-[#F5A000] hover:bg-[#D98E00] text-white text-xs h-9 shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Register Visitor</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-[#F5A000] shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Currently on Campus</p>
              <h3 className="text-2xl font-black text-[#1E293B] mt-1">{activeVisitorsCount}</h3>
              <p className="text-[11px] text-[#F5A000] font-medium mt-0.5">Active visitor badges</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#EFF6FF] text-[#F5A000] flex items-center justify-center">
              <UserCheck className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#10B981] shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Total Check-Ins Today</p>
              <h3 className="text-2xl font-black text-[#1E293B] mt-1">{totalToday}</h3>
              <p className="text-[11px] text-[#10B981] font-medium mt-0.5">Authorized entries</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#ECFDF5] text-[#10B981] flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#64748B] shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Total Check-Outs</p>
              <h3 className="text-2xl font-black text-[#1E293B] mt-1">{checkedOutCount}</h3>
              <p className="text-[11px] text-[#64748B] font-medium mt-0.5">Cleared campus</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#F1F5F9] text-[#64748B] flex items-center justify-center">
              <UserX className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#123B5A] shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Gate Checkpoints</p>
              <h3 className="text-2xl font-black text-[#1E293B] mt-1">4 Active</h3>
              <p className="text-[11px] text-[#123B5A] font-medium mt-0.5">Main, North, South, Goods</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#E0E7FF] text-[#123B5A] flex items-center justify-center">
              <Building className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#E2E8F0] gap-4">
        <button
          onClick={() => setActiveTab("visitors")}
          className={`pb-2.5 text-xs font-bold transition-colors cursor-pointer border-b-2 flex items-center gap-2 ${
            activeTab === "visitors"
              ? "border-[#F5A000] text-[#F5A000]"
              : "border-transparent text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>Visitor Passes & Badges</span>
          <span className="bg-[#EFF6FF] text-[#F5A000] text-[10px] px-1.5 py-0.2 rounded-full font-bold">
            {visitors.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("student_logs")}
          className={`pb-2.5 text-xs font-bold transition-colors cursor-pointer border-b-2 flex items-center gap-2 ${
            activeTab === "student_logs"
              ? "border-[#F5A000] text-[#F5A000]"
              : "border-transparent text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Student In / Out Transit Logs</span>
          <span className="bg-[#F1F5F9] text-[#64748B] text-[10px] px-1.5 py-0.2 rounded-full font-bold">
            {studentLogs.length}
          </span>
        </button>
      </div>

      {/* Tab 1: Visitors */}
      {activeTab === "visitors" && (
        <Card className="shadow-xs">
          <CardHeader className="p-4 pb-3 border-b border-[#E2E8F0]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-sm font-bold text-[#1E293B] flex items-center gap-2">
                <span>Visitor Ledger</span>
              </CardTitle>

              <div className="flex items-center gap-2.5">
                <div className="relative w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#94A3B8]" />
                  <Input
                    placeholder="Search name, pass no, host..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 text-xs h-8 bg-[#F8FAFC]"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="text-xs h-8 px-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-[#1E293B]"
                >
                  <option value="ALL">All Status</option>
                  <option value="CHECKED_IN">On Campus (In)</option>
                  <option value="CHECKED_OUT">Checked Out</option>
                </select>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-bold text-[#475569]">Pass No</TableHead>
                  <TableHead className="text-xs font-bold text-[#475569]">Visitor Details</TableHead>
                  <TableHead className="text-xs font-bold text-[#475569]">Purpose & Organization</TableHead>
                  <TableHead className="text-xs font-bold text-[#475569]">Host Person & Dept</TableHead>
                  <TableHead className="text-xs font-bold text-[#475569]">Vehicle / Gate</TableHead>
                  <TableHead className="text-xs font-bold text-[#475569]">Timestamps</TableHead>
                  <TableHead className="text-xs font-bold text-[#475569]">Status</TableHead>
                  <TableHead className="text-xs font-bold text-[#475569] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-xs text-[#64748B]">
                      Loading visitor logs...
                    </TableCell>
                  </TableRow>
                ) : filteredVisitors.length === 0 ? (
                  <TableEmpty colSpan={8} message="No visitor passes recorded for the selected filter." />
                ) : (
                  filteredVisitors.map((v) => (
                    <TableRow key={v.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <TableCell className="font-mono text-xs font-bold text-[#F5A000]">
                        {v.passNumber}
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-xs text-[#1E293B]">{v.visitorName}</div>
                        <div className="text-[11px] text-[#64748B] flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-[#94A3B8]" />
                          {v.phoneNumber}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-medium text-[#1E293B]">{v.purpose}</div>
                        <div className="text-[10px] text-[#64748B]">{v.organization}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-semibold text-[#1E293B]">{v.hostName}</div>
                        <div className="text-[10px] text-[#64748B]">{v.hostDepartment}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-[#1E293B] flex items-center gap-1">
                          <Building className="w-3 h-3 text-[#64748B]" />
                          <span>{v.gateName}</span>
                        </div>
                        {v.vehicleNumber && v.vehicleNumber !== "None" && (
                          <div className="text-[10px] text-[#64748B] flex items-center gap-1 mt-0.5 font-mono">
                            <Car className="w-3 h-3 text-[#94A3B8]" />
                            {v.vehicleNumber}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-[11px] text-[#1E293B] font-medium">
                          In: {new Date(v.checkInTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                        {v.checkOutTime && (
                          <div className="text-[10px] text-[#64748B]">
                            Out: {new Date(v.checkOutTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={v.status === "CHECKED_IN" ? "success" : "neutral"}
                          className="text-[10px]"
                        >
                          {v.status === "CHECKED_IN" ? "On Campus" : "Checked Out"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedPass(v)}
                            className="h-7 px-2 text-[11px] border-[#CBD5E1]"
                            title="View / Print Badge Pass"
                          >
                            <QrCode className="w-3 h-3 mr-1 text-[#F5A000]" />
                            Badge
                          </Button>
                          {v.status === "CHECKED_IN" && (
                            <Button
                              size="sm"
                              onClick={() => handleCheckout(v.id)}
                              className="h-7 px-2 text-[11px] bg-[#EF4444] hover:bg-[#DC2626] text-white"
                            >
                              <LogOut className="w-3 h-3 mr-1" />
                              Check Out
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
      )}

      {/* Tab 2: Student Movement Logs */}
      {activeTab === "student_logs" && (
        <Card className="shadow-xs">
          <CardHeader className="p-4 pb-3 border-b border-[#E2E8F0]">
            <CardTitle className="text-sm font-bold text-[#1E293B]">
              Student Transit Movement Ledger
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-bold text-[#475569]">Timestamp</TableHead>
                  <TableHead className="text-xs font-bold text-[#475569]">Student</TableHead>
                  <TableHead className="text-xs font-bold text-[#475569]">Roll No / USN</TableHead>
                  <TableHead className="text-xs font-bold text-[#475569]">Transit Type</TableHead>
                  <TableHead className="text-xs font-bold text-[#475569]">Gate</TableHead>
                  <TableHead className="text-xs font-bold text-[#475569]">Verified By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-xs text-[#64748B]">
                      Loading student transit movements...
                    </TableCell>
                  </TableRow>
                ) : studentLogs.length === 0 ? (
                  <TableEmpty colSpan={6} message="No student gate logs recorded. Use 'Log Student Transit' to record a movement." />
                ) : (
                  studentLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-[#1E293B]">
                        {new Date(log.timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-[#1E293B]">
                        {log.student?.fullName || "Student"}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-[#64748B]">
                        {log.student?.rollNumber || log.student?.usn || "N/A"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={log.logType === "ENTRY" ? "success" : "neutral"}
                          className="text-[10px]"
                        >
                          {log.logType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-[#1E293B]">{log.gateName}</TableCell>
                      <TableCell className="text-xs text-[#64748B]">{log.verifiedBy || "RFID Scanner"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Visitor Registration Modal */}
      <Modal
        isOpen={isVisitorModalOpen}
        onClose={() => setIsVisitorModalOpen(false)}
        title="Visitor Gate Pass Registration"
      >
        <form onSubmit={handleRegisterVisitor} className="space-y-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#1E293B] block mb-1">
                Visitor Full Name *
              </label>
              <Input
                required
                value={visitorName}
                onChange={(e) => setVisitorName(e.target.value)}
                placeholder="e.g. Ramesh Chandra"
                className="text-xs h-9"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#1E293B] block mb-1">
                Phone Number *
              </label>
              <Input
                required
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+91 98765 43210"
                className="text-xs h-9"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#1E293B] block mb-1">
                ID Proof Type
              </label>
              <select
                value={idProofType}
                onChange={(e) => setIdProofType(e.target.value)}
                className="w-full text-xs h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-[#1E293B]"
              >
                <option value="Aadhaar Card">Aadhaar Card</option>
                <option value="Driving License">Driving License</option>
                <option value="Voter ID">Voter ID</option>
                <option value="Passport">Passport</option>
                <option value="Company / Student ID">Company / Student ID</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[#1E293B] block mb-1">
                ID Proof / Document No
              </label>
              <Input
                value={idProofNumber}
                onChange={(e) => setIdProofNumber(e.target.value)}
                placeholder="XXXX-XXXX-XXXX"
                className="text-xs h-9"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#1E293B] block mb-1">
                Organization / Company
              </label>
              <Input
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="Parent / TCS / Courier"
                className="text-xs h-9"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#1E293B] block mb-1">
                Vehicle Number
              </label>
              <Input
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
                placeholder="KA-01-XX-1234 (optional)"
                className="text-xs h-9"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[#1E293B] block mb-1">
              Purpose of Visit *
            </label>
            <Input
              required
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Admission inquiry, Guest Lecture, Warden visit"
              className="text-xs h-9"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#1E293B] block mb-1">
                Host Contact Person *
              </label>
              <Input
                required
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                placeholder="e.g. Dr. Anand Rao"
                className="text-xs h-9"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#1E293B] block mb-1">
                Host Department
              </label>
              <Input
                value={hostDepartment}
                onChange={(e) => setHostDepartment(e.target.value)}
                placeholder="e.g. Computer Science"
                className="text-xs h-9"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[#1E293B] block mb-1">
              Entry Gate
            </label>
            <select
              value={gateName}
              onChange={(e) => setGateName(e.target.value)}
              className="w-full text-xs h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-[#1E293B]"
            >
              <option value="Main Security Gate">Main Security Gate</option>
              <option value="North Gate">North Gate</option>
              <option value="South Gate">South Gate</option>
              <option value="Goods Delivery Gate 3">Goods Delivery Gate 3</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E2E8F0]">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsVisitorModalOpen(false)}
              className="text-xs h-9"
            >
              Cancel
            </Button>
            <Button type="submit" className="bg-[#F5A000] hover:bg-[#D98E00] text-white text-xs h-9">
              Issue Visitor Pass
            </Button>
          </div>
        </form>
      </Modal>

      {/* Pass Detail / Badge Modal */}
      {selectedPass && (
        <Modal
          isOpen={!!selectedPass}
          onClose={() => setSelectedPass(null)}
          title="Campus Visitor Pass Badge"
        >
          <div className="space-y-4 pt-2">
            <div className="p-4 rounded-xl border border-[#F5A000]/30 bg-[#EFF6FF] text-center space-y-2">
              <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-[#F5A000] uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4" /> Official Campus Visitor Pass
              </div>
              <h2 className="text-2xl font-black font-mono text-[#1E293B]">
                {selectedPass.passNumber}
              </h2>
              <p className="text-sm font-bold text-[#1E293B]">{selectedPass.visitorName}</p>
              <p className="text-xs text-[#64748B]">{selectedPass.organization} • {selectedPass.phoneNumber}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-[#F8FAFC] p-3 rounded-lg border border-[#E2E8F0]">
              <div>
                <span className="text-[#64748B] block text-[11px]">Purpose</span>
                <span className="font-semibold text-[#1E293B]">{selectedPass.purpose}</span>
              </div>
              <div>
                <span className="text-[#64748B] block text-[11px]">Visiting Host</span>
                <span className="font-semibold text-[#1E293B]">{selectedPass.hostName}</span>
              </div>
              <div>
                <span className="text-[#64748B] block text-[11px]">Gate</span>
                <span className="font-semibold text-[#1E293B]">{selectedPass.gateName}</span>
              </div>
              <div>
                <span className="text-[#64748B] block text-[11px]">Check-In Time</span>
                <span className="font-semibold text-[#1E293B]">
                  {new Date(selectedPass.checkInTime).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-[#64748B]">Issued by: {selectedPass.issuedBy}</span>
              <Button
                onClick={() => {
                  window.print();
                }}
                className="bg-[#F5A000] hover:bg-[#D98E00] text-white text-xs h-8"
              >
                Print Visitor Badge
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Student Transit Modal */}
      <Modal
        isOpen={isStudentModalOpen}
        onClose={() => setIsStudentModalOpen(false)}
        title="Record Student Campus Transit"
      >
        <form onSubmit={handleStudentLog} className="space-y-4 pt-2">
          <div>
            <label className="text-xs font-semibold text-[#1E293B] block mb-1">
              Select Student *
            </label>
            <select
              required
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="w-full text-xs h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-[#1E293B]"
            >
              <option value="">-- Choose Student --</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.rollNumber})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#1E293B] block mb-1">
                Transit Type *
              </label>
              <select
                value={logType}
                onChange={(e) => setLogType(e.target.value as any)}
                className="w-full text-xs h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-[#1E293B]"
              >
                <option value="ENTRY">ENTRY (Entering Campus)</option>
                <option value="EXIT">EXIT (Leaving Campus)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-[#1E293B] block mb-1">
                Checkpoint Gate
              </label>
              <select
                value={studentGateName}
                onChange={(e) => setStudentGateName(e.target.value)}
                className="w-full text-xs h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-[#1E293B]"
              >
                <option value="Main Gate">Main Gate</option>
                <option value="Hostel Gate">Hostel Gate</option>
                <option value="Library Gate">Library Gate</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E2E8F0]">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsStudentModalOpen(false)}
              className="text-xs h-9"
            >
              Cancel
            </Button>
            <Button type="submit" className="bg-[#F5A000] hover:bg-[#D98E00] text-white text-xs h-9">
              Record Movement
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
