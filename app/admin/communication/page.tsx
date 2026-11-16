"use client";

import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { MessageSquare, Plus, Send, Bell, Users } from "lucide-react";

export default function CommunicationPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

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
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-[#14B8A6] uppercase tracking-wider flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" /> Institutional Broadcast
            </span>
            <span className="text-[#CBD5E1]">•</span>
            <span className="text-xs font-semibold text-[#64748B]">Notice Board</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#1E293B] tracking-tight">
            Communication & Circulars Broadcast
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            Publish circulars, send emergency alerts, and broadcast announcements across student, parent, and faculty portals.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          leftIcon={<Send className="w-4 h-4" />}
          onClick={() => setIsModalOpen(true)}
        >
          Dispatch Broadcast Notice
        </Button>
      </div>

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
              ) : notifications.length === 0 ? (
                <TableEmpty colSpan={4} message="No broadcast notices published yet." />
              ) : (
                notifications.map((n) => (
                  <TableRow key={n.id} className="hover:bg-[#F8FAFC]">
                    <TableCell className="text-xs font-bold text-[#153B66]">
                      <div className="flex items-center gap-1.5">
                        <Bell className="w-3.5 h-3.5 text-[#2563EB]" />
                        <span>{n.title}</span>
                      </div>
                      <span className="text-[11px] text-[#64748B] font-normal block mt-0.5 max-w-xl">
                        {n.message}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="navy">{n.category}</Badge>
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
    </div>
  );
}
