"use client";

import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { Home, Plus, Trash2, Phone, User } from "lucide-react";
import { useInstitution } from "@/lib/store";

export default function HostelPage() {
  const { students } = useInstitution();
  const [allocations, setAllocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

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
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-[#14B8A6] uppercase tracking-wider flex items-center gap-1">
              <Home className="w-3.5 h-3.5" /> Campus Services
            </span>
            <span className="text-[#CBD5E1]">•</span>
            <span className="text-xs font-semibold text-[#64748B]">Residential Life</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#1E293B] tracking-tight">
            Hostel & Residential Accommodation
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
                        <User className="w-3.5 h-3.5 text-[#2563EB]" />
                        <span>{a.student?.fullName || "Student"}</span>
                      </div>
                      <span className="text-[11px] text-[#64748B] block">{a.student?.rollNumber}</span>
                    </TableCell>
                    <TableCell className="text-xs font-medium text-[#1E293B]">{a.hostelName}</TableCell>
                    <TableCell className="text-xs font-bold text-[#153B66]">{a.roomNumber}</TableCell>
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
