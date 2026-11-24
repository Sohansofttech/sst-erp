"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/alert";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty } from "@/components/ui/table";
import {
  BookMarked,
  Plus,
  Edit2,
  Trash2,
  UserCheck,
  Filter,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { SubjectItem, SubjectType, Course, DegreeType } from "@/types/institution";

const DEFAULT_DEPARTMENTS = [
  { id: "dept-cse", name: "Computer Science & Engineering", code: "CSE" },
  { id: "dept-ece", name: "Electronics & Communication Engineering", code: "ECE" },
  { id: "dept-mech", name: "Mechanical Engineering", code: "MECH" },
  { id: "dept-civil", name: "Civil Engineering", code: "CIVIL" },
  { id: "dept-mgmt", name: "Management Studies", code: "MBA" },
];

function toUiSubjectType(val?: string): SubjectType {
  switch (val) {
    case "PRACTICAL_LAB":
      return "Practical / Lab";
    case "DEPARTMENT_ELECTIVE":
      return "Department Elective";
    case "OPEN_ELECTIVE":
      return "Open Elective";
    case "PROJECT_SEMINAR":
      return "Project / Seminar";
    default:
      return "Core Theory";
  }
}

function toDbSubjectType(val?: string): string {
  switch (val) {
    case "Practical / Lab":
      return "PRACTICAL_LAB";
    case "Department Elective":
      return "DEPARTMENT_ELECTIVE";
    case "Open Elective":
      return "OPEN_ELECTIVE";
    case "Project / Seminar":
      return "PROJECT_SEMINAR";
    default:
      return "CORE_THEORY";
  }
}

function toUiDegreeType(val?: string): DegreeType {
  switch (val?.toUpperCase()) {
    case "POSTGRADUATE":
      return "Postgraduate";
    case "DIPLOMA":
      return "Diploma";
    case "DOCTORAL":
      return "Doctoral";
    case "CERTIFICATE":
      return "Certificate";
    default:
      return "Undergraduate";
  }
}

function mapApiToCourse(c: any): Course {
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    degreeType: toUiDegreeType(c.degreeType),
    departmentId: c.departmentId || "",
    departmentName: c.departmentName || c.department || "General",
    durationYears: c.durationYears ?? 4,
    totalSemesters: c.totalSemesters ?? 8,
    totalCredits: c.totalCredits ?? 160,
    status: c.status === "INACTIVE" ? "Inactive" : "Active",
    description: c.description || "",
  };
}

function mapApiToSubject(s: any): SubjectItem {
  let teacher = s.allocatedTeacherName || "";
  if (!teacher && s.description?.startsWith("Teacher:")) {
    teacher = s.description.substring(8).split("|")[0].trim();
  }

  return {
    id: s.id,
    code: s.code || "",
    name: s.name,
    credits: s.credits ?? 3,
    hoursPerWeek: s.hoursPerWeek ?? 3,
    type: toUiSubjectType(s.type),
    courseId: s.courseId || "",
    courseName: s.courseName || s.course?.name || "General",
    classId: s.classId || "",
    className: s.className || undefined,
    departmentId: s.departmentId || "",
    departmentName: s.departmentName || "General",
    semester: s.semester ?? 1,
    allocatedTeacherName: teacher || undefined,
    status: s.status === "INACTIVE" ? "Inactive" : "Active",
  };
}

