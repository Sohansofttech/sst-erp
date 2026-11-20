"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useInstitution } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/alert";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/table";
import {
  Plus,
  Search,
  UserCheck,
  UserX,
  Eye,
  Edit2,
  Phone,
  Mail,
  MapPin,
  HeartHandshake,
  History,
  ArrowUpDown,
  KeyRound,
} from "lucide-react";
import { StudentItem, StudentStatus } from "@/types/institution";
import { CredentialManagementModal } from "@/components/admin/CredentialManagementModal";
import { EmailDispatchModal } from "@/components/admin/EmailDispatchModal";
import { PortalAccountStatus } from "@/lib/utils/credential-helpers";

export default function StudentsPage() {
  const {
    students,
    addStudent,
    updateStudent,
    deactivateStudent,
    guardians,
    linkGuardianToStudent,
    unlinkGuardianFromStudent,
    departments,
    courses,
    classes,
    sections,
    academicYears,
    activeAcademicYear,
  } = useInstitution();

  // Search, Filters & Sorting
  const [searchQuery, setSearchQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [courseFilter, setCourseFilter] = useState("ALL");
  const [classFilter, setClassFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<"name" | "roll" | "date">("name");

  // Modal States
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentItem | null>(null);

  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentItem | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "academics" | "guardians" | "history" | "credentials">("overview");

  const [isCredentialModalOpen, setIsCredentialModalOpen] = useState(false);
  const [credentialStudent, setCredentialStudent] = useState<StudentItem | null>(null);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailStudent, setEmailStudent] = useState<StudentItem | null>(null);

  const [isLinkGuardianModalOpen, setIsLinkGuardianModalOpen] = useState(false);
  const [selectedGuardianToLink, setSelectedGuardianToLink] = useState("");

  // Form State
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("2006-05-10");
  const [gender, setGender] = useState<"Male" | "Female" | "Other">("Male");
  const [bloodGroup, setBloodGroup] = useState("O+");
  const [category, setCategory] = useState("General");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("+91 ");
  const [addressLine, setAddressLine] = useState("");
  const [city, setCity] = useState("Bengaluru");
  const [state, setState] = useState("Karnataka");
  const [postalCode, setPostalCode] = useState("560001");

  const [selectedAYId, setSelectedAYId] = useState(activeAcademicYear?.id || academicYears[0]?.id || "");
  const [selectedDeptId, setSelectedDeptId] = useState(departments[0]?.id || "");
  const [selectedCourseId, setSelectedCourseId] = useState(courses[0]?.id || "");
  const [selectedClassId, setSelectedClassId] = useState(classes[0]?.id || "");
  const [selectedSectionId, setSelectedSectionId] = useState(sections[0]?.id || "");
  const [batch, setBatch] = useState("2026-2030");
  const [rollNumber, setRollNumber] = useState("");
  const [admissionNumber, setAdmissionNumber] = useState("");
  const [admissionDate, setAdmissionDate] = useState(new Date().toISOString().split("T")[0]);
  const [status, setStatus] = useState<StudentStatus>("Active");

  const [formError, setFormError] = useState("");

  // Filtered & Sorted Student List
  const filteredStudents = useMemo(() => {
    const result = students.filter((s) => {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        searchQuery === "" ||
        s.fullName.toLowerCase().includes(query) ||
        s.studentId.toLowerCase().includes(query) ||
        s.admissionNumber.toLowerCase().includes(query) ||
        s.rollNumber.toLowerCase().includes(query) ||
        s.email.toLowerCase().includes(query) ||
        s.phone.includes(searchQuery);

      const matchesDept = deptFilter === "ALL" || s.departmentId === deptFilter;
      const matchesCourse = courseFilter === "ALL" || s.courseId === courseFilter;
      const matchesClass = classFilter === "ALL" || s.classId === classFilter;
      const matchesStatus = statusFilter === "ALL" || s.status === statusFilter;

      return matchesSearch && matchesDept && matchesCourse && matchesClass && matchesStatus;
    });

    result.sort((a, b) => {
      if (sortBy === "name") {
        return a.fullName.localeCompare(b.fullName);
      } else if (sortBy === "roll") {
        return a.rollNumber.localeCompare(b.rollNumber);
      } else if (sortBy === "date") {
        return new Date(b.admissionDate).getTime() - new Date(a.admissionDate).getTime();
      }
      return 0;
    });

    return result;
  }, [students, searchQuery, deptFilter, courseFilter, classFilter, statusFilter, sortBy]);

  // Statistics
  const stats = useMemo(() => {
    return {
      total: students.length,
      active: students.filter((s) => s.status === "Active").length,
      inactive: students.filter((s) => s.status === "Inactive" || s.status === "Suspended").length,
      newlyAdmitted: students.filter((s) => s.admissionDate?.startsWith("2026")).length,
    };
  }, [students]);

  // Open Add Student Modal
  const handleOpenAddModal = () => {
    setEditingStudent(null);
    setFirstName("");
    setLastName("");
    setDob("2006-05-10");
    setGender("Male");
    setBloodGroup("O+");
    setCategory("General");
    setEmail("");
    setPhone("+91 ");
    setAddressLine("");
    setCity("Bengaluru");
    setState("Karnataka");
    setPostalCode("560001");

    setSelectedAYId(activeAcademicYear?.id || academicYears[0]?.id || "");
    const firstDept = departments[0];
    setSelectedDeptId(firstDept?.id || "");
    const matchingCourses = courses.filter((c) => c.departmentId === firstDept?.id);
    const firstCourse = matchingCourses[0] || courses[0];
    setSelectedCourseId(firstCourse?.id || "");
    const matchingClasses = classes.filter((c) => c.courseId === firstCourse?.id);
    const firstClass = matchingClasses[0] || classes[0];
    setSelectedClassId(firstClass?.id || "");
    const matchingSections = sections.filter((s) => s.classId === firstClass?.id);
    setSelectedSectionId(matchingSections[0]?.id || "");

    setBatch("2026-2030");
    setRollNumber("");
    setAdmissionNumber("");
    setAdmissionDate(new Date().toISOString().split("T")[0]);
    setStatus("Active");
    setFormError("");
    setIsFormModalOpen(true);
  };

  // Open Edit Student Modal
  const handleOpenEditModal = (stu: StudentItem) => {
    setEditingStudent(stu);
    setFirstName(stu.firstName);
    setLastName(stu.lastName);
    setDob(stu.dob);
    setGender(stu.gender);
    setBloodGroup(stu.bloodGroup || "O+");
    setCategory(stu.category || "General");
    setEmail(stu.email);
    setPhone(stu.phone);
    setAddressLine(stu.addressLine);
    setCity(stu.city);
    setState(stu.state);
    setPostalCode(stu.postalCode);

    setSelectedAYId(stu.academicYearId);
    setSelectedDeptId(stu.departmentId);
    setSelectedCourseId(stu.courseId);
    setSelectedClassId(stu.classId);
    setSelectedSectionId(stu.sectionId || "");
    setBatch(stu.batch);
    setRollNumber(stu.rollNumber);
    setAdmissionNumber(stu.admissionNumber);
    setAdmissionDate(stu.admissionDate);
    setStatus(stu.status);
    setFormError("");
    setIsFormModalOpen(true);
  };

  // Open Profile View Modal
  const handleOpenProfile = (stu: StudentItem) => {
    setSelectedStudent(stu);
    setActiveTab("overview");
    setIsProfileModalOpen(true);
  };

  // Submit Student Form
  const [isSubmitting, setIsSubmitting] = useState(false);
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!firstName.trim() || !lastName.trim()) {
      setFormError("Student first name and last name are required.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setFormError("A valid email address is required.");
      return;
    }
    if (!phone.trim() || phone.trim() === "+91") {
      setFormError("Student contact phone number is required.");
      return;
    }

    setIsSubmitting(true);

    try {
      const deptObj = departments.find((d) => d.id === selectedDeptId);
      const courseObj = courses.find((c) => c.id === selectedCourseId);
      const classObj = classes.find((c) => c.id === selectedClassId);
      const secObj = sections.find((s) => s.id === selectedSectionId);
      const ayObj = academicYears.find((ay) => ay.id === selectedAYId);

      if (editingStudent) {
        try {
          await fetch("/api/admin/students", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: editingStudent.id,
              fullName: `${firstName.trim()} ${lastName.trim()}`,
              email: email.trim(),
              phone: phone.trim(),
              gender,
              status,
            }),
          });
        } catch (apiErr) {
          console.warn("PUT /api/admin/students fallback:", apiErr);
        }

        updateStudent(editingStudent.id, {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          dob,
          gender,
          bloodGroup,
          category,
          email: email.trim(),
          phone: phone.trim(),
          addressLine: addressLine.trim(),
          city: city.trim(),
          state: state.trim(),
          postalCode: postalCode.trim(),
          academicYearId: selectedAYId,
          academicYearName: ayObj?.name || "2026-2027",
          departmentId: selectedDeptId,
          departmentName: deptObj?.name || "Department",
          courseId: selectedCourseId,
          courseName: courseObj?.name || "Course",
          classId: selectedClassId,
          className: classObj?.name || "Class",
          sectionId: selectedSectionId,
          sectionName: secObj?.name || "Section A",
          batch,
          rollNumber: rollNumber.trim() || editingStudent.rollNumber,
          admissionNumber: admissionNumber.trim() || editingStudent.admissionNumber,
          admissionDate,
          status,
        });
      } else {
        const nextIdx = students.length + 1;
        const deptPrefix = deptObj?.name ? deptObj.name.substring(0, 3).toUpperCase() : "GEN";
        const genRoll = rollNumber.trim() || `26${deptPrefix}${String(nextIdx).padStart(3, "0")}`;
        const genAdm = admissionNumber.trim() || `ADM-2026-${String(nextIdx + 100).padStart(4, "0")}`;

        let createdServerStudent: any = null;
        try {
          const res = await fetch("/api/admin/students", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fullName: `${firstName.trim()} ${lastName.trim()}`,
              email: email.trim(),
              rollNumber: genRoll,
              admissionNumber: genAdm,
              phone: phone.trim(),
              gender,
              dateOfBirth: dob,
              courseId: selectedCourseId || undefined,
              academicYearId: selectedAYId || undefined,
              classId: selectedClassId || undefined,
              sectionId: selectedSectionId || undefined,
              departmentId: selectedDeptId || undefined,
              bloodGroup,
              category,
              addressLine: addressLine.trim() || undefined,
              city: city.trim() || undefined,
              state: state.trim() || undefined,
              postalCode: postalCode.trim() || undefined,
              admissionDate: admissionDate || undefined,
              batch: batch || undefined,
              status: status || undefined,
            }),
          });
          const json = await res.json();
          if (res.ok && json.success) {
            createdServerStudent = json.data;
          } else {
            throw new Error(json.error || "Failed to create student on server.");
          }
        } catch (apiErr: any) {
          throw new Error(apiErr.message || "Failed to save student.");
        }

        const realStudentId = createdServerStudent?.id || `STU-2026-${String(nextIdx).padStart(3, "0")}`;
        const realUserId = createdServerStudent?.user?.id || createdServerStudent?.userId;

        addStudent({
          studentId: realStudentId,
          admissionNumber: genAdm,
          rollNumber: genRoll,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          fullName: `${firstName.trim()} ${lastName.trim()}`,
          dob,
          gender,
          bloodGroup,
          category,
          email: email.trim(),
          institutionalEmail: `${firstName.toLowerCase()}.${genRoll.toLowerCase()}@sst.edu.in`,
          phone: phone.trim(),
          addressLine: addressLine.trim(),
          city: city.trim(),
          state: state.trim(),
          postalCode: postalCode.trim(),
          academicYearId: selectedAYId,
          academicYearName: ayObj?.name || "2026-2027",
          departmentId: selectedDeptId,
          departmentName: deptObj?.name || "Department",
          courseId: selectedCourseId,
          courseName: courseObj?.name || "Course",
          classId: selectedClassId,
          className: classObj?.name || "Class",
          sectionId: selectedSectionId,
          sectionName: secObj?.name || "Section A",
          batch,
          admissionDate,
          status,
          guardianIds: [],
          portalUserId: realUserId,
          portalStatus: "PENDING_SETUP",
          portalAccess: false,
          portalEmail: email.trim(),
        });

        // Sync with API so any server-derived status is up to date
        loadStudentsFromApi();
      }

      setIsFormModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || "Failed to save student.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Link Guardian Action
  const handleExecuteLinkGuardian = () => {
    if (!selectedStudent || !selectedGuardianToLink) return;

    linkGuardianToStudent(selectedStudent.id, selectedGuardianToLink);
    // Refresh local selectedStudent
    setSelectedStudent((prev) =>
      prev
        ? {
            ...prev,
            guardianIds: [...prev.guardianIds, selectedGuardianToLink],
          }
        : null
    );
    setIsLinkGuardianModalOpen(false);
    setSelectedGuardianToLink("");
  };

  // Helper Status Badge
  const getStudentStatusBadge = (st: StudentStatus) => {
    switch (st) {
      case "Active":
        return <Badge variant="success">Active</Badge>;
      case "Inactive":
        return <Badge variant="neutral">Inactive</Badge>;
      case "Suspended":
        return <Badge variant="error">Suspended</Badge>;
      case "Alumni":
        return <Badge variant="navy">Alumni</Badge>;
      case "Archived":
        return <Badge variant="neutral">Archived</Badge>;
      default:
        return <Badge variant="neutral">{st}</Badge>;
    }
  };

  const getStudentPortalBadge = (stu: StudentItem) => {
    const status = stu.portalStatus || (stu.portalAccess ? "ACTIVE" : "NOT_CREATED");
    switch (status) {
      case "ACTIVE":
        return <Badge variant="success" size="sm">Active Portal</Badge>;
      case "DISABLED":
        return <Badge variant="error" size="sm">Disabled</Badge>;
      case "NOT_CREATED":
      default:
        return <Badge variant="neutral" size="sm">No Account</Badge>;
    }
  };

  const handleOpenCredentialModal = (stu: StudentItem) => {
    setCredentialStudent(stu);
    setIsCredentialModalOpen(true);
  };

  const updateStudentRef = useRef(updateStudent);
  useEffect(() => {
    updateStudentRef.current = updateStudent;
  });

  const refreshBatchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/credentials?type=batch&entityType=STUDENT");
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && json.data) {
        Object.entries(json.data as Record<string, any>).forEach(([id, statusInfo]) => {
          updateStudentRef.current(id, {
            portalStatus: statusInfo.portalStatus,
            portalAccess: statusInfo.isActive,
            portalUserId: statusInfo.userId,
            portalEmail: statusInfo.email || undefined,
            lastLoginAt: statusInfo.lastLoginAt,
          });
        });
      }
    } catch (err) {
      console.warn("Failed to fetch batch student credential status:", err);
    }
  }, []);

  useEffect(() => {
    refreshBatchStatus();
  }, [refreshBatchStatus]);

  const loadStudentsFromApi = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/students?take=200");
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        json.data.forEach((s: any) => {
          const hasUser = !!s.user;
          const hasPassword = !!s.user?.passwordHash && s.user.passwordHash !== "UNPROVISIONED";
          const isActive = !!s.user?.isActive && s.user?.status === "ACTIVE";
          const portalStatus = !hasUser
            ? "NOT_CREATED"
            : !hasPassword
            ? "PENDING_SETUP"
            : isActive
            ? "ACTIVE"
            : "DISABLED";

          updateStudentRef.current(s.id, {
            rollNumber: s.rollNumber,
            admissionNumber: s.admissionNumber || s.rollNumber,
            fullName: s.fullName,
            email: s.email,
            phone: s.phone || "",
            portalUserId: s.userId || s.user?.id,
            portalStatus: portalStatus as any,
            portalAccess: isActive,
            portalEmail: s.user?.email || s.email,
            lastLoginAt: s.user?.lastLoginAt,
          });
        });
      }
    } catch (err) {
      console.warn("Could not sync students from server:", err);
    }
  }, []);

  useEffect(() => {
    loadStudentsFromApi();
  }, [loadStudentsFromApi]);

  const handleCredentialStatusUpdated = (entityId: string, updatedStatus: PortalAccountStatus, userId?: string) => {
    updateStudent(entityId, {
      portalStatus: updatedStatus as any,
      portalAccess: updatedStatus === "ACTIVE",
      portalUserId: userId,
    });
    if (selectedStudent && selectedStudent.id === entityId) {
      setSelectedStudent((prev) =>
        prev
          ? {
              ...prev,
              portalStatus: updatedStatus as any,
              portalAccess: updatedStatus === "ACTIVE",
              portalUserId: userId,
            }
          : null
      );
    }
    if (credentialStudent && credentialStudent.id === entityId) {
      setCredentialStudent((prev) =>
        prev
          ? {
              ...prev,
              portalStatus: updatedStatus as any,
              portalAccess: updatedStatus === "ACTIVE",
              portalUserId: userId,
            }
          : null
      );
    }
    refreshBatchStatus();
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E2E8F0]">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#1E293B]">
            Students
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            Maintain student profiles, class cohort allocations, and academic histories.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={handleOpenAddModal}
          leftIcon={<Plus className="w-4 h-4" />}
        >
          Add Student
        </Button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card className="border-l-4 border-l-[#F5A000]">
          <CardContent className="p-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
              Total Enrolled Students
            </span>
            <h3 className="text-2xl font-black text-[#1E293B] mt-1">{stats.total}</h3>
            <p className="text-[11px] text-[#64748B] mt-0.5">Across All Programs & Semesters</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#16A34A]">
          <CardContent className="p-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[#16A34A]">
              Active Students
            </span>
            <h3 className="text-2xl font-black text-[#16A34A] mt-1">{stats.active}</h3>
            <p className="text-[11px] text-[#16A34A] font-medium mt-0.5">Regularly Attending</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#64748B]">
          <CardContent className="p-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
              Inactive / On Leave
            </span>
            <h3 className="text-2xl font-black text-[#64748B] mt-1">{stats.inactive}</h3>
            <p className="text-[11px] text-[#64748B] mt-0.5">Preserved Academic Records</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#14B8A6]">
          <CardContent className="p-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[#0D9488]">
              New Admissions (2026)
            </span>
            <h3 className="text-2xl font-black text-[#0D9488] mt-1">{stats.newlyAdmitted}</h3>
            <p className="text-[11px] text-[#0D9488] font-medium mt-0.5">Admitted This Academic Cycle</p>
          </CardContent>
        </Card>
      </div>

      {/* Search, Filter & Sort Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-3 text-[#64748B]" />
              <input
                type="text"
                placeholder="Search by student name, Student ID, Admission No, Roll No, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-[#E2E8F0] focus:border-[#F5A000] focus:outline-none"
              />
            </div>

            {/* Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-[#E2E8F0] bg-white text-[#1E293B] focus:border-[#F5A000] focus:outline-none max-w-[150px] truncate"
              >
                <option value="ALL">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code}
                  </option>
                ))}
              </select>

              <select
                value={courseFilter}
                onChange={(e) => setCourseFilter(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-[#E2E8F0] bg-white text-[#1E293B] focus:border-[#F5A000] focus:outline-none max-w-[150px] truncate"
              >
                <option value="ALL">All Courses</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code}
                  </option>
                ))}
              </select>

              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-[#E2E8F0] bg-white text-[#1E293B] focus:border-[#F5A000] focus:outline-none max-w-[150px] truncate"
              >
                <option value="ALL">All Classes</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-[#E2E8F0] bg-white text-[#1E293B] focus:border-[#F5A000] focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Suspended">Suspended</option>
                <option value="Alumni">Alumni</option>
              </select>

              <div className="flex items-center gap-1 border-l border-[#E2E8F0] pl-2">
                <ArrowUpDown className="w-3.5 h-3.5 text-[#64748B]" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "name" | "roll" | "date")}
                  className="px-2.5 py-2 text-xs rounded-lg border border-[#E2E8F0] bg-white text-[#1E293B] focus:border-[#F5A000] focus:outline-none"
                >
                  <option value="name">Sort: Name (A-Z)</option>
                  <option value="roll">Sort: Roll No</option>
                  <option value="date">Sort: Admission Date</option>
                </select>
              </div>

              {(searchQuery || deptFilter !== "ALL" || courseFilter !== "ALL" || classFilter !== "ALL" || statusFilter !== "ALL") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("");
                    setDeptFilter("ALL");
                    setCourseFilter("ALL");
                    setClassFilter("ALL");
                    setStatusFilter("ALL");
                  }}
                  className="text-xs text-[#DC2626]"
                >
                  Reset
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Student Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student ID / Roll No</TableHead>
                <TableHead>Student Name</TableHead>
                <TableHead>Cohort Placement</TableHead>
                <TableHead>Admission No</TableHead>
                <TableHead>Linked Guardians</TableHead>
                <TableHead>Portal Access</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStudents.length === 0 ? (
                <TableEmpty
                  colSpan={8}
                  message="No students found matching your search and filter criteria."
                />
              ) : (
                filteredStudents.map((stu) => {
                  const linkedGuardianList = guardians.filter((g) =>
                    stu.guardianIds.includes(g.id)
                  );

                  return (
                    <TableRow key={stu.id}>
                      {/* ID / Roll */}
                      <TableCell>
                        <span className="font-mono text-xs font-bold text-[#123B5A] bg-[#EFF6FF] px-2 py-0.5 rounded border border-[#BFDBFE] whitespace-nowrap inline-block">
                          {stu.studentId}
                        </span>
                        <span className="block text-[11px] font-semibold text-[#64748B] mt-0.5 whitespace-nowrap">
                          Roll: {stu.rollNumber}
                        </span>
                      </TableCell>

                      {/* Name & Contact */}
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-[#123B5A] text-white flex items-center justify-center font-bold text-xs shrink-0">
                            {stu.firstName[0]}
                            {stu.lastName[0]}
                          </div>
                          <div>
                            <span className="font-semibold text-[#1E293B] block">
                              {stu.fullName}
                            </span>
                            <span className="text-[11px] text-[#64748B] block truncate max-w-[180px]">
                              {stu.email}
                            </span>
                          </div>
                        </div>
                      </TableCell>

                      {/* Cohort Placement */}
                      <TableCell>
                        <span className="font-semibold text-[#1E293B] text-xs block truncate max-w-[200px]">
                          {stu.className} {stu.sectionName ? `(${stu.sectionName})` : ""}
                        </span>
                        <span className="text-[11px] text-[#64748B] block truncate max-w-[200px]">
                          {stu.courseName} • {stu.batch}
                        </span>
                      </TableCell>

                      {/* Admission */}
                      <TableCell>
                        <span className="font-mono text-xs text-[#1E293B] block whitespace-nowrap">
                          {stu.admissionNumber}
                        </span>
                        <span className="text-[10px] text-[#94A3B8] block whitespace-nowrap">
                          Adm: {stu.admissionDate}
                        </span>
                      </TableCell>

                      {/* Guardians */}
                      <TableCell>
                        {linkedGuardianList.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            {linkedGuardianList.map((g) => (
                              <span
                                key={g.id}
                                className="text-[11px] text-[#1E293B] font-medium flex items-center gap-1"
                              >
                                <HeartHandshake className="w-3 h-3 text-[#14B8A6]" />
                                <span>{g.fullName} ({g.relationship})</span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[11px] text-[#94A3B8] italic">No guardian linked</span>
                        )}
                      </TableCell>

                      {/* Portal Access */}
                      <TableCell>{getStudentPortalBadge(stu)}</TableCell>

                      {/* Status */}
                      <TableCell>{getStudentStatusBadge(stu.status)}</TableCell>

                      {/* Actions */}
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                          <button
                            onClick={() => handleOpenCredentialModal(stu)}
                            className="p-1.5 rounded text-[#64748B] hover:text-[#123B5A] hover:bg-[#EFF6FF] transition-colors cursor-pointer"
                            title="Manage Portal Credentials & Access"
                          >
                            <KeyRound className="w-4 h-4 text-[#F5A000]" />
                          </button>

                          <button
                            onClick={() => {
                              setEmailStudent(stu);
                              setIsEmailModalOpen(true);
                            }}
                            className="p-1.5 rounded text-[#64748B] hover:text-[#123B5A] hover:bg-[#EFF6FF] transition-colors cursor-pointer"
                            title="Send Direct Email / Onboarding Invitation"
                          >
                            <Mail className="w-4 h-4 text-[#123B5A]" />
                          </button>

                          <button
                            onClick={() => handleOpenProfile(stu)}
                            className="p-1.5 rounded text-[#64748B] hover:text-[#F5A000] hover:bg-[#EFF6FF] transition-colors cursor-pointer"
                            title="View Full Profile"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleOpenEditModal(stu)}
                            className="p-1.5 rounded text-[#64748B] hover:text-[#1E293B] hover:bg-[#F1F5F9] transition-colors cursor-pointer"
                            title="Edit Student"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => {
                              const actionLabel = stu.status === "Active" ? "Deactivate" : "Activate";
                              if (confirm(`${actionLabel} student ${stu.fullName} (${stu.studentId})? Academic records will be safely preserved.`)) {
                                deactivateStudent(stu.id);
                              }
                            }}
                            className={`p-1.5 rounded transition-colors cursor-pointer ${
                              stu.status === "Active"
                                ? "text-[#DC2626] hover:bg-[#FEE2E2]"
                                : "text-[#16A34A] hover:bg-[#DCFCE7]"
                            }`}
                            title={stu.status === "Active" ? "Deactivate Student (Preserve Records)" : "Activate Student"}
                          >
                            {stu.status === "Active" ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ================================================================= */}
      {/* 1. STUDENT FULL PROFILE VIEW MODAL                                */}
      {/* ================================================================= */}
      <Modal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        title={selectedStudent ? `${selectedStudent.fullName} (${selectedStudent.studentId})` : "Student Profile"}
        description="Comprehensive 360-degree academic and personal record."
        maxWidth="2xl"
        footer={
          selectedStudent ? (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsProfileModalOpen(false);
                    handleOpenEditModal(selectedStudent);
                  }}
                  leftIcon={<Edit2 className="w-3.5 h-3.5" />}
                >
                  Edit Profile
                </Button>
                <Button
                  variant={selectedStudent.status === "Active" ? "outline" : "primary"}
                  size="sm"
                  onClick={() => {
                    deactivateStudent(selectedStudent.id);
                    setSelectedStudent((prev) =>
                      prev
                        ? {
                            ...prev,
                            status: prev.status === "Active" ? "Inactive" : "Active",
                          }
                        : null
                    );
                  }}
                  className={selectedStudent.status === "Active" ? "text-[#DC2626] border-[#DC2626]/30 hover:bg-[#FEE2E2]" : ""}
                >
                  {selectedStudent.status === "Active" ? "Deactivate Student" : "Activate Student"}
                </Button>
              </div>
              <Button variant="outline" size="sm" onClick={() => setIsProfileModalOpen(false)}>
                Close
              </Button>
            </div>
          ) : undefined
        }
      >
        {selectedStudent && (
          <div className="space-y-5">
            {/* Top Identity Banner */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-[#123B5A] to-[#1E4D82] text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-[#F5A000] text-white font-black text-lg flex items-center justify-center shadow-xs">
                  {selectedStudent.firstName[0]}
                  {selectedStudent.lastName[0]}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{selectedStudent.fullName}</h3>
                  <p className="text-xs text-[#93C5FD]">
                    Roll: <strong className="text-white">{selectedStudent.rollNumber}</strong> • Adm: {selectedStudent.admissionNumber}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getStudentStatusBadge(selectedStudent.status)}
              </div>
            </div>

            {/* Profile Navigation Tabs */}
            <div className="flex border-b border-[#E2E8F0] gap-4 text-xs font-bold">
              <button
                onClick={() => setActiveTab("overview")}
                className={`pb-2.5 transition-colors cursor-pointer border-b-2 ${
                  activeTab === "overview"
                    ? "border-[#F5A000] text-[#F5A000]"
                    : "border-transparent text-[#64748B] hover:text-[#1E293B]"
                }`}
              >
                Personal & Contact
              </button>
              <button
                onClick={() => setActiveTab("academics")}
                className={`pb-2.5 transition-colors cursor-pointer border-b-2 ${
                  activeTab === "academics"
                    ? "border-[#F5A000] text-[#F5A000]"
                    : "border-transparent text-[#64748B] hover:text-[#1E293B]"
                }`}
              >
                Academic Placement
              </button>
              <button
                onClick={() => setActiveTab("guardians")}
                className={`pb-2.5 transition-colors cursor-pointer border-b-2 ${
                  activeTab === "guardians"
                    ? "border-[#F5A000] text-[#F5A000]"
                    : "border-transparent text-[#64748B] hover:text-[#1E293B]"
                }`}
              >
                Linked Guardians ({selectedStudent.guardianIds.length})
              </button>
              <button
                onClick={() => setActiveTab("history")}
                className={`pb-2.5 transition-colors cursor-pointer border-b-2 ${
                  activeTab === "history"
                    ? "border-[#F5A000] text-[#F5A000]"
                    : "border-transparent text-[#64748B] hover:text-[#1E293B]"
                }`}
              >
                Enrollment History
              </button>
              <button
                onClick={() => setActiveTab("credentials")}
                className={`pb-2.5 transition-colors cursor-pointer border-b-2 ${
                  activeTab === "credentials"
                    ? "border-[#F5A000] text-[#F5A000]"
                    : "border-transparent text-[#64748B] hover:text-[#1E293B]"
                }`}
              >
                Portal Credentials
              </button>
            </div>

            {/* Tab 1: Personal & Contact */}
            {activeTab === "overview" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-xl border border-[#E2E8F0] space-y-2">
                  <h5 className="font-bold text-[#123B5A] uppercase tracking-wider pb-1.5 border-b border-[#F1F5F9]">
                    Personal Information
                  </h5>
                  <p><span className="text-[#64748B] font-medium">Full Name:</span> {selectedStudent.fullName}</p>
                  <p><span className="text-[#64748B] font-medium">Date of Birth:</span> {selectedStudent.dob}</p>
                  <p><span className="text-[#64748B] font-medium">Gender:</span> {selectedStudent.gender}</p>
                  <p><span className="text-[#64748B] font-medium">Blood Group:</span> {selectedStudent.bloodGroup || "Not specified"}</p>
                  <p><span className="text-[#64748B] font-medium">Category / Quota:</span> {selectedStudent.category || "General"}</p>
                </div>

                <div className="p-4 rounded-xl border border-[#E2E8F0] space-y-2">
                  <h5 className="font-bold text-[#123B5A] uppercase tracking-wider pb-1.5 border-b border-[#F1F5F9]">
                    Contact & Address
                  </h5>
                  <p className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-[#64748B]" /> <span className="text-[#64748B]">Personal:</span> {selectedStudent.email}</p>
                  <p className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-[#F5A000]" /> <span className="text-[#64748B]">Institutional:</span> {selectedStudent.institutionalEmail}</p>
                  <p className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-[#64748B]" /> <span className="text-[#64748B]">Phone:</span> {selectedStudent.phone}</p>
                  <p className="flex items-start gap-1.5"><MapPin className="w-3.5 h-3.5 text-[#64748B] shrink-0 mt-0.5" /> <span className="text-[#64748B]">Address:</span> {selectedStudent.addressLine}, {selectedStudent.city}, {selectedStudent.state} - {selectedStudent.postalCode}</p>
                </div>
              </div>
            )}

            {/* Tab 2: Academic Placement */}
            {activeTab === "academics" && (
              <div className="p-4 rounded-xl border border-[#E2E8F0] space-y-3 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="text-[11px] text-[#64748B] block">Academic Year</span>
                    <strong className="text-[#1E293B]">{selectedStudent.academicYearName}</strong>
                  </div>
                  <div>
                    <span className="text-[11px] text-[#64748B] block">Department</span>
                    <strong className="text-[#1E293B]">{selectedStudent.departmentName}</strong>
                  </div>
                  <div>
                    <span className="text-[11px] text-[#64748B] block">Course / Program</span>
                    <strong className="text-[#123B5A]">{selectedStudent.courseName}</strong>
                  </div>
                  <div>
                    <span className="text-[11px] text-[#64748B] block">Class & Cohort</span>
                    <strong className="text-[#1E293B]">{selectedStudent.className}</strong>
                  </div>
                  <div>
                    <span className="text-[11px] text-[#64748B] block">Section Batch</span>
                    <strong className="text-[#1E293B]">{selectedStudent.sectionName || "Section A"}</strong>
                  </div>
                  <div>
                    <span className="text-[11px] text-[#64748B] block">Batch Window</span>
                    <strong className="text-[#1E293B]">{selectedStudent.batch}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Linked Guardians */}
            {activeTab === "guardians" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#64748B]">
                    Primary contacts authorized for communication & emergencies.
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsLinkGuardianModalOpen(true)}
                    leftIcon={<Plus className="w-3.5 h-3.5" />}
                  >
                    Link Another Guardian
                  </Button>
                </div>

                {selectedStudent.guardianIds.length === 0 ? (
                  <div className="p-6 text-center rounded-xl border border-dashed border-[#CBD5E1] text-xs text-[#64748B]">
                    No guardians currently linked to this student.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {guardians
                      .filter((g) => selectedStudent.guardianIds.includes(g.id))
                      .map((g) => (
                        <div
                          key={g.id}
                          className="p-3.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] space-y-2 text-xs relative"
                        >
                          <div className="flex items-center justify-between">
                            <h5 className="font-bold text-[#1E293B] flex items-center gap-1.5">
                              <HeartHandshake className="w-4 h-4 text-[#14B8A6]" />
                              <span>{g.fullName}</span>
                            </h5>
                            <button
                              onClick={() => {
                                if (confirm(`Unlink guardian ${g.fullName} from ${selectedStudent.fullName}?`)) {
                                  unlinkGuardianFromStudent(selectedStudent.id, g.id);
                                  setSelectedStudent((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          guardianIds: prev.guardianIds.filter((id) => id !== g.id),
                                        }
                                      : null
                                  );
                                }
                              }}
                              className="text-[11px] text-[#DC2626] hover:underline cursor-pointer"
                            >
                              Unlink
                            </button>
                          </div>
                          <p className="text-[#64748B]">
                            Relation: <strong>{g.relationship}</strong> • {g.occupation}
                          </p>
                          <p className="flex items-center gap-1 text-[#1E293B]">
                            <Phone className="w-3 h-3 text-[#64748B]" /> {g.phone}
                          </p>
                          <p className="flex items-center gap-1 text-[#1E293B]">
                            <Mail className="w-3 h-3 text-[#64748B]" /> {g.email || "No email"}
                          </p>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 4: Enrollment History */}
            {activeTab === "history" && (
              <div className="space-y-3">
                <div className="p-4 rounded-xl border border-[#E2E8F0] space-y-2.5">
                  <h5 className="text-xs font-bold text-[#123B5A] uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-[#F1F5F9]">
                    <History className="w-4 h-4 text-[#F5A000]" />
                    <span>Academic Progression Log</span>
                  </h5>
                  <div className="space-y-2 text-xs">
                    {selectedStudent.enrollmentHistory?.map((h) => (
                      <div key={h.id} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-[#F8FAFC]">
                        <div className="w-2 h-2 rounded-full bg-[#F5A000] mt-1.5 shrink-0" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[#1E293B]">
                              {h.className} {h.sectionName ? `(${h.sectionName})` : ""}
                            </span>
                            <span className="text-[10px] text-[#94A3B8]">{h.enrolledAt}</span>
                          </div>
                          <p className="text-[11px] text-[#64748B]">
                            Academic Year: {h.academicYearName} • Status: {h.status}
                          </p>
                          {h.remarks && (
                            <p className="text-[11px] text-[#123B5A] italic mt-0.5">
                              Note: {h.remarks}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 5: Portal Credentials */}
            {activeTab === "credentials" && (
              <div className="p-4 rounded-xl border border-[#E2E8F0] space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#F1F5F9]">
                  <h5 className="text-xs font-bold text-[#123B5A] uppercase tracking-wider flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4 text-[#F5A000]" />
                    <span>Student Portal Access & Security</span>
                  </h5>
                  {getStudentPortalBadge(selectedStudent)}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[#64748B] font-medium block">Portal Username / Email:</span>
                    <span className="font-semibold text-[#1E293B]">{selectedStudent.email || "No email registered"}</span>
                  </div>
                  <div>
                    <span className="text-[#64748B] font-medium block">Portal Destination:</span>
                    <span className="font-semibold text-[#1E293B]">/dashboard (Student Dashboard via /login)</span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[#64748B]">Account Status:</span>
                    <span className="font-bold text-[#1E293B]">
                      {selectedStudent.portalStatus === "ACTIVE"
                        ? "Active & Authorized"
                        : selectedStudent.portalStatus === "DISABLED"
                        ? "Portal Access Suspended"
                        : "Account Not Yet Created"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-[#E2E8F0] pt-2">
                    <span className="text-[#64748B]">Password Policy:</span>
                    <span className="text-[#123B5A] font-medium">Mandatory change on first login</span>
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleOpenCredentialModal(selectedStudent)}
                    leftIcon={<KeyRound className="w-3.5 h-3.5" />}
                  >
                    Manage Portal Credentials
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEmailStudent(selectedStudent);
                      setIsEmailModalOpen(true);
                    }}
                    leftIcon={<Mail className="w-3.5 h-3.5 text-[#123B5A]" />}
                  >
                    Send Email / Setup Link
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ================================================================= */}
      {/* 2. LINK GUARDIAN MODAL                                            */}
      {/* ================================================================= */}
      <Modal
        isOpen={isLinkGuardianModalOpen}
        onClose={() => setIsLinkGuardianModalOpen(false)}
        title="Link Registered Guardian"
        description="Select an existing guardian from the institutional registry to link to this student."
        maxWidth="md"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsLinkGuardianModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleExecuteLinkGuardian}
              disabled={!selectedGuardianToLink}
            >
              Link Guardian
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#1E293B] uppercase tracking-wider mb-1.5">
              Select Guardian *
            </label>
            <select
              value={selectedGuardianToLink}
              onChange={(e) => setSelectedGuardianToLink(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-[#E2E8F0] bg-white text-[#1E293B] focus:border-[#F5A000] focus:outline-none"
            >
              <option value="">-- Choose Guardian --</option>
              {guardians
                .filter((g) => selectedStudent && !selectedStudent.guardianIds.includes(g.id))
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.fullName} ({g.relationship}) • {g.phone}
                  </option>
                ))}
            </select>
          </div>
          <p className="text-xs text-[#64748B]">
            Linking associates the guardian record bidirectionally, allowing both parties to view synchronized contact channels.
          </p>
        </div>
      </Modal>

      {/* ================================================================= */}
      {/* 3. ADD / EDIT STUDENT MODAL                                       */}
      {/* ================================================================= */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        title={editingStudent ? `Edit Student: ${editingStudent.fullName}` : "Add New Student"}
        description="Configure student demographic records, academic placement, and cohort section."
        maxWidth="2xl"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsFormModalOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSubmitForm} disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : (editingStudent ? "Save Changes" : "Create Student Record")}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmitForm} className="space-y-5">
          {formError && (
            <Alert variant="error" title="Validation Incomplete">
              {formError}
            </Alert>
          )}

          {/* Section 1: Demographics */}
          <div>
            <h4 className="text-xs font-bold text-[#123B5A] uppercase tracking-wider mb-2.5 pb-1 border-b border-[#F1F5F9]">
              1. Personal & Contact Details
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="First Name *"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="e.g. Aarav"
              />
              <Input
                label="Last Name *"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="e.g. Sharma"
              />
              <Input
                label="Date of Birth *"
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
              />
              <div>
                <label className="block text-xs font-bold text-[#1E293B] uppercase tracking-wider mb-1.5">
                  Gender *
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as "Male" | "Female" | "Other")}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[#E2E8F0] bg-white text-[#1E293B] focus:border-[#F5A000] focus:outline-none"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#1E293B] uppercase tracking-wider mb-1.5">
                  Blood Group
                </label>
                <select
                  value={bloodGroup}
                  onChange={(e) => setBloodGroup(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[#E2E8F0] bg-white text-[#1E293B] focus:border-[#F5A000] focus:outline-none"
                >
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                </select>
              </div>
              <Input
                label="Category / Quota"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="General / Management / OBC"
              />
              <Input
                label="Email Address *"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@example.com"
              />
              <Input
                label="Phone Number *"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98450 11223"
              />
              <div className="sm:col-span-2">
                <Input
                  label="Address Line"
                  value={addressLine}
                  onChange={(e) => setAddressLine(e.target.value)}
                  placeholder="Street and building"
                />
              </div>
              <Input
                label="City"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
              <Input
                label="Postal Code"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
              />
            </div>
          </div>

          {/* Section 2: Academic Placement */}
          <div>
            <h4 className="text-xs font-bold text-[#123B5A] uppercase tracking-wider mb-2.5 pb-1 border-b border-[#F1F5F9]">
              2. Academic Placement & Cohort
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#1E293B] uppercase tracking-wider mb-1.5">
                  Academic Year *
                </label>
                <select
                  value={selectedAYId}
                  onChange={(e) => setSelectedAYId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[#E2E8F0] bg-white text-[#1E293B] focus:border-[#F5A000] focus:outline-none"
                >
                  {academicYears.map((ay) => (
                    <option key={ay.id} value={ay.id}>
                      AY {ay.name} {ay.isActive ? "(Active)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1E293B] uppercase tracking-wider mb-1.5">
                  Department *
                </label>
                <select
                  value={selectedDeptId}
                  onChange={(e) => setSelectedDeptId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[#E2E8F0] bg-white text-[#1E293B] focus:border-[#F5A000] focus:outline-none"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} - {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1E293B] uppercase tracking-wider mb-1.5">
                  Degree Course *
                </label>
                <select
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[#E2E8F0] bg-white text-[#1E293B] focus:border-[#F5A000] focus:outline-none"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1E293B] uppercase tracking-wider mb-1.5">
                  Class & Cohort *
                </label>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[#E2E8F0] bg-white text-[#1E293B] focus:border-[#F5A000] focus:outline-none"
                >
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name} ({cls.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1E293B] uppercase tracking-wider mb-1.5">
                  Section *
                </label>
                <select
                  value={selectedSectionId}
                  onChange={(e) => setSelectedSectionId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[#E2E8F0] bg-white text-[#1E293B] focus:border-[#F5A000] focus:outline-none"
                >
                  {sections
                    .filter((s) => !selectedClassId || s.classId === selectedClassId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.batchName})
                      </option>
                    ))}
                </select>
              </div>

              <Input
                label="Batch Window *"
                value={batch}
                onChange={(e) => setBatch(e.target.value)}
                placeholder="2026-2030"
              />

              <Input
                label="Roll Number"
                value={rollNumber}
                onChange={(e) => setRollNumber(e.target.value)}
                placeholder="Auto-generated if left blank"
              />

              <Input
                label="Admission Number"
                value={admissionNumber}
                onChange={(e) => setAdmissionNumber(e.target.value)}
                placeholder="Auto-generated if left blank"
              />

              <Input
                label="Admission Date *"
                type="date"
                value={admissionDate}
                onChange={(e) => setAdmissionDate(e.target.value)}
              />

              <div>
                <label className="block text-xs font-bold text-[#1E293B] uppercase tracking-wider mb-1.5">
                  Student Status *
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as StudentStatus)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[#E2E8F0] bg-white text-[#1E293B] focus:border-[#F5A000] focus:outline-none"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Suspended">Suspended</option>
                  <option value="Alumni">Alumni</option>
                </select>
              </div>
            </div>
          </div>
        </form>
      </Modal>

      {/* ================================================================= */}
      {/* 4. STUDENT PORTAL CREDENTIAL MANAGEMENT MODAL                    */}
      {/* ================================================================= */}
      <CredentialManagementModal
        isOpen={isCredentialModalOpen}
        onClose={() => setIsCredentialModalOpen(false)}
        entityType="STUDENT"
        entity={credentialStudent ? {
          id: credentialStudent.id,
          fullName: credentialStudent.fullName,
          email: credentialStudent.email,
          rollNumber: credentialStudent.rollNumber,
          admissionNumber: credentialStudent.admissionNumber,
          departmentName: credentialStudent.departmentName,
          userId: credentialStudent.portalUserId,
          portalStatus: credentialStudent.portalStatus,
          portalAccess: credentialStudent.portalAccess,
          lastLoginAt: credentialStudent.lastLoginAt,
        } : null}
        onStatusUpdated={handleCredentialStatusUpdated}
      />

      {/* 5. EMAIL DISPATCH MODAL */}
      <EmailDispatchModal
        isOpen={isEmailModalOpen}
        onClose={() => {
          setIsEmailModalOpen(false);
          setEmailStudent(null);
        }}
        initialRole="STUDENT"
        allowedRoles={["STUDENT"]}
        lockRole={true}
        preselectedRecipients={
          emailStudent
            ? [
                {
                  id: emailStudent.portalUserId || emailStudent.id,
                  name: emailStudent.fullName,
                  email: emailStudent.email,
                  role: "STUDENT",
                },
              ]
            : []
        }
      />
    </div>
  );
}
