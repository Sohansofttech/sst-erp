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
  Layers,
  Plus,
  Edit2,
  Trash2,
  Users,
  UserCheck,
} from "lucide-react";
import { ClassItem, SectionItem } from "@/types/institution";
import { useDivision } from "@/lib/division-store";

const SCHOOL_GRADES = [
  { value: "Grade 1", label: "Grade 1 (Primary)" },
  { value: "Grade 2", label: "Grade 2 (Primary)" },
  { value: "Grade 3", label: "Grade 3 (Primary)" },
  { value: "Grade 4", label: "Grade 4 (Primary)" },
  { value: "Grade 5", label: "Grade 5 (Primary)" },
  { value: "Grade 6", label: "Grade 6 (Middle School)" },
  { value: "Grade 7", label: "Grade 7 (Middle School)" },
  { value: "Grade 8", label: "Grade 8 (Middle School)" },
  { value: "Grade 9", label: "Grade 9 (Secondary / High School)" },
  { value: "Grade 10", label: "Grade 10 (Secondary / High School)" },
];

const HIGHER_SEC_GRADES = [
  { value: "Grade 11", label: "Grade 11 / 1st Year PUC (+1)" },
  { value: "Grade 12", label: "Grade 12 / 2nd Year PUC (+2)" },
];

const HIGHER_SEC_STREAMS = [
  { value: "Science", label: "Science (PCMB / PCMC)" },
  { value: "Commerce", label: "Commerce (Accountancy, Business, Economics)" },
  { value: "Arts", label: "Arts / Humanities" },
];

const MONTESSORI_STAGES = [
  { value: "Toddler (1.5-3 yrs)", label: "Toddler Community (1.5 - 3 yrs)" },
  { value: "Primary (3-6 yrs)", label: "Primary / Children's House (3 - 6 yrs)" },
  { value: "Lower Elementary (6-9 yrs)", label: "Lower Elementary (6 - 9 yrs)" },
];

