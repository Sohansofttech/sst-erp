"use client";

import React, { useRef } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Printer, Download, Award, CheckCircle2, User, Building } from "lucide-react";

export interface ReportCardData {
  studentId: string;
  studentName: string;
  admissionNumber: string;
  rollNumber: string;
  divisionName: string;
  divisionType: string;
  className: string;
  gradeLevel: string;
  stream?: string | null;
  termName: string;
  academicYear: string;
  subjects: {
    subjectId: string;
    subjectName: string;
    subjectCode: string;
    maxMarks: number;
    marksObtained: number;
    percentage: number;
    grade: string;
    remarks: string;
  }[];
  totals: {
    maxMarks: number;
    obtainedMarks: number;
    percentage: number;
    overallGrade: string;
    resultStatus: string;
  };
  attendance: {
    workingDays: number;
    presentDays: number;
    percentage: number;
  };
  teacherRemarks: string;
}

interface SchoolReportCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportCard: ReportCardData | null;
  institutionName?: string;
  institutionLogo?: string | null;
}

export function SchoolReportCardModal({
  isOpen,
  onClose,
  reportCard,
  institutionName = "SST Educational Academy",
  institutionLogo,
}: SchoolReportCardModalProps) {
  const printAreaRef = useRef<HTMLDivElement>(null);

  if (!reportCard) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`School Report Card — ${reportCard.studentName}`}
      description={`${reportCard.gradeLevel} · ${reportCard.termName} Academic Evaluation`}
      maxWidth="xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handlePrint}
              leftIcon={<Printer className="w-4 h-4" />}
            >
              Print Report Card
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6 p-4 bg-white" ref={printAreaRef}>
        {/* Institutional Report Card Header */}
        <div className="text-center pb-4 border-b-2 border-[#123B5A]">
          <div className="flex items-center justify-center gap-3 mb-2">
            {institutionLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={institutionLogo} alt="Logo" className="w-12 h-12 rounded object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-[#123B5A] text-white flex items-center justify-center font-bold">
                <Building className="w-6 h-6" />
              </div>
            )}
            <div>
              <h2 className="text-xl font-extrabold text-[#123B5A] uppercase tracking-wide">
                {institutionName}
              </h2>
              <p className="text-xs font-bold text-[#F5A000] uppercase tracking-wider">
                {reportCard.divisionName} · Student Progress Report
              </p>
            </div>
          </div>
          <div className="inline-block bg-[#F8FAFC] border border-[#E2E8F0] px-4 py-1 rounded-full text-xs font-bold text-[#1E293B]">
            {reportCard.termName} Evaluation · Academic Year 2026–2027
          </div>
        </div>

        {/* Student Profile Information Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-xs">
          <div>
            <span className="text-[#64748B] block font-medium">Student Name</span>
            <span className="font-bold text-[#1E293B] text-sm">{reportCard.studentName}</span>
          </div>
          <div>
            <span className="text-[#64748B] block font-medium">Admission / Roll No.</span>
            <span className="font-bold text-[#1E293B]">{reportCard.admissionNumber}</span>
          </div>
          <div>
            <span className="text-[#64748B] block font-medium">Grade & Section</span>
            <span className="font-bold text-[#1E293B]">
              {reportCard.gradeLevel} {reportCard.stream ? `(${reportCard.stream})` : ""}
            </span>
          </div>
          <div>
            <span className="text-[#64748B] block font-medium">Term Attendance</span>
            <span className="font-bold text-[#123B5A]">
              {reportCard.attendance.presentDays}/{reportCard.attendance.workingDays} Days ({reportCard.attendance.percentage}%)
            </span>
          </div>
        </div>

        {/* Subject-Wise Assessment Table */}
        <div className="border border-[#E2E8F0] rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#123B5A] text-white font-bold uppercase text-[11px]">
                <th className="py-2.5 px-3">Subject</th>
                <th className="py-2.5 px-3 text-center">Max Marks</th>
                <th className="py-2.5 px-3 text-center">Marks Obtained</th>
                <th className="py-2.5 px-3 text-center">Grade</th>
                <th className="py-2.5 px-3">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {reportCard.subjects.map((sub, idx) => (
                <tr key={sub.subjectId || idx} className="hover:bg-[#F8FAFC] transition-colors">
                  <td className="py-2 px-3 font-semibold text-[#1E293B]">
                    {sub.subjectName}
                    <span className="text-[10px] text-[#64748B] block font-normal">{sub.subjectCode}</span>
                  </td>
                  <td className="py-2 px-3 text-center font-medium text-[#64748B]">{sub.maxMarks}</td>
                  <td className="py-2 px-3 text-center font-bold text-[#123B5A]">{sub.marksObtained}</td>
                  <td className="py-2 px-3 text-center">
                    <span className="inline-block px-2 py-0.5 rounded text-[11px] font-black bg-[#FEF3C7] text-[#D97706]">
                      {sub.grade}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-[#64748B] text-[11px]">{sub.remarks}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[#F1F5F9] font-bold text-[#1E293B] border-t-2 border-[#123B5A]">
                <td className="py-2.5 px-3">Grand Total</td>
                <td className="py-2.5 px-3 text-center">{reportCard.totals.maxMarks}</td>
                <td className="py-2.5 px-3 text-center text-[#123B5A] text-sm">{reportCard.totals.obtainedMarks}</td>
                <td className="py-2.5 px-3 text-center">
                  <span className="inline-block px-2 py-0.5 rounded text-xs font-black bg-[#123B5A] text-white">
                    {reportCard.totals.overallGrade}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-[#123B5A] font-bold">
                  {reportCard.totals.percentage}% · {reportCard.totals.resultStatus}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Qualitative Teacher Remarks & Performance Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2 p-3.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#123B5A] mb-1.5 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
              Class Teacher&apos;s Comprehensive Remarks
            </h4>
            <p className="text-xs text-[#334155] leading-relaxed italic">
              &ldquo;{reportCard.teacherRemarks}&rdquo;
            </p>
          </div>

          <div className="p-3.5 rounded-xl border border-[#E2E8F0] bg-[#FEF3C7]/40 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#D97706] block mb-1">
                Evaluation Verdict
              </span>
              <span className="text-base font-black text-[#123B5A] block">
                {reportCard.totals.resultStatus === "PASSED" ? "Qualified / Promoted" : "Under Academic Review"}
              </span>
            </div>
            <div className="pt-4 border-t border-[#E2E8F0]/80 mt-2 flex justify-between text-[10px] text-[#64748B]">
              <span>Class Teacher</span>
              <span>Principal Signature</span>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
