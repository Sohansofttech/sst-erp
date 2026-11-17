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

export default function HostelPage() {
  const { students } = useInstitution();
  const [allocations, setAllocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"allocations" | "matrix" | "maintenance">("allocations");

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
      }
    } catch (err) {
      console.warn("Failed to load hostel allocations:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllocations();
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
      <div className="flex items-center gap-2 border-b border-[#E2E8F0]">
        <button
          onClick={() => setActiveTab("allocations")}
          className={`pb-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
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
          className={`pb-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === "matrix"
              ? "border-[#F5A000] text-[#F5A000]"
              : "border-transparent text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          <Building2 className="w-4 h-4" />
          Room & Bed Occupancy Matrix
        </button>
        <button
          onClick={() => setActiveTab("maintenance")}
          className={`pb-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === "maintenance"
              ? "border-[#F5A000] text-[#F5A000]"
              : "border-transparent text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          <Wrench className="w-4 h-4" />
          Maintenance & Facilities (3)
        </button>
      </div>

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
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs text-[#DC2626] border-[#DC2626]/30 hover:bg-[#DC2626]/10"
                          onClick={() => handleDelete(a.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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

      {activeTab === "matrix" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-[#E2E8F0]">
              <CardHeader className="p-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#123B5A] bg-[#123B5A]/10 px-2 py-0.5 rounded">
                      Boys Residential Wing
                    </span>
                    <h4 className="text-sm font-bold text-[#1E293B] mt-1">Kaveri Hostel Block A</h4>
                    <p className="text-[11px] text-[#64748B]">Warden: Mr. Ramesh Rao (+91 98450 11223)</p>
                  </div>
                  <Badge variant="default" className="bg-[#123B5A]">40 Rooms / 80 Beds</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                  {[
                    { room: "A-101", beds: ["Occupied", "Occupied"], status: "FULL" },
                    { room: "A-102", beds: ["Occupied", "Vacant"], status: "PARTIAL" },
                    { room: "A-103", beds: ["Occupied", "Occupied"], status: "FULL" },
                    { room: "A-104", beds: ["Vacant", "Vacant"], status: "AVAILABLE" },
                    { room: "A-201", beds: ["Occupied", "Occupied"], status: "FULL" },
                    { room: "A-202", beds: ["Occupied", "Vacant"], status: "PARTIAL" },
                    { room: "A-203", beds: ["Occupied", "Occupied"], status: "FULL" },
                    { room: "A-204", beds: ["Occupied (Aarav)", "Occupied"], status: "FULL" },
                    { room: "A-301", beds: ["Occupied", "Occupied"], status: "FULL" },
                    { room: "A-302", beds: ["Occupied (Rohan)", "Occupied"], status: "FULL" },
                    { room: "A-303", beds: ["Vacant", "Vacant"], status: "AVAILABLE" },
                    { room: "A-304", beds: ["Maintenance", "Maintenance"], status: "MAINT" },
                  ].map((r, i) => (
                    <div
                      key={i}
                      className={`p-2.5 rounded-lg border text-center text-xs transition-all ${
                        r.status === "FULL"
                          ? "bg-[#F8FAFC] border-[#E2E8F0] text-[#1E293B]"
                          : r.status === "PARTIAL"
                          ? "bg-[#FEF3C7]/40 border-[#F59E0B]/30 text-[#B45309]"
                          : r.status === "AVAILABLE"
                          ? "bg-[#DCFCE7]/40 border-[#22C55E]/30 text-[#15803D]"
                          : "bg-[#FEE2E2]/40 border-[#EF4444]/30 text-[#B91C1C]"
                      }`}
                    >
                      <div className="font-bold">{r.room}</div>
                      <div className="text-[10px] opacity-75 mt-0.5">{r.status}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-[#E2E8F0]">
              <CardHeader className="p-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#F5A000] bg-[#FEF3C7] px-2 py-0.5 rounded">
                      Girls Residential Wing
                    </span>
                    <h4 className="text-sm font-bold text-[#1E293B] mt-1">Sharavathi Hostel Block B</h4>
                    <p className="text-[11px] text-[#64748B]">Warden: Mrs. Shobha K (+91 98450 22334)</p>
                  </div>
                  <Badge variant="default" className="bg-[#F5A000]">40 Rooms / 80 Beds</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                  {[
                    { room: "B-101", beds: ["Occupied", "Occupied"], status: "FULL" },
                    { room: "B-102", beds: ["Occupied", "Vacant"], status: "PARTIAL" },
                    { room: "B-103", beds: ["Occupied", "Occupied"], status: "FULL" },
                    { room: "B-108", beds: ["Occupied (Diya)", "Occupied"], status: "FULL" },
                    { room: "B-201", beds: ["Occupied", "Occupied"], status: "FULL" },
                    { room: "B-202", beds: ["Vacant", "Vacant"], status: "AVAILABLE" },
                    { room: "B-211", beds: ["Occupied", "Occupied"], status: "FULL" },
                    { room: "B-212", beds: ["Occupied (Sneha)", "Occupied"], status: "FULL" },
                    { room: "B-301", beds: ["Occupied", "Occupied"], status: "FULL" },
                    { room: "B-302", beds: ["Occupied", "Vacant"], status: "PARTIAL" },
                    { room: "B-303", beds: ["Vacant", "Vacant"], status: "AVAILABLE" },
                    { room: "B-304", beds: ["Occupied", "Occupied"], status: "FULL" },
                  ].map((r, i) => (
                    <div
                      key={i}
                      className={`p-2.5 rounded-lg border text-center text-xs transition-all ${
                        r.status === "FULL"
                          ? "bg-[#F8FAFC] border-[#E2E8F0] text-[#1E293B]"
                          : r.status === "PARTIAL"
                          ? "bg-[#FEF3C7]/40 border-[#F59E0B]/30 text-[#B45309]"
                          : r.status === "AVAILABLE"
                          ? "bg-[#DCFCE7]/40 border-[#22C55E]/30 text-[#15803D]"
                          : "bg-[#FEE2E2]/40 border-[#EF4444]/30 text-[#B91C1C]"
                      }`}
                    >
                      <div className="font-bold">{r.room}</div>
                      <div className="text-[10px] opacity-75 mt-0.5">{r.status}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === "maintenance" && (
        <Card className="border-[#E2E8F0]">
          <CardHeader className="p-4 border-b border-[#E2E8F0]">
            <CardTitle className="text-sm font-bold text-[#1E293B]">
              Residential Maintenance & Facility Work Orders
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#F8FAFC]">
                  <TableHead className="text-xs font-bold text-[#1E293B]">Ticket #</TableHead>
                  <TableHead className="text-xs font-bold text-[#1E293B]">Location</TableHead>
                  <TableHead className="text-xs font-bold text-[#1E293B]">Issue Description</TableHead>
                  <TableHead className="text-xs font-bold text-[#1E293B]">Priority</TableHead>
                  <TableHead className="text-xs font-bold text-[#1E293B]">Reported Date</TableHead>
                  <TableHead className="text-xs font-bold text-[#1E293B]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  {
                    id: "TK-2026-081",
                    location: "Kaveri Block A (Room A-204)",
                    issue: "Bathroom water heater heating coil replacement",
                    priority: "HIGH",
                    date: "2026-11-14",
                    status: "IN_PROGRESS",
                  },
                  {
                    id: "TK-2026-080",
                    location: "Sharavathi Block B (2nd Floor Corridor)",
                    issue: "Wi-Fi Access Point 5GHz band channel interference",
                    priority: "MEDIUM",
                    date: "2026-11-13",
                    status: "PENDING",
                  },
                  {
                    id: "TK-2026-079",
                    location: "Central Dining Hall A",
                    issue: "Steam boiler pressure valve routine quarterly inspection",
                    priority: "LOW",
                    date: "2026-11-10",
                    status: "RESOLVED",
                  },
                ].map((t) => (
                  <TableRow key={t.id} className="hover:bg-[#F8FAFC]">
                    <TableCell className="font-mono text-xs font-bold text-[#123B5A]">{t.id}</TableCell>
                    <TableCell className="text-xs font-semibold text-[#1E293B]">{t.location}</TableCell>
                    <TableCell className="text-xs text-[#64748B]">{t.issue}</TableCell>
                    <TableCell>
                      <Badge variant={t.priority === "HIGH" ? "destructive" : t.priority === "MEDIUM" ? "warning" : "default"}>
                        {t.priority}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-[#64748B]">{t.date}</TableCell>
                    <TableCell>
                      <Badge variant={t.status === "RESOLVED" ? "success" : t.status === "IN_PROGRESS" ? "warning" : "destructive"}>
                        {t.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
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
              {students.map((s) => (
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
