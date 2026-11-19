import type { AcademicYear, Institution } from "@/types/common"
import type {
  Announcement,
  Assignment,
  AssignmentSubmission,
  AttendanceSession,
  CampusDuty,
  ClassAllocation,
  DepartmentFacultyLoad,
  ExamDuty,
  ExamScheduleItem,
  InternalAssessment,
  LearningMaterial,
  LogBookEntry,
  Mentee,
  MentoringSession,
  NotificationItem,
  Quiz,
  QuizSubmission,
  ResultEntry,
  StudentLeaveRequest,
  StudentLogReview,
  StudentRosterItem,
  SubjectAllocation,
  TeacherLeaveRequest,
  TeacherProfile,
  TimetableSlot,
} from "@/types/teacher"

export const INSTITUTION_MOCK: Institution = {
  id: "inst-demo-01",
  name: "Vidya Niketan Public School",
  slug: "demo-school",
  type: "school",
  code: "VNPS-BLR-01",
  city: "Bengaluru",
  state: "Karnataka",
  boardOrUniversity: "CBSE",
}

export const ACADEMIC_YEARS_MOCK: AcademicYear[] = [
  {
    id: "ay-2026-27",
    institutionId: INSTITUTION_MOCK.id,
    name: "2026-27",
    isCurrent: true,
    startDate: "2026-06-01",
    endDate: "2027-03-31",
  },
  {
    id: "ay-2025-26",
    institutionId: INSTITUTION_MOCK.id,
    name: "2025-26",
    isCurrent: false,
    startDate: "2025-06-01",
    endDate: "2026-03-31",
  },
  {
    id: "ay-2024-25",
    institutionId: INSTITUTION_MOCK.id,
    name: "2024-25",
    isCurrent: false,
    startDate: "2024-06-01",
    endDate: "2025-03-31",
  },
]

export const TEACHER_PROFILE_MOCK: TeacherProfile = {
  id: "tch-042",
  institutionId: INSTITUTION_MOCK.id,
  employeeCode: "VNPS-TCH-042",
  fullName: "Dr. Ananya Sharma",
  email: "ananya.sharma@vidyaniketan.edu.in",
  phone: "+91 98450 21478",
  designation: "Senior PGT — Mathematics",
  departmentId: "dept-math",
  departmentName: "Department of Mathematics",
  qualification: "Ph.D. (Applied Mathematics), M.Sc., B.Ed.",
  specialization: "Algebra, Calculus & Olympiad Mentoring",
  experienceYears: 11,
  joiningDate: "2018-06-04",
  isClassTeacher: true,
  classTeacherOf: "Class 10 - A",
  subjectsHandled: ["Mathematics (10-A)", "Mathematics (10-B)", "Core Mathematics (11-A)"],
  officeRoom: "Staff Room 2, Academic Block B",
  bio: "Senior Mathematics faculty & Class Teacher for Grade 10-A, coordinating STEM Olympiad mentoring and CBSE board readiness.",
  status: "active",
}

export const CLASS_ALLOCATIONS_MOCK: ClassAllocation[] = [
  {
    id: "ca-10a",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: TEACHER_PROFILE_MOCK.id,
    classId: "cls-10",
    className: "Class 10",
    sectionId: "sec-10a",
    section: "A",
    role: "class_teacher",
    studentCount: 18,
    roomNo: "B-204",
    averageAttendancePercent: 94.2,
  },
  {
    id: "ca-10b",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: TEACHER_PROFILE_MOCK.id,
    classId: "cls-10",
    className: "Class 10",
    sectionId: "sec-10b",
    section: "B",
    role: "subject_teacher",
    studentCount: 16,
    roomNo: "B-205",
    averageAttendancePercent: 91.6,
  },
  {
    id: "ca-11a",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: TEACHER_PROFILE_MOCK.id,
    classId: "cls-11",
    className: "Class 11",
    sectionId: "sec-11a",
    section: "A",
    role: "subject_teacher",
    studentCount: 16,
    roomNo: "C-102",
    averageAttendancePercent: 89.8,
  },
]

export const SUBJECT_ALLOCATIONS_MOCK: SubjectAllocation[] = [
  {
    id: "sa-10a-math",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: TEACHER_PROFILE_MOCK.id,
    classId: "cls-10",
    className: "Class 10",
    sectionId: "sec-10a",
    section: "A",
    subjectId: "sub-math-10",
    subjectCode: "MATH-10",
    subjectName: "Mathematics",
    weeklyHours: 6,
    syllabusCompletionPercent: 74,
  },
  {
    id: "sa-10b-math",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: TEACHER_PROFILE_MOCK.id,
    classId: "cls-10",
    className: "Class 10",
    sectionId: "sec-10b",
    section: "B",
    subjectId: "sub-math-10",
    subjectCode: "MATH-10",
    subjectName: "Mathematics",
    weeklyHours: 6,
    syllabusCompletionPercent: 70,
  },
  {
    id: "sa-11a-math",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: TEACHER_PROFILE_MOCK.id,
    classId: "cls-11",
    className: "Class 11",
    sectionId: "sec-11a",
    section: "A",
    subjectId: "sub-math-11",
    subjectCode: "MATH-041",
    subjectName: "Core Mathematics",
    weeklyHours: 6,
    syllabusCompletionPercent: 62,
  },
]

interface SeedStudentSpec {
  fullName: string
  guardianName: string
  relation: "Father" | "Mother" | "Guardian"
  phone: string
  attendancePercent: number
  iaAverage: number
  house: string
}

const SECTION_10A_SEEDS: SeedStudentSpec[] = [
  { fullName: "Aarav Kulkarni", guardianName: "Rajesh Kulkarni", relation: "Father", phone: "+91 98451 10201", attendancePercent: 97, iaAverage: 88, house: "Ashoka" },
  { fullName: "Aditi Menon", guardianName: "Lakshmi Menon", relation: "Mother", phone: "+91 98451 10202", attendancePercent: 95, iaAverage: 92, house: "Tagore" },
  { fullName: "Akshay Deshmukh", guardianName: "Suresh Deshmukh", relation: "Father", phone: "+91 98451 10203", attendancePercent: 86, iaAverage: 86, house: "Raman" },
  { fullName: "Ananya Iyer", guardianName: "Subramanian Iyer", relation: "Father", phone: "+91 98451 10204", attendancePercent: 98, iaAverage: 94, house: "Sarojini" },
  { fullName: "Arjun Nair", guardianName: "Deepa Nair", relation: "Mother", phone: "+91 98451 10205", attendancePercent: 91, iaAverage: 84, house: "Ashoka" },
  { fullName: "Bhavna Reddy", guardianName: "Venkat Reddy", relation: "Father", phone: "+91 98451 10206", attendancePercent: 94, iaAverage: 85, house: "Tagore" },
  { fullName: "Chirag Joshi", guardianName: "Manoj Joshi", relation: "Father", phone: "+91 98451 10207", attendancePercent: 79, iaAverage: 72, house: "Raman" },
  { fullName: "Devika Krishnan", guardianName: "Ramesh Krishnan", relation: "Father", phone: "+91 98451 10208", attendancePercent: 96, iaAverage: 90, house: "Sarojini" },
  { fullName: "Eshan Verma", guardianName: "Pooja Verma", relation: "Mother", phone: "+91 98451 10209", attendancePercent: 89, iaAverage: 82, house: "Ashoka" },
  { fullName: "Gauri Chatterjee", guardianName: "Anirban Chatterjee", relation: "Father", phone: "+91 98451 10210", attendancePercent: 93, iaAverage: 84, house: "Tagore" },
  { fullName: "Harshvardhan Rao", guardianName: "Prakash Rao", relation: "Father", phone: "+91 98451 10211", attendancePercent: 72, iaAverage: 65, house: "Raman" },
  { fullName: "Ishita Gupta", guardianName: "Neha Gupta", relation: "Mother", phone: "+91 98451 10212", attendancePercent: 97, iaAverage: 91, house: "Sarojini" },
  { fullName: "Kabir Malhotra", guardianName: "Vikram Malhotra", relation: "Father", phone: "+91 98451 10213", attendancePercent: 88, iaAverage: 82, house: "Ashoka" },
  { fullName: "Kavya Srinivasan", guardianName: "Meenakshi Srinivasan", relation: "Mother", phone: "+91 98451 10214", attendancePercent: 99, iaAverage: 96, house: "Tagore" },
  { fullName: "Mihir Patwardhan", guardianName: "Ashwin Patwardhan", relation: "Father", phone: "+91 98451 10215", attendancePercent: 92, iaAverage: 83, house: "Raman" },
  { fullName: "Nandini Hegde", guardianName: "Ganesh Hegde", relation: "Father", phone: "+91 98451 10216", attendancePercent: 95, iaAverage: 87, house: "Sarojini" },
  { fullName: "Pranav Bhatia", guardianName: "Sunita Bhatia", relation: "Mother", phone: "+91 98451 10217", attendancePercent: 83, iaAverage: 76, house: "Ashoka" },
  { fullName: "Riya Banerjee", guardianName: "Soumya Banerjee", relation: "Father", phone: "+91 98451 10218", attendancePercent: 96, iaAverage: 86, house: "Tagore" },
]

