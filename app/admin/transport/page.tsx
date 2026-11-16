"use client";

import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { Bus, Plus, Trash2, MapPin, Clock } from "lucide-react";
import { useInstitution } from "@/lib/store";

export default function TransportPage() {
  const { students } = useInstitution();
  const [allocations, setAllocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form
  const [studentId, setStudentId] = useState("");
  const [routeName, setRouteName] = useState("Route 12 - Airport Road via Indiranagar");
  const [routeNumber, setRouteNumber] = useState("R-12");
  const [vehicleNumber, setVehicleNumber] = useState("KA-01-F-4921");
  const [driverName, setDriverName] = useState("Mr. Manjunath S");
  const [driverContact, setDriverContact] = useState("+91 98450 77889");
  const [pickupPoint, setPickupPoint] = useState("Sony Signal Koramangala");
  const [pickupTime, setPickupTime] = useState("07:30 AM");
  const [dropTime, setDropTime] = useState("05:15 PM");

  const fetchAllocations = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/transport");
      const json = await res.json();
      if (json.success && json.data) {
        setAllocations(json.data);
      }
    } catch (err) {
      console.warn("Failed to load transport allocations:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllocations();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || !routeName || !routeNumber || !vehicleNumber) return;

    try {
      const res = await fetch("/api/admin/transport", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          routeName,
          routeNumber,
          vehicleNumber,
          driverName,
          driverContact,
          pickupPoint,
          pickupTime,
          dropTime,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsModalOpen(false);
        fetchAllocations();
      } else {
        alert(data.error || "Transport allocation failed.");
      }
    } catch (err: any) {
      alert(err.message || "Network error");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this transport route allocation?")) return;
    try {
      const res = await fetch(`/api/admin/transport?id=${id}`, { method: "DELETE" });
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
              <Bus className="w-3.5 h-3.5" /> Campus Logistics
            </span>
            <span className="text-[#CBD5E1]">•</span>
            <span className="text-xs font-semibold text-[#64748B]">Fleet Operations</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#1E293B] tracking-tight">
            Transport & Route Fleet Management
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            Manage institutional bus routes, vehicle allocations, pickup stops, and student fleet assignments.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => setIsModalOpen(true)}
        >
          Assign Transport Route
        </Button>
      </div>

      <Card className="border-[#E2E8F0]">
        <CardHeader className="p-4 border-b border-[#E2E8F0]">
          <CardTitle className="text-sm font-bold text-[#1E293B]">
            Assigned Student Fleet Routes ({allocations.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#F8FAFC]">
                <TableHead className="text-xs font-bold text-[#1E293B]">Student</TableHead>
                <TableHead className="text-xs font-bold text-[#1E293B]">Route & Code</TableHead>
                <TableHead className="text-xs font-bold text-[#1E293B]">Vehicle #</TableHead>
                <TableHead className="text-xs font-bold text-[#1E293B]">Pickup Stop</TableHead>
                <TableHead className="text-xs font-bold text-[#1E293B]">Timings</TableHead>
                <TableHead className="text-xs font-bold text-[#1E293B]">Driver Details</TableHead>
                <TableHead className="text-xs font-bold text-[#1E293B] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-sm text-[#64748B]">
                    Loading transport allocations...
                  </TableCell>
                </TableRow>
              ) : allocations.length === 0 ? (
                <TableEmpty colSpan={7} message="No student transport route assignments recorded." />
              ) : (
                allocations.map((a) => (
                  <TableRow key={a.id} className="hover:bg-[#F8FAFC]">
                    <TableCell className="text-xs font-semibold text-[#1E293B]">
                      {a.student?.fullName || "Student"}
                      <span className="text-[11px] text-[#64748B] block">{a.student?.rollNumber}</span>
                    </TableCell>
                    <TableCell className="text-xs font-bold text-[#153B66]">
                      <span>{a.routeNumber}</span>
                      <span className="text-[11px] font-normal text-[#64748B] block">{a.routeName}</span>
                    </TableCell>
                    <TableCell className="text-xs font-mono font-medium text-[#1E293B]">
                      {a.vehicleNumber}
                    </TableCell>
                    <TableCell className="text-xs text-[#64748B]">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-[#2563EB]" />
                        <span>{a.pickupPoint}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-[#64748B]">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-[#14B8A6]" />
                        <span>{a.pickupTime} / {a.dropTime}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-[#64748B]">
                      <span>{a.driverName}</span>
                      <span className="text-[10px] block text-[#94A3B8]">{a.driverContact}</span>
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

      {/* Assign Transport Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Assign Student Transport Route">
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#1E293B] block mb-1">Route Number *</label>
              <Input value={routeNumber} onChange={(e) => setRouteNumber(e.target.value)} required />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#1E293B] block mb-1">Vehicle Plate # *</label>
              <Input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} required />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[#1E293B] block mb-1">Route Name & Destination *</label>
            <Input value={routeName} onChange={(e) => setRouteName(e.target.value)} required />
          </div>

          <div>
            <label className="text-xs font-semibold text-[#1E293B] block mb-1">Pickup Stop / Location</label>
            <Input value={pickupPoint} onChange={(e) => setPickupPoint(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#1E293B] block mb-1">Pickup Time</label>
              <Input value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#1E293B] block mb-1">Drop Time</label>
              <Input value={dropTime} onChange={(e) => setDropTime(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#1E293B] block mb-1">Driver Name</label>
              <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#1E293B] block mb-1">Driver Contact</label>
              <Input value={driverContact} onChange={(e) => setDriverContact(e.target.value)} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Confirm Route Assignment
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
