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

export default function TransportPage() {
  const { students } = useInstitution();
  const [allocations, setAllocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"allocations" | "fleet" | "routes">("allocations");

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
      <div className="flex items-center gap-2 border-b border-[#E2E8F0]">
        <button
          onClick={() => setActiveTab("allocations")}
          className={`pb-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
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
          className={`pb-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === "fleet"
              ? "border-[#F5A000] text-[#F5A000]"
              : "border-transparent text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          <Bus className="w-4 h-4" />
          Campus Fleet & Vehicles Roster (8)
        </button>
        <button
          onClick={() => setActiveTab("routes")}
          className={`pb-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === "routes"
              ? "border-[#F5A000] text-[#F5A000]"
              : "border-transparent text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          <Route className="w-4 h-4" />
          Route Stops & Schedules
        </button>
      </div>

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              busNo: "Bus #01",
              reg: "KA-01-F-4921",
              route: "R-12 (Airport via Indiranagar)",
              capacity: "52 Seats",
              driver: "Mr. Manjunath S",
              phone: "+91 98450 77889",
              status: "LIVE_IN_ROUTE",
              fuel: "82%",
            },
            {
              busNo: "Bus #02",
              reg: "KA-04-E-8812",
              route: "R-05 (Whitefield ITPL)",
              capacity: "52 Seats",
              driver: "Mr. Suresh Gowda",
              phone: "+91 98450 66554",
              status: "LIVE_IN_ROUTE",
              fuel: "68%",
            },
            {
              busNo: "Bus #03",
              reg: "KA-05-G-1902",
              route: "R-08 (Jayanagar South)",
              capacity: "45 Seats",
              driver: "Mr. Anand Murthy",
              phone: "+91 98450 33441",
              status: "LIVE_IN_ROUTE",
              fuel: "74%",
            },
            {
              busNo: "Bus #04",
              reg: "KA-01-MJ-9901",
              route: "R-15 (Electronic City Phase 1)",
              capacity: "52 Seats",
              driver: "Mr. Venkatesh R",
              phone: "+91 97412 11220",
              status: "AT_DEPOT",
              fuel: "95%",
            },
            {
              busNo: "Bus #05",
              reg: "KA-03-AB-4450",
              route: "R-03 (Malleshwaram / Rajajinagar)",
              capacity: "45 Seats",
              driver: "Mr. Somasekhar",
              phone: "+91 98860 44551",
              status: "LIVE_IN_ROUTE",
              fuel: "60%",
            },
            {
              busNo: "Bus #06",
              reg: "KA-02-F-1123",
              route: "R-21 (Kengeri Satellite Town)",
              capacity: "52 Seats",
              driver: "Mr. Basavaraj K",
              phone: "+91 94480 99882",
              status: "AT_DEPOT",
              fuel: "88%",
            },
            {
              busNo: "Bus #07",
              reg: "KA-01-F-7711",
              route: "Campus Reserve Shuttle",
              capacity: "32 Seats",
              driver: "Mr. Narayana Swamy",
              phone: "+91 99001 22334",
              status: "STANDBY",
              fuel: "100%",
            },
            {
              busNo: "Bus #08",
              reg: "KA-04-MM-3309",
              route: "Sports & Event Transit",
              capacity: "45 Seats",
              driver: "Mr. Girish M",
              phone: "+91 98440 55667",
              status: "STANDBY",
              fuel: "90%",
            },
          ].map((bus, i) => (
            <Card key={i} className="border-[#E2E8F0]">
              <CardHeader className="p-3.5 border-b border-[#E2E8F0] bg-[#F8FAFC]">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-xs text-[#123B5A]">{bus.busNo}</span>
                    <p className="font-mono text-[11px] text-[#64748B]">{bus.reg}</p>
                  </div>
                  <Badge variant={bus.status === "LIVE_IN_ROUTE" ? "success" : "default"}>
                    {bus.status === "LIVE_IN_ROUTE" ? "IN TRANSIT" : bus.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-3.5 space-y-2 text-xs">
                <div>
                  <span className="text-[#64748B] text-[10px] uppercase font-semibold">Assigned Route</span>
                  <p className="font-semibold text-[#1E293B] text-[11px] truncate">{bus.route}</p>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-[#64748B]">Capacity:</span>
                  <span className="font-bold text-[#1E293B]">{bus.capacity}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-[#64748B]">Fuel Level:</span>
                  <span className="font-semibold text-[#16A34A]">{bus.fuel}</span>
                </div>
                <div className="pt-2 border-t border-[#E2E8F0]">
                  <span className="text-[#64748B] text-[10px] uppercase font-semibold">Driver Contact</span>
                  <p className="text-[11px] font-medium text-[#1E293B]">{bus.driver}</p>
                  <p className="text-[10px] text-[#F5A000]">{bus.phone}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {activeTab === "routes" && (
        <div className="space-y-4">
          {[
            {
              routeNo: "Route 12",
              title: "Airport Expressway via Indiranagar & Domlur",
              vehicle: "KA-01-F-4921 (Bus #01)",
              stops: [
                { stop: "Sony Signal Koramangala", time: "07:15 AM", evening: "05:15 PM" },
                { stop: "Domlur Flyover Junction", time: "07:30 AM", evening: "05:00 PM" },
                { stop: "Indiranagar 100ft Road", time: "07:45 AM", evening: "04:45 PM" },
                { stop: "Hebbal Flyover Depot", time: "08:05 AM", evening: "04:25 PM" },
                { stop: "SST Campus Main Gate", time: "08:25 AM", evening: "04:05 PM" },
              ],
            },
            {
              routeNo: "Route 05",
              title: "Whitefield ITPL via Marathahalli & Kundalahalli",
              vehicle: "KA-04-E-8812 (Bus #02)",
              stops: [
                { stop: "ITPL Main Gate Whitefield", time: "07:10 AM", evening: "05:25 PM" },
                { stop: "Kundalahalli Gate", time: "07:25 AM", evening: "05:10 PM" },
                { stop: "Marathahalli Bridge", time: "07:40 AM", evening: "04:55 PM" },
                { stop: "HAL Old Airport Road", time: "07:55 AM", evening: "04:40 PM" },
                { stop: "SST Campus Main Gate", time: "08:20 AM", evening: "04:15 PM" },
              ],
            },
            {
              routeNo: "Route 08",
              title: "Jayanagar 4th Block via Banashankari & JP Nagar",
              vehicle: "KA-05-G-1902 (Bus #03)",
              stops: [
                { stop: "Banashankari Bus Terminal", time: "07:15 AM", evening: "05:20 PM" },
                { stop: "JP Nagar 6th Phase", time: "07:30 AM", evening: "05:05 PM" },
                { stop: "South End Circle Jayanagar", time: "07:45 AM", evening: "04:50 PM" },
                { stop: "Lalbagh West Gate", time: "08:00 AM", evening: "04:35 PM" },
                { stop: "SST Campus Main Gate", time: "08:25 AM", evening: "04:10 PM" },
              ],
            },
          ].map((r, i) => (
            <Card key={i} className="border-[#E2E8F0]">
              <CardHeader className="p-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-xs bg-[#F5A000]/10 text-[#F5A000] px-2 py-0.5 rounded uppercase">
                      {r.routeNo}
                    </span>
                    <h4 className="text-sm font-bold text-[#1E293B] mt-1">{r.title}</h4>
                  </div>
                  <span className="font-mono text-xs text-[#64748B] bg-white border px-2.5 py-1 rounded">
                    {r.vehicle}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                  {r.stops.map((s, idx) => (
                    <div key={idx} className="p-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-xs space-y-1">
                      <div className="flex items-center gap-1 text-[11px] font-bold text-[#123B5A]">
                        <span className="w-4 h-4 rounded-full bg-[#123B5A] text-white flex items-center justify-center text-[10px]">
                          {idx + 1}
                        </span>
                        <span className="truncate">{s.stop}</span>
                      </div>
                      <div className="text-[10px] text-[#64748B] flex justify-between pt-1 border-t border-[#E2E8F0]">
                        <span>Pickup: <strong className="text-[#16A34A]">{s.time}</strong></span>
                        <span>Drop: <strong className="text-[#F5A000]">{s.evening}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
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