const SECTION_10B_SEEDS: SeedStudentSpec[] = [
  { fullName: "Aditya Sengupta", guardianName: "Debashish Sengupta", relation: "Father", phone: "+91 98452 20101", attendancePercent: 93, iaAverage: 82, house: "Ashoka" },
  { fullName: "Bhoomi Shetty", guardianName: "Uday Shetty", relation: "Father", phone: "+91 98452 20102", attendancePercent: 96, iaAverage: 89, house: "Tagore" },
  { fullName: "Darshan Gowda", guardianName: "Mahesh Gowda", relation: "Father", phone: "+91 98452 20103", attendancePercent: 87, iaAverage: 75, house: "Raman" },
  { fullName: "Diya Pillai", guardianName: "Sreekumar Pillai", relation: "Father", phone: "+91 98452 20104", attendancePercent: 95, iaAverage: 88, house: "Sarojini" },
  { fullName: "Farhan Siddiqui", guardianName: "Imran Siddiqui", relation: "Father", phone: "+91 98452 20105", attendancePercent: 90, iaAverage: 78, house: "Ashoka" },
  { fullName: "Hamsini Murthy", guardianName: "Narasimha Murthy", relation: "Father", phone: "+91 98452 20106", attendancePercent: 97, iaAverage: 91, house: "Tagore" },
  { fullName: "Jayesh Mehta", guardianName: "Kiran Mehta", relation: "Mother", phone: "+91 98452 20107", attendancePercent: 84, iaAverage: 70, house: "Raman" },
  { fullName: "Keerthana Prasad", guardianName: "Raghu Prasad", relation: "Father", phone: "+91 98452 20108", attendancePercent: 94, iaAverage: 84, house: "Sarojini" },
  { fullName: "Lakshay Kapoor", guardianName: "Anil Kapoor", relation: "Father", phone: "+91 98452 20109", attendancePercent: 88, iaAverage: 74, house: "Ashoka" },
  { fullName: "Meera Subramanian", guardianName: "Vidya Subramanian", relation: "Mother", phone: "+91 98452 20110", attendancePercent: 98, iaAverage: 93, house: "Tagore" },
  { fullName: "Nikhil Kamath", guardianName: "Dinesh Kamath", relation: "Father", phone: "+91 98452 20111", attendancePercent: 91, iaAverage: 80, house: "Raman" },
  { fullName: "Pallavi Tiwari", guardianName: "Rakesh Tiwari", relation: "Father", phone: "+91 98452 20112", attendancePercent: 92, iaAverage: 81, house: "Sarojini" },
  { fullName: "Raghavendra Pai", guardianName: "Mohan Pai", relation: "Father", phone: "+91 98452 20113", attendancePercent: 74, iaAverage: 68, house: "Ashoka" },
  { fullName: "Sanjana Kulkarni", guardianName: "Shilpa Kulkarni", relation: "Mother", phone: "+91 98452 20114", attendancePercent: 95, iaAverage: 87, house: "Tagore" },
  { fullName: "Tarun Choudhary", guardianName: "Harish Choudhary", relation: "Father", phone: "+91 98452 20115", attendancePercent: 89, iaAverage: 76, house: "Raman" },
  { fullName: "Vaishnavi Agarwal", guardianName: "Sandeep Agarwal", relation: "Father", phone: "+91 98452 20116", attendancePercent: 96, iaAverage: 90, house: "Sarojini" },
]

const SECTION_11A_SEEDS: SeedStudentSpec[] = [
  { fullName: "Abhinav Bhattacharya", guardianName: "Subrata Bhattacharya", relation: "Father", phone: "+91 98453 30101", attendancePercent: 94, iaAverage: 85, house: "Ashoka" },
  { fullName: "Aishwarya Shenoy", guardianName: "Prashanth Shenoy", relation: "Father", phone: "+91 98453 30102", attendancePercent: 97, iaAverage: 91, house: "Tagore" },
  { fullName: "Aryan Saxena", guardianName: "Meera Saxena", relation: "Mother", phone: "+91 98453 30103", attendancePercent: 85, iaAverage: 72, house: "Raman" },
  { fullName: "Chaitanya Gokhale", guardianName: "Milind Gokhale", relation: "Father", phone: "+91 98453 30104", attendancePercent: 91, iaAverage: 80, house: "Sarojini" },
  { fullName: "Dhruv Acharya", guardianName: "Sanjay Acharya", relation: "Father", phone: "+91 98453 30105", attendancePercent: 88, iaAverage: 77, house: "Ashoka" },
  { fullName: "Gayatri Venkatesh", guardianName: "Radha Venkatesh", relation: "Mother", phone: "+91 98453 30106", attendancePercent: 96, iaAverage: 89, house: "Tagore" },
  { fullName: "Hrishikesh Pandey", guardianName: "Alok Pandey", relation: "Father", phone: "+91 98453 30107", attendancePercent: 82, iaAverage: 67, house: "Raman" },
  { fullName: "Jhanvi Nambiar", guardianName: "Vinod Nambiar", relation: "Father", phone: "+91 98453 30108", attendancePercent: 93, iaAverage: 84, house: "Sarojini" },
  { fullName: "Karthikeya Naidu", guardianName: "Srinivas Naidu", relation: "Father", phone: "+91 98453 30109", attendancePercent: 90, iaAverage: 79, house: "Ashoka" },
  { fullName: "Lavanya Deshpande", guardianName: "Anjali Deshpande", relation: "Mother", phone: "+91 98453 30110", attendancePercent: 95, iaAverage: 88, house: "Tagore" },
  { fullName: "Manav Khurana", guardianName: "Deepak Khurana", relation: "Father", phone: "+91 98453 30111", attendancePercent: 71, iaAverage: 63, house: "Raman" },
  { fullName: "Niharika Kashyap", guardianName: "Pankaj Kashyap", relation: "Father", phone: "+91 98453 30112", attendancePercent: 92, iaAverage: 83, house: "Sarojini" },
  { fullName: "Omkar Shinde", guardianName: "Vikas Shinde", relation: "Father", phone: "+91 98453 30113", attendancePercent: 89, iaAverage: 76, house: "Ashoka" },
  { fullName: "Prarthana Varma", guardianName: "Rekha Varma", relation: "Mother", phone: "+91 98453 30114", attendancePercent: 94, iaAverage: 86, house: "Tagore" },
  { fullName: "Siddharth Rajagopal", guardianName: "K. Rajagopal", relation: "Father", phone: "+91 98453 30115", attendancePercent: 91, iaAverage: 81, house: "Raman" },
  { fullName: "Tanvi Mishra", guardianName: "Vivek Mishra", relation: "Father", phone: "+91 98453 30116", attendancePercent: 96, iaAverage: 90, house: "Sarojini" },
]

function buildSectionRoster(
  seeds: SeedStudentSpec[],
  params: {
    classId: string
    className: string
    sectionId: string
    section: string
    rollPrefix: string
    admPrefix: string
  }
): StudentRosterItem[] {
  return seeds.map((seed, index) => {
    const seq = String(index + 1).padStart(2, "0")
    return {
      studentId: `stu-${params.sectionId}-${seq}`,
      rollNo: `${params.rollPrefix}${seq}`,
      admissionNo: `${params.admPrefix}${String(101 + index)}`,
      fullName: seed.fullName,
      classId: params.classId,
      className: params.className,
      sectionId: params.sectionId,
      section: params.section,
      attendancePercent: seed.attendancePercent,
      iaAverage: seed.iaAverage,
      guardianContact: {
        guardianName: seed.guardianName,
        relation: seed.relation,
        phone: seed.phone,
      },
      houseOrGroup: seed.house,
    }
  })
}

