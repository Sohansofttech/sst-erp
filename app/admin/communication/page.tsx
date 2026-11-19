"use client";

import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { MessageSquare, Plus, Send, Bell, Users, Search, Filter, CheckCircle2, ShieldAlert, Mail } from "lucide-react";
import { EmailDispatchModal } from "@/components/admin/EmailDispatchModal";

export default function CommunicationPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  // Form
  const [title, setTitle] = useState("Semester End Examination Guidelines 2026");
  const [message, setMessage] = useState("All students and faculty are required to review the updated hall ticket guidelines.");
  const [category, setCategory] = useState("ACADEMIC");
  const [targetRole, setTargetRole] = useState("ALL");

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/communication");
      const json = await res.json();
      if (json.success && json.data) {
        setNotifications(json.data);
      }
    } catch (err) {
      console.warn("Failed to load notifications:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !message) return;

    try {
      const res = await fetch("/api/admin/communication", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          message,
          category,
          targetRole,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsModalOpen(false);
        fetchNotifications();
      } else {
        alert(data.error || "Broadcast failed.");
      }
    } catch (err: any) {
      alert(err.message || "Network error");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#E2E8F0]">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#1E293B] tracking-tight">
            Communication
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            Publish circulars, send emergency alerts, and broadcast announcements across portals.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Mail className="w-4 h-4 text-[#123B5A]" />}
            onClick={() => setIsEmailModalOpen(true)}
          >
            Direct Email & Invites
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Send className="w-4 h-4" />}
            onClick={() => setIsModalOpen(true)}
          >
            Dispatch Broadcast Notice
          </Button>
        </div>
      </div>

      {/* Communication KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-[#E2E8F0]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase">Active Circulars</p>
              <h3 className="text-2xl font-bold text-[#1E293B] mt-1">{notifications.length} Published</h3>
              <p className="text-[11px] text-[#64748B] mt-0.5">Campus Announcements</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#F5A000]/10 flex items-center justify-center text-[#F5A000]">
              <Bell className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E2E8F0]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase">Multi-Channel</p>
              <h3 className="text-2xl font-bold text-[#123B5A] mt-1">3 Channels</h3>
              <p className="text-[11px] text-[#16A34A] mt-0.5 font-medium">In-App • SMS • Email</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#123B5A]/10 flex items-center justify-center text-[#123B5A]">
              <MessageSquare className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E2E8F0]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase">Targeted Audiences</p>
              <h3 className="text-2xl font-bold text-[#F5A000] mt-1">4 Cohorts</h3>
              <p className="text-[11px] text-[#64748B] mt-0.5">Students, Faculty, Parents, Staff</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#FEF3C7] flex items-center justify-center text-[#F5A000]">
              <Users className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E2E8F0]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase">Delivery Reliability</p>
              <h3 className="text-2xl font-bold text-[#16A34A] mt-1">99.8%</h3>
              <p className="text-[11px] text-[#16A34A] mt-0.5 font-medium">Dispatched & Acknowledged</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#16A34A]/10 flex items-center justify-center text-[#16A34A]">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Search */}
      <Card className="border-[#E2E8F0]">
        <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
            <input
              type="text"
              placeholder="Search circular title or message..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-[#CBD5E1] rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#F5A000]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
            {["ALL", "ACADEMIC", "FINANCE", "PLACEMENT", "ADMINISTRATIVE", "EMERGENCY"].map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                  categoryFilter === cat
                    ? "bg-[#F5A000] text-white"
                    : "bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-[#E2E8F0]">
        <CardHeader className="p-4 border-b border-[#E2E8F0]">
          <CardTitle className="text-sm font-bold text-[#1E293B]">
            Dispatched Broadcast History ({notifications.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#F8FAFC]">
                <TableHead className="text-xs font-bold text-[#1E293B]">Circular Title</TableHead>
                <TableHead className="text-xs font-bold text-[#1E293B]">Category</TableHead>
                <TableHead className="text-xs font-bold text-[#1E293B]">Dispatched At</TableHead>
                <TableHead className="text-xs font-bold text-[#1E293B]">Recipients</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-sm text-[#64748B]">
                    Loading circulars...
                  </TableCell>
                </TableRow>
              ) : notifications.filter(
                  (n) =>
                    (categoryFilter === "ALL" || n.category === categoryFilter) &&
                    (search === "" ||
                      n.title?.toLowerCase().includes(search.toLowerCase()) ||
                      n.message?.toLowerCase().includes(search.toLowerCase()))
                ).length === 0 ? (
                <TableEmpty colSpan={4} message="No broadcast notices matching your search or filter." />
              ) : (
                notifications
                  .filter(
                    (n) =>
                      (categoryFilter === "ALL" || n.category === categoryFilter) &&
                      (search === "" ||
                        n.title?.toLowerCase().includes(search.toLowerCase()) ||
                        n.message?.toLowerCase().includes(search.toLowerCase()))
                  )
                  .map((n) => (
                    <TableRow key={n.id} className="hover:bg-[#F8FAFC]">
                      <TableCell className="text-xs font-bold text-[#123B5A]">
                        <div className="flex items-center gap-1.5">
                          <Bell className="w-3.5 h-3.5 text-[#F5A000]" />
                          <span>{n.title}</span>
                        </div>
                        <span className="text-[11px] text-[#64748B] font-normal block mt-0.5 max-w-xl">
                          {n.message}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={n.category === "EMERGENCY" ? "destructive" : "navy"}>{n.category}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-[#64748B]">
                        {new Date(n.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-[#1E293B]">
                        <div className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-[#14B8A6]" />
                          <span>{n.recipients?.length || "Target Cohort"} users</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Broadcast Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Dispatch Circular Notice">
        <form onSubmit={handleBroadcast} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-[#1E293B] block mb-1">Circular Title *</label>
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
                <option value="ACADEMIC">Academic Announcement</option>
                <option value="ADMINISTRATIVE">Administrative Circular</option>
                <option value="EXAMINATION">Examination Notice</option>
                <option value="FEE_REMINDER">Fee & Finance Reminder</option>
                <option value="EMERGENCY">Urgent / Emergency Alert</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[#1E293B] block mb-1">Target Audience</label>
              <select
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                className="w-full text-xs p-2 border border-[#CBD5E1] rounded-lg bg-white"
              >
                <option value="ALL">Entire Campus (Students, Parents, Faculty)</option>
                <option value="STUDENT">Students Only</option>
                <option value="PARENT">Parents Only</option>
                <option value="TEACHER">Faculty Members Only</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[#1E293B] block mb-1">Notice Body / Message *</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              required
              className="w-full text-xs p-2 border border-[#CBD5E1] rounded-lg focus:outline-hidden"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Broadcast Immediately
            </Button>
          </div>
        </form>
      </Modal>

      {/* Email Dispatcher Modal */}
      <EmailDispatchModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        initialRole="ALL"
        allowedRoles={["ALL", "STUDENT", "TEACHER", "PARENT"]}
        onSuccess={fetchNotifications}
      />
    </div>
  );
}
