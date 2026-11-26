"use client";

import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Phone, User, Bed, Building2, Wrench, CheckCircle2, Clock } from "lucide-react";
import { useInstitution } from "@/lib/store";
import { DepartmentStaffPanel } from "@/components/admin/DepartmentStaffPanel";

export default function HostelPage() {
  const { students } = useInstitution();
  const [directoryStudents, setDirectoryStudents] = useState<any[]>([]);
  const availableStudents = directoryStudents.length > 0 ? directoryStudents : students;
  const [allocations, setAllocations] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [operations, setOperations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "allocations" | "matrix" | "maintenance" | "team">("allocations");
  const [newRoomCapacity, setNewRoomCapacity] = useState("2");
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [roomBlockInput, setRoomBlockInput] = useState("Kaveri Hostel Block A");
  const [roomNumInput, setRoomNumInput] = useState("");
  const [roomWardenInput, setRoomWardenInput] = useState("Mr. Ramesh Rao");
  const [roomContactInput, setRoomContactInput] = useState("+91 98450 11223");
  const [opType, setOpType] = useState<"MAINTENANCE" | "ATTENDANCE">("MAINTENANCE");
  const [opHostelInput, setOpHostelInput] = useState("Kaveri Hostel Block A");
  const [opRoomInput, setOpRoomInput] = useState("");
  const [opSummary, setOpSummary] = useState("");
  const [transferAlloc, setTransferAlloc] = useState<any | null>(null);
  const [transferHostel, setTransferHostel] = useState("");
  const [transferRoom, setTransferRoom] = useState("");
  const [transferBed, setTransferBed] = useState("");

  // Form
  const [studentId, setStudentId] = useState("");
  const [hostelName, setHostelName] = useState("Kaveri Hostel Block A");
  const [roomNumber, setRoomNumber] = useState("A-201");
  const [bedNumber, setBedNumber] = useState("Bed 1");
  const [wardenName, setWardenName] = useState("Mr. Ramesh Rao");
  const [wardenContact, setWardenContact] = useState("+91 98450 11223");

  const fetchAllocations = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/hostel");
      const json = await res.json();
      if (json.success && json.data) {
        setAllocations(json.data);
        setRooms(json.rooms || []);
        setOperations(json.operations || []);
      }
    } catch (err) {
      console.warn("Failed to load hostel allocations:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const tab = new URLSearchParams(window.location.search).get("tab");
      if (tab === "overview" || tab === "allocations" || tab === "matrix" || tab === "maintenance") {
        setActiveTab(tab);
      }
    }
    fetchAllocations();
    fetch("/api/admin/students/directory?take=200")
      .then((r) => r.json())
      .then((j) => {
        if (j.success && Array.isArray(j.data)) setDirectoryStudents(j.data);
      })
      .catch(() => {});
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || !hostelName || !roomNumber || !bedNumber) return;

    try {
      const res = await fetch("/api/admin/hostel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          hostelName,
          roomNumber,
          bedNumber,
          wardenName,
          wardenContact,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsModalOpen(false);
        fetchAllocations();
      } else {
        alert(data.error || "Allocation failed.");
      }
    } catch (err: any) {
      alert(err.message || "Network error");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Release this hostel room allocation?")) return;
    try {
      const res = await fetch(`/api/admin/hostel?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        fetchAllocations();
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#E2E8F0]">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#1E293B] tracking-tight">
            Hostel Management
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            Manage student room allocations, bed occupancies, and resident warden administration.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => setIsModalOpen(true)}
        >
          Allocate Room
        </Button>
      </div>

      {/* Hostel KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-[#E2E8F0]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase">Resident Students</p>
              <h3 className="text-2xl font-bold text-[#1E293B] mt-1">{allocations.length} Active</h3>
              <p className="text-[11px] text-[#64748B] mt-0.5">Capacity: 160 beds</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#F5A000]/10 flex items-center justify-center text-[#F5A000]">
              <Bed className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E2E8F0]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase">Kaveri Block A (Boys)</p>
              <h3 className="text-2xl font-bold text-[#123B5A] mt-1">92% Full</h3>
              <p className="text-[11px] text-[#16A34A] mt-0.5 font-medium">74 / 80 Beds Occupied</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#123B5A]/10 flex items-center justify-center text-[#123B5A]">
              <Building2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E2E8F0]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase">Sharavathi Block B (Girls)</p>
              <h3 className="text-2xl font-bold text-[#F5A000] mt-1">88% Full</h3>
              <p className="text-[11px] text-[#F5A000] mt-0.5 font-medium">70 / 80 Beds Occupied</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#FEF3C7] flex items-center justify-center text-[#F5A000]">
              <Building2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E2E8F0]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase">Maintenance Requests</p>
              <h3 className="text-2xl font-bold text-[#F59E0B] mt-1">2 Pending</h3>
              <p className="text-[11px] text-[#64748B] mt-0.5">Plumbing & Electrical</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#FEF3C7] flex items-center justify-center text-[#F59E0B]">
              <Wrench className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Module Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#E2E8F0]">
        <button
          onClick={() => setActiveTab("overview")}
          className={`pb-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === "overview"
              ? "border-[#F5A000] text-[#F5A000]"
              : "border-transparent text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          <Building2 className="w-4 h-4" />
          Overview
        </button>
        <button
          onClick={() => setActiveTab("allocations")}
          className={`pb-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === "allocations"
              ? "border-[#F5A000] text-[#F5A000]"
              : "border-transparent text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          <Bed className="w-4 h-4" />
          Active Allocations ({allocations.length})
        </button>
        <button
          onClick={() => setActiveTab("matrix")}
          className={`pb-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === "matrix"
              ? "border-[#F5A000] text-[#F5A000]"
              : "border-transparent text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          <Building2 className="w-4 h-4" />
          Buildings &amp; Rooms ({rooms.length})
        </button>
        <button
          onClick={() => setActiveTab("maintenance")}
          className={`pb-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === "maintenance"
              ? "border-[#F5A000] text-[#F5A000]"
              : "border-transparent text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          <Wrench className="w-4 h-4" />
          Attendance &amp; Maintenance ({operations.length})
        </button>
        <button
          onClick={() => setActiveTab("team")}
          className={`pb-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === "team"
              ? "border-[#F5A000] text-[#F5A000]"
              : "border-transparent text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          <User className="w-4 h-4" />
          Department Team
        </button>
      </div>

      {activeTab === "team" && (
        <DepartmentStaffPanel departmentRole="HOSTEL_WARDEN" departmentLabel="Hostel Warden" />
      )}

      {activeTab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <span className="text-xs font-bold uppercase text-[#64748B]">Occupied Beds</span>
              <h3 className="text-2xl font-black text-[#1E293B] mt-1">{allocations.length}</h3>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <span className="text-xs font-bold uppercase text-[#64748B]">Configured Rooms</span>
              <h3 className="text-2xl font-black text-[#123B5A] mt-1">{rooms.length}</h3>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <span className="text-xs font-bold uppercase text-[#64748B]">Maintenance / Ops Logs</span>
              <h3 className="text-2xl font-black text-[#D97706] mt-1">{operations.length}</h3>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "allocations" && (
        <Card className="border-[#E2E8F0]">
          <CardHeader className="p-4 border-b border-[#E2E8F0]">
            <CardTitle className="text-sm font-bold text-[#1E293B]">
              Active Hostel Allocations ({allocations.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#F8FAFC]">
                  <TableHead className="text-xs font-bold text-[#1E293B]">Student</TableHead>
                  <TableHead className="text-xs font-bold text-[#1E293B]">Hostel Block</TableHead>
                  <TableHead className="text-xs font-bold text-[#1E293B]">Room #</TableHead>
                  <TableHead className="text-xs font-bold text-[#1E293B]">Bed #</TableHead>
                  <TableHead className="text-xs font-bold text-[#1E293B]">Warden</TableHead>
                  <TableHead className="text-xs font-bold text-[#1E293B]">Allocated Date</TableHead>
                  <TableHead className="text-xs font-bold text-[#1E293B] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-sm text-[#64748B]">
                      Loading hostel records...
                    </TableCell>
                  </TableRow>
                ) : allocations.length === 0 ? (
                  <TableEmpty colSpan={7} message="No hostel room allocations recorded yet." />
                ) : (
                  allocations.map((a) => (
                    <TableRow key={a.id} className="hover:bg-[#F8FAFC]">
                      <TableCell className="text-xs font-semibold text-[#1E293B]">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-[#F5A000]" />
                          <span>{a.student?.fullName || "Student"}</span>
                        </div>
                        <span className="text-[11px] text-[#64748B] block">{a.student?.rollNumber}</span>
                      </TableCell>
                      <TableCell className="text-xs font-medium text-[#1E293B]">{a.hostelName}</TableCell>
                      <TableCell className="text-xs font-bold text-[#123B5A]">{a.roomNumber}</TableCell>
                      <TableCell className="text-xs text-[#64748B]">{a.bedNumber}</TableCell>
                      <TableCell className="text-xs text-[#64748B]">
                        <span>{a.wardenName}</span>
                        <span className="text-[10px] block text-[#94A3B8]">{a.wardenContact}</span>
                      </TableCell>
                      <TableCell className="text-xs text-[#64748B]">
                        {new Date(a.allocatedDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex items-center justify-end whitespace-nowrap">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs text-[#DC2626] border-[#DC2626]/30 hover:bg-[#DC2626]/10"
                            onClick={() => handleDelete(a.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
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

      {activeTab === "matrix" && (
        <div className="space-y-4">
          <Card className="border-[#E2E8F0]">
            <CardHeader className="p-4 border-b border-[#E2E8F0]">
              <CardTitle className="text-sm font-bold text-[#1E293B]">
                {editingRoomId ? "Edit Hostel Room" : "Create Hostel Room"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <form
                className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const cap = parseInt(newRoomCapacity, 10);
                  if (!roomBlockInput.trim() || !roomNumInput.trim() || isNaN(cap) || cap <= 0) {
                    alert("Hostel block, room number, and positive bed capacity are required.");
                    return;
                  }
                  const res = await fetch("/api/admin/hostel", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      type: "SAVE_ROOM",
                      id: editingRoomId || undefined,
                      hostelName: roomBlockInput.trim(),
                      roomNumber: roomNumInput.trim(),
                      capacity: cap,
                      wardenName: roomWardenInput.trim(),
                      wardenContact: roomContactInput.trim(),
                    }),
                  });
                  const j = await res.json();
                  if (j.success) {
                    setEditingRoomId(null);
                    setRoomNumInput("");
                    fetchAllocations();
                  } else {
                    alert(j.error || "Failed to save room.");
                  }
                }}
              >
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-bold text-[#64748B] mb-1">Hostel Building / Block *</label>
                  <Input value={roomBlockInput} onChange={(e) => setRoomBlockInput(e.target.value)} required />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#64748B] mb-1">Room # *</label>
                  <Input value={roomNumInput} onChange={(e) => setRoomNumInput(e.target.value)} placeholder="A-101" required />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#64748B] mb-1">Bed Capacity *</label>
                  <Input type="number" min="1" value={newRoomCapacity} onChange={(e) => setNewRoomCapacity(e.target.value)} required />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#64748B] mb-1">Warden Name</label>
                  <Input value={roomWardenInput} onChange={(e) => setRoomWardenInput(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" variant="primary">
                    {editingRoomId ? "Update" : "Save Room"}
                  </Button>
                  {editingRoomId && (
                    <Button type="button" size="sm" variant="outline" onClick={() => setEditingRoomId(null)}>
                      Cancel
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>

          {rooms.length === 0 ? (
            <Card className="border-[#E2E8F0]">
              <CardContent className="p-6 text-center text-xs text-[#64748B]">
                No hostel rooms configured yet. Create your first room above to track live bed occupancy.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rooms.map((rm: any) => {
                const occupants = allocations.filter(
                  (a) => a.hostelName === rm.hostelName && a.roomNumber === rm.roomNumber
                );
                const isFull = occupants.length >= Number(rm.capacity || 1);
                return (
                  <Card key={rm.id} className="border-[#E2E8F0]">
                    <CardHeader className="p-3.5 border-b border-[#E2E8F0] bg-[#F8FAFC]">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-bold uppercase text-[#123B5A]">{rm.hostelName}</span>
                          <h4 className="text-sm font-bold text-[#1E293B]">Room {rm.roomNumber}</h4>
                        </div>
                        <Badge variant={isFull ? "destructive" : occupants.length > 0 ? "warning" : "success"}>
                          {occupants.length} / {rm.capacity} Beds
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3.5 space-y-2 text-xs">
                      <p className="text-[11px] text-[#64748B]">
                        Warden: {rm.wardenName || "Assigned Warden"} {rm.wardenContact ? `(${rm.wardenContact})` : ""}
                      </p>
                      {occupants.length === 0 ? (
                        <p className="text-[11px] text-[#16A34A] font-medium">All beds vacant</p>
                      ) : (
                        <div className="space-y-1.5">
                          {occupants.map((occ: any) => (
                            <div key={occ.id} className="flex items-center justify-between p-2 rounded bg-[#F8FAFC] border border-[#E2E8F0]">
                              <div>
                                <span className="font-semibold text-[#1E293B] block">{occ.student?.fullName || "Student"}</span>
                                <span className="text-[10px] text-[#64748B]">{occ.bedNumber}</span>
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setTransferAlloc(occ);
                                    setTransferHostel(occ.hostelName);
                                    setTransferRoom(occ.roomNumber);
                                    setTransferBed(occ.bedNumber);
                                  }}
                                >
                                  Transfer
                                </Button>
                                <Button size="sm" variant="outline" className="text-[#DC2626]" onClick={() => handleDelete(occ.id)}>
                                  Vacate
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="pt-2 border-t border-[#E2E8F0] flex justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingRoomId(rm.id);
                            setRoomBlockInput(rm.hostelName);
                            setRoomNumInput(rm.roomNumber);
                            setNewRoomCapacity(String(rm.capacity));
                            setRoomWardenInput(rm.wardenName || "");
                            setRoomContactInput(rm.wardenContact || "");
                          }}
                        >
                          Edit Room
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {transferAlloc && (
            <Modal isOpen={true} onClose={() => setTransferAlloc(null)} title={`Transfer Bed — ${transferAlloc.student?.fullName || "Student"}`}>
              <form
                className="space-y-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const res = await fetch("/api/admin/hostel", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      id: transferAlloc.id,
                      hostelName: transferHostel,
                      roomNumber: transferRoom,
                      bedNumber: transferBed,
                    }),
                  });
                  const j = await res.json();
                  if (j.success) {
                    setTransferAlloc(null);
                    fetchAllocations();
                  } else {
                    alert(j.error || "Bed transfer failed.");
                  }
                }}
              >
                <div>
                  <label className="block text-xs font-semibold mb-1">Target Hostel Block *</label>
                  <Input value={transferHostel} onChange={(e) => setTransferHostel(e.target.value)} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Target Room # *</label>
                    <Input value={transferRoom} onChange={(e) => setTransferRoom(e.target.value)} required />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Target Bed # *</label>
                    <Input value={transferBed} onChange={(e) => setTransferBed(e.target.value)} required />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setTransferAlloc(null)}>Cancel</Button>
                  <Button type="submit" variant="primary">Confirm Transfer</Button>
                </div>
              </form>
            </Modal>
          )}
        </div>
      )}

      {activeTab === "maintenance" && (
        <div className="space-y-4">
          <Card className="border-[#E2E8F0]">
            <CardHeader className="p-4 border-b border-[#E2E8F0]">
              <CardTitle className="text-sm font-bold text-[#1E293B]">
                Record Hostel Attendance or Maintenance Ticket
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <form
                className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!opHostelInput.trim() || !opSummary.trim()) return;
                  const res = await fetch("/api/admin/hostel", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      type: "OPERATION",
                      operationType: opType,
                      hostelName: opHostelInput.trim(),
                      roomNumber: opRoomInput.trim() || undefined,
                      summary: opSummary.trim(),
                    }),
                  });
                  const j = await res.json();
                  if (j.success) {
                    setOpSummary("");
                    setOpRoomInput("");
                    fetchAllocations();
                  } else {
                    alert(j.error || "Failed to save hostel record.");
                  }
                }}
              >
                <div>
                  <label className="block text-[11px] font-bold text-[#64748B] mb-1">Type</label>
                  <select
                    value={opType}
                    onChange={(e) => setOpType(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#E2E8F0] bg-white"
                  >
                    <option value="MAINTENANCE">Maintenance Ticket</option>
                    <option value="ATTENDANCE">Roll Call / Attendance</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#64748B] mb-1">Hostel Block *</label>
                  <Input value={opHostelInput} onChange={(e) => setOpHostelInput(e.target.value)} required />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#64748B] mb-1">Room # (optional)</label>
                  <Input value={opRoomInput} onChange={(e) => setOpRoomInput(e.target.value)} placeholder="A-204" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#64748B] mb-1">Summary / Notes *</label>
                  <Input value={opSummary} onChange={(e) => setOpSummary(e.target.value)} placeholder="Evening roll call / Repair detail" required />
                </div>
                <Button type="submit" size="sm" variant="primary">
                  Save Record
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="border-[#E2E8F0]">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#F8FAFC]">
                    <TableHead className="text-xs font-bold">Type</TableHead>
                    <TableHead className="text-xs font-bold">Location</TableHead>
                    <TableHead className="text-xs font-bold">Summary</TableHead>
                    <TableHead className="text-xs font-bold">Date</TableHead>
                    <TableHead className="text-xs font-bold">Status</TableHead>
                    <TableHead className="text-xs font-bold text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {operations.length === 0 ? (
                    <TableEmpty colSpan={6} message="No hostel attendance or maintenance records logged yet." />
                  ) : (
                    operations.map((op: any) => (
                      <TableRow key={op.id} className="hover:bg-[#F8FAFC]">
                        <TableCell>
                          <Badge variant={op.type === "MAINTENANCE" ? "warning" : "info"}>{op.type}</Badge>
                        </TableCell>
                        <TableCell className="text-xs font-semibold text-[#1E293B]">
                          {op.hostelName} {op.roomNumber ? `(${op.roomNumber})` : ""}
                        </TableCell>
                        <TableCell className="text-xs text-[#64748B]">{op.summary}</TableCell>
                        <TableCell className="text-xs text-[#64748B]">
                          {new Date(op.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant={op.status === "RESOLVED" || op.status === "RECORDED" ? "success" : "warning"}>
                            {op.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {op.status === "OPEN" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                const res = await fetch("/api/admin/hostel", {
                                  method: "PUT",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    action: "UPDATE_OPERATION",
                                    operationId: op.id,
                                    status: "RESOLVED",
                                  }),
                                });
                                if ((await res.json()).success) fetchAllocations();
                              }}
                            >
                              Mark Resolved
                            </Button>
                          )}
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

      {/* Allocate Room Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Allocate Hostel Room">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-[#1E293B] block mb-1">Select Student *</label>
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
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
            <label className="text-xs font-semibold text-[#1E293B] block mb-1">Hostel Block Name *</label>
            <Input value={hostelName} onChange={(e) => setHostelName(e.target.value)} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#1E293B] block mb-1">Room # *</label>
              <Input value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} required />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#1E293B] block mb-1">Bed # *</label>
              <Input value={bedNumber} onChange={(e) => setBedNumber(e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#1E293B] block mb-1">Warden Name</label>
              <Input value={wardenName} onChange={(e) => setWardenName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#1E293B] block mb-1">Warden Contact</label>
              <Input value={wardenContact} onChange={(e) => setWardenContact(e.target.value)} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Confirm Allocation
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