export const STUDENT_ROSTER_MOCK: StudentRosterItem[] = [
  ...buildSectionRoster(SECTION_10A_SEEDS, {
    classId: "cls-10",
    className: "Class 10",
    sectionId: "sec-10a",
    section: "A",
    rollPrefix: "10A-",
    admPrefix: "VNPS24-10A-",
  }),
  ...buildSectionRoster(SECTION_10B_SEEDS, {
    classId: "cls-10",
    className: "Class 10",
    sectionId: "sec-10b",
    section: "B",
    rollPrefix: "10B-",
    admPrefix: "VNPS24-10B-",
  }),
  ...buildSectionRoster(SECTION_11A_SEEDS, {
    classId: "cls-11",
    className: "Class 11",
    sectionId: "sec-11a",
    section: "A",
    rollPrefix: "11A-",
    admPrefix: "VNPS25-11A-",
  }),
]

export const TIMETABLE_MOCK: TimetableSlot[] = [
  // Monday
  { id: "tt-mon-1", institutionId: INSTITUTION_MOCK.id, academicYearId: "ay-2026-27", teacherId: TEACHER_PROFILE_MOCK.id, day: "Monday", period: 1, startTime: "08:30", endTime: "09:15", subjectCode: "MATH-10", subject: "Mathematics", classId: "cls-10", className: "Class 10", sectionId: "sec-10a", section: "A", room: "B-204", isSubstituted: false },
  { id: "tt-mon-2", institutionId: INSTITUTION_MOCK.id, academicYearId: "ay-2026-27", teacherId: TEACHER_PROFILE_MOCK.id, day: "Monday", period: 2, startTime: "09:15", endTime: "10:00", subjectCode: "MATH-10", subject: "Mathematics", classId: "cls-10", className: "Class 10", sectionId: "sec-10b", section: "B", room: "B-205", isSubstituted: false },
  { id: "tt-mon-4", institutionId: INSTITUTION_MOCK.id, academicYearId: "ay-2026-27", teacherId: TEACHER_PROFILE_MOCK.id, day: "Monday", period: 4, startTime: "11:00", endTime: "11:45", subjectCode: "MATH-041", subject: "Core Mathematics", classId: "cls-11", className: "Class 11", sectionId: "sec-11a", section: "A", room: "C-102", isSubstituted: false },
  { id: "tt-mon-6", institutionId: INSTITUTION_MOCK.id, academicYearId: "ay-2026-27", teacherId: TEACHER_PROFILE_MOCK.id, day: "Monday", period: 6, startTime: "13:15", endTime: "14:00", subjectCode: "MATH-10", subject: "Mathematics Lab", classId: "cls-10", className: "Class 10", sectionId: "sec-10a", section: "A", room: "Math Lab", isSubstituted: false, isLab: true },

  // Tuesday
  { id: "tt-tue-1", institutionId: INSTITUTION_MOCK.id, academicYearId: "ay-2026-27", teacherId: TEACHER_PROFILE_MOCK.id, day: "Tuesday", period: 1, startTime: "08:30", endTime: "09:15", subjectCode: "MATH-041", subject: "Core Mathematics", classId: "cls-11", className: "Class 11", sectionId: "sec-11a", section: "A", room: "C-102", isSubstituted: false },
  { id: "tt-tue-3", institutionId: INSTITUTION_MOCK.id, academicYearId: "ay-2026-27", teacherId: TEACHER_PROFILE_MOCK.id, day: "Tuesday", period: 3, startTime: "10:15", endTime: "11:00", subjectCode: "MATH-10", subject: "Mathematics", classId: "cls-10", className: "Class 10", sectionId: "sec-10a", section: "A", room: "B-204", isSubstituted: false },
  { id: "tt-tue-5", institutionId: INSTITUTION_MOCK.id, academicYearId: "ay-2026-27", teacherId: TEACHER_PROFILE_MOCK.id, day: "Tuesday", period: 5, startTime: "11:45", endTime: "12:30", subjectCode: "MATH-10", subject: "Mathematics", classId: "cls-10", className: "Class 10", sectionId: "sec-10b", section: "B", room: "B-205", isSubstituted: true, substitutedFor: "Mr. Rajesh Nair (On Leave)", notes: "Covering Quadratic Equations revision" },

  // Wednesday
  { id: "tt-wed-2", institutionId: INSTITUTION_MOCK.id, academicYearId: "ay-2026-27", teacherId: TEACHER_PROFILE_MOCK.id, day: "Wednesday", period: 2, startTime: "09:15", endTime: "10:00", subjectCode: "MATH-10", subject: "Mathematics", classId: "cls-10", className: "Class 10", sectionId: "sec-10a", section: "A", room: "B-204", isSubstituted: false },
  { id: "tt-wed-3", institutionId: INSTITUTION_MOCK.id, academicYearId: "ay-2026-27", teacherId: TEACHER_PROFILE_MOCK.id, day: "Wednesday", period: 3, startTime: "10:15", endTime: "11:00", subjectCode: "MATH-10", subject: "Mathematics", classId: "cls-10", className: "Class 10", sectionId: "sec-10b", section: "B", room: "B-205", isSubstituted: false },
  { id: "tt-wed-5", institutionId: INSTITUTION_MOCK.id, academicYearId: "ay-2026-27", teacherId: TEACHER_PROFILE_MOCK.id, day: "Wednesday", period: 5, startTime: "11:45", endTime: "12:30", subjectCode: "MATH-041", subject: "Core Mathematics", classId: "cls-11", className: "Class 11", sectionId: "sec-11a", section: "A", room: "C-102", isSubstituted: false },

  // Thursday
  { id: "tt-thu-1", institutionId: INSTITUTION_MOCK.id, academicYearId: "ay-2026-27", teacherId: TEACHER_PROFILE_MOCK.id, day: "Thursday", period: 1, startTime: "08:30", endTime: "09:15", subjectCode: "MATH-10", subject: "Mathematics", classId: "cls-10", className: "Class 10", sectionId: "sec-10b", section: "B", room: "B-205", isSubstituted: false },
  { id: "tt-thu-2", institutionId: INSTITUTION_MOCK.id, academicYearId: "ay-2026-27", teacherId: TEACHER_PROFILE_MOCK.id, day: "Thursday", period: 2, startTime: "09:15", endTime: "10:00", subjectCode: "MATH-041", subject: "Core Mathematics", classId: "cls-11", className: "Class 11", sectionId: "sec-11a", section: "A", room: "C-102", isSubstituted: false },
  { id: "tt-thu-4", institutionId: INSTITUTION_MOCK.id, academicYearId: "ay-2026-27", teacherId: TEACHER_PROFILE_MOCK.id, day: "Thursday", period: 4, startTime: "11:00", endTime: "11:45", subjectCode: "MATH-10", subject: "Mathematics", classId: "cls-10", className: "Class 10", sectionId: "sec-10a", section: "A", room: "B-204", isSubstituted: false },
  { id: "tt-thu-7", institutionId: INSTITUTION_MOCK.id, academicYearId: "ay-2026-27", teacherId: TEACHER_PROFILE_MOCK.id, day: "Thursday", period: 7, startTime: "14:00", endTime: "14:45", subjectCode: "MENTOR", subject: "Mentorship Hour", classId: "cls-10", className: "Class 10", sectionId: "sec-10a", section: "A", room: "B-204", isSubstituted: false },

  // Friday
  { id: "tt-fri-1", institutionId: INSTITUTION_MOCK.id, academicYearId: "ay-2026-27", teacherId: TEACHER_PROFILE_MOCK.id, day: "Friday", period: 1, startTime: "08:30", endTime: "09:15", subjectCode: "MATH-10", subject: "Mathematics", classId: "cls-10", className: "Class 10", sectionId: "sec-10a", section: "A", room: "B-204", isSubstituted: false },
  { id: "tt-fri-3", institutionId: INSTITUTION_MOCK.id, academicYearId: "ay-2026-27", teacherId: TEACHER_PROFILE_MOCK.id, day: "Friday", period: 3, startTime: "10:15", endTime: "11:00", subjectCode: "MATH-041", subject: "Core Mathematics", classId: "cls-11", className: "Class 11", sectionId: "sec-11a", section: "A", room: "C-102", isSubstituted: false },
  { id: "tt-fri-6", institutionId: INSTITUTION_MOCK.id, academicYearId: "ay-2026-27", teacherId: TEACHER_PROFILE_MOCK.id, day: "Friday", period: 6, startTime: "13:15", endTime: "14:00", subjectCode: "MATH-10", subject: "Mathematics", classId: "cls-10", className: "Class 10", sectionId: "sec-10b", section: "B", room: "B-205", isSubstituted: false },

  // Saturday
  { id: "tt-sat-2", institutionId: INSTITUTION_MOCK.id, academicYearId: "ay-2026-27", teacherId: TEACHER_PROFILE_MOCK.id, day: "Saturday", period: 2, startTime: "09:15", endTime: "10:00", subjectCode: "MATH-10", subject: "Mathematics", classId: "cls-10", className: "Class 10", sectionId: "sec-10a", section: "A", room: "B-204", isSubstituted: false },
  { id: "tt-sat-3", institutionId: INSTITUTION_MOCK.id, academicYearId: "ay-2026-27", teacherId: TEACHER_PROFILE_MOCK.id, day: "Saturday", period: 3, startTime: "10:15", endTime: "11:00", subjectCode: "MATH-041", subject: "Olympiad / Doubt Clinic", classId: "cls-11", className: "Class 11", sectionId: "sec-11a", section: "A", room: "C-102", isSubstituted: false },
]