export default function SubjectsPage() {
  const [classes, setClasses] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>(DEFAULT_DEPARTMENTS);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<SubjectItem | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [credits, setCredits] = useState(4);
  const [hoursPerWeek, setHoursPerWeek] = useState(4);
  const [type, setType] = useState<SubjectType>("Core Theory");
  const [courseId, setCourseId] = useState("");
  const [classId, setClassId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [semester, setSemester] = useState(5);
  const [allocatedTeacherName, setAllocatedTeacherName] = useState("");
  const [formError, setFormError] = useState("");

  // Filters
  const [filterType, setFilterType] = useState<string>("all");
  const [filterCourse, setFilterCourse] = useState<string>("all");

  const effectiveDepts = departments && departments.length > 0 ? departments : DEFAULT_DEPARTMENTS;

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setFetchError(null);
      const [subRes, crsRes, clRes, deptRes] = await Promise.all([
        fetch("/api/admin/academics/subjects"),
        fetch("/api/admin/academics/courses"),
        fetch("/api/admin/academics/classes").catch(() => null),
        fetch("/api/admin/academics/departments").catch(() => null),
      ]);

      const [subJson, crsJson] = await Promise.all([subRes.json(), crsRes.json()]);

      if (!subRes.ok || !subJson.success) {
        throw new Error(subJson.error || "Failed to load subjects.");
      }

      if (crsRes.ok && crsJson.success && crsJson.data) {
        setCourses(crsJson.data.map(mapApiToCourse));
      }

      if (clRes && clRes.ok) {
        const clJson = await clRes.json();
        if (clJson.success && clJson.data) {
          setClasses(clJson.data);
        }
      }

      if (deptRes && deptRes.ok) {
        const dJson = await deptRes.json();
        if (dJson.success && dJson.data?.length > 0) {
          setDepartments(dJson.data);
        }
      }

      setSubjects((subJson.data || []).map(mapApiToSubject));
    } catch (err: any) {
      setFetchError(err.message || "Failed to load data from server.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenAddModal = () => {
    setEditingSubject(null);
    setName("");
    setCode("");
    setCredits(4);
    setHoursPerWeek(4);
    setType("Core Theory");
    setCourseId(courses[0]?.id || "");
    setClassId(classes[0]?.id || "");
    setDepartmentId(effectiveDepts[0]?.id || "");
    setSemester(5);
    setAllocatedTeacherName("");
    setFormError("");
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (subj: SubjectItem) => {
    setEditingSubject(subj);
    setName(subj.name);
    setCode(subj.code);
    setCredits(subj.credits);
    setHoursPerWeek(subj.hoursPerWeek);
    setType(subj.type);
    setCourseId(subj.courseId);
    setClassId(subj.classId || "");
    setDepartmentId(subj.departmentId || effectiveDepts[0]?.id || "");
    setSemester(subj.semester);
    setAllocatedTeacherName(subj.allocatedTeacherName || "");
    setFormError("");
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!name.trim() || !code.trim()) {
      setFormError("Subject name and code are required.");
      return;
    }
    if (!courseId) {
      setFormError("Course mapping is required.");
      return;
    }
    if (credits <= 0) {
      setFormError("Credits must be a positive integer.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingSubject) {
        const res = await fetch("/api/admin/academics/subjects", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingSubject.id,
            name: name.trim(),
            code: code.trim().toUpperCase(),
            credits: Number(credits),
            hoursPerWeek: Number(hoursPerWeek),
            type: toDbSubjectType(type),
            courseId,
            semester: Number(semester),
            allocatedTeacherName: allocatedTeacherName.trim() || undefined,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Failed to update subject.");
        }
      } else {
        const res = await fetch("/api/admin/academics/subjects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            code: code.trim().toUpperCase(),
            credits: Number(credits),
            hoursPerWeek: Number(hoursPerWeek),
            type: toDbSubjectType(type),
            courseId,
            semester: Number(semester),
            allocatedTeacherName: allocatedTeacherName.trim() || undefined,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Failed to create subject.");
        }
      }

      await loadData();
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || "An unexpected error occurred while saving.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, subjName: string) => {
    if (!confirm(`Are you sure you want to delete subject "${subjName}"?`)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/admin/academics/subjects?id=${id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to delete subject.");
      }
      await loadData();
    } catch (err: any) {
      alert(err.message || "Failed to delete subject.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const courseOptions = courses.map((c) => ({
    value: c.id,
    label: `${c.name} (${c.code})`,
  }));

  const classOptions = [
    { value: "", label: "No Specific Class Binding" },
    ...classes.map((c) => ({
      value: c.id,
      label: `${c.name} [Sem ${c.semester}]`,
    })),
  ];

  const deptOptions = effectiveDepts.map((d) => ({
    value: d.id,
    label: `${d.name} (${d.code})`,
  }));

  const subjectTypeOptions = [
    { value: "Core Theory", label: "Core Theory Subject" },
    { value: "Practical / Lab", label: "Practical / Laboratory" },
    { value: "Department Elective", label: "Departmental Elective (DE)" },
    { value: "Open Elective", label: "Open / Institutional Elective (OE)" },
    { value: "Project / Seminar", label: "Capstone Project / Seminar" },
  ];

  const filteredSubjects = subjects.filter((s) => {
    if (filterType !== "all" && s.type !== filterType) return false;
    if (filterCourse !== "all" && s.courseId !== filterCourse) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E2E8F0]">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#1E293B]">
            Subjects
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            Configure curriculum subjects, credits, syllabus types, and faculty allocations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={isLoading || isSubmitting}
            leftIcon={<RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleOpenAddModal}
            disabled={isSubmitting}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Create Subject
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {fetchError && (
        <Alert variant="error" title="Failed to Load Subjects">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-1">
            <span className="text-sm">{fetchError}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={isLoading}
              className="border-red-300 text-red-700 hover:bg-red-50"
            >
              Retry
            </Button>
          </div>
        </Alert>
      )}

      {/* Filter Controls Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-white rounded-xl border border-[#E2E8F0] shadow-xs">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-[#64748B] font-semibold">
            <Filter className="w-4 h-4" /> Filters:
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="text-xs border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 bg-white text-[#1E293B]"
          >
            <option value="all">All Subject Types</option>
            <option value="Core Theory">Core Theory</option>
            <option value="Practical / Lab">Practical / Lab</option>
            <option value="Department Elective">Department Elective</option>
            <option value="Open Elective">Open Elective</option>
          </select>

          <select
            value={filterCourse}
            onChange={(e) => setFilterCourse(e.target.value)}
            className="text-xs border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 bg-white text-[#1E293B]"
          >
            <option value="all">All Associated Programs</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} - {c.name}
              </option>
            ))}
          </select>
        </div>

        <span className="text-xs font-medium text-[#64748B]">
          Showing <strong>{filteredSubjects.length}</strong> of {subjects.length} Subjects
        </span>
      </div>

      {/* Subjects Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BookMarked className="w-5 h-5 text-[#F5A000]" />
            <CardTitle>Subject Master Register</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Subject Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Credits & Load</TableHead>
                <TableHead>Program & Semester</TableHead>
                <TableHead>Allocated Instructor</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-[#64748B]">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-[#F5A000]" />
                      <span>Loading subjects...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {filteredSubjects.map((subj) => (
                    <TableRow key={subj.id}>
                      <TableCell>
                        <span className="font-mono text-xs font-bold bg-[#123B5A] text-white px-2 py-0.5 rounded whitespace-nowrap inline-block">
                          {subj.code}
                        </span>
                      </TableCell>
                      <TableCell className="font-bold text-[#1E293B]">
                        {subj.name}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            subj.type === "Core Theory"
                              ? "navy"
                              : subj.type === "Practical / Lab"
                              ? "teal"
                              : "info"
                          }
                          size="sm"
                        >
                          {subj.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-semibold text-[#123B5A]">
                          {subj.credits} Credits ({subj.hoursPerWeek} hrs/wk)
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs space-y-0.5">
                          <span className="font-medium text-[#F5A000] block">
                            {subj.courseName || "General"}
                          </span>
                          <span className="text-[11px] text-[#64748B]">
                            Semester {subj.semester}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-xs">
                          <UserCheck className="w-3.5 h-3.5 text-[#16A34A]" />
                          <span className="font-semibold text-[#1E293B]">
                            {subj.allocatedTeacherName || (
                              <span className="text-[#DC2626] font-normal italic">Unallocated</span>
                            )}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEditModal(subj)}
                            disabled={isSubmitting}
                            title="Edit Subject"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-[#F5A000]" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(subj.id, subj.name)}
                            disabled={isSubmitting}
                            title="Delete Subject"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-[#DC2626]" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredSubjects.length === 0 && (
                    <TableEmpty colSpan={7} message="No subjects match selected filters." />
                  )}
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal: Create / Edit Subject */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => !isSubmitting && setIsModalOpen(false)}
        title={editingSubject ? `Edit Subject (${editingSubject.code})` : "Create Academic Subject"}
        description="Define course curriculum subject, weekly load, credits, and teaching assignment."
        maxWidth="lg"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleSubmit}
              disabled={isSubmitting}
              leftIcon={isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}
            >
              {isSubmitting
                ? "Saving..."
                : editingSubject
                ? "Update Subject"
                : "Save Subject"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <Alert variant="error" title="Validation">
              {formError}
            </Alert>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Input
                label="Subject Title"
                required
                placeholder="e.g. Database Management Systems & SQL Engines"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <Input
              label="Subject Code"
              required
              placeholder="e.g. CS501"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />

            <Select
              label="Subject Category / Type"
              required
              value={type}
              options={subjectTypeOptions}
              onChange={(e) => setType(e.target.value as SubjectType)}
            />

            <Select
              label="Program / Degree Association"
              required
              value={courseId}
              options={courseOptions}
              onChange={(e) => setCourseId(e.target.value)}
            />

            <Select
              label="Administering Department"
              required
              value={departmentId}
              options={deptOptions}
              onChange={(e) => setDepartmentId(e.target.value)}
            />

            <Select
              label="Target Class (Optional)"
              value={classId}
              options={classOptions}
              onChange={(e) => setClassId(e.target.value)}
            />

            <Input
              label="Semester / Term Number"
              type="number"
              required
              value={semester}
              onChange={(e) => setSemester(Number(e.target.value))}
            />

            <Input
              label="Academic Credits"
              type="number"
              required
              value={credits}
              onChange={(e) => setCredits(Number(e.target.value))}
            />

            <Input
              label="Teaching Hours / Week"
              type="number"
              required
              value={hoursPerWeek}
              onChange={(e) => setHoursPerWeek(Number(e.target.value))}
            />

            <div className="sm:col-span-2 pt-2 border-t border-[#F1F5F9]">
              <Input
                label="Designated Faculty / Subject Instructor"
                placeholder="e.g. Prof. Sudha Murthy"
                value={allocatedTeacherName}
                onChange={(e) => setAllocatedTeacherName(e.target.value)}
                leftIcon={<UserCheck className="w-4 h-4" />}
                helperText="Primary instructor responsible for curriculum delivery and continuous grading"
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
