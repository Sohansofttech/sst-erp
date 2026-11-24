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
  BookOpen,
  Plus,
  Edit2,
  Trash2,
  Building,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { Course, DegreeType } from "@/types/institution";

const DEFAULT_DEPARTMENTS = [
  { id: "dept-cse", name: "Computer Science & Engineering", code: "CSE" },
  { id: "dept-ece", name: "Electronics & Communication Engineering", code: "ECE" },
  { id: "dept-mech", name: "Mechanical Engineering", code: "MECH" },
  { id: "dept-civil", name: "Civil Engineering", code: "CIVIL" },
  { id: "dept-mgmt", name: "Management Studies", code: "MBA" },
];

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

export default function CoursesPage() {
  const [departments, setDepartments] = useState<any[]>(DEFAULT_DEPARTMENTS);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [degreeType, setDegreeType] = useState<DegreeType>("Undergraduate");
  const [departmentId, setDepartmentId] = useState("");
  const [durationYears, setDurationYears] = useState(4);
  const [totalSemesters, setTotalSemesters] = useState(8);
  const [totalCredits, setTotalCredits] = useState(160);
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState("");

  const effectiveDepts = departments && departments.length > 0 ? departments : DEFAULT_DEPARTMENTS;

  const loadCourses = useCallback(async () => {
    try {
      setIsLoading(true);
      setFetchError(null);
      const [cRes, dRes] = await Promise.all([
        fetch("/api/admin/academics/courses"),
        fetch("/api/admin/academics/departments").catch(() => null),
      ]);
      const json = await cRes.json();
      if (!cRes.ok || !json.success) {
        throw new Error(json.error || "Failed to load courses.");
      }
      const mapped = (json.data || []).map(mapApiToCourse);
      setCourses(mapped);

      if (dRes && dRes.ok) {
        const dJson = await dRes.json();
        if (dJson.success && dJson.data?.length > 0) {
          setDepartments(dJson.data);
        }
      }
    } catch (err: any) {
      setFetchError(err.message || "Failed to load courses from database.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  const handleOpenAddModal = () => {
    setEditingCourse(null);
    setName("");
    setCode("");
    setDegreeType("Undergraduate");
    setDepartmentId(effectiveDepts[0]?.id || "");
    setDurationYears(4);
    setTotalSemesters(8);
    setTotalCredits(160);
    setDescription("");
    setFormError("");
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (course: Course) => {
    setEditingCourse(course);
    setName(course.name);
    setCode(course.code);
    setDegreeType(course.degreeType);
    setDepartmentId(course.departmentId || effectiveDepts[0]?.id || "");
    setDurationYears(course.durationYears);
    setTotalSemesters(course.totalSemesters);
    setTotalCredits(course.totalCredits);
    setDescription(course.description || "");
    setFormError("");
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!name.trim() || !code.trim()) {
      setFormError("Program title and course code are required.");
      return;
    }
    if (durationYears <= 0 || totalSemesters <= 0) {
      setFormError("Duration and semesters must be positive numbers.");
      return;
    }

    const selectedDept = effectiveDepts.find((d) => d.id === departmentId);
    const departmentName = selectedDept ? `${selectedDept.name} (${selectedDept.code})` : undefined;

    setIsSubmitting(true);
    try {
      if (editingCourse) {
        const res = await fetch("/api/admin/academics/courses", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingCourse.id,
            name: name.trim(),
            code: code.trim().toUpperCase(),
            degreeType,
            departmentId: departmentId || undefined,
            departmentName,
            durationYears: Number(durationYears),
            totalSemesters: Number(totalSemesters),
            totalCredits: Number(totalCredits),
            description: description.trim() || undefined,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Failed to update course.");
        }
      } else {
        const res = await fetch("/api/admin/academics/courses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            code: code.trim().toUpperCase(),
            degreeType,
            departmentId: departmentId || undefined,
            departmentName,
            durationYears: Number(durationYears),
            totalSemesters: Number(totalSemesters),
            totalCredits: Number(totalCredits),
            description: description.trim() || undefined,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Failed to create course.");
        }
      }

      await loadCourses();
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || "An unexpected error occurred while saving.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, courseName: string) => {
    if (!confirm(`Are you sure you want to delete course "${courseName}"?`)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/admin/academics/courses?id=${id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to delete course.");
      }
      await loadCourses();
    } catch (err: any) {
      alert(err.message || "Failed to delete course.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const departmentOptions = effectiveDepts.map((d) => ({
    value: d.id,
    label: `${d.name} (${d.code})`,
  }));

  const degreeOptions = [
    { value: "Undergraduate", label: "Undergraduate (UG / Bachelor)" },
    { value: "Postgraduate", label: "Postgraduate (PG / Master)" },
    { value: "Diploma", label: "Diploma / Polytechnic" },
    { value: "Doctoral", label: "Doctoral (Ph.D. / Research)" },
    { value: "Certificate", label: "Certificate / Skill Program" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E2E8F0]">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#1E293B]">
            Courses & Programs
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            Manage academic degrees, program codes, department associations, and credit rules.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadCourses}
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
            Create Course
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {fetchError && (
        <Alert variant="error" title="Failed to Load Courses">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-1">
            <span className="text-sm">{fetchError}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={loadCourses}
              disabled={isLoading}
              className="border-red-300 text-red-700 hover:bg-red-50"
            >
              Retry
            </Button>
          </div>
        </Alert>
      )}

      {/* Quick Overview Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 bg-white">
          <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">
            Total Degree Programs
          </span>
          <h4 className="text-2xl font-bold text-[#123B5A] mt-1">{courses.length}</h4>
          <span className="text-[11px] text-[#16A34A] font-medium">All active and approved</span>
        </Card>
        <Card className="p-4 bg-white">
          <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">
            Undergraduate Programs
          </span>
          <h4 className="text-2xl font-bold text-[#F5A000] mt-1">
            {courses.filter((c) => c.degreeType === "Undergraduate").length}
          </h4>
          <span className="text-[11px] text-[#64748B]">B.Tech / Bachelor streams</span>
        </Card>
        <Card className="p-4 bg-white">
          <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">
            Postgraduate Programs
          </span>
          <h4 className="text-2xl font-bold text-[#F5A000] mt-1">
            {courses.filter((c) => c.degreeType === "Postgraduate").length}
          </h4>
          <span className="text-[11px] text-[#64748B]">M.Tech / MBA streams</span>
        </Card>
      </div>

      {/* Courses Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[#F5A000]" />
              <CardTitle>Configured Academic Programs</CardTitle>
            </div>
            <span className="text-xs text-[#64748B]">
              Showing {courses.length} Courses
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Program Title</TableHead>
                <TableHead>Degree Level</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Duration & Sems</TableHead>
                <TableHead>Total Credits</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-[#64748B]">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-[#F5A000]" />
                      <span>Loading courses...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {courses.map((course) => (
                    <TableRow key={course.id}>
                      <TableCell>
                        <span className="font-mono text-xs font-bold bg-[#123B5A] text-white px-2 py-1 rounded whitespace-nowrap inline-block">
                          {course.code}
                        </span>
                      </TableCell>
                      <TableCell className="font-semibold text-[#1E293B]">
                        {course.name}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            course.degreeType === "Undergraduate"
                              ? "navy"
                              : course.degreeType === "Postgraduate"
                              ? "teal"
                              : "info"
                          }
                          size="sm"
                        >
                          {course.degreeType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-xs text-[#64748B]">
                          <Building className="w-3.5 h-3.5 text-[#F5A000]" />
                          <span>{course.departmentName || "General"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-medium text-[#1E293B]">
                          {course.durationYears} Years • {course.totalSemesters} Semesters
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-bold text-[#123B5A]">
                          {course.totalCredits} Credits
                        </span>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEditModal(course)}
                            disabled={isSubmitting}
                            title="Edit Course"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-[#F5A000]" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(course.id, course.name)}
                            disabled={isSubmitting}
                            title="Delete Course"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-[#DC2626]" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {courses.length === 0 && (
                    <TableEmpty colSpan={7} message="No courses or programs configured yet." />
                  )}
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal: Create / Edit Course */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => !isSubmitting && setIsModalOpen(false)}
        title={editingCourse ? `Edit Course (${editingCourse.code})` : "Create Academic Course"}
        description="Define course title, code, department association, and duration."
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
                : editingCourse
                ? "Update Course"
                : "Save Course"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <Alert variant="error" title="Input Validation Error">
              {formError}
            </Alert>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Input
                label="Course / Program Full Title"
                required
                placeholder="e.g. Bachelor of Technology in Computer Science & Engineering"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <Input
              label="Course Code / Prefix"
              required
              placeholder="e.g. BTECH-CSE"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              helperText="Unique uppercase identifier"
            />

            <Select
              label="Degree Level / Type"
              required
              value={degreeType}
              options={degreeOptions}
              onChange={(e) => setDegreeType(e.target.value as DegreeType)}
            />

            <div className="sm:col-span-2">
              <Select
                label="Associated Department"
                required
                value={departmentId}
                options={departmentOptions}
                onChange={(e) => setDepartmentId(e.target.value)}
                helperText="Primary academic department administering this curriculum"
              />
            </div>

            <Input
              label="Program Duration (Years)"
              type="number"
              required
              value={durationYears}
              onChange={(e) => setDurationYears(Number(e.target.value))}
            />

            <Input
              label="Total Semesters / Terms"
              type="number"
              required
              value={totalSemesters}
              onChange={(e) => setTotalSemesters(Number(e.target.value))}
            />

            <Input
              label="Total Graduation Credits"
              type="number"
              required
              value={totalCredits}
              onChange={(e) => setTotalCredits(Number(e.target.value))}
            />

            <div className="sm:col-span-2">
              <label className="block text-[13px] font-medium text-[#1E293B] mb-1">
                Program Description (Optional)
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Summary of course objectives, career prospects, and industry accreditation"
                className="w-full rounded-lg border border-[#CBD5E1] p-2.5 text-xs text-[#1E293B] focus:border-[#F5A000] focus:outline-none"
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