function buildAttendanceSession(params: {
  id: string
  classId: string
  className: string
  sectionId: string
  section: string
  subjectId: string
  subjectName: string
  date: string
  period: number
  status: "draft" | "submitted" | "locked"
  editWindowOpen: boolean
  absentIndices?: number[]
  lateIndices?: number[]
  onDutyIndices?: number[]
}): AttendanceSession {
  const roster = STUDENT_ROSTER_MOCK.filter(
    (s) => s.sectionId === params.sectionId
  )
  const absentSet = new Set(params.absentIndices ?? [])
  const lateSet = new Set(params.lateIndices ?? [])
  const onDutySet = new Set(params.onDutyIndices ?? [])

  const records = roster.map((student, idx) => {
    const status = absentSet.has(idx)
      ? ("absent" as const)
      : lateSet.has(idx)
        ? ("late" as const)
        : onDutySet.has(idx)
          ? ("on_duty" as const)
          : ("present" as const)
    return {
      id: `${params.id}-rec-${idx + 1}`,
      sessionId: params.id,
      studentId: student.studentId,
      rollNo: student.rollNo,
      studentName: student.fullName,
      status,
      remarks:
        status === "on_duty"
          ? "Inter-school Science Quiz"
          : status === "late"
            ? "Arrived 10 mins late"
            : undefined,
      markedAt: `${params.date}T08:40:00+05:30`,
    }
  })

  const presentCount = records.filter((r) => r.status === "present").length
  const absentCount = records.filter((r) => r.status === "absent").length
  const lateCount = records.filter((r) => r.status === "late").length
  const onDutyCount = records.filter((r) => r.status === "on_duty").length

  return {
    id: params.id,
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: TEACHER_PROFILE_MOCK.id,
    classId: params.classId,
    className: params.className,
    sectionId: params.sectionId,
    section: params.section,
    subjectId: params.subjectId,
    subjectName: params.subjectName,
    date: params.date,
    period: params.period,
    totalStudents: records.length,
    presentCount,
    absentCount,
    lateCount,
    onDutyCount,
    status: params.status,
    editWindowOpen: params.editWindowOpen,
    editWindowClosesAt: params.editWindowOpen
      ? `${params.date}T17:00:00+05:30`
      : undefined,
    records,
    auditHistory: [
      {
        id: `${params.id}-aud-1`,
        timestamp: `${params.date}T08:40:00+05:30`,
        actorId: TEACHER_PROFILE_MOCK.id,
        actorName: TEACHER_PROFILE_MOCK.fullName,
        action: params.status === "locked" ? "locked" : "submitted",
        summary: `Marked ${presentCount} present, ${absentCount} absent, ${lateCount} late, ${onDutyCount} on-duty.`,
      },
    ],
  }
}

export const ATTENDANCE_SESSIONS_MOCK: AttendanceSession[] = [
  buildAttendanceSession({
    id: "att-10a-20261112",
    classId: "cls-10",
    className: "Class 10",
    sectionId: "sec-10a",
    section: "A",
    subjectId: "sub-math-10",
    subjectName: "Mathematics",
    date: "2026-11-12",
    period: 1,
    status: "submitted",
    editWindowOpen: true,
    absentIndices: [10],
    lateIndices: [6],
    onDutyIndices: [3],
  }),
  buildAttendanceSession({
    id: "att-10b-20261112",
    classId: "cls-10",
    className: "Class 10",
    sectionId: "sec-10b",
    section: "B",
    subjectId: "sub-math-10",
    subjectName: "Mathematics",
    date: "2026-11-12",
    period: 2,
    status: "draft",
    editWindowOpen: true,
    absentIndices: [6, 12],
  }),
  buildAttendanceSession({
    id: "att-11a-20261111",
    classId: "cls-11",
    className: "Class 11",
    sectionId: "sec-11a",
    section: "A",
    subjectId: "sub-math-11",
    subjectName: "Core Mathematics",
    date: "2026-11-11",
    period: 4,
    status: "locked",
    editWindowOpen: false,
    absentIndices: [10],
    lateIndices: [2],
  }),
  buildAttendanceSession({
    id: "att-10a-20261110",
    classId: "cls-10",
    className: "Class 10",
    sectionId: "sec-10a",
    section: "A",
    subjectId: "sub-math-10",
    subjectName: "Mathematics",
    date: "2026-11-10",
    period: 3,
    status: "submitted",
    editWindowOpen: false,
    absentIndices: [6, 10],
    onDutyIndices: [1],
  }),
  buildAttendanceSession({
    id: "att-10b-20261111",
    classId: "cls-10",
    className: "Class 10",
    sectionId: "sec-10b",
    section: "B",
    subjectId: "sub-math-10",
    subjectName: "Mathematics",
    date: "2026-11-11",
    period: 3,
    status: "submitted",
    editWindowOpen: true,
    absentIndices: [12],
    lateIndices: [8],
  }),
]

function buildAssessmentMarks(
  assessmentId: string,
  sectionId: string,
  componentName: string,
  maxMarks: number,
  status: InternalAssessment["status"]
) {
  const roster = STUDENT_ROSTER_MOCK.filter((s) => s.sectionId === sectionId)
  return roster.map((student, idx) => {
    const isAbsent = idx === 10 && assessmentId === "ia-10a-ut2"
    const scaled = Math.min(
      maxMarks,
      Math.max(
        Math.round((student.iaAverage / 100) * maxMarks) + ((idx % 3) - 1),
        Math.round(maxMarks * 0.4)
      )
    )
    return {
      id: `${assessmentId}-m-${idx + 1}`,
      assessmentId,
      studentId: student.studentId,
      rollNo: student.rollNo,
      studentName: student.fullName,
      componentName,
      maxMarks,
      obtainedMarks: isAbsent ? null : scaled,
      isAbsent,
      status,
    }
  })
}

export const INTERNAL_ASSESSMENTS_MOCK: InternalAssessment[] = [
  {
    id: "ia-10a-ut1",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: TEACHER_PROFILE_MOCK.id,
    classId: "cls-10",
    className: "Class 10",
    sectionId: "sec-10a",
    section: "A",
    subjectId: "sub-math-10",
    subjectName: "Mathematics",
    title: "Periodic Test 1 — Algebra & Polynomials",
    componentName: "PT-1",
    maxMarks: 40,
    passingMarks: 14,
    weightagePercent: 20,
    conductedDate: "2026-09-18",
    status: "approved",
    marks: buildAssessmentMarks("ia-10a-ut1", "sec-10a", "PT-1", 40, "approved"),
  },
  {
    id: "ia-10a-ut2",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: TEACHER_PROFILE_MOCK.id,
    classId: "cls-10",
    className: "Class 10",
    sectionId: "sec-10a",
    section: "A",
    subjectId: "sub-math-10",
    subjectName: "Mathematics",
    title: "Periodic Test 2 — Quadratic Equations & AP",
    componentName: "PT-2",
    maxMarks: 40,
    passingMarks: 14,
    weightagePercent: 20,
    conductedDate: "2026-11-04",
    status: "draft",
    marks: buildAssessmentMarks("ia-10a-ut2", "sec-10a", "PT-2", 40, "draft"),
  },
  {
    id: "ia-11a-ia1",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: TEACHER_PROFILE_MOCK.id,
    classId: "cls-11",
    className: "Class 11",
    sectionId: "sec-11a",
    section: "A",
    subjectId: "sub-math-11",
    subjectName: "Core Mathematics",
    title: "Internal Assessment 1 — Sets, Relations & Trigonometry",
    componentName: "IA-1",
    maxMarks: 25,
    passingMarks: 9,
    weightagePercent: 25,
    conductedDate: "2026-10-22",
    status: "submitted",
    marks: buildAssessmentMarks("ia-11a-ia1", "sec-11a", "IA-1", 25, "submitted"),
  },
  {
    id: "ia-10b-lab",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: TEACHER_PROFILE_MOCK.id,
    classId: "cls-10",
    className: "Class 10",
    sectionId: "sec-10b",
    section: "B",
    subjectId: "sub-math-10",
    subjectName: "Mathematics",
    title: "Term 1 Mathematics Lab Activity & Viva",
    componentName: "Lab Test",
    maxMarks: 20,
    passingMarks: 7,
    weightagePercent: 10,
    conductedDate: "2026-09-28",
    status: "locked",
    publishedToStudents: true,
    marks: buildAssessmentMarks("ia-10b-lab", "sec-10b", "Lab Test", 20, "locked"),
  },
  {
    id: "ia-10b-pt1",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: TEACHER_PROFILE_MOCK.id,
    classId: "cls-10",
    className: "Class 10",
    sectionId: "sec-10b",
    section: "B",
    subjectId: "sub-math-10",
    subjectName: "Mathematics",
    title: "Periodic Test 1 — Polynomials & Linear Equations",
    componentName: "PT-1",
    maxMarks: 40,
    passingMarks: 14,
    weightagePercent: 20,
    conductedDate: "2026-09-19",
    status: "returned",
    correctionNote:
      "HoD requested re-verification of Roll No. 10B-07 & 10B-13 grace mark entries.",
    marks: buildAssessmentMarks("ia-10b-pt1", "sec-10b", "PT-1", 40, "returned"),
  },
]

