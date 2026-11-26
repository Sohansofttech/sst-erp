"use client";

import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Bus, Plus, Trash2, MapPin, Clock, Navigation, Radio, Route, CheckCircle2 } from "lucide-react";
import { useInstitution } from "@/lib/store";
import { DepartmentStaffPanel } from "@/components/admin/DepartmentStaffPanel";

export default function TransportPage() {
  const { students } = useInstitution();
  const [directoryStudents, setDirectoryStudents] = useState<any[]>([]);
  const availableStudents = directoryStudents.length > 0 ? directoryStudents : students;
  const [allocations, setAllocations] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [maintenance, setMaintenance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "allocations" | "fleet" | "routes" | "maintenance" | "team">("allocations");
  const [editingCatalogId, setEditingCatalogId] = useState<string | null>(null);
  const [catRouteNo, setCatRouteNo] = useState("");
  const [catRouteName, setCatRouteName] = useState("");
  const [catVehicleNo, setCatVehicleNo] = useState("");
  const [catCapacity, setCatCapacity] = useState("40");
  const [catDriverName, setCatDriverName] = useState("");
  const [catDriverContact, setCatDriverContact] = useState("");
  const [catStops, setCatStops] = useState("");
  const [catStatus, setCatStatus] = useState<"ACTIVE" | "INACTIVE" | "MAINTENANCE">("ACTIVE");
  const [maintVehicle, setMaintVehicle] = useState("KA-01-F-4921");
  const [maintSummary, setMaintSummary] = useState("");
  const [maintCost, setMaintCost] = useState("");

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
        setCatalog(json.catalog || []);
        setMaintenance(json.maintenance || []);
      }
    } catch (err) {
      console.warn("Failed to load transport allocations:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const tab = new URLSearchParams(window.location.search).get("tab");
      if (
        tab === "overview" ||
        tab === "allocations" ||
        tab === "fleet" ||
        tab === "routes" ||
        tab === "maintenance"
      ) {
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
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#1E293B] tracking-tight">
            Transport Management
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            Manage institutional bus routes, vehicle allocations, and student fleet assignments.
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

      {/* Transport KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-[#E2E8F0]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase">Active Routes</p>
              <h3 className="text-2xl font-bold text-[#1E293B] mt-1">6 Routes</h3>
              <p className="text-[11px] text-[#64748B] mt-0.5">Metropolitan Coverage</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#F5A000]/10 flex items-center justify-center text-[#F5A000]">
              <Route className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E2E8F0]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase">Fleet Vehicles</p>
              <h3 className="text-2xl font-bold text-[#123B5A] mt-1">8 Buses</h3>
              <p className="text-[11px] text-[#16A34A] mt-0.5 font-medium">100% Fitness Certified</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#123B5A]/10 flex items-center justify-center text-[#123B5A]">
              <Bus className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E2E8F0]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase">Commuting Scholars</p>
              <h3 className="text-2xl font-bold text-[#F5A000] mt-1">{allocations.length} Active</h3>
              <p className="text-[11px] text-[#64748B] mt-0.5">Transit Pass Holders</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#FEF3C7] flex items-center justify-center text-[#F5A000]">
              <Navigation className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E2E8F0]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase">On-Time Score</p>
              <h3 className="text-2xl font-bold text-[#16A34A] mt-1">98.4%</h3>
              <p className="text-[11px] text-[#16A34A] mt-0.5 font-medium">GPS Telemetry Tracked</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#16A34A]/10 flex items-center justify-center text-[#16A34A]">
              <Radio className="w-5 h-5" />
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
          <Bus className="w-4 h-4" />
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
          <Navigation className="w-4 h-4" />
          Student Route Allocations ({allocations.length})
        </button>
        <button
          onClick={() => setActiveTab("fleet")}
          className={`pb-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === "fleet"
              ? "border-[#F5A000] text-[#F5A000]"
              : "border-transparent text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          <Bus className="w-4 h-4" />
          Vehicles &amp; Drivers ({catalog.length})
        </button>
        <button
          onClick={() => setActiveTab("routes")}
          className={`pb-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === "routes"
              ? "border-[#F5A000] text-[#F5A000]"
              : "border-transparent text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          <Route className="w-4 h-4" />
          Route Stops &amp; Schedules
        </button>
        <button
          onClick={() => setActiveTab("maintenance")}
          className={`pb-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === "maintenance"
              ? "border-[#F5A000] text-[#F5A000]"
              : "border-transparent text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          Maintenance &amp; Reports ({maintenance.length})
        </button>
        <button
          onClick={() => setActiveTab("team")}
          className={`pb-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === "team"
              ? "border-[#F5A000] text-[#F5A000]"
              : "border-transparent text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          <Bus className="w-4 h-4" />
          Department Team
        </button>
      </div>

      {activeTab === "team" && (
        <DepartmentStaffPanel departmentRole="TRANSPORT_OFFICER" departmentLabel="Transport Officer" />
      )}

      {activeTab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <span className="text-xs font-bold uppercase text-[#64748B]">Allocated Students</span>
              <h3 className="text-2xl font-black text-[#1E293B] mt-1">{allocations.length}</h3>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <span className="text-xs font-bold uppercase text-[#64748B]">Configured Routes / Vehicles</span>
              <h3 className="text-2xl font-black text-[#123B5A] mt-1">{catalog.length}</h3>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <span className="text-xs font-bold uppercase text-[#64748B]">Maintenance Records</span>
              <h3 className="text-2xl font-black text-[#D97706] mt-1">{maintenance.length}</h3>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "maintenance" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold text-[#1E293B]">Log Vehicle Maintenance</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!maintVehicle.trim() || !maintSummary.trim()) return;
                  const res = await fetch("/api/admin/transport", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      type: "MAINTENANCE",
                      vehicleNumber: maintVehicle,
                      summary: maintSummary,
                      cost: maintCost ? parseFloat(maintCost) : 0,
                    }),
                  });
                  const j = await res.json();
                  if (j.success) {
                    setMaintSummary("");
                    setMaintCost("");
                    fetchAllocations();
                  } else {
                    alert(j.error || "Failed to log maintenance.");
                  }
                }}
              >
                <div>
                  <label className="block text-[11px] font-bold text-[#64748B] mb-1">Vehicle Number</label>
                  <Input value={maintVehicle} onChange={(e) => setMaintVehicle(e.target.value)} required />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#64748B] mb-1">Summary</label>
                  <Input
                    value={maintSummary}
                    onChange={(e) => setMaintSummary(e.target.value)}
                    placeholder="Brake & tire inspection"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#64748B] mb-1">Cost (₹)</label>
                  <Input
                    type="number"
                    min="0"
                    value={maintCost}
                    onChange={(e) => setMaintCost(e.target.value)}
                    placeholder="3500"
                  />
                </div>
                <Button type="submit" size="sm" variant="primary">
                  Save Record
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {maintenance.length === 0 ? (
                    <TableEmpty colSpan={5} message="No maintenance records logged yet." />
                  ) : (
                    maintenance.map((m: any) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-mono text-xs font-bold">{m.vehicleNumber}</TableCell>
                        <TableCell className="text-xs">{m.summary}</TableCell>
                        <TableCell className="text-xs font-semibold">₹{Number(m.cost || 0).toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant="warning">{m.status}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-[#64748B]">
                          {new Date(m.createdAt).toLocaleDateString()}
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

      {activeTab === "allocations" && (
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
                      <TableCell className="text-xs font-bold text-[#123B5A]">
                        <span>{a.routeNumber}</span>
                        <span className="text-[11px] font-normal text-[#64748B] block">{a.routeName}</span>
                      </TableCell>
                      <TableCell className="text-xs font-mono font-medium text-[#1E293B]">
                        {a.vehicleNumber}
                      </TableCell>
                      <TableCell className="text-xs text-[#64748B]">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-[#F5A000]" />
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

      {activeTab === "fleet" && (
        <div className="space-y-4">
          <Card className="border-[#E2E8F0]">
            <CardHeader className="p-4 border-b border-[#E2E8F0]">
              <CardTitle className="text-sm font-bold text-[#1E293B]">
                {editingCatalogId ? "Edit Vehicle, Driver & Route" : "Register Vehicle, Driver & Route"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <form
                className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const cap = parseInt(catCapacity, 10);
                  if (!catRouteNo.trim() || !catRouteName.trim() || !catVehicleNo.trim() || !catDriverName.trim() || isNaN(cap) || cap <= 0) {
                    alert("Route number, route name, vehicle plate, driver name, and positive capacity are required.");
                    return;
                  }
                  const stopsArr = catStops
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                  const res = await fetch("/api/admin/transport", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      type: "SAVE_ROUTE",
                      id: editingCatalogId || undefined,
                      routeNumber: catRouteNo.trim(),
                      routeName: catRouteName.trim(),
                      vehicleNumber: catVehicleNo.trim(),
                      capacity: cap,
                      driverName: catDriverName.trim(),
                      driverContact: catDriverContact.trim(),
                      stops: stopsArr,
                      status: catStatus,
                    }),
                  });
                  const j = await res.json();
                  if (j.success) {
                    setEditingCatalogId(null);
                    setCatRouteNo("");
                    setCatRouteName("");
                    setCatVehicleNo("");
                    setCatDriverName("");
                    setCatDriverContact("");
                    setCatStops("");
                    fetchAllocations();
                  } else {
                    alert(j.error || "Failed to save vehicle/route.");
                  }
                }}
              >
                <div>
                  <label className="block text-[11px] font-bold text-[#64748B] mb-1">Route # *</label>
                  <Input value={catRouteNo} onChange={(e) => setCatRouteNo(e.target.value)} placeholder="R-12" required />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#64748B] mb-1">Route Name *</label>
                  <Input value={catRouteName} onChange={(e) => setCatRouteName(e.target.value)} placeholder="Airport via Indiranagar" required />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#64748B] mb-1">Vehicle Plate # *</label>
                  <Input value={catVehicleNo} onChange={(e) => setCatVehicleNo(e.target.value)} placeholder="KA-01-F-4921" required />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#64748B] mb-1">Seating Capacity *</label>
                  <Input type="number" min="1" value={catCapacity} onChange={(e) => setCatCapacity(e.target.value)} required />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#64748B] mb-1">Driver Name *</label>
                  <Input value={catDriverName} onChange={(e) => setCatDriverName(e.target.value)} placeholder="Mr. Manjunath S" required />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#64748B] mb-1">Driver Contact</label>
                  <Input value={catDriverContact} onChange={(e) => setCatDriverContact(e.target.value)} placeholder="+91 98450 77889" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#64748B] mb-1">Stops (comma-separated)</label>
                  <Input value={catStops} onChange={(e) => setCatStops(e.target.value)} placeholder="Stop A, Stop B, Campus" />
                </div>
                <div className="flex gap-2 items-center">
                  <select
                    value={catStatus}
                    onChange={(e) => setCatStatus(e.target.value as any)}
                    className="px-2.5 py-2 text-xs rounded-lg border border-[#E2E8F0] bg-white"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="MAINTENANCE">MAINTENANCE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                  <Button type="submit" size="sm" variant="primary">
                    {editingCatalogId ? "Update" : "Save"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {catalog.length === 0 ? (
            <Card className="border-[#E2E8F0]">
              <CardContent className="p-6 text-center text-xs text-[#64748B]">
                No vehicles or routes configured yet. Register your first vehicle and route above.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {catalog.map((bus: any) => {
                const usedSeats = allocations.filter(
                  (a) => a.vehicleNumber === bus.vehicleNumber && a.routeNumber === bus.routeNumber
                ).length;
                return (
                  <Card key={bus.id} className="border-[#E2E8F0]">
                    <CardHeader className="p-3.5 border-b border-[#E2E8F0] bg-[#F8FAFC]">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-bold text-xs text-[#123B5A]">{bus.routeNumber}</span>
                          <p className="font-mono text-[11px] text-[#64748B]">{bus.vehicleNumber}</p>
                        </div>
                        <Badge variant={bus.status === "ACTIVE" ? "success" : "warning"}>{bus.status || "ACTIVE"}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3.5 space-y-2 text-xs">
                      <div>
                        <span className="text-[#64748B] text-[10px] uppercase font-semibold">Route</span>
                        <p className="font-semibold text-[#1E293B] text-[11px] truncate">{bus.routeName}</p>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-[#64748B]">Occupancy / Capacity:</span>
                        <span className="font-bold text-[#1E293B]">
                          {usedSeats} / {bus.capacity} Seats
                        </span>
                      </div>
                      <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between">
                        <div>
                          <p className="text-[11px] font-medium text-[#1E293B]">{bus.driverName}</p>
                          <p className="text-[10px] text-[#F5A000]">{bus.driverContact || "—"}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingCatalogId(bus.id);
                            setCatRouteNo(bus.routeNumber || "");
                            setCatRouteName(bus.routeName || "");
                            setCatVehicleNo(bus.vehicleNumber || "");
                            setCatCapacity(String(bus.capacity || 40));
                            setCatDriverName(bus.driverName || "");
                            setCatDriverContact(bus.driverContact || "");
                            setCatStops(Array.isArray(bus.stops) ? bus.stops.join(", ") : "");
                            setCatStatus(bus.status || "ACTIVE");
                          }}
                        >
                          Edit
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "routes" && (
        <div className="space-y-4">
          {catalog.length === 0 ? (
            <Card className="border-[#E2E8F0]">
              <CardContent className="p-6 text-center text-xs text-[#64748B]">
                No routes configured yet. Add routes and stops in the Vehicles &amp; Drivers tab.
              </CardContent>
            </Card>
          ) : (
            catalog.map((r: any) => (
              <Card key={r.id} className="border-[#E2E8F0]">
                <CardHeader className="p-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-xs bg-[#F5A000]/10 text-[#F5A000] px-2 py-0.5 rounded uppercase">
                        {r.routeNumber}
                      </span>
                      <h4 className="text-sm font-bold text-[#1E293B] mt-1">{r.routeName}</h4>
                    </div>
                    <span className="font-mono text-xs text-[#64748B] bg-white border px-2.5 py-1 rounded">
                      {r.vehicleNumber} • {r.driverName}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  {Array.isArray(r.stops) && r.stops.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      {r.stops.map((stopName: string, idx: number) => (
                        <div key={idx} className="p-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-xs">
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#123B5A]">
                            <span className="w-4 h-4 rounded-full bg-[#123B5A] text-white flex items-center justify-center text-[10px]">
                              {idx + 1}
                            </span>
                            <span className="truncate">{stopName}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#64748B]">No stops defined for this route yet.</p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

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
              {availableStudents.map((s) => (
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