export default function ClassesSectionsPage() {
  const { activeDivision, activeDivisionId } = useDivision();
  const divType = activeDivision?.type ?? "COLLEGE";
  const isSchool = divType === "SCHOOL";
  const isHigherSec = divType === "HIGHER_SECONDARY";
  const isMontessori = divType === "MONTESSORI";
  const isCollege = !isSchool && !isHigherSec && !isMontessori;

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [academicYears, setAcademicYears] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [clsRes, crsRes, ayRes] = await Promise.all([
        fetch("/api/admin/academics/classes").then((r) => r.json()).catch(() => ({})),
        fetch("/api/admin/academics/courses").then((r) => r.json()).catch(() => ({})),
        fetch("/api/admin/academics/academic-years").then((r) => r.json()).catch(() => ({})),
      ]);
      if (clsRes.success) {
        setClasses(clsRes.data || []);
      }
      if (crsRes.success) {
        setCourses(crsRes.data || []);
      }
      if (ayRes.success) {
        setAcademicYears(ayRes.data || []);
      }
    } catch (err) {
      console.error("Error loading academics data:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeAcademicYear = academicYears.find((ay) => ay.isActive || ay.isCurrent) || academicYears[0];

  const [activeTab, setActiveTab] = useState<"classes" | "sections">("classes");

  // Class Modal State
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  const [className, setClassName] = useState("");
  const [classCode, setClassCode] = useState("");
  const [courseId, setCourseId] = useState("");
  const [academicYearId, setAcademicYearId] = useState("");
  const [stream, setStream] = useState("Core Engineering");
  const [semester, setSemester] = useState(1);
  const [gradeLevel, setGradeLevel] = useState("");
  const [classError, setClassError] = useState("");

  // Section Modal State
  const [isSectionModalOpen, setIsSectionModalOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<SectionItem | null>(null);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [batchName, setBatchName] = useState("Batch 2024-2028");
  const [maxCapacity, setMaxCapacity] = useState(60);
  const [roomNumber, setRoomNumber] = useState("LH-301");
  const [classTeacherName, setClassTeacherName] = useState("Prof. Sudha Murthy");
  const [sectionError, setSectionError] = useState("");

  // Open Class Modal
  const handleOpenAddClass = () => {
    setEditingClass(null);
    setClassName("");
    setClassCode("");
    setCourseId(courses[0]?.id || "");
    setAcademicYearId(activeAcademicYear?.id || academicYears[0]?.id || "");
    if (isSchool) {
      setGradeLevel("Grade 1");
      setStream("");
      setSemester(1);
    } else if (isHigherSec) {
      setGradeLevel("Grade 11");
      setStream("Science");
      setSemester(1);
    } else if (isMontessori) {
      setGradeLevel("Primary (3-6 yrs)");
      setStream("");
      setSemester(1);
    } else {
      setGradeLevel("");
      setStream("Core Engineering");
      setSemester(1);
    }
    setClassError("");
    setIsClassModalOpen(true);
  };

  const handleOpenEditClass = (cls: any) => {
    setEditingClass(cls);
    setClassName(cls.name);
    setClassCode(cls.code);
    setCourseId(cls.courseId || "");
    setAcademicYearId(cls.academicYearId || "");
    setStream(cls.stream || "");
    setSemester(cls.semester || 1);
    setGradeLevel(cls.gradeLevel || "");
    setClassError("");
    setIsClassModalOpen(true);
  };

  const handleClassSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setClassError("");

    if (!className.trim() || !classCode.trim()) {
      setClassError("Class title and code are required.");
      return;
    }
    if (isCollege && !courseId) {
      setClassError("Please link an approved course.");
      return;
    }

    try {
      const targetAyId = academicYearId || activeAcademicYear?.id || "";
      const payload = {
        id: editingClass?.id,
        name: className,
        code: classCode,
        courseId: isCollege ? courseId : null,
        academicYearId: targetAyId,
        semester: isCollege ? Number(semester) : null,
        gradeLevel: !isCollege ? gradeLevel : null,
        stream: isHigherSec ? stream : (isCollege ? stream : null),
        divisionType: divType,
        divisionId: activeDivisionId,
      };

      const res = await fetch("/api/admin/academics/classes", {
        method: editingClass ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to save class.");

      await loadData();
      setIsClassModalOpen(false);
    } catch (err: any) {
      setClassError(err.message || "Failed to save class.");
    }
  };

  // Open Section Modal
  const handleOpenAddSection = (preselectedClassId?: string) => {
    setEditingSection(null);
    setSelectedClassId(preselectedClassId || classes[0]?.id || "");
    setSectionName("Section A");
    setBatchName("2024-2028 Batch");
    setMaxCapacity(60);
    setRoomNumber("Lecture Hall 204");
    setClassTeacherName("");
    setSectionError("");
    setIsSectionModalOpen(true);
  };

  const handleOpenEditSection = (sec: SectionItem) => {
    setEditingSection(sec);
    setSelectedClassId(sec.classId);
    setSectionName(sec.name);
    setBatchName(sec.batchName);
    setMaxCapacity(sec.maxCapacity);
    setRoomNumber(sec.roomNumber);
    setClassTeacherName(sec.classTeacherName);
    setSectionError("");
    setIsSectionModalOpen(true);
  };

  const handleSectionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSectionError("");

    if (!sectionName.trim()) {
      setSectionError("Section label is required.");
      return;
    }
    if (!selectedClassId) {
      setSectionError("Please select a parent class.");
      return;
    }

    if (editingSection) {
      setSections((prev) =>
        prev.map((s) =>
          s.id === editingSection.id
            ? {
                ...s,
                classId: selectedClassId,
                name: sectionName,
                batchName,
                maxCapacity: Number(maxCapacity),
                roomNumber,
                classTeacherName,
              }
            : s
        )
      );
    } else {
      const newSec: SectionItem = {
        id: `sec-${Date.now()}`,
        classId: selectedClassId,
        name: sectionName,
        batchName,
        maxCapacity: Number(maxCapacity),
        currentEnrollment: 0,
        roomNumber,
        classTeacherName,
      };
      setSections((prev) => [...prev, newSec]);
    }

    setIsSectionModalOpen(false);
  };

  const handleDeleteClass = async (id: string, name: string) => {
    if (!confirm(`Delete class "${name}"?`)) return;
    try {
      const res = await fetch(`/api/admin/academics/classes?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!data.success) alert(data.error || "Failed to delete class.");
      await loadData();
    } catch (err: any) {
      alert(err.message || "Network error deleting class.");
    }
  };

  const handleDeleteSection = (id: string, name: string) => {
    if (!confirm(`Delete section "${name}"?`)) return;
    setSections((prev) => prev.filter((s) => s.id !== id));
  };

  const courseOptions = courses.map((c) => ({
    value: c.id,
    label: `${c.name} (${c.code})`,
  }));

  const ayOptions = academicYears.map((ay) => ({
    value: ay.id,
    label: `AY ${ay.name} ${ay.isActive ? "(Active)" : ""}`,
  }));

  const classOptions = classes.map((c) => ({
    value: c.id,
    label: `${c.name} [${c.code}]`,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E2E8F0]">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#1E293B]">
            Classes & Sections
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            Manage classes, academic streams, and section allocations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenAddSection()}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Add Section
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleOpenAddClass}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Create Class
          </Button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-[#E2E8F0]">
        <button
          onClick={() => setActiveTab("classes")}
          className={`px-5 py-2.5 text-sm font-bold border-b-2 transition-colors cursor-pointer ${
            activeTab === "classes"
              ? "border-[#F5A000] text-[#F5A000]"
              : "border-transparent text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          Classes Master ({classes.length})
        </button>
        <button
          onClick={() => setActiveTab("sections")}
          className={`px-5 py-2.5 text-sm font-bold border-b-2 transition-colors cursor-pointer ${
            activeTab === "sections"
              ? "border-[#F5A000] text-[#F5A000]"
              : "border-transparent text-[#64748B] hover:text-[#1E293B]"
          }`}
        >
          Sections & Batches ({sections.length})
        </button>
      </div>

      {/* View 1: Classes Table */}
      {activeTab === "classes" && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#F5A000]" />
              <CardTitle>Configured Classes</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class Code</TableHead>
                  <TableHead>Class Name</TableHead>
                  <TableHead>{isCollege ? "Program / Course" : (isMontessori ? "Stage / Group" : "Grade Standard")}</TableHead>
                  <TableHead>Stream / Track</TableHead>
                  <TableHead>Semester / Term</TableHead>
                  <TableHead>Academic Year</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classes.map((cls) => {
                  const classSections = sections.filter((s) => s.classId === cls.id);
                  return (
                    <TableRow key={cls.id}>
                      <TableCell>
                        <span className="font-mono text-xs font-bold bg-[#123B5A] text-white px-2 py-0.5 rounded whitespace-nowrap inline-block">
                          {cls.code}
                        </span>
                      </TableCell>
                      <TableCell className="font-bold text-[#1E293B]">
                        <div>
                          <span>{cls.name}</span>
                          <span className="text-[11px] text-[#64748B] block font-normal">
                            {classSections.length} Sections configured
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-[#F5A000] font-medium">
                          {(cls as any).gradeLevel || cls.courseName || ((cls as any).course?.name) || "General"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="teal" size="sm">
                          {cls.stream || (cls as any).gradeLevel || "General"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-semibold text-[#123B5A]">
                          {cls.semester ? `Sem ${cls.semester}` : ((cls as any).gradeLevel ? "Annual" : "N/A")}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-[#64748B]">
                          {cls.academicYearName}
                        </span>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenAddSection(cls.id)}
                            title="Add Section to this class"
                          >
                            <Plus className="w-3.5 h-3.5 text-[#F5A000]" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEditClass(cls)}
                            title="Edit Class"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-[#F5A000]" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteClass(cls.id, cls.name)}
                            title="Delete Class"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-[#DC2626]" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {classes.length === 0 && (
                  <TableEmpty colSpan={7} message="No classes created yet." />
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* View 2: Sections & Batches Table */}
      {activeTab === "sections" && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-[#123B5A]" />
              <CardTitle>Section Batches & Rooms</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Parent Class</TableHead>
                  <TableHead>Section Name</TableHead>
                  <TableHead>Batch Cycle</TableHead>
                  <TableHead>Lecture Room</TableHead>
                  <TableHead>Class Mentor / Teacher</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sections.map((sec) => {
                  const parentClass = classes.find((c) => c.id === sec.classId);
                  return (
                    <TableRow key={sec.id}>
                      <TableCell>
                        <span className="font-semibold text-xs text-[#123B5A]">
                          {parentClass?.name || "Unassigned"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-bold text-xs bg-[#EFF6FF] text-[#F5A000] px-2 py-1 rounded border border-[#BFDBFE]">
                          {sec.name}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-[#64748B]">{sec.batchName}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-mono text-[#1E293B]">
                          {sec.roomNumber}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-xs text-[#1E293B]">
                          <UserCheck className="w-3.5 h-3.5 text-[#16A34A]" />
                          <span>{sec.classTeacherName || "Not Allocated"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-semibold text-[#123B5A]">
                          {sec.currentEnrollment} / {sec.maxCapacity} Seats
                        </span>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEditSection(sec)}
                            title="Edit Section"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-[#F5A000]" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteSection(sec.id, sec.name)}
                            title="Delete Section"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-[#DC2626]" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {sections.length === 0 && (
                  <TableEmpty colSpan={7} message="No sections created yet." />
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Modal: Create / Edit Class */}
      <Modal
        isOpen={isClassModalOpen}
        onClose={() => setIsClassModalOpen(false)}
        title={
          editingClass
            ? `Edit Class (${editingClass.code})`
            : isSchool
            ? "Create School Grade Class"
            : isHigherSec
            ? "Create Higher Secondary Class"
            : isMontessori
            ? "Create Montessori Stage / Group"
            : "Create Academic Class"
        }
        description={
          isSchool
            ? "Configure standard grade level, section, and academic year."
            : isHigherSec
            ? "Configure junior college / intermediate grade standard, stream, and academic year."
            : isMontessori
            ? "Configure early childhood developmental stage, age group, and academic year."
            : "Link class to course degree, stream specialization, and semester."
        }
        maxWidth="lg"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsClassModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={handleClassSubmit}>
              {editingClass ? "Update Class" : "Save Class"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {classError && (
            <Alert variant="error" title="Validation">
              {classError}
            </Alert>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Input
                label="Class Full Title"
                required
                placeholder={
                  isSchool
                    ? "e.g. Grade 10 - Section A"
                    : isHigherSec
                    ? "e.g. Grade 11 Science - A"
                    : isMontessori
                    ? "e.g. Primary Children's House (3-6 yrs)"
                    : "e.g. 3rd Year Computer Science (5th Sem)"
                }
                value={className}
                onChange={(e) => setClassName(e.target.value)}
              />
            </div>

            <Input
              label="Class Code"
              required
              placeholder={
                isSchool
                  ? "e.g. G10-A"
                  : isHigherSec
                  ? "e.g. HSEC-11-SCI"
                  : isMontessori
                  ? "e.g. MONT-PRIM-A"
                  : "e.g. CSE-Y3-S5"
              }
              value={classCode}
              onChange={(e) => setClassCode(e.target.value)}
            />

            {/* Non-college Grade / Stage selector */}
            {isSchool && (
              <Select
                label="Standard / Grade Level"
                required
                value={gradeLevel}
                options={SCHOOL_GRADES}
                onChange={(e) => setGradeLevel(e.target.value)}
              />
            )}

            {isHigherSec && (
              <>
                <Select
                  label="Grade Standard"
                  required
                  value={gradeLevel}
                  options={HIGHER_SEC_GRADES}
                  onChange={(e) => setGradeLevel(e.target.value)}
                />
                <Select
                  label="Academic Stream"
                  required
                  value={stream}
                  options={HIGHER_SEC_STREAMS}
                  onChange={(e) => setStream(e.target.value)}
                />
              </>
            )}

            {isMontessori && (
              <div className="sm:col-span-2">
                <Select
                  label="Developmental Stage / Age Group"
                  required
                  value={gradeLevel}
                  options={MONTESSORI_STAGES}
                  onChange={(e) => setGradeLevel(e.target.value)}
                />
              </div>
            )}

            {/* College fields */}
            {isCollege && (
              <>
                <Input
                  label="Stream / Track Specialization"
                  required
                  placeholder="e.g. Core, AI & ML, Cloud"
                  value={stream}
                  onChange={(e) => setStream(e.target.value)}
                />

                <div className="sm:col-span-2">
                  <Select
                    label="Associated Degree Course"
                    required
                    value={courseId}
                    options={courseOptions}
                    onChange={(e) => setCourseId(e.target.value)}
                  />
                </div>
              </>
            )}

            <Select
              label="Academic Year"
              required
              value={academicYearId}
              options={ayOptions}
              onChange={(e) => setAcademicYearId(e.target.value)}
            />

            {isCollege && (
              <Input
                label="Semester Number"
                type="number"
                min={1}
                max={10}
                required
                value={semester}
                onChange={(e) => setSemester(Number(e.target.value))}
              />
            )}
          </div>
        </div>
      </Modal>

      {/* Modal: Create / Edit Section */}
      <Modal
        isOpen={isSectionModalOpen}
        onClose={() => setIsSectionModalOpen(false)}
        title={editingSection ? `Edit Section (${editingSection.name})` : "Create Class Section"}
        description="Allocate physical lecture room, maximum enrollment capacity, and mentor."
        maxWidth="lg"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsSectionModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={handleSectionSubmit}>
              {editingSection ? "Update Section" : "Save Section"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {sectionError && (
            <Alert variant="error" title="Validation">
              {sectionError}
            </Alert>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Select
                label="Target Parent Class"
                required
                value={selectedClassId}
                options={classOptions}
                onChange={(e) => setSelectedClassId(e.target.value)}
              />
            </div>

            <Input
              label="Section Label"
              required
              placeholder="e.g. Section A, Batch 1"
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
            />

            <Input
              label="Graduation Batch"
              placeholder="e.g. 2024-2028 Batch"
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
            />

            <Input
              label="Assigned Lecture Room / Hall"
              required
              placeholder="e.g. LH-301, Ramanujan Block"
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
            />

            <Input
              label="Maximum Seat Capacity"
              type="number"
              required
              value={maxCapacity}
              onChange={(e) => setMaxCapacity(Number(e.target.value))}
            />

            <div className="sm:col-span-2">
              <Input
                label="Designated Class Teacher / Mentor"
                placeholder="e.g. Prof. Sudha Murthy"
                value={classTeacherName}
                onChange={(e) => setClassTeacherName(e.target.value)}
                leftIcon={<UserCheck className="w-4 h-4" />}
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