export const ASSIGNMENTS_MOCK: Assignment[] = [
  {
    id: "asg-10a-01",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: TEACHER_PROFILE_MOCK.id,
    classId: "cls-10",
    className: "Class 10",
    sectionId: "sec-10a",
    section: "A",
    subjectId: "sub-math-10",
    subjectName: "Mathematics",
    title: "Quadratic Equations — Word Problems Set",
    description:
      "Solve all 12 application problems from Exercise 4.3 showing discriminant checks and final units.",
    unit: "Unit 4: Quadratic Equations",
    dueDate: "2026-11-16",
    maxMarks: 20,
    status: "published",
    totalStudents: 18,
    submittedCount: 14,
    gradedCount: 9,
    createdAt: "2026-11-06",
  },
  {
    id: "asg-10b-01",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: TEACHER_PROFILE_MOCK.id,
    classId: "cls-10",
    className: "Class 10",
    sectionId: "sec-10b",
    section: "B",
    subjectId: "sub-math-10",
    subjectName: "Mathematics",
    title: "Arithmetic Progressions — Case Study Worksheet",
    description:
      "Complete the 3 CBSE competency-based case study questions on nth term and sum of n terms.",
    unit: "Unit 5: Arithmetic Progressions",
    dueDate: "2026-11-18",
    maxMarks: 20,
    status: "published",
    totalStudents: 16,
    submittedCount: 10,
    gradedCount: 4,
    createdAt: "2026-11-08",
  },
  {
    id: "asg-11a-01",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: TEACHER_PROFILE_MOCK.id,
    classId: "cls-11",
    className: "Class 11",
    sectionId: "sec-11a",
    section: "A",
    subjectId: "sub-math-11",
    subjectName: "Core Mathematics",
    title: "Limits & Derivatives — Practice Sheet",
    description:
      "Evaluate algebraic and trigonometric limits using standard identities and first principles.",
    unit: "Unit 6: Calculus",
    dueDate: "2026-11-20",
    maxMarks: 25,
    status: "draft",
    totalStudents: 16,
    submittedCount: 0,
    gradedCount: 0,
    createdAt: "2026-11-11",
  },
]

export const ASSIGNMENT_SUBMISSIONS_MOCK: AssignmentSubmission[] = STUDENT_ROSTER_MOCK.filter(
  (s) => s.sectionId === "sec-10a"
).map((student, idx) => {
  const isPending = idx >= 14
  const isGraded = idx < 9
  const isLate = idx === 13
  return {
    id: `sub-asg10a-${idx + 1}`,
    assignmentId: "asg-10a-01",
    studentId: student.studentId,
    rollNo: student.rollNo,
    studentName: student.fullName,
    submittedAt: isPending ? undefined : `2026-11-${10 + (idx % 4)}T17:20:00+05:30`,
    fileName: isPending ? undefined : `${student.rollNo}_Quadratic_Problems.pdf`,
    fileUrl: isPending ? undefined : `/uploads/assignments/${student.rollNo}_quadratic.pdf`,
    status: isPending
      ? "pending"
      : isGraded
        ? "graded"
        : isLate
          ? "late"
          : "submitted",
    obtainedMarks: isGraded ? Math.min(20, Math.max(12, Math.round(student.iaAverage / 5))) : null,
    feedback: isGraded ? "Clear step-by-step derivation." : undefined,
    gradedAt: isGraded ? "2026-11-11T15:10:00+05:30" : undefined,
  }
})

export const LEARNING_MATERIALS_MOCK: LearningMaterial[] = [
  {
    id: "lm-01",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: TEACHER_PROFILE_MOCK.id,
    classId: "cls-10",
    className: "Class 10",
    section: "A & B",
    subjectId: "sub-math-10",
    subjectName: "Mathematics",
    unit: "Unit 4: Quadratic Equations",
    title: "Quadratic Formula & Nature of Roots — Lecture Notes",
    description: "Annotated summary sheet with solved board questions (2021–2025).",
    type: "pdf",
    fileUrl: "/materials/class10-quadratic-notes.pdf",
    fileSizeLabel: "1.8 MB",
    isPublished: true,
    uploadedAt: "2026-11-02",
  },
  {
    id: "lm-02",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: TEACHER_PROFILE_MOCK.id,
    classId: "cls-10",
    className: "Class 10",
    section: "A & B",
    subjectId: "sub-math-10",
    subjectName: "Mathematics",
    unit: "Unit 5: Arithmetic Progressions",
    title: "Visualizing Sum of First n Terms (Video Walkthrough)",
    description: "12-minute conceptual walkthrough before class activity.",
    type: "video",
    fileUrl: "https://example.edu/videos/ap-sum-derivation",
    isPublished: true,
    uploadedAt: "2026-11-07",
  },
  {
    id: "lm-03",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: TEACHER_PROFILE_MOCK.id,
    classId: "cls-11",
    className: "Class 11",
    section: "A",
    subjectId: "sub-math-11",
    subjectName: "Core Mathematics",
    unit: "Unit 6: Calculus",
    title: "Desmos Interactive Graph — Secant to Tangent Slope",
    description: "Interactive link to inspect limiting slope behavior.",
    type: "link",
    fileUrl: "https://www.desmos.com/calculator",
    isPublished: true,
    uploadedAt: "2026-11-09",
  },
  {
    id: "lm-04",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: TEACHER_PROFILE_MOCK.id,
    classId: "cls-11",
    className: "Class 11",
    section: "A",
    subjectId: "sub-math-11",
    subjectName: "Core Mathematics",
    unit: "Unit 6: Calculus",
    title: "Standard Trigonometric Limits Cheat Sheet",
    description: "Quick revision formula card for weekly quiz prep.",
    type: "note",
    fileUrl: "/materials/class11-trig-limits-note.md",
    isPublished: false,
    uploadedAt: "2026-11-11",
  },
]

