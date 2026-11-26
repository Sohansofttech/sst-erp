"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty } from "@/components/ui/table";
import { UserPlus, Shield, RefreshCw, KeyRound, CheckCircle2, XCircle, History } from "lucide-react";

interface DepartmentStaffPanelProps {
  departmentRole: "ADMISSIONS_OFFICER" | "ACCOUNTANT" | "HOSTEL_WARDEN" | "TRANSPORT_OFFICER";
  departmentLabel: string;
}

export function DepartmentStaffPanel({ departmentRole, departmentLabel }: DepartmentStaffPanelProps) {
  const [staffList, setStaffList] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<any | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [designation, setDesignation] = useState(departmentLabel);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [staffRes, rolesRes, auditRes] = await Promise.all([
        fetch("/api/admin/staff"),
        fetch("/api/admin/roles"),
        fetch("/api/admin/audit-logs?take=40"),
      ]);

      if (staffRes.status === 403) {
        setAuthorized(false);
        return;
      }

      const [staffJson, rolesJson, auditJson] = await Promise.all([
        staffRes.json().catch(() => ({})),
        rolesRes.json().catch(() => ({})),
        auditRes.json().catch(() => ({})),
      ]);

      if (staffJson.success && Array.isArray(staffJson.data)) {
        const filtered = staffJson.data.filter(
          (u: any) =>
            u.role === departmentRole ||
            (Array.isArray(u.assignedRoles) && u.assignedRoles.some((r: any) => r.code === departmentRole))
        );
        setStaffList(filtered);
      } else if (staffJson.error) {
        setError(staffJson.error);
      }

      if (rolesJson.success && Array.isArray(rolesJson.data)) {
        setRoles(rolesJson.data);
        const matchingRole = rolesJson.data.find((r: any) => r.code === departmentRole);
        if (matchingRole && !selectedRoleId) {
          setSelectedRoleId(matchingRole.id);
        }
      }

      if (auditJson.success && Array.isArray(auditJson.data)) {
        setAuditLogs(
          auditJson.data.filter(
            (l: any) =>
              (l.action || "").includes("STAFF") ||
              (l.action || "").includes("ROLE") ||
              (l.newValuesJson || "").includes(departmentRole)
          )
        );
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load department staff.");
    } finally {
      setLoading(false);
    }
  }, [departmentRole, selectedRoleId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!authorized) {
    return null;
  }

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || (!editingMember && !email.trim())) return;

    try {
      setSubmitting(true);
      setError(null);
      const roleIds = selectedRoleId ? [selectedRoleId] : [];
      const res = await fetch("/api/admin/staff", {
        method: editingMember ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingMember
            ? {
                id: editingMember.id,
                fullName: fullName.trim(),
                phone: phone.trim(),
                designation: designation.trim(),
                role: departmentRole,
                roleIds,
              }
            : {
                fullName: fullName.trim(),
                email: email.trim().toLowerCase(),
                phone: phone.trim(),
                designation: designation.trim(),
                role: departmentRole,
                roleIds,
              }
        ),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || "Failed to save departmental employee.");
        return;
      }
      setMessage(
        editingMember
          ? `Updated ${fullName.trim()} (${departmentLabel}).`
          : `Provisioned ${fullName.trim()} and sent secure setup invitation.`
      );
      setIsAddOpen(false);
      setEditingMember(null);
      setFullName("");
      setEmail("");
      setPhone("");
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Network error saving employee.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (member: any) => {
    try {
      const res = await fetch("/api/admin/staff", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: member.id,
          isActive: !member.isActive,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage(`${member.fullName} is now ${!member.isActive ? "Active" : "Inactive"}.`);
        loadData();
      } else {
        setError(json.error || "Failed to update employee status.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to update status.");
    }
  };

  const handleRevokeAccess = async (member: any) => {
    try {
      const res = await fetch("/api/admin/staff", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: member.id,
          role: "STAFF",
          roleIds: [],
          isActive: false,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage(`Revoked ${departmentLabel} access for ${member.fullName}.`);
        loadData();
      } else {
        setError(json.error || "Failed to revoke access.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to revoke access.");
    }
  };

  const getAccountStatusBadge = (member: any) => {
    if (!member.isActive || member.status === "INACTIVE") {
      return <Badge variant="error">Inactive</Badge>;
    }
    if (member.mustChangePassword) {
      return <Badge variant="warning">Password Setup Pending</Badge>;
    }
    if (!member.assignedRoles || member.assignedRoles.length === 0) {
      return <Badge variant="warning">Invitation / Role Pending</Badge>;
    }
    return <Badge variant="success">Active</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[#1E293B]">{departmentLabel} Team &amp; Access Control</h3>
          <p className="text-xs text-[#64748B]">
            Provision employees, assign {departmentRole} permissions, manage account status, and review audit history.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/roles-permissions">
            <Button size="sm" variant="outline" leftIcon={<Shield className="w-3.5 h-3.5" />}>
              Role Permissions
            </Button>
          </Link>
          <Button
            size="sm"
            variant="primary"
            leftIcon={<UserPlus className="w-3.5 h-3.5" />}
            onClick={() => {
              setEditingMember(null);
              setFullName("");
              setEmail("");
              setPhone("");
              setDesignation(departmentLabel);
              setIsAddOpen(true);
            }}
          >
            Add {departmentLabel}
          </Button>
        </div>
      </div>

      {message && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} className="font-bold">Dismiss</button>
        </div>
      )}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">{error}</div>
      )}

      <Card className="border-[#E2E8F0]">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#F8FAFC]">
                <TableHead className="text-xs font-bold">Employee</TableHead>
                <TableHead className="text-xs font-bold">Role &amp; Permissions</TableHead>
                <TableHead className="text-xs font-bold">Account / Invitation Status</TableHead>
                <TableHead className="text-xs font-bold text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-6 text-xs text-[#64748B]">
                    Loading {departmentLabel} staff...
                  </TableCell>
                </TableRow>
              ) : staffList.length === 0 ? (
                <TableEmpty colSpan={4} message={`No ${departmentLabel} employees assigned yet.`} />
              ) : (
                staffList.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="text-xs font-bold text-[#1E293B]">{member.fullName}</div>
                      <div className="text-[11px] text-[#64748B]">{member.email}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="navy">{member.role}</Badge>
                      {Array.isArray(member.assignedRoles) && member.assignedRoles.length > 0 && (
                        <div className="text-[10px] text-[#64748B] mt-1">
                          {member.assignedRoles.map((r: any) => r.name).join(", ")}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{getAccountStatusBadge(member)}</TableCell>
                    <TableCell className="text-right space-x-1.5 whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingMember(member);
                          setFullName(member.fullName || "");
                          setEmail(member.email || "");
                          setPhone(member.phone || "");
                          setDesignation(member.staff?.designation || departmentLabel);
                          setIsAddOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleToggleActive(member)}
                        leftIcon={member.isActive ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      >
                        {member.isActive ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-[#DC2626]"
                        onClick={() => handleRevokeAccess(member)}
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-[#E2E8F0]">
        <CardHeader className="p-3.5 border-b border-[#E2E8F0] flex flex-row items-center justify-between">
          <CardTitle className="text-xs font-bold text-[#1E293B] flex items-center gap-2">
            <History className="w-3.5 h-3.5 text-[#123B5A]" />
            Department Employee &amp; Role Audit History
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={loadData} leftIcon={<RefreshCw className="w-3 h-3" />}>
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Time</TableHead>
                <TableHead className="text-xs">Action</TableHead>
                <TableHead className="text-xs">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditLogs.length === 0 ? (
                <TableEmpty colSpan={3} message="No recent staff or role audit events." />
              ) : (
                auditLogs.slice(0, 10).map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-[11px] text-[#64748B]">
                      {new Date(log.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="navy">{log.action}</Badge>
                    </TableCell>
                    <TableCell className="text-[11px] text-[#475569] max-w-md truncate">
                      {log.newValuesJson || "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title={editingMember ? `Edit ${departmentLabel}` : `Provision ${departmentLabel}`}
      >
        <form onSubmit={handleSaveEmployee} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-[#1E293B] mb-1">Full Name *</label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          {!editingMember && (
            <div>
              <label className="block text-xs font-semibold text-[#1E293B] mb-1">Work Email *</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-[#1E293B] mb-1">Phone</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#1E293B] mb-1">Assigned Institutional Role</label>
            <select
              value={selectedRoleId}
              onChange={(e) => setSelectedRoleId(e.target.value)}
              className="w-full text-xs p-2 border border-[#CBD5E1] rounded-lg bg-white"
            >
              <option value="">Default ({departmentRole})</option>
              {roles
                .filter((r) => !["SUPER_ADMIN", "ADMIN", "INSTITUTION_ADMIN"].includes((r.code || "").toUpperCase()))
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.code})
                  </option>
                ))}
            </select>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[#64748B] bg-[#F8FAFC] p-2.5 rounded-lg border border-[#E2E8F0]">
            <KeyRound className="w-3.5 h-3.5 text-[#F5A000] shrink-0" />
            <span>
              {editingMember
                ? "Updates profile and role assignments atomically."
                : "Creates account and sends a secure password-setup invitation link without exposing credentials."}
            </span>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Saving..." : editingMember ? "Save Changes" : "Create & Send Invite"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
