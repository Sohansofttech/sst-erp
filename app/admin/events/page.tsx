"use client";

import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { CalendarDays, Plus, MapPin, Clock, Tag, Building, CheckCircle2, XCircle, Users, CheckSquare, Sparkles } from "lucide-react";

export default function EventsResourcesPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"events" | "bookings" | "facilities">("events");
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form
  const [title, setTitle] = useState("National Robotics & AI Symposium 2026");
  const [category, setCategory] = useState("ACADEMIC");
  const [eventDate, setEventDate] = useState("2026-11-25");
  const [venue, setVenue] = useState("Main Auditorium & Tech Lab");
  const [organizer, setOrganizer] = useState("Dept of Computer Science & Engineering");
  const [description, setDescription] = useState("Annual technical symposium with industry keynotes and paper presentations.");

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/events");
      const json = await res.json();
      if (json.success && json.data) {
        setEvents(json.data.events || []);
        setBookings(json.data.bookings || []);
      }
    } catch (err) {
      console.warn("Failed to load events:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !eventDate || !venue) return;

    try {
      const res = await fetch("/api/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          category,
          eventDate,
          venue,
          organizer,
          description,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsModalOpen(false);
        fetchData();
      } else {
        alert(data.error || "Event scheduling failed.");
      }
    } catch (err: any) {
      alert(err.message || "Network error");
    }
  };

  const handleUpdateBookingStatus = async (bookingId: string, status: "APPROVED" | "REJECTED") => {
    try {
      const res = await fetch("/api/admin/events", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, status }),
      });
      const data = await res.json();
      if (data.success) {
        fetchData();
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
            Events & Resources
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            Publish academic seminars, sports tournaments, and review campus resource reservations.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => setIsModalOpen(true)}
        >
          Create Event
        </Button>
      </div>

      {/* Events KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-[#E2E8F0]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase">Scheduled Events</p>
              <h3 className="text-2xl font-bold text-[#1E293B] mt-1">{events.length} Events</h3>
              <p className="text-[11px] text-[#64748B] mt-0.5">Symposia & Festivals</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#F5A000]/10 flex items-center justify-center text-[#F5A000]">
              <CalendarDays className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E2E8F0]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase">Resource Bookings</p>
              <h3 className="text-2xl font-bold text-[#123B5A] mt-1">{bookings.length} Requests</h3>
              <p className="text-[11px] text-[#64748B] mt-0.5">Auditorium / Labs</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#123B5A]/10 flex items-center justify-center text-[#123B5A]">
              <Building className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E2E8F0]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase">Pending Decisions</p>
              <h3 className="text-2xl font-bold text-[#F5A000] mt-1">
                {bookings.filter((b) => b.status === "PENDING").length} Pending
              </h3>
              <p className="text-[11px] text-[#F5A000] mt-0.5 font-medium">Awaiting Adjudication</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#FEF3C7] flex items-center justify-center text-[#F5A000]">
              <Clock className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E2E8F0]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase">Venues & Facilities</p>
              <h3 className="text-2xl font-bold text-[#16A34A] mt-1">4 Facilities</h3>
              <p className="text-[11px] text-[#16A34A] mt-0.5 font-medium">Fully Equipped & Online</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#16A34A]/10 flex items-center justify-center text-[#16A34A]">
              <Sparkles className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-[#E2E8F0]">
        <button
          onClick={() => setActiveTab("events")}
          className={`pb-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === "events"
              ? "border-[#F5A000] text-[#F5A000]"
              : "border-transparent text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          <CalendarDays className="w-4 h-4" />
          Scheduled Campus Events ({events.length})
        </button>
        <button
          onClick={() => setActiveTab("bookings")}
          className={`pb-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === "bookings"
              ? "border-[#F5A000] text-[#F5A000]"
              : "border-transparent text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          <Building className="w-4 h-4" />
          Resource & Venue Reservations ({bookings.length})
        </button>
        <button
          onClick={() => setActiveTab("facilities")}
          className={`pb-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === "facilities"
              ? "border-[#F5A000] text-[#F5A000]"
              : "border-transparent text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          Campus Facilities & Venues Roster (4)
        </button>
      </div>

      {activeTab === "events" && (
        <Card className="border-[#E2E8F0]">
          <CardHeader className="p-4 border-b border-[#E2E8F0]">
            <CardTitle className="text-sm font-bold text-[#1E293B]">
              Scheduled Campus Events
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#F8FAFC]">
                  <TableHead className="text-xs font-bold text-[#1E293B]">Event Title</TableHead>
                  <TableHead className="text-xs font-bold text-[#1E293B]">Category</TableHead>
                  <TableHead className="text-xs font-bold text-[#1E293B]">Date</TableHead>
                  <TableHead className="text-xs font-bold text-[#1E293B]">Venue</TableHead>
                  <TableHead className="text-xs font-bold text-[#1E293B]">Organizer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-sm text-[#64748B]">
                      Loading events...
                    </TableCell>
                  </TableRow>
                ) : events.length === 0 ? (
                  <TableEmpty colSpan={5} message="No campus events scheduled." />
                ) : (
                  events.map((e) => (
                    <TableRow key={e.id} className="hover:bg-[#F8FAFC]">
                      <TableCell className="text-xs font-bold text-[#123B5A]">
                        <span>{e.title}</span>
                        {e.description && (
                          <span className="text-[11px] text-[#64748B] font-normal block max-w-md truncate">
                            {e.description}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="navy">{e.category}</Badge>
                      </TableCell>
                      <TableCell className="text-xs font-medium text-[#1E293B]">
                        {new Date(e.eventDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-xs text-[#64748B]">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-[#F5A000]" />
                          <span>{e.venue}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-[#64748B]">{e.organizer}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {activeTab === "bookings" && (
        <Card className="border-[#E2E8F0]">
          <CardHeader className="p-4 border-b border-[#E2E8F0]">
            <CardTitle className="text-sm font-bold text-[#1E293B]">
              Resource & Venue Reservations
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#F8FAFC]">
                  <TableHead className="text-xs font-bold text-[#1E293B]">Student</TableHead>
                  <TableHead className="text-xs font-bold text-[#1E293B]">Resource</TableHead>
                  <TableHead className="text-xs font-bold text-[#1E293B]">Date & Slot</TableHead>
                  <TableHead className="text-xs font-bold text-[#1E293B]">Purpose</TableHead>
                  <TableHead className="text-xs font-bold text-[#1E293B]">Status</TableHead>
                  <TableHead className="text-xs font-bold text-[#1E293B] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-sm text-[#64748B]">
                      Loading resource requests...
                    </TableCell>
                  </TableRow>
                ) : bookings.length === 0 ? (
                  <TableEmpty colSpan={6} message="No resource bookings requested yet." />
                ) : (
                  bookings.map((b) => (
                    <TableRow key={b.id} className="hover:bg-[#F8FAFC]">
                      <TableCell className="text-xs font-semibold text-[#1E293B]">
                        {b.student?.fullName || "Student"}
                        <span className="text-[11px] text-[#64748B] block">{b.student?.rollNumber}</span>
                      </TableCell>
                      <TableCell className="text-xs font-bold text-[#123B5A]">
                        <span>{b.resourceName}</span>
                        <span className="text-[10px] text-[#64748B] block uppercase">{b.resourceType}</span>
                      </TableCell>
                      <TableCell className="text-xs text-[#64748B]">
                        <span>{new Date(b.bookingDate).toLocaleDateString()}</span>
                        <span className="text-[11px] text-[#F5A000] block font-medium">{b.timeSlot}</span>
                      </TableCell>
                      <TableCell className="text-xs text-[#64748B]">{b.purpose}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            b.status === "APPROVED"
                              ? "success"
                              : b.status === "REJECTED"
                              ? "destructive"
                              : "warning"
                          }
                        >
                          {b.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {b.status === "PENDING" && (
                          <div className="flex justify-end gap-1.5">
                            <Button
                              variant="primary"
                              size="sm"
                              className="text-xs"
                              onClick={() => handleUpdateBookingStatus(b.id, "APPROVED")}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs text-[#DC2626]"
                              onClick={() => handleUpdateBookingStatus(b.id, "REJECTED")}
                            >
                              Reject
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {activeTab === "facilities" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              name: "Sir M. Visvesvaraya Seminar Hall",
              location: "Academic Block 1 (Ground Floor)",
              capacity: "150 Seats",
              features: [
                "Ultra-HD Laser Projector",
                "Wireless Lapel Microphones",
                "Central Air Conditioning",
                "Podium Touch Panel",
              ],
              manager: "Mr. Suresh K (AV Technical Lead)",
              status: "AVAILABLE",
            },
            {
              name: "Main Campus Auditorium",
              location: "Cultural Complex (North Quad)",
              capacity: "850 Seats",
              features: [
                "4K Cinema Projection",
                "Line-Array Sound Stage",
                "Theatrical Lighting Rig",
                "Dual Green Rooms",
              ],
              manager: "Prof. N. Meera (Guild Coordinator)",
              status: "RESERVED",
            },
            {
              name: "Advanced Computing Lab 3",
              location: "Technology Block (3rd Floor)",
              capacity: "70 High-Performance Workstations",
              features: [
                "NVIDIA RTX GPUs",
                "Gigabit Managed Network",
                "Smart Board Interactive",
                "Automated Attendance",
              ],
              manager: "Dr. Anand Rao (CSE Dept)",
              status: "AVAILABLE",
            },
            {
              name: "AV Studio & Media Suite",
              location: "Media Library Wing (2nd Floor)",
              capacity: "25 Crew Capacity",
              features: [
                "4K Broadcast Cameras",
                "Acoustic Treated Sound Booth",
                "Multi-Track Audio Console",
                "Teleprompter",
              ],
              manager: "Mr. Arvind Swamy (Media Studio)",
              status: "AVAILABLE",
            },
          ].map((fac, i) => (
            <Card key={i} className="border-[#E2E8F0]">
              <CardHeader className="p-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-xs text-[#123B5A]">{fac.name}</span>
                    <p className="text-[11px] text-[#64748B] mt-0.5">{fac.location}</p>
                  </div>
                  <Badge variant={fac.status === "AVAILABLE" ? "success" : "warning"}>
                    {fac.status === "AVAILABLE" ? "READY FOR BOOKING" : "RESERVED"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-3 text-xs">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[#64748B]">Capacity:</span>
                  <span className="font-bold text-[#1E293B]">{fac.capacity}</span>
                </div>
                <div>
                  <span className="text-[#64748B] text-[10px] uppercase font-semibold">
                    Amenities & Tech Specs
                  </span>
                  <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                    {fac.features.map((f, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 text-[11px] text-[#334155]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                        <span className="truncate">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="pt-2 border-t border-[#E2E8F0] flex justify-between items-center text-[11px]">
                  <span className="text-[#64748B]">Facility Custodian:</span>
                  <span className="font-medium text-[#1E293B]">{fac.manager}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Event Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Create Campus Event">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-[#1E293B] block mb-1">Event Title *</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#1E293B] block mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full text-xs p-2 border border-[#CBD5E1] rounded-lg bg-white"
              >
                <option value="ACADEMIC">Academic / Workshop</option>
                <option value="CULTURAL">Cultural Fest</option>
                <option value="SPORTS">Sports Tournament</option>
                <option value="SEMINAR">Guest Lecture / Seminar</option>
                <option value="EXAMINATION">Exam Notification</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[#1E293B] block mb-1">Event Date *</label>
              <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#1E293B] block mb-1">Venue *</label>
              <Input value={venue} onChange={(e) => setVenue(e.target.value)} required />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#1E293B] block mb-1">Organizer</label>
              <Input value={organizer} onChange={(e) => setOrganizer(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[#1E293B] block mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full text-xs p-2 border border-[#CBD5E1] rounded-lg focus:outline-hidden"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Publish Event
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