export const QUIZZES_MOCK: Quiz[] = [
  {
    id: "quiz-10a-01",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: TEACHER_PROFILE_MOCK.id,
    classId: "cls-10",
    className: "Class 10",
    sectionId: "sec-10a",
    section: "A",
    subjectId: "sub-math-10",
    subjectName: "Mathematics",
    title: "Quick Check: Discriminant & Roots",
    description: "15-minute formative MCQ check on quadratic discriminants.",
    durationMinutes: 15,
    totalMarks: 10,
    scheduledAt: "2026-11-10T10:15:00+05:30",
    closesAt: "2026-11-14T20:00:00+05:30",
    status: "published",
    attemptCount: 15,
    totalStudents: 18,
    questions: [
      {
        id: "qq-1",
        quizId: "quiz-10a-01",
        questionNumber: 1,
        prompt: "If b² - 4ac = 0 for a quadratic equation ax² + bx + c = 0 (a ≠ 0), the roots are:",
        questionType: "mcq",
        options: [
          "Real and distinct",
          "Real and equal",
          "No real roots",
          "Reciprocal to each other",
        ],
        correctAnswer: "Real and equal",
        marks: 2,
      },
      {
        id: "qq-2",
        quizId: "quiz-10a-01",
        questionNumber: 2,
        prompt: "For x² - 5x + 6 = 0, the sum of the roots is 5.",
        questionType: "true_false",
        options: ["True", "False"],
        correctAnswer: "True",
        marks: 2,
      },
    ],
  },
  {
    id: "quiz-11a-01",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: TEACHER_PROFILE_MOCK.id,
    classId: "cls-11",
    className: "Class 11",
    sectionId: "sec-11a",
    section: "A",
    subjectId: "sub-math-11",
    subjectName: "Core Mathematics",
    title: "Limits & Continuity Readiness Quiz",
    durationMinutes: 20,
    totalMarks: 15,
    scheduledAt: "2026-11-15T09:00:00+05:30",
    closesAt: "2026-11-17T18:00:00+05:30",
    status: "draft",
    attemptCount: 0,
    totalStudents: 16,
    questions: [
      {
        id: "qq-3",
        quizId: "quiz-11a-01",
        questionNumber: 1,
        prompt: "Evaluate lim (x → 0) sin(3x) / x.",
        questionType: "mcq",
        options: ["0", "1", "3", "Does not exist"],
        correctAnswer: "3",
        marks: 3,
      },
    ],
  },
]

export const QUIZ_SUBMISSIONS_MOCK: QuizSubmission[] = STUDENT_ROSTER_MOCK.filter(
  (s) => s.sectionId === "sec-10a"
)
  .slice(0, 15)
  .map((student, idx) => ({
    id: `qsub-10a-${idx + 1}`,
    quizId: "quiz-10a-01",
    studentId: student.studentId,
    rollNo: student.rollNo,
    studentName: student.fullName,
    startedAt: "2026-11-10T10:16:00+05:30",
    submittedAt: "2026-11-10T10:28:00+05:30",
    score: Math.min(10, Math.max(5, Math.round(student.iaAverage / 10))),
    totalMarks: 10,
    status: "graded",
    answers: {
      "qq-1": "Real and equal",
      "qq-2": "True",
    },
  }))

export const EXAM_DUTIES_MOCK: ExamDuty[] = [
  {
    id: "ed-01",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: TEACHER_PROFILE_MOCK.id,
    examName: "Pre-Board Examination I",
    examDate: "2026-11-24",
    session: "Morning",
    startTime: "09:00",
    endTime: "12:15",
    roomNo: "Hall A-101",
    dutyRole: "Invigilator",
    className: "Class 10",
    subjectName: "Science",
    status: "assigned",
  },
  {
    id: "ed-02",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: TEACHER_PROFILE_MOCK.id,
    examName: "Pre-Board Examination I",
    examDate: "2026-11-27",
    session: "Morning",
    startTime: "09:00",
    endTime: "12:15",
    roomNo: "Exam Control Room",
    dutyRole: "Evaluator",
    className: "Class 10",
    subjectName: "Mathematics",
    status: "assigned",
  },
  {
    id: "ed-03",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: TEACHER_PROFILE_MOCK.id,
    examName: "Mid-Term Assessment",
    examDate: "2026-10-08",
    session: "Morning",
    startTime: "09:00",
    endTime: "12:00",
    roomNo: "B-204",
    dutyRole: "Chief Invigilator",
    className: "Class 10",
    subjectName: "Social Science",
    status: "completed",
  },
]

export const EXAM_SCHEDULE_MOCK: ExamScheduleItem[] = [
  {
    id: "es-01",
    examName: "Pre-Board Examination I",
    examDate: "2026-11-24",
    startTime: "09:00",
    endTime: "12:15",
    className: "Class 10",
    section: "A & B",
    subjectCode: "SCI-086",
    subjectName: "Science",
    maxMarks: 80,
    passingMarks: 27,
    roomNo: "Hall A-101",
  },
  {
    id: "es-02",
    examName: "Pre-Board Examination I",
    examDate: "2026-11-27",
    startTime: "09:00",
    endTime: "12:15",
    className: "Class 10",
    section: "A & B",
    subjectCode: "MATH-041",
    subjectName: "Mathematics (Standard)",
    maxMarks: 80,
    passingMarks: 27,
    roomNo: "Hall A-101 / A-102",
  },
]

function computeGrade(percent: number): string {
  if (percent >= 91) return "A1"
  if (percent >= 81) return "A2"
  if (percent >= 71) return "B1"
  if (percent >= 61) return "B2"
  if (percent >= 51) return "C1"
  if (percent >= 41) return "C2"
  if (percent >= 33) return "D"
  return "E"
}

export const RESULT_ENTRIES_MOCK: ResultEntry[] = [
  {
    id: "res-10a-midterm",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: TEACHER_PROFILE_MOCK.id,
    examName: "Mid-Term Examination (Term 1)",
    classId: "cls-10",
    className: "Class 10",
    sectionId: "sec-10a",
    section: "A",
    subjectId: "sub-math-10",
    subjectName: "Mathematics",
    maxTheoryMarks: 80,
    maxPracticalMarks: 20,
    maxTotalMarks: 100,
    entryStatus: "approved",
    publicationStatus: "published",
    submissionDeadline: "2026-10-18",
    lastUpdatedAt: "2026-10-16T16:30:00+05:30",
    rows: STUDENT_ROSTER_MOCK.filter((s) => s.sectionId === "sec-10a").map(
      (student) => {
        const theory = Math.min(80, Math.max(32, Math.round(student.iaAverage * 0.8)))
        const practical = Math.min(20, Math.max(13, Math.round(student.iaAverage * 0.2)))
        const total = theory + practical
        return {
          studentId: student.studentId,
          rollNo: student.rollNo,
          studentName: student.fullName,
          theoryMarks: theory,
          practicalMarks: practical,
          totalMarks: total,
          grade: computeGrade(total),
        }
      }
    ),
  },
  {
    id: "res-10b-midterm",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: TEACHER_PROFILE_MOCK.id,
    examName: "Mid-Term Examination (Term 1)",
    classId: "cls-10",
    className: "Class 10",
    sectionId: "sec-10b",
    section: "B",
    subjectId: "sub-math-10",
    subjectName: "Mathematics",
    maxTheoryMarks: 80,
    maxPracticalMarks: 20,
    maxTotalMarks: 100,
    entryStatus: "draft",
    publicationStatus: "draft",
    submissionDeadline: "2026-11-18",
    lastUpdatedAt: "2026-11-10T11:20:00+05:30",
    rows: STUDENT_ROSTER_MOCK.filter((s) => s.sectionId === "sec-10b").map(
      (student, idx) => {
        const theory =
          idx < 12
            ? Math.min(80, Math.max(30, Math.round(student.iaAverage * 0.78)))
            : null
        const practical =
          idx < 12
            ? Math.min(20, Math.max(12, Math.round(student.iaAverage * 0.2)))
            : null
        const total =
          theory !== null && practical !== null ? theory + practical : null
        return {
          studentId: student.studentId,
          rollNo: student.rollNo,
          studentName: student.fullName,
          theoryMarks: theory,
          practicalMarks: practical,
          totalMarks: total,
          grade: total !== null ? computeGrade(total) : undefined,
        }
      }
    ),
  },
]

export const MENTEES_MOCK: Mentee[] = [
  STUDENT_ROSTER_MOCK[10], // Harshvardhan Rao (72% att, 58 IA)
  STUDENT_ROSTER_MOCK[6],  // Chirag Joshi (79% att, 66 IA)
  STUDENT_ROSTER_MOCK[16], // Pranav Bhatia (83% att, 69 IA)
  STUDENT_ROSTER_MOCK[2],  // Akshay Deshmukh (86% att, 74 IA)
  STUDENT_ROSTER_MOCK[0],  // Aarav Kulkarni (97% att, 88 IA)
  STUDENT_ROSTER_MOCK[13], // Kavya Srinivasan (99% att, 96 IA)
].map((student) => ({
  id: `mentee-${student.studentId}`,
  institutionId: INSTITUTION_MOCK.id,
  academicYearId: "ay-2026-27",
  mentorTeacherId: TEACHER_PROFILE_MOCK.id,
  studentId: student.studentId,
  rollNo: student.rollNo,
  admissionNo: student.admissionNo,
  fullName: student.fullName,
  className: student.className,
  section: student.section,
  attendancePercent: student.attendancePercent,
  iaAverage: student.iaAverage,
  iaTrend:
    student.iaAverage < 65
      ? ("down" as const)
      : student.iaAverage >= 85
        ? ("up" as const)
        : ("stable" as const),
  riskLevel:
    student.attendancePercent < 75 || student.iaAverage < 60
      ? "at_risk"
      : student.attendancePercent < 85 || student.iaAverage < 75
        ? "watch"
        : "on_track",
  guardianContact: student.guardianContact,
  lastSessionDate: "2026-11-05",
  notesSummary:
    student.attendancePercent < 75
      ? "Follow up on recent absences & extra doubt-clearing sessions."
      : "Steady progress; encourage participation in Math Olympiad practice.",
  confidentialNotes:
    student.attendancePercent < 75
      ? "Parent shared that student missed 4 school days due to seasonal viral fever; recommended bridge worksheets."
      : undefined,
}))

