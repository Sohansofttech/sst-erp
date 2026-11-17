"use client";

import React, { useEffect, useState } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { Card } from "@/components/shared/Card";
import { Badge } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import { Modal } from "@/components/shared/Modal";
import { FormInput } from "@/components/shared/FormInput";
import { Table } from "@/components/shared/Table";
import {
  Building2,
  Bus,
  Calendar,
  Layers,
  CheckCircle2,
  MapPin,
  Clock,
  Phone,
  User,
  Plus,
} from "lucide-react";

export default function CampusServicesPage() {
  const [hostel, setHostel] = useState<any>(null);
  const [transport, setTransport] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [electives, setElectives] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Booking modal
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [resourceType, setResourceType] = useState("LAB_WORKSTATION");
  const [resourceName, setResourceName] = useState("");
  const [bookingDate, setBookingDate] = useState("");
  const [timeSlot, setTimeSlot] = useState("14:00 - 16:00");
  const [purpose, setPurpose] = useState("");
  const [submittingBooking, setSubmittingBooking] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [hRes, tRes, evRes, resRes, elRes] = await Promise.all([
        fetch("/api/student/hostel", { credentials: "include" }).then((r) => r.json()),
        fetch("/api/student/transport", { credentials: "include" }).then((r) => r.json()),
        fetch("/api/student/events", { credentials: "include" }).then((r) => r.json()),
        fetch("/api/student/resources", { credentials: "include" }).then((r) => r.json()),
        fetch("/api/student/electives", { credentials: "include" }).then((r) => r.json()),
      ]);

      if (hRes.success) setHostel(hRes.data);
      if (tRes.success) setTransport(tRes.data);
      if (evRes.success) setEvents(evRes.data);
      if (resRes.success) setResources(resRes.data);
      if (elRes.success) setElectives(elRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const handleChildChanged = () => {
      fetchData();
    };
    window.addEventListener("activeChildChanged", handleChildChanged);
    return () => {
      window.removeEventListener("activeChildChanged", handleChildChanged);
    };
  }, []);

  const handleBookSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingBooking(true);
    try {
      const res = await fetch("/api/student/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceType,
          resourceName,
          bookingDate,
          timeSlot,
          purpose,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setIsBookModalOpen(false);
        setResourceName("");
        setPurpose("");
        fetchData();
      } else {
        alert(json.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingBooking(false);
    }
  };

  const handleElectiveSelect = async (electiveCourseId: string) => {
    try {
      const res = await fetch("/api/student/electives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ electiveCourseId }),
      });
      const json = await res.json();
      if (json.success) {
        alert("Elective selection submitted for academic coordinator approval!");
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <PortalLayout portalType="STUDENT" pageTitle="Campus Living & Services">
        <div className="py-20 text-center text-sm text-[#788391]">Loading campus services...</div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout portalType="STUDENT" pageTitle="Campus Living, Transport & Resources">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Hostel Allocation (Section 18) */}
        <Card
          title={
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#F5A000]" />
              <span>Hostel & Residential Allocation</span>
            </div>
          }
          subtitle="Campus residential residency details"
        >
          {hostel ? (
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-[#EEF1F5]/50 rounded-lg border border-[#E5E9EF]">
                <span className="text-[#788391] block">Assigned Hostel Residence</span>
                <span className="text-sm font-bold text-[#123B5A]">{hostel.hostelName}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-[#EEF1F5]/50 rounded-lg border border-[#E5E9EF]">
                  <span className="text-[#788391] block">Room Number</span>
                  <span className="text-sm font-bold text-[#202936]">{hostel.roomNumber}</span>
                </div>
                <div className="p-3 bg-[#EEF1F5]/50 rounded-lg border border-[#E5E9EF]">
                  <span className="text-[#788391] block">Bed Assignment</span>
                  <span className="text-sm font-bold text-[#202936]">{hostel.bedNumber}</span>
                </div>
              </div>
              <div className="p-3 bg-white rounded-lg border border-[#E5E9EF] space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-[#202936]">
                  <User className="w-4 h-4 text-[#F5A000]" />
                  <span>Residential Warden: {hostel.wardenName}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[#788391]">
                  <Phone className="w-3.5 h-3.5" />
                  <span>Warden Contact: {hostel.wardenContact}</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-[#788391]">No hostel allocated. Registered as day-scholar.</p>
          )}
        </Card>

        {/* Transport Allocation (Section 19) */}
        <Card
          title={
            <div className="flex items-center gap-2">
              <Bus className="w-5 h-5 text-[#F5A000]" />
              <span>Campus Transport & Bus Service</span>
            </div>
          }
          subtitle="Route schedule, bus number, and designated pickup point"
        >
          {transport ? (
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-[#EEF1F5]/50 rounded-lg border border-[#E5E9EF]">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-[#D97706]">{transport.routeNumber}</span>
                  <Badge variant="brand" size="sm">{transport.vehicleNumber}</Badge>
                </div>
                <span className="text-sm font-bold text-[#123B5A] mt-1 block">
                  {transport.routeName}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-[#EEF1F5]/50 rounded-lg border border-[#E5E9EF]">
                  <span className="text-[#788391] block">Morning Pickup</span>
                  <span className="font-bold text-[#202936]">{transport.pickupTime}</span>
                  <span className="text-[11px] text-[#788391] block mt-0.5 truncate">
                    {transport.pickupPoint}
                  </span>
                </div>
                <div className="p-3 bg-[#EEF1F5]/50 rounded-lg border border-[#E5E9EF]">
                  <span className="text-[#788391] block">Evening Drop</span>
                  <span className="font-bold text-[#202936]">{transport.dropTime}</span>
                  <span className="text-[11px] text-[#788391] block mt-0.5 truncate">
                    Campus Bus Bay 4
                  </span>
                </div>
              </div>
              <div className="p-3 bg-white rounded-lg border border-[#E5E9EF] space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-[#202936]">
                  <User className="w-4 h-4 text-[#F5A000]" />
                  <span>Driver: {transport.driverName}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[#788391]">
                  <Phone className="w-3.5 h-3.5" />
                  <span>Driver Mobile: {transport.driverContact}</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-[#788391]">No transport pass associated.</p>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Electives Selection Workflow (Section 16) */}
        <Card
          title="Elective Courses & Requests"
          subtitle="Select professional electives for your degree program"
        >
          <div className="space-y-3">
            {electives.map((el) => (
              <div
                key={el.id}
                className="p-3.5 rounded-xl border border-[#E5E9EF] bg-[#EEF1F5]/50 flex justify-between items-center text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#D97706]">{el.subjectCode}</span>
                    <h4 className="font-semibold text-[#202936]">{el.subjectName}</h4>
                  </div>
                  <p className="text-[#788391] text-[11px] mt-1">{el.description}</p>
                  <p className="text-[#94A3B8] text-[10px] mt-0.5">
                    Credits: {el.credits} • Enrolled: {el.enrolledCount} / {el.capacity}
                  </p>
                </div>
                <div className="shrink-0 ml-3">
                  {el.selectionStatus === "APPROVED" ? (
                    <Badge variant="success" size="sm">Enrolled</Badge>
                  ) : el.selectionStatus === "PENDING" ? (
                    <Badge variant="warning" size="sm">Approval Pending</Badge>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleElectiveSelect(el.id)}
                    >
                      Select
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Institutional Events (Section 20) */}
        <Card title="Campus Events & Announcements">
          <div className="space-y-3">
            {events.map((ev) => (
              <div
                key={ev.id}
                className="p-3.5 rounded-xl border border-[#E5E9EF] bg-white flex items-start gap-3 text-xs"
              >
                <div className="p-2.5 rounded-lg bg-[#FEF3C7] text-[#D97706] shrink-0 text-center min-w-[50px]">
                  <Calendar className="w-4 h-4 mx-auto mb-0.5" />
                  <span className="text-[10px] font-bold block">
                    {new Date(ev.eventDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="brand" size="sm">{ev.category}</Badge>
                    <h4 className="font-bold text-[#202936]">{ev.title}</h4>
                  </div>
                  <p className="text-[#788391] text-xs mt-1 leading-relaxed">{ev.description}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-[#94A3B8]">
                    <span>Venue: {ev.venue}</span>
                    <span>•</span>
                    <span>Org: {ev.organizer}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Resource Booking (Section 21) */}
      <Card
        title="Institutional Resource Bookings"
        subtitle="Request access to computing clusters, specialized laboratories, or library study rooms"
        action={
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsBookModalOpen(true)}
            icon={<Plus className="w-4 h-4" />}
          >
            New Booking Request
          </Button>
        }
      >
        <Table
          columns={[
            {
              header: "Booking Date",
              cell: (item: any) => new Date(item.bookingDate).toLocaleDateString(),
            },
            {
              header: "Facility / Resource",
              accessorKey: "resourceName",
            },
            {
              header: "Category",
              accessorKey: "resourceType",
            },
            {
              header: "Time Slot",
              accessorKey: "timeSlot",
            },
            {
              header: "Purpose",
              accessorKey: "purpose",
            },
            {
              header: "Approval Status",
              cell: (item: any) => (
                <Badge
                  variant={
                    item.status === "APPROVED"
                      ? "success"
                      : item.status === "REJECTED"
                      ? "error"
                      : "warning"
                  }
                  size="sm"
                >
                  {item.status}
                </Badge>
              ),
            },
          ]}
          data={resources}
          emptyMessage="No institutional resource bookings recorded."
        />
      </Card>

      {/* Resource Booking Request Modal */}
      <Modal
        isOpen={isBookModalOpen}
        onClose={() => setIsBookModalOpen(false)}
        title="Reserve Institutional Resource"
        subtitle="Shared approval engine workflow"
      >
        <form onSubmit={handleBookSubmit} className="space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-[#202936] mb-1">
              Resource Category
            </label>
            <select
              value={resourceType}
              onChange={(e) => setResourceType(e.target.value)}
              className="w-full px-3.5 py-2 text-xs border border-[#E5E9EF] rounded-lg bg-white"
            >
              <option value="LAB_WORKSTATION">High-Performance Computing / Lab Workstation</option>
              <option value="LIBRARY_STUDY_ROOM">Library Discussion Room</option>
              <option value="AUDITORIUM">Auditorium / Seminar Hall</option>
            </select>
          </div>

          <FormInput
            label="Facility / Room Name"
            value={resourceName}
            onChange={(e) => setResourceName(e.target.value)}
            placeholder="e.g. AI GPU Cluster #04 or Reading Room 2B"
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <FormInput
              label="Reservation Date"
              type="date"
              value={bookingDate}
              onChange={(e) => setBookingDate(e.target.value)}
              required
            />
            <FormInput
              label="Time Slot"
              value={timeSlot}
              onChange={(e) => setTimeSlot(e.target.value)}
              placeholder="e.g. 14:00 - 16:00"
              required
            />
          </div>

          <div>
            <label className="block text-[13px] font-medium text-[#202936] mb-1">
              Purpose & Research Objectives
            </label>
            <textarea
              className="w-full px-3.5 py-2 text-xs border border-[#E5E9EF] rounded-lg"
              rows={3}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="State the academic purpose for this reservation..."
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsBookModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={submittingBooking}>
              Submit Request
            </Button>
          </div>
        </form>
      </Modal>
    </PortalLayout>
  );
}