export const MENTORING_SESSIONS_MOCK: MentoringSession[] = [
  {
    id: "ms-01",
    menteeId: MENTEES_MOCK[0].id,
    studentId: MENTEES_MOCK[0].studentId,
    studentName: MENTEES_MOCK[0].fullName,
    mentorTeacherId: TEACHER_PROFILE_MOCK.id,
    sessionDate: "2026-11-05",
    mode: "parent_call",
    topic: "Attendance Recovery & PT-2 Preparation",
    observations:
      "Missed 4 days due to viral fever in October; catching up on Quadratic Equations.",
    actionItems: [
      "Attend Tuesday remedial clinic (3:00 PM)",
      "Submit pending Exercise 4.2 worksheet by Friday",
    ],
    followUpDate: "2026-11-19",
    status: "completed",
  },
  {
    id: "ms-02",
    menteeId: MENTEES_MOCK[1].id,
    studentId: MENTEES_MOCK[1].studentId,
    studentName: MENTEES_MOCK[1].fullName,
    mentorTeacherId: TEACHER_PROFILE_MOCK.id,
    sessionDate: "2026-11-14",
    mode: "in_person",
    topic: "Mid-Term Error Analysis & Time Management",
    observations: "Lost marks mainly on calculation speed in Section C.",
    actionItems: ["Timed 30-minute practice sets twice a week"],
    followUpDate: "2026-11-21",
    status: "scheduled",
  },
]

export const LOGBOOK_ENTRIES_MOCK: LogBookEntry[] = [
  {
    id: "lb-01",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: TEACHER_PROFILE_MOCK.id,
    date: "2026-11-12",
    period: 1,
    classId: "cls-10",
    className: "Class 10",
    section: "A",
    subjectId: "sub-math-10",
    subjectName: "Mathematics",
    unit: "Unit 5: Arithmetic Progressions",
    topicCovered: "Derivation of Sum of First n Terms (Sn) with Board Examples",
    teachingMethod: "Interactive",
    homeworkAssigned: "Exercise 5.3 Q1–Q6",
    syllabusProgressPercent: 74,
    status: "submitted",
  },
  {
    id: "lb-02",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: TEACHER_PROFILE_MOCK.id,
    date: "2026-11-11",
    period: 4,
    classId: "cls-11",
    className: "Class 11",
    section: "A",
    subjectId: "sub-math-11",
    subjectName: "Core Mathematics",
    unit: "Unit 6: Calculus",
    topicCovered: "Sandwich Theorem & Standard Trigonometric Limits",
    teachingMethod: "Lecture",
    homeworkAssigned: "NCERT Ex 13.1 Q13–Q22",
    syllabusProgressPercent: 62,
    status: "approved",
    verifiedBy: "HoD Mathematics",
  },
]

export const TEACHER_LEAVE_REQUESTS_MOCK: TeacherLeaveRequest[] = [
  {
    id: "tlr-01",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: TEACHER_PROFILE_MOCK.id,
    teacherName: TEACHER_PROFILE_MOCK.fullName,
    leaveType: "Academic Leave",
    fromDate: "2026-11-20",
    toDate: "2026-11-20",
    daysCount: 1,
    reason: "CBSE Regional Mathematics Pedagogy Workshop at Koramangala.",
    substituteTeacherName: "Mr. Arvind Bhat",
    handoverNotes: "10-A worksheet packets placed in Staff Room locker #12.",
    appliedAt: "2026-11-09",
    status: "approved",
    reviewedBy: "Principal",
    reviewerRemarks: "Approved as academic deputation.",
  },
  {
    id: "tlr-02",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: TEACHER_PROFILE_MOCK.id,
    teacherName: TEACHER_PROFILE_MOCK.fullName,
    leaveType: "Casual Leave",
    fromDate: "2026-12-04",
    toDate: "2026-12-05",
    daysCount: 2,
    reason: "Family wedding out of station (Mysuru).",
    substituteTeacherName: "Ms. Shreya Kulkarni",
    appliedAt: "2026-11-11",
    status: "in_review",
    reviewedBy: "Principal",
    reviewerRemarks: "Routed to Principal (HoD self-application)",
  },
  {
    id: "tlr-03",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: "teacher_demo_089",
    teacherName: "Prof. Rajesh Verma",
    leaveType: "Sick Leave",
    fromDate: "2026-11-25",
    toDate: "2026-11-26",
    daysCount: 2,
    reason: "Medical consultation and recovery.",
    substituteTeacherName: "Mr. Arvind Deshpande",
    handoverNotes: "Class 10-B trigonometry test papers kept on desk.",
    appliedAt: "2026-11-18",
    status: "submitted",
  },
  {
    id: "tlr-04",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    teacherId: "tch-math-03",
    teacherName: "Ms. Nandini Iyer",
    leaveType: "Casual Leave",
    fromDate: "2026-11-28",
    toDate: "2026-11-28",
    daysCount: 1,
    reason: "Personal family obligation.",
    substituteTeacherName: "Mr. Rohan Kulkarni",
    appliedAt: "2026-11-19",
    status: "submitted",
  },
]

export const STUDENT_LEAVE_REQUESTS_MOCK: StudentLeaveRequest[] = [
  {
    id: "slr-01",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    studentId: STUDENT_ROSTER_MOCK[10].studentId,
    rollNo: STUDENT_ROSTER_MOCK[10].rollNo,
    studentName: STUDENT_ROSTER_MOCK[10].fullName,
    className: "Class 10",
    section: "A",
    leaveType: "Medical",
    fromDate: "2026-11-12",
    toDate: "2026-11-13",
    daysCount: 2,
    reason: "Recovering from seasonal fever; doctor advised two days rest.",
    guardianName: STUDENT_ROSTER_MOCK[10].guardianContact.guardianName,
    guardianPhone: STUDENT_ROSTER_MOCK[10].guardianContact.phone,
    appliedAt: "2026-11-12",
    status: "pending",
  },
  {
    id: "slr-02",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    studentId: STUDENT_ROSTER_MOCK[3].studentId,
    rollNo: STUDENT_ROSTER_MOCK[3].rollNo,
    studentName: STUDENT_ROSTER_MOCK[3].fullName,
    className: "Class 10",
    section: "A",
    leaveType: "On-Duty",
    fromDate: "2026-11-12",
    toDate: "2026-11-12",
    daysCount: 1,
    reason: "Representing school at District Inter-School Science Quiz.",
    guardianName: STUDENT_ROSTER_MOCK[3].guardianContact.guardianName,
    guardianPhone: STUDENT_ROSTER_MOCK[3].guardianContact.phone,
    appliedAt: "2026-11-10",
    status: "approved",
    reviewedBy: TEACHER_PROFILE_MOCK.fullName,
    reviewerRemarks: "Marked On-Duty for Period 1–7.",
  },
  {
    id: "slr-03",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    studentId: STUDENT_ROSTER_MOCK[6].studentId,
    rollNo: STUDENT_ROSTER_MOCK[6].rollNo,
    studentName: STUDENT_ROSTER_MOCK[6].fullName,
    className: "Class 10",
    section: "A",
    leaveType: "Family",
    fromDate: "2026-11-15",
    toDate: "2026-11-15",
    daysCount: 1,
    reason: "Attending grandparent's milestone ceremony in Hubballi.",
    guardianName: STUDENT_ROSTER_MOCK[6].guardianContact.guardianName,
    guardianPhone: STUDENT_ROSTER_MOCK[6].guardianContact.phone,
    appliedAt: "2026-11-11",
    status: "pending",
  },
]

export const NOTIFICATIONS_MOCK: NotificationItem[] = [
  {
    id: "notif-01",
    institutionId: INSTITUTION_MOCK.id,
    title: "2 Student Leave Requests Pending",
    message: "Harshvardhan Rao and Chirag Joshi (10-A) have requested leave approval.",
    category: "leave",
    createdAt: "2026-11-12T08:15:00+05:30",
    isRead: false,
    actionHref: "/campus/demo-school/teacher/leave",
  },
  {
    id: "notif-02",
    institutionId: INSTITUTION_MOCK.id,
    title: "Attendance Draft Reminder — Class 10-B",
    message: "Period 2 Mathematics attendance is saved as draft. Submit before 5:00 PM.",
    category: "attendance",
    createdAt: "2026-11-12T10:05:00+05:30",
    isRead: false,
    actionHref: "/campus/demo-school/teacher/attendance",
  },
  {
    id: "notif-03",
    institutionId: INSTITUTION_MOCK.id,
    title: "Campus Duty Assigned",
    message: "Morning Assembly Supervision in Main Quadrangle scheduled for tomorrow.",
    category: "announcement",
    createdAt: "2026-11-11T16:40:00+05:30",
    isRead: false,
    actionHref: "/campus/demo-school/teacher/duties",
  },
  {
    id: "notif-04",
    institutionId: INSTITUTION_MOCK.id,
    title: "PT-1 Marks Approved",
    message: "Class 10-A Periodic Test 1 marks approved by Academic Coordinator.",
    category: "assessment",
    createdAt: "2026-11-09T14:20:00+05:30",
    isRead: true,
    actionHref: "/campus/demo-school/teacher/assessments",
  },
]

export const ANNOUNCEMENTS_MOCK: Announcement[] = [
  {
    id: "ann-01",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    title: "Pre-Board Examination I Seating & Invigilation Roster Released",
    content:
      "All faculty members are requested to review their invigilation and paper-evaluation duties by 18 Nov and report any schedule conflicts to the Exam Cell.",
    audience: "All Staff",
    authorName: "Dr. Meenakshi Rao",
    authorRole: "Principal",
    publishedAt: "2026-11-11",
    isPinned: true,
    priority: "important",
  },
  {
    id: "ann-02",
    institutionId: INSTITUTION_MOCK.id,
    academicYearId: "ay-2026-27",
    title: "Class 10-A Parent–Teacher Interaction (PTI) Schedule",
    content:
      "Term 1 progress cards and attendance summaries will be reviewed with parents on Saturday, 21 Nov from 9:30 AM to 1:00 PM in Room B-204.",
    audience: "Class & Parents",
    targetClasses: ["Class 10 - A"],
    authorName: TEACHER_PROFILE_MOCK.fullName,
    authorRole: "Class Teacher (10-A)",
    publishedAt: "2026-11-10",
    isPinned: false,
    priority: "normal",
  },
]

export const CAMPUS_DUTIES_MOCK: CampusDuty[] = [
  {
    id: "cd-01",
    title: "Morning Assembly & Attendance Floor Supervision",
    category: "Assembly",
    schedule: "Mon & Thu • 08:00 AM – 08:25 AM",
    location: "Main Quadrangle (Block A)",
    assignedBy: "Vice Principal (Academics)",
    status: "active",
  },
  {
    id: "cd-02",
    title: "Mathematics Olympiad & Vedic Math Club Coordinator",
    category: "Club",
    schedule: "Every Wednesday • 02:30 PM – 03:45 PM",
    location: "Seminar Room C-102",
    assignedBy: "Co-Curricular Committee",
    status: "active",
  },
  {
    id: "cd-03",
    title: "Lunch Corridor & Wing B Discipline Duty",
    category: "Discipline",
    schedule: "Tue & Fri • 12:30 PM – 01:05 PM",
    location: "Block B — 2nd Floor",
    assignedBy: "Disciplinary Cell",
    status: "active",
  },
  {
    id: "cd-04",
    title: "Applied Mathematics Practical Lab Verification",
    category: "Lab Supervision",
    schedule: "06 Nov 2026 • 01:30 PM – 03:30 PM",
    location: "STEM Resource Lab 1",
    assignedBy: "Exam Cell",
    status: "completed",
  },
]

export const STUDENT_LOG_REVIEWS_MOCK: StudentLogReview[] = [
  {
    id: "slr-01",
    studentId: "stu-10a-01",
    rollNo: "10A-01",
    studentName: "Aarav Kulkarni",
    className: "Class 10",
    section: "A",
    projectTitle: "Traffic Signal Optimization using Modular Arithmetic",
    weekLabel: "Week 4 (02 Nov – 07 Nov)",
    entryDate: "2026-11-08",
    hoursLogged: 6,
    summary:
      "Collected peak-hour signal wait timings near Indiranagar junction and formulated a linear congruence schedule model.",
    status: "pending",
  },
  {
    id: "slr-02",
    studentId: "stu-10a-07",
    rollNo: "10A-07",
    studentName: "Chirag Joshi",
    className: "Class 10",
    section: "A",
    projectTitle: "Campus Solar Rainwater Catchment Estimation",
    weekLabel: "Week 4 (02 Nov – 07 Nov)",
    entryDate: "2026-11-08",
    hoursLogged: 4,
    summary:
      "Measured rooftop area of Block B and drafted trigonometric slope runoff calculations. Missing uncertainty error bars.",
    status: "pending",
  },
  {
    id: "slr-03",
    studentId: "stu-10a-14",
    rollNo: "10A-14",
    studentName: "Kavya Srinivasan",
    className: "Class 10",
    section: "A",
    projectTitle: "Cryptographic Ciphers & Prime Factorization Demo",
    weekLabel: "Week 3 (26 Oct – 31 Oct)",
    entryDate: "2026-11-01",
    hoursLogged: 7,
    summary:
      "Implemented Euclid's GCD and RSA small-prime toy cipher worksheet with step-by-step verification tables.",
    teacherRemarks: "Clean proof writeup and well-verified numerical examples.",
    status: "locked",
  },
  {
    id: "slr-04",
    studentId: "stu-10a-11",
    rollNo: "10A-11",
    studentName: "Harshvardhan Rao",
    className: "Class 10",
    section: "A",
    projectTitle: "Sports Tournament Fixture Scheduling Graphs",
    weekLabel: "Week 3 (26 Oct – 31 Oct)",
    entryDate: "2026-11-02",
    hoursLogged: 3,
    summary:
      "Outlined 8-team knockout bracket but round-robin matrix calculations were incomplete.",
    teacherRemarks: "Please add the balanced round-robin table for 6 teams and resubmit.",
    status: "returned",
  },
]

export const DEPARTMENT_FACULTY_LOAD_MOCK: DepartmentFacultyLoad[] = [
  {
    teacherId: TEACHER_PROFILE_MOCK.id,
    fullName: TEACHER_PROFILE_MOCK.fullName,
    designation: "Senior PGT & HoD (Mathematics)",
    subjects: ["Mathematics (10-A, 10-B)", "Applied Mathematics (11-A)"],
    sectionsCount: 3,
    weeklyHours: 19,
    syllabusAveragePercent: 81,
    attendanceAveragePercent: 94,
  },
  {
    teacherId: "tch-math-02",
    fullName: "Mr. Arvind Deshpande",
    designation: "PGT Mathematics",
    subjects: ["Mathematics (11-B, 12-A)", "Competitive Quant Lab"],
    sectionsCount: 3,
    weeklyHours: 20,
    syllabusAveragePercent: 76,
    attendanceAveragePercent: 89,
  },
  {
    teacherId: "tch-math-03",
    fullName: "Ms. Nandini Iyer",
    designation: "TGT Mathematics",
    subjects: ["Mathematics (9-A, 9-B, 9-C)"],
    sectionsCount: 3,
    weeklyHours: 18,
    syllabusAveragePercent: 82,
    attendanceAveragePercent: 93,
  },
  {
    teacherId: "tch-math-04",
    fullName: "Mr. Rohan Kulkarni",
    designation: "TGT Mathematics",
    subjects: ["Mathematics (8-A, 8-B)", "Math Remedial Support"],
    sectionsCount: 2,
    weeklyHours: 17,
    syllabusAveragePercent: 80,
    attendanceAveragePercent: 91,
  },
  {
    teacherId: "teacher_demo_089",
    fullName: "Prof. Rajesh Verma",
    designation: "PGT Mathematics",
    subjects: ["Mathematics (10-B, 12-B)"],
    sectionsCount: 2,
    weeklyHours: 19,
    syllabusAveragePercent: 78,
    attendanceAveragePercent: 90.5,
  },
]

