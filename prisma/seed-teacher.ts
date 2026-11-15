import "dotenv/config"
import { prisma } from "../lib/prisma"

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
  { fullName: "Akshay Deshmukh", guardianName: "Suresh Deshmukh", relation: "Father", phone: "+91 98451 10203", attendancePercent: 86, iaAverage: 74, house: "Raman" },
  { fullName: "Ananya Iyer", guardianName: "Subramanian Iyer", relation: "Father", phone: "+91 98451 10204", attendancePercent: 98, iaAverage: 94, house: "Sarojini" },
  { fullName: "Arjun Nair", guardianName: "Deepa Nair", relation: "Mother", phone: "+91 98451 10205", attendancePercent: 91, iaAverage: 79, house: "Ashoka" },
  { fullName: "Bhavna Reddy", guardianName: "Venkat Reddy", relation: "Father", phone: "+91 98451 10206", attendancePercent: 94, iaAverage: 85, house: "Tagore" },
  { fullName: "Chirag Joshi", guardianName: "Manoj Joshi", relation: "Father", phone: "+91 98451 10207", attendancePercent: 79, iaAverage: 66, house: "Raman" },
  { fullName: "Devika Krishnan", guardianName: "Ramesh Krishnan", relation: "Father", phone: "+91 98451 10208", attendancePercent: 96, iaAverage: 90, house: "Sarojini" },
  { fullName: "Eshan Verma", guardianName: "Pooja Verma", relation: "Mother", phone: "+91 98451 10209", attendancePercent: 89, iaAverage: 76, house: "Ashoka" },
  { fullName: "Gauri Chatterjee", guardianName: "Anirban Chatterjee", relation: "Father", phone: "+91 98451 10210", attendancePercent: 93, iaAverage: 84, house: "Tagore" },
  { fullName: "Harshvardhan Rao", guardianName: "Prakash Rao", relation: "Father", phone: "+91 98451 10211", attendancePercent: 72, iaAverage: 58, house: "Raman" },
  { fullName: "Ishita Gupta", guardianName: "Neha Gupta", relation: "Mother", phone: "+91 98451 10212", attendancePercent: 97, iaAverage: 91, house: "Sarojini" },
  { fullName: "Kabir Malhotra", guardianName: "Vikram Malhotra", relation: "Father", phone: "+91 98451 10213", attendancePercent: 88, iaAverage: 73, house: "Ashoka" },
  { fullName: "Kavya Srinivasan", guardianName: "Meenakshi Srinivasan", relation: "Mother", phone: "+91 98451 10214", attendancePercent: 99, iaAverage: 96, house: "Tagore" },
  { fullName: "Mihir Patwardhan", guardianName: "Ashwin Patwardhan", relation: "Father", phone: "+91 98451 10215", attendancePercent: 92, iaAverage: 81, house: "Raman" },
  { fullName: "Nandini Hegde", guardianName: "Ganesh Hegde", relation: "Father", phone: "+91 98451 10216", attendancePercent: 95, iaAverage: 87, house: "Sarojini" },
  { fullName: "Pranav Bhatia", guardianName: "Sunita Bhatia", relation: "Mother", phone: "+91 98451 10217", attendancePercent: 83, iaAverage: 69, house: "Ashoka" },
  { fullName: "Riya Banerjee", guardianName: "Soumya Banerjee", relation: "Father", phone: "+91 98451 10218", attendancePercent: 94, iaAverage: 86, house: "Tagore" },
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

async function main() {
  console.log("🌱 Starting database seeding...")

  // ---------------------------------------------------------------------------
  // 1. Baseline Institution: 'demo-school' (Vidya Niketan Public School)
  // ---------------------------------------------------------------------------
  const institution = await prisma.institutions.upsert({
    where: { code: "demo-school" },
    update: {
      name: "Vidya Niketan Public School",
      address: "12th Main, Indiranagar, Bengaluru, Karnataka 560038",
      phone: "+91 98450 21478",
      email: "info@vidyaniketan.edu.in",
      website: "https://vidyaniketan.edu.in",
      isActive: true,
      updatedAt: new Date(),
    },
    create: {
      id: "inst_demo_school",
      code: "demo-school",
      name: "Vidya Niketan Public School",
      logoUrl: null,
      address: "12th Main, Indiranagar, Bengaluru, Karnataka 560038",
      phone: "+91 98450 21478",
      email: "info@vidyaniketan.edu.in",
      website: "https://vidyaniketan.edu.in",
      isActive: true,
      updatedAt: new Date(),
    },
  })
  console.log(`✅ Institution seeded: ${institution.name} (${institution.code})`)

  // ---------------------------------------------------------------------------
  // 2. Academic Years: 2026-27 (Current) and 2025-26
  // ---------------------------------------------------------------------------
  const currentAcademicYear = await prisma.academic_years.upsert({
    where: { id: "ay_demo_2026_27" },
    update: {
      name: "2026-27",
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      endDate: new Date("2027-03-31T23:59:59.000Z"),
      isCurrent: true,
    },
    create: {
      id: "ay_demo_2026_27",
      institutionId: institution.id,
      name: "2026-27",
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      endDate: new Date("2027-03-31T23:59:59.000Z"),
      isCurrent: true,
    },
  })

  await prisma.academic_years.upsert({
    where: { id: "ay_demo_2025_26" },
    update: {
      name: "2025-26",
      startDate: new Date("2025-06-01T00:00:00.000Z"),
      endDate: new Date("2026-03-31T23:59:59.000Z"),
      isCurrent: false,
    },
    create: {
      id: "ay_demo_2025_26",
      institutionId: institution.id,
      name: "2025-26",
      startDate: new Date("2025-06-01T00:00:00.000Z"),
      endDate: new Date("2026-03-31T23:59:59.000Z"),
      isCurrent: false,
    },
  })
  console.log(`✅ Academic years seeded (Current: ${currentAcademicYear.name})`)

  // ---------------------------------------------------------------------------
  // 3. Departments & Academic Courses / Classes
  // ---------------------------------------------------------------------------
  const coursesData = [
    {
      id: "course_demo_math",
      code: "DEPT-MATH",
      name: "Department of Mathematics",
      department: "Mathematics",
      totalSemesters: 2,
    },
    {
      id: "course_demo_sci",
      code: "DEPT-SCI",
      name: "Department of Science",
      department: "Science",
      totalSemesters: 2,
    },
    {
      id: "course_demo_eng",
      code: "DEPT-ENG",
      name: "Department of English",
      department: "English",
      totalSemesters: 2,
    },
    {
      id: "course_demo_cs",
      code: "DEPT-CS",
      name: "Department of Computer Science",
      department: "Computer Science",
      totalSemesters: 2,
    },
    {
      id: "course_demo_soc",
      code: "DEPT-SOC",
      name: "Department of Social Studies",
      department: "Social Studies",
      totalSemesters: 2,
    },
    {
      id: "course_demo_cls_10",
      code: "CLS-10",
      name: "Class 10 (Secondary)",
      department: "Mathematics",
      totalSemesters: 2,
    },
    {
      id: "course_demo_cls_11",
      code: "CLS-11",
      name: "Class 11 (Senior Secondary)",
      department: "Mathematics",
      totalSemesters: 2,
    },
  ]

  for (const c of coursesData) {
    await prisma.courses.upsert({
      where: {
        institutionId_code: {
          institutionId: institution.id,
          code: c.code,
        },
      },
      update: {
        name: c.name,
        department: c.department,
        totalSemesters: c.totalSemesters,
      },
      create: {
        id: c.id,
        institutionId: institution.id,
        code: c.code,
        name: c.name,
        department: c.department,
        totalSemesters: c.totalSemesters,
      },
    })
  }
  console.log(`✅ ${coursesData.length} Departments and Courses seeded`)

  // ---------------------------------------------------------------------------
  // 4. Subjects for Mathematics Department
  // ---------------------------------------------------------------------------
  const mathSubjects = [
    {
      id: "sub_demo_math_10",
      code: "MATH-10",
      name: "Mathematics",
      courseId: "course_demo_math",
      semester: 1,
      credits: 4,
    },
    {
      id: "sub_demo_math_11",
      code: "MATH-041",
      name: "Core Mathematics",
      courseId: "course_demo_math",
      semester: 1,
      credits: 4,
    },
    {
      id: "sub_demo_mentor",
      code: "MENTOR",
      name: "Mentorship Hour",
      courseId: "course_demo_math",
      semester: 1,
      credits: 1,
    },
  ]

  for (const sub of mathSubjects) {
    await prisma.subjects.upsert({
      where: {
        institutionId_code: {
          institutionId: institution.id,
          code: sub.code,
        },
      },
      update: {
        name: sub.name,
        courseId: sub.courseId,
        semester: sub.semester,
        credits: sub.credits,
      },
      create: {
        id: sub.id,
        institutionId: institution.id,
        courseId: sub.courseId,
        code: sub.code,
        name: sub.name,
        semester: sub.semester,
        credits: sub.credits,
        isElective: false,
      },
    })
  }
  console.log(`✅ Subjects seeded for Mathematics`)

  // ---------------------------------------------------------------------------
  // 5. Test Teacher User (Dr. Ananya Sharma) & Profile
  // ---------------------------------------------------------------------------
  const teacherUser = await prisma.users.upsert({
    where: {
      institutionId_email: {
        institutionId: institution.id,
        email: "ananya.sharma@vidyaniketan.edu.in",
      },
    },
    update: {
      fullName: "Dr. Ananya Sharma",
      role: "TEACHER",
      phone: "+91 98450 21478",
      isActive: true,
      updatedAt: new Date(),
    },
    create: {
      id: "user_teacher_demo_042",
      institutionId: institution.id,
      email: "ananya.sharma@vidyaniketan.edu.in",
      passwordHash: "$2a$10$.rEfnifd6F9H7QBeSS2mF.869UASvZHg0.1azQMbnr.eMRTzUR0t6",
      role: "TEACHER",
      fullName: "Dr. Ananya Sharma",
      phone: "+91 98450 21478",
      avatarUrl: null,
      isActive: true,
      updatedAt: new Date(),
    },
  })

  const teacherProfile = await prisma.teachers.upsert({
    where: {
      userId: teacherUser.id,
    },
    update: {
      department: "Mathematics",
      designation: "Senior PGT — Mathematics",
      employeeId: "VNPS-TCH-042",
    },
    create: {
      id: "teacher_demo_042",
      institutionId: institution.id,
      userId: teacherUser.id,
      employeeId: "VNPS-TCH-042",
      department: "Mathematics",
      designation: "Senior PGT — Mathematics",
    },
  })
  console.log(
    `✅ Test teacher profile seeded: ${teacherUser.fullName} (${teacherProfile.employeeId}, ${teacherProfile.department})`
  )

  // ---------------------------------------------------------------------------
  // 6. Full Weekly Timetable Schedule (16 slots: Mon-Fri)
  // ---------------------------------------------------------------------------
  const timetableSlots = [
    // Monday
    { id: "tt-mon-1", day: "Monday", start: "08:30", end: "09:15", sub: "sub_demo_math_10", crs: "course_demo_math", sem: 1, sec: "A", room: "B-204" },
    { id: "tt-mon-2", day: "Monday", start: "09:15", end: "10:00", sub: "sub_demo_math_10", crs: "course_demo_math", sem: 1, sec: "B", room: "B-205" },
    { id: "tt-mon-4", day: "Monday", start: "11:00", end: "11:45", sub: "sub_demo_math_11", crs: "course_demo_math", sem: 2, sec: "A", room: "C-102" },
    { id: "tt-mon-6", day: "Monday", start: "13:15", end: "14:00", sub: "sub_demo_math_10", crs: "course_demo_math", sem: 1, sec: "A", room: "Math Lab" },
    // Tuesday
    { id: "tt-tue-1", day: "Tuesday", start: "08:30", end: "09:15", sub: "sub_demo_math_11", crs: "course_demo_math", sem: 2, sec: "A", room: "C-102" },
    { id: "tt-tue-3", day: "Tuesday", start: "10:15", end: "11:00", sub: "sub_demo_math_10", crs: "course_demo_math", sem: 1, sec: "A", room: "B-204" },
    { id: "tt-tue-5", day: "Tuesday", start: "11:45", end: "12:30", sub: "sub_demo_math_10", crs: "course_demo_math", sem: 1, sec: "B", room: "B-205" },
    // Wednesday
    { id: "tt-wed-2", day: "Wednesday", start: "09:15", end: "10:00", sub: "sub_demo_math_10", crs: "course_demo_math", sem: 1, sec: "A", room: "B-204" },
    { id: "tt-wed-3", day: "Wednesday", start: "10:15", end: "11:00", sub: "sub_demo_math_10", crs: "course_demo_math", sem: 1, sec: "B", room: "B-205" },
    { id: "tt-wed-5", day: "Wednesday", start: "11:45", end: "12:30", sub: "sub_demo_math_11", crs: "course_demo_math", sem: 2, sec: "A", room: "C-102" },
    // Thursday
    { id: "tt-thu-1", day: "Thursday", start: "08:30", end: "09:15", sub: "sub_demo_math_10", crs: "course_demo_math", sem: 1, sec: "B", room: "B-205" },
    { id: "tt-thu-2", day: "Thursday", start: "09:15", end: "10:00", sub: "sub_demo_math_11", crs: "course_demo_math", sem: 2, sec: "A", room: "C-102" },
    { id: "tt-thu-4", day: "Thursday", start: "11:00", end: "11:45", sub: "sub_demo_math_10", crs: "course_demo_math", sem: 1, sec: "A", room: "B-204" },
    { id: "tt-thu-7", day: "Thursday", start: "14:00", end: "14:45", sub: "sub_demo_mentor", crs: "course_demo_math", sem: 1, sec: "A", room: "B-204" },
    // Friday
    { id: "tt-fri-1", day: "Friday", start: "08:30", end: "09:15", sub: "sub_demo_math_10", crs: "course_demo_math", sem: 1, sec: "A", room: "B-204" },
    { id: "tt-fri-3", day: "Friday", start: "10:15", end: "11:00", sub: "sub_demo_math_11", crs: "course_demo_math", sem: 2, sec: "A", room: "C-102" },
    { id: "tt-fri-6", day: "Friday", start: "13:15", end: "14:00", sub: "sub_demo_math_10", crs: "course_demo_math", sem: 1, sec: "B", room: "B-205" },
  ]

  for (const slot of timetableSlots) {
    await prisma.timetable_slots.upsert({
      where: { id: slot.id },
      update: {
        startTime: slot.start,
        endTime: slot.end,
        roomNumber: slot.room,
        teacherId: teacherProfile.id,
        courseId: slot.crs,
        subjectId: slot.sub,
        dayOfWeek: slot.day,
        semester: slot.sem,
        section: slot.sec,
      },
      create: {
        id: slot.id,
        institutionId: institution.id,
        courseId: slot.crs,
        subjectId: slot.sub,
        teacherId: teacherProfile.id,
        dayOfWeek: slot.day,
        startTime: slot.start,
        endTime: slot.end,
        semester: slot.sem,
        section: slot.sec,
        roomNumber: slot.room,
      },
    })
  }
  console.log(`✅ ${timetableSlots.length} weekly timetable slots seeded for ${teacherUser.fullName}`)

  // ---------------------------------------------------------------------------
  // 7. Student Rosters, Users, and Enrollments (Class 10-A, 10-B, and 11-A)
  // ---------------------------------------------------------------------------
  const sectionsToSeed = [
    {
      seeds: SECTION_10A_SEEDS,
      sectionId: "sec-10a",
      section: "A",
      semester: 1,
      courseId: "course_demo_cls_10",
      rollPrefix: "10A-",
      admPrefix: "VNPS24-10A-",
    },
    {
      seeds: SECTION_10B_SEEDS,
      sectionId: "sec-10b",
      section: "B",
      semester: 1,
      courseId: "course_demo_cls_10",
      rollPrefix: "10B-",
      admPrefix: "VNPS24-10B-",
    },
    {
      seeds: SECTION_11A_SEEDS,
      sectionId: "sec-11a",
      section: "A",
      semester: 2,
      courseId: "course_demo_cls_11",
      rollPrefix: "11A-",
      admPrefix: "VNPS25-11A-",
    },
  ]

  let totalStudentsSeeded = 0

  for (const secConfig of sectionsToSeed) {
    for (let i = 0; i < secConfig.seeds.length; i++) {
      const seed = secConfig.seeds[i]
      const seq = String(i + 1).padStart(2, "0")
      const studentId = `stu-${secConfig.sectionId}-${seq}`
      const studentUserId = `user-stu-${secConfig.sectionId}-${seq}`
      const rollNumber = `${secConfig.rollPrefix}${seq}`
      const admissionNumber = `${secConfig.admPrefix}${String(101 + i)}`
      const email = `student.${secConfig.sectionId}.${seq}@vidyaniketan.edu.in`
      const names = seed.fullName.split(" ")
      const firstName = names[0]
      const lastName = names.slice(1).join(" ") || "Student"

      // Student user
      const studentUser = await prisma.users.upsert({
        where: {
          institutionId_email: {
            institutionId: institution.id,
            email,
          },
        },
        update: {
          fullName: seed.fullName,
          phone: seed.phone,
          isActive: true,
          updatedAt: new Date(),
        },
        create: {
          id: studentUserId,
          institutionId: institution.id,
          email,
          passwordHash: "$2a$10$demostudentpwdhash1234567890",
          role: "STUDENT",
          fullName: seed.fullName,
          phone: seed.phone,
          isActive: true,
          updatedAt: new Date(),
        },
      })

      // Student record
      await prisma.students.upsert({
        where: {
          institutionId_admissionNumber: {
            institutionId: institution.id,
            admissionNumber,
          },
        },
        update: {
          rollNumber,
          firstName,
          lastName,
          currentSemester: secConfig.semester,
          currentSection: secConfig.section,
          status: "ACTIVE",
          updatedAt: new Date(),
        },
        create: {
          id: studentId,
          institutionId: institution.id,
          userId: studentUser.id,
          admissionNumber,
          rollNumber,
          firstName,
          lastName,
          dateOfBirth: new Date("2010-05-15"),
          gender: i % 2 === 0 ? "MALE" : "FEMALE",
          emergencyContact: seed.phone,
          admissionDate: new Date("2024-06-01"),
          currentSemester: secConfig.semester,
          currentSection: secConfig.section,
          status: "ACTIVE",
          updatedAt: new Date(),
        },
      })

      // Enrollment record
      const enrollmentId = `enr-${secConfig.sectionId}-${seq}`
      await prisma.enrollments.upsert({
        where: { id: enrollmentId },
        update: {
          section: secConfig.section,
          semester: secConfig.semester,
          status: "ACTIVE",
        },
        create: {
          id: enrollmentId,
          institutionId: institution.id,
          studentId,
          academicYearId: currentAcademicYear.id,
          courseId: secConfig.courseId,
          semester: secConfig.semester,
          section: secConfig.section,
          status: "ACTIVE",
        },
      })

      // Guardian account & link
      const guardianUserId = `user-grd-${secConfig.sectionId}-${seq}`
      const guardianAccountId = `grd-${secConfig.sectionId}-${seq}`
      const guardianEmail = `guardian.${secConfig.sectionId}.${seq}@vidyaniketan.edu.in`

      const guardianUser = await prisma.users.upsert({
        where: {
          institutionId_email: {
            institutionId: institution.id,
            email: guardianEmail,
          },
        },
        update: {
          fullName: seed.guardianName,
          phone: seed.phone,
          isActive: true,
          updatedAt: new Date(),
        },
        create: {
          id: guardianUserId,
          institutionId: institution.id,
          email: guardianEmail,
          passwordHash: "$2a$10$demoguardianpwdhash1234567890",
          role: "GUARDIAN",
          fullName: seed.guardianName,
          phone: seed.phone,
          isActive: true,
          updatedAt: new Date(),
        },
      })

      await prisma.guardian_accounts.upsert({
        where: { userId: guardianUser.id },
        update: {
          fullName: seed.guardianName,
          phone: seed.phone,
          relationship: seed.relation,
        },
        create: {
          id: guardianAccountId,
          institutionId: institution.id,
          userId: guardianUser.id,
          fullName: seed.guardianName,
          phone: seed.phone,
          relationship: seed.relation,
        },
      })

      await prisma.guardian_links.upsert({
        where: {
          guardianAccountId_studentId: {
            guardianAccountId,
            studentId,
          },
        },
        update: {
          relationship: seed.relation,
          isPrimary: true,
        },
        create: {
          id: `glink-${secConfig.sectionId}-${seq}`,
          institutionId: institution.id,
          guardianAccountId,
          studentId,
          relationship: seed.relation,
          isVerified: true,
          isPrimary: true,
          canAccessPortal: true,
        },
      })

      totalStudentsSeeded++
    }
  }
  console.log(`✅ ${totalStudentsSeeded} Students, Enrollments, and Guardians seeded across 3 sections`)

  // ---------------------------------------------------------------------------
  // 8. Baseline Attendance Records (Nov 12, 2026)
  // ---------------------------------------------------------------------------
  const attDate = new Date("2026-11-12T00:00:00.000Z")
  const sec10aStudents = await prisma.students.findMany({
    where: { institutionId: institution.id, currentSemester: 1, currentSection: "A" },
    include: { enrollments: true },
  })

  let attRecordsCount = 0
  for (let i = 0; i < sec10aStudents.length; i++) {
    const st = sec10aStudents[i]
    const enr = st.enrollments[0]
    if (!enr) continue

    let status = "PRESENT"
    if (i === 10) status = "ABSENT"
    else if (i === 6) status = "LATE"
    else if (i === 3) status = "ON_DUTY"

    await prisma.attendance_records.upsert({
      where: { id: `att-rec-${st.id}-20261112-p1` },
      update: { status },
      create: {
        id: `att-rec-${st.id}-20261112-p1`,
        institutionId: institution.id,
        studentId: st.id,
        enrollmentId: enr.id,
        subjectId: "sub_demo_math_10",
        date: attDate,
        status,
        remarks: status === "ABSENT" ? "Medical leave reported" : null,
        recordedAt: new Date(),
      },
    })
    attRecordsCount++
  }
  console.log(`✅ ${attRecordsCount} Baseline attendance records seeded for Nov 12, 2026`)

  // ---------------------------------------------------------------------------
  // 9. Baseline Assessment Records (PT-1 & PT-2)
  // ---------------------------------------------------------------------------
  let iaRecordsCount = 0
  const baselineScores = [36, 38, 29, 39, 31, 35, 24, 37, 30, 34, 22, 38, 28, 40, 32, 35, 26, 34]

  for (let i = 0; i < sec10aStudents.length; i++) {
    const st = sec10aStudents[i]
    const enr = st.enrollments[0]
    if (!enr) continue

    const score = baselineScores[i] ?? 32
    await prisma.assessment_records.upsert({
      where: { id: `rec-ia-10a-ut1-${st.id}` },
      update: { marksObtained: score },
      create: {
        id: `rec-ia-10a-ut1-${st.id}`,
        institutionId: institution.id,
        studentId: st.id,
        enrollmentId: enr.id,
        subjectId: "sub_demo_math_10",
        assessmentName: "Periodic Test 1 — Algebra & Polynomials",
        maxMarks: 40,
        marksObtained: score,
        weightage: 20,
        remarks: score >= 35 ? "Excellent work" : "Satisfactory",
        conductedDate: new Date("2026-09-18T00:00:00.000Z"),
      },
    })
    iaRecordsCount++
  }

  // Approval requests for assessments
  await prisma.approval_requests.upsert({
    where: { id: "apr-ia-ia-10a-ut1" },
    update: { status: "APPROVED" },
    create: {
      id: "apr-ia-ia-10a-ut1",
      institutionId: institution.id,
      userId: teacherUser.id,
      requestType: "INTERNAL_ASSESSMENT",
      title: "Periodic Test 1 — Algebra & Polynomials",
      status: "APPROVED",
      adminRemarks: "Approved by Head of Department",
      requestedDataJson: JSON.stringify({
        assessmentId: "ia-10a-ut1",
        status: "approved",
        marksCount: sec10aStudents.length,
      }),
      reviewedAt: new Date("2026-09-22T10:00:00.000Z"),
    },
  })

  await prisma.approval_requests.upsert({
    where: { id: "apr-ia-ia-10a-ut2" },
    update: { status: "PENDING" },
    create: {
      id: "apr-ia-ia-10a-ut2",
      institutionId: institution.id,
      userId: teacherUser.id,
      requestType: "INTERNAL_ASSESSMENT",
      title: "Periodic Test 2 — Trigonometry & Geometry",
      status: "PENDING",
      requestedDataJson: JSON.stringify({
        assessmentId: "ia-10a-ut2",
        status: "submitted",
        marksCount: sec10aStudents.length,
      }),
    },
  })
  console.log(`✅ ${iaRecordsCount} Assessment records and approval requests seeded`)

  // -------------------------------------------------------------------------
  // Part 4: Storage Bucket, LMS Materials, Assignments & Quizzes
  // -------------------------------------------------------------------------

  // 1. Supabase Storage bucket 'course-materials' and RLS policy
  try {
    await prisma.$executeRawUnsafe(`
      INSERT INTO storage.buckets (id, name, public)
      VALUES ('course-materials', 'course-materials', true)
      ON CONFLICT (id) DO UPDATE SET public = true;
    `)
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies 
          WHERE tablename = 'objects' AND policyname = 'Public Access Course Materials'
        ) THEN
          CREATE POLICY "Public Access Course Materials" ON storage.objects
          FOR ALL USING (bucket_id = 'course-materials')
          WITH CHECK (bucket_id = 'course-materials');
        END IF;
      END $$;
    `)
    console.log("✅ Supabase Storage bucket 'course-materials' and public policy ensured")
  } catch (storageErr) {
    console.warn("⚠️ Storage bucket setup notice (can continue):", storageErr)
  }

  // 2. LMS Study Materials (lms_course_materials)
  const lmsMaterialsData = [
    {
      id: "lm-demo-10a-01",
      subjectId: "sub_demo_math_10",
      title: "Unit 1 — Real Numbers & Polynomials Comprehensive Formula Sheet",
      description: "CBSE Class 10 Board exam revision notes covering Euclid division lemma and quadratic polynomial relationships.",
      fileUrl: "https://qrlyvalbjtxavxmznfzz.supabase.co/storage/v1/object/public/course-materials/demo/unit1_polynomials_formula_sheet.pdf",
      fileType: "pdf",
      fileSizeBytes: 2450000,
      unitNumber: 1,
    },
    {
      id: "lm-demo-10a-02",
      subjectId: "sub_demo_math_10",
      title: "Unit 2 — Pair of Linear Equations in Two Variables Practice Problems",
      description: "Detailed graphical and algebraic solutions with substitution and elimination method examples.",
      fileUrl: "https://qrlyvalbjtxavxmznfzz.supabase.co/storage/v1/object/public/course-materials/demo/unit2_linear_equations_practice.pdf",
      fileType: "pdf",
      fileSizeBytes: 3100000,
      unitNumber: 2,
    },
    {
      id: "lm-demo-10a-03",
      subjectId: "sub_demo_math_10",
      title: "Unit 3 — Introduction to Trigonometry Proofs & Identities Guide",
      description: "Step-by-step proofs for standard trigonometric identities and angle value shortcut tables.",
      fileUrl: "https://qrlyvalbjtxavxmznfzz.supabase.co/storage/v1/object/public/course-materials/demo/unit3_trigonometry_identities.pdf",
      fileType: "pdf",
      fileSizeBytes: 1850000,
      unitNumber: 3,
    },
    {
      id: "lm-demo-10a-04",
      subjectId: "sub_demo_math_10",
      title: "Unit 4 — Coordinate Geometry & Section Formula Summary Note",
      description: "Quick reference card for distance formula, midpoint formula, and collinearity condition.",
      fileUrl: "https://qrlyvalbjtxavxmznfzz.supabase.co/storage/v1/object/public/course-materials/demo/unit4_coordinate_geometry_notes.pdf",
      fileType: "note",
      fileSizeBytes: 950000,
      unitNumber: 4,
    },
  ]

  for (const mat of lmsMaterialsData) {
    await prisma.lms_course_materials.upsert({
      where: { id: mat.id },
      update: {
        title: mat.title,
        description: mat.description,
        fileUrl: mat.fileUrl,
        fileType: mat.fileType,
        fileSizeBytes: mat.fileSizeBytes,
        unitNumber: mat.unitNumber,
      },
      create: {
        id: mat.id,
        institutionId: institution.id,
        subjectId: mat.subjectId,
        title: mat.title,
        description: mat.description,
        fileUrl: mat.fileUrl,
        fileType: mat.fileType,
        fileSizeBytes: mat.fileSizeBytes,
        unitNumber: mat.unitNumber,
        uploadedAt: new Date("2026-11-01T10:00:00.000Z"),
      },
    })
  }
  console.log(`✅ ${lmsMaterialsData.length} LMS Course Materials seeded`)

  // 3. Assignments & Student Submissions (assignments, assignment_submissions)
  const assignment1 = await prisma.assignments.upsert({
    where: { id: "asg-10a-01" },
    update: {
      title: "NCERT Exercise 3.3 — Pair of Linear Equations Substitution Method",
      dueDate: new Date("2026-11-20T23:59:59.000Z"),
      totalPoints: 20,
    },
    create: {
      id: "asg-10a-01",
      institutionId: institution.id,
      subjectId: "sub_demo_math_10",
      title: "NCERT Exercise 3.3 — Pair of Linear Equations Substitution Method",
      description: "Solve questions 1 through 6 from NCERT Chapter 3. Submit handwritten step-by-step solutions as a scanned PDF.",
      dueDate: new Date("2026-11-20T23:59:59.000Z"),
      totalPoints: 20,
      attachmentUrl: "https://qrlyvalbjtxavxmznfzz.supabase.co/storage/v1/object/public/course-materials/demo/ncert_ex_3_3_worksheet.pdf",
      createdAt: new Date("2026-11-10T09:00:00.000Z"),
    },
  })

  const assignment2 = await prisma.assignments.upsert({
    where: { id: "asg-10a-02" },
    update: {
      title: "Trigonometric Heights & Distances Real-World Case Study",
      dueDate: new Date("2026-11-28T23:59:59.000Z"),
      totalPoints: 25,
    },
    create: {
      id: "asg-10a-02",
      institutionId: institution.id,
      subjectId: "sub_demo_math_10",
      title: "Trigonometric Heights & Distances Real-World Case Study",
      description: "Solve problems involving angle of elevation and depression of towers and buildings with clear labeled diagrams.",
      dueDate: new Date("2026-11-28T23:59:59.000Z"),
      totalPoints: 25,
      attachmentUrl: "https://qrlyvalbjtxavxmznfzz.supabase.co/storage/v1/object/public/course-materials/demo/heights_and_distances_casestudy.pdf",
      createdAt: new Date("2026-11-12T11:00:00.000Z"),
    },
  })

  // Seed Submissions for Assignment 1 across Section 10A students
  let asgSubmissionsCount = 0
  for (let i = 0; i < sec10aStudents.length; i++) {
    const student = sec10aStudents[i]
    // 10 graded, 5 submitted (pending review), 3 pending
    const isGraded = i < 10
    const isSubmitted = i < 15
    const score = isGraded ? Math.min(20, Math.max(14, 15 + ((i * 3) % 6))) : null
    const feedback = isGraded
      ? score && score >= 18
        ? "Excellent presentation and accurate algebraic substitution steps."
        : "Good attempt. Watch out for negative sign distribution in question 3."
      : null

    const status = isGraded ? "GRADED" : isSubmitted ? "SUBMITTED" : "PENDING"
    const fileUrl = isSubmitted
      ? `https://qrlyvalbjtxavxmznfzz.supabase.co/storage/v1/object/public/course-materials/submissions/10a_${student.rollNumber}_asg01.pdf`
      : null

    await prisma.assignment_submissions.upsert({
      where: {
        assignmentId_studentId: {
          assignmentId: assignment1.id,
          studentId: student.id,
        },
      },
      update: {
        status,
        score,
        feedback,
        fileUrl,
      },
      create: {
        id: `sub-${assignment1.id}-${student.id}`,
        institutionId: institution.id,
        assignmentId: assignment1.id,
        studentId: student.id,
        fileUrl,
        submittedAt: isSubmitted ? new Date("2026-11-11T16:00:00.000Z") : new Date(),
        score,
        feedback,
        status,
      },
    })
    asgSubmissionsCount++
  }

  // Seed Submissions for Assignment 2 across Section 10A students
  for (let i = 0; i < sec10aStudents.length; i++) {
    const student = sec10aStudents[i]
    const isGraded = i < 5
    const isSubmitted = i < 12
    const score = isGraded ? Math.min(25, Math.max(18, 19 + ((i * 2) % 7))) : null
    const feedback = isGraded ? "Well-drawn elevation diagrams and correct angle application." : null
    const status = isGraded ? "GRADED" : isSubmitted ? "SUBMITTED" : "PENDING"
    const fileUrl = isSubmitted
      ? `https://qrlyvalbjtxavxmznfzz.supabase.co/storage/v1/object/public/course-materials/submissions/10a_${student.rollNumber}_asg02.pdf`
      : null

    await prisma.assignment_submissions.upsert({
      where: {
        assignmentId_studentId: {
          assignmentId: assignment2.id,
          studentId: student.id,
        },
      },
      update: {
        status,
        score,
        feedback,
        fileUrl,
      },
      create: {
        id: `sub-${assignment2.id}-${student.id}`,
        institutionId: institution.id,
        assignmentId: assignment2.id,
        studentId: student.id,
        fileUrl,
        submittedAt: isSubmitted ? new Date("2026-11-13T14:30:00.000Z") : new Date(),
        score,
        feedback,
        status,
      },
    })
    asgSubmissionsCount++
  }
  console.log(`✅ 2 Assignments and ${asgSubmissionsCount} student submissions seeded`)

  // 4. Quizzes, Questions & Student Attempts (quizzes, quiz_questions, quiz_attempts)
  const quiz1 = await prisma.quizzes.upsert({
    where: { id: "quiz-10a-01" },
    update: {
      title: "Unit 1: Polynomials & Quadratic Equations Speed Diagnostic",
      durationMinutes: 20,
      totalPoints: 20,
    },
    create: {
      id: "quiz-10a-01",
      institutionId: institution.id,
      subjectId: "sub_demo_math_10",
      title: "Unit 1: Polynomials & Quadratic Equations Speed Diagnostic",
      durationMinutes: 20,
      totalPoints: 20,
      createdAt: new Date("2026-11-08T10:00:00.000Z"),
    },
  })

  const quiz1Questions = [
    {
      id: "quiz-10a-01-q1",
      quizId: quiz1.id,
      questionText: "If one zero of the quadratic polynomial x² + 3x + k is 2, then what is the value of k?",
      optionA: "-10",
      optionB: "-7",
      optionC: "-2",
      optionD: "10",
      correctOption: "-10",
      points: 5,
    },
    {
      id: "quiz-10a-01-q2",
      quizId: quiz1.id,
      questionText: "What is the degree of a non-zero constant polynomial?",
      optionA: "0",
      optionB: "1",
      optionC: "2",
      optionD: "Undefined",
      correctOption: "0",
      points: 5,
    },
    {
      id: "quiz-10a-01-q3",
      quizId: quiz1.id,
      questionText: "If α and β are the zeros of 2x² + 5x - 9, what is the value of product of roots αβ?",
      optionA: "-9/2",
      optionB: "5/2",
      optionC: "-5/2",
      optionD: "9/2",
      correctOption: "-9/2",
      points: 5,
    },
    {
      id: "quiz-10a-01-q4",
      quizId: quiz1.id,
      questionText: "How many quadratic polynomials can have zeros as -2 and 5?",
      optionA: "Only 1",
      optionB: "Exactly 2",
      optionC: "Exactly 3",
      optionD: "More than 3 (Infinitely many)",
      correctOption: "More than 3 (Infinitely many)",
      points: 5,
    },
  ]

  for (const q of quiz1Questions) {
    await prisma.quiz_questions.upsert({
      where: { id: q.id },
      update: {
        questionText: q.questionText,
        optionA: q.optionA,
        optionB: q.optionB,
        optionC: q.optionC,
        optionD: q.optionD,
        correctOption: q.correctOption,
        points: q.points,
      },
      create: {
        id: q.id,
        quizId: q.quizId,
        questionText: q.questionText,
        optionA: q.optionA,
        optionB: q.optionB,
        optionC: q.optionC,
        optionD: q.optionD,
        correctOption: q.correctOption,
        points: q.points,
      },
    })
  }

  // Quiz 1 Student Attempts
  let quizAttemptsCount = 0
  for (let i = 0; i < 12; i++) {
    const student = sec10aStudents[i]
    const score = i % 3 === 0 ? 20 : i % 2 === 0 ? 15 : 10
    const answers = {
      "quiz-10a-01-q1": "-10",
      "quiz-10a-01-q2": "0",
      "quiz-10a-01-q3": score >= 15 ? "-9/2" : "5/2",
      "quiz-10a-01-q4": score === 20 ? "More than 3 (Infinitely many)" : "Only 1",
    }
    const answersJson = JSON.stringify({
      answers,
      feedback: score >= 15 ? "Strong conceptual understanding." : "Review product and sum of roots relations.",
    })

    await prisma.quiz_attempts.upsert({
      where: { id: `att-${quiz1.id}-${student.id}` },
      update: {
        score,
        answersJson,
      },
      create: {
        id: `att-${quiz1.id}-${student.id}`,
        institutionId: institution.id,
        quizId: quiz1.id,
        studentId: student.id,
        score,
        answersJson,
        submittedAt: new Date("2026-11-09T14:30:00.000Z"),
      },
    })
    quizAttemptsCount++
  }

  // Quiz 2: Trigonometric Ratios Flash Quiz
  const quiz2 = await prisma.quizzes.upsert({
    where: { id: "quiz-10a-02" },
    update: {
      title: "Unit 2: Trigonometric Ratios & Standard Angles Flash Quiz",
      durationMinutes: 15,
      totalPoints: 15,
    },
    create: {
      id: "quiz-10a-02",
      institutionId: institution.id,
      subjectId: "sub_demo_math_10",
      title: "Unit 2: Trigonometric Ratios & Standard Angles Flash Quiz",
      durationMinutes: 15,
      totalPoints: 15,
      createdAt: new Date("2026-11-12T15:00:00.000Z"),
    },
  })

  const quiz2Questions = [
    {
      id: "quiz-10a-02-q1",
      quizId: quiz2.id,
      questionText: "What is the value of sin 60° cos 30° + sin 30° cos 60°?",
      optionA: "1",
      optionB: "0",
      optionC: "1/2",
      optionD: "√3/2",
      correctOption: "1",
      points: 5,
    },
    {
      id: "quiz-10a-02-q2",
      quizId: quiz2.id,
      questionText: "If tan θ = 4/3, what is the value of (sin θ + cos θ) / (sin θ - cos θ)?",
      optionA: "7",
      optionB: "1/7",
      optionC: "-7",
      optionD: "-1/7",
      correctOption: "7",
      points: 5,
    },
    {
      id: "quiz-10a-02-q3",
      quizId: quiz2.id,
      questionText: "What is the identity value of (sin² 30° + cos² 30°)?",
      optionA: "1",
      optionB: "0",
      optionC: "1/2",
      optionD: "2",
      correctOption: "1",
      points: 5,
    },
  ]

  for (const q of quiz2Questions) {
    await prisma.quiz_questions.upsert({
      where: { id: q.id },
      update: {
        questionText: q.questionText,
        optionA: q.optionA,
        optionB: q.optionB,
        optionC: q.optionC,
        optionD: q.optionD,
        correctOption: q.correctOption,
        points: q.points,
      },
      create: {
        id: q.id,
        quizId: q.quizId,
        questionText: q.questionText,
        optionA: q.optionA,
        optionB: q.optionB,
        optionC: q.optionC,
        optionD: q.optionD,
        correctOption: q.correctOption,
        points: q.points,
      },
    })
  }

  for (let i = 0; i < 8; i++) {
    const student = sec10aStudents[i]
    const score = i % 2 === 0 ? 15 : 10
    const answers = {
      "quiz-10a-02-q1": "1",
      "quiz-10a-02-q2": score === 15 ? "7" : "1/7",
      "quiz-10a-02-q3": "1",
    }
    const answersJson = JSON.stringify({
      answers,
      feedback: score === 15 ? "Perfect standard angle calculation." : "Revise fraction quotient rule for tan θ.",
    })

    await prisma.quiz_attempts.upsert({
      where: { id: `att-${quiz2.id}-${student.id}` },
      update: {
        score,
        answersJson,
      },
      create: {
        id: `att-${quiz2.id}-${student.id}`,
        institutionId: institution.id,
        quizId: quiz2.id,
        studentId: student.id,
        score,
        answersJson,
        submittedAt: new Date("2026-11-13T10:15:00.000Z"),
      },
    })
    quizAttemptsCount++
  }
  console.log(`✅ 2 Quizzes with questions and ${quizAttemptsCount} attempts seeded`)

  // -------------------------------------------------------------------------
  // Part 5: Exam Schedules, Exam Results, Mentoring, Logbooks, Leaves, Notifications
  // -------------------------------------------------------------------------

  // 1. Exam Schedules & Slots
  const examSchedule1 = await prisma.exam_schedules.upsert({
    where: { id: "es-midterm-2026" },
    update: {
      title: "Mid-Term Examination 2026-27",
      startDate: new Date("2026-12-01T09:00:00.000Z"),
      endDate: new Date("2026-12-12T13:00:00.000Z"),
      isPublished: true,
    },
    create: {
      id: "es-midterm-2026",
      institutionId: institution.id,
      academicYearId: currentAcademicYear.id,
      semester: 1,
      title: "Mid-Term Examination 2026-27",
      examType: "MID_TERM",
      startDate: new Date("2026-12-01T09:00:00.000Z"),
      endDate: new Date("2026-12-12T13:00:00.000Z"),
      isPublished: true,
      createdAt: new Date("2026-11-01T10:00:00.000Z"),
    },
  })

  const examSlotsData = [
    {
      id: "slot-midterm-math10",
      examScheduleId: examSchedule1.id,
      subjectCode: "MATH-10",
      subjectName: "Mathematics",
      examDate: new Date("2026-12-02T09:30:00.000Z"),
      startTime: "09:30 AM",
      endTime: "12:30 PM",
      roomNumber: "Room 402",
    },
    {
      id: "slot-midterm-sci10",
      examScheduleId: examSchedule1.id,
      subjectCode: "SCI-10",
      subjectName: "General Science",
      examDate: new Date("2026-12-04T09:30:00.000Z"),
      startTime: "09:30 AM",
      endTime: "12:30 PM",
      roomNumber: "Room 405",
    },
    {
      id: "slot-midterm-eng10",
      examScheduleId: examSchedule1.id,
      subjectCode: "ENG-10",
      subjectName: "English Language & Literature",
      examDate: new Date("2026-12-07T09:30:00.000Z"),
      startTime: "09:30 AM",
      endTime: "12:30 PM",
      roomNumber: "Hall B",
    },
  ]

  for (const slot of examSlotsData) {
    await prisma.exam_slots.upsert({
      where: { id: slot.id },
      update: {
        subjectCode: slot.subjectCode,
        subjectName: slot.subjectName,
        examDate: slot.examDate,
        startTime: slot.startTime,
        endTime: slot.endTime,
        roomNumber: slot.roomNumber,
      },
      create: slot,
    })
  }
  console.log(`✅ Exam Schedule and ${examSlotsData.length} Exam Slots seeded`)

  // 2. Exam Results for Section 10A students
  let examResultsCount = 0
  for (let i = 0; i < sec10aStudents.length; i++) {
    const student = sec10aStudents[i]
    const external = Math.min(70, Math.max(42, 45 + ((i * 4) % 25)))
    const internal = 25.0
    const total = external + internal
    const grade = total >= 90 ? "A1" : total >= 80 ? "A2" : total >= 70 ? "B1" : "B2"
    const gradePoint = total >= 90 ? 10.0 : total >= 80 ? 9.0 : total >= 70 ? 8.0 : 7.0

    await prisma.exam_results.upsert({
      where: { id: `res-midterm-${student.id}` },
      update: {
        internalMarks: internal,
        externalMarks: external,
        totalMarks: total,
        grade,
        gradePoint,
      },
      create: {
        id: `res-midterm-${student.id}`,
        institutionId: institution.id,
        examScheduleId: examSchedule1.id,
        studentId: student.id,
        subjectId: "sub_demo_math_10",
        internalMarks: internal,
        externalMarks: external,
        totalMarks: total,
        maxMarks: 100,
        grade,
        gradePoint,
        credits: 4,
        isPassed: true,
        isSupplementary: false,
        attemptNumber: 1,
        publishedAt: new Date("2026-11-13T12:00:00.000Z"),
      },
    })
    examResultsCount++
  }
  console.log(`✅ ${examResultsCount} Exam Results seeded for Class 10 Mathematics`)

  // 3. Mentoring Records
  const mentoringRecordsData = [
    {
      id: "mr-demo-01",
      studentId: "stu-sec-10a-01",
      mentorTeacherId: teacherProfile.id,
      sessionDate: new Date("2026-11-04T15:30:00.000Z"),
      topicsDiscussed: "Mid-Term academic goal setting and algebraic substitution practice schedule",
      studentActionItems: JSON.stringify([
        "Complete NCERT Chapter 3 worked examples",
        "Attend Tuesday math doubt clearing period",
      ]),
      followUpDate: new Date("2026-11-20T15:30:00.000Z"),
      isPrivateNote: false,
      mentorNotes: "Aarav showed constructive enthusiasm. Advised him to maintain an algebraic formula notebook.",
    },
    {
      id: "mr-demo-02",
      studentId: "stu-sec-10a-02",
      mentorTeacherId: teacherProfile.id,
      sessionDate: new Date("2026-11-06T14:30:00.000Z"),
      topicsDiscussed: "Trigonometric standard angle memorization and board exam time management",
      studentActionItems: JSON.stringify([
        "Draft trigonometric identity summary chart",
        "Practice 4 multi-step height and distance problems daily",
      ]),
      followUpDate: new Date("2026-11-25T14:30:00.000Z"),
      isPrivateNote: false,
      mentorNotes: "Ananya has strong mathematical aptitude. Recommended speed drills for 5-mark geometry proofs.",
    },
    {
      id: "mr-demo-03-conf",
      studentId: "stu-sec-10a-01",
      mentorTeacherId: teacherProfile.id,
      sessionDate: new Date("2026-11-05T16:00:00.000Z"),
      topicsDiscussed: "Confidential Student Welfare & Medical Observation",
      isPrivateNote: true,
      mentorNotes: "Guardian contacted regarding seasonal allergy medication. Student is fully supported with class notes.",
    },
  ]

  for (const mr of mentoringRecordsData) {
    await prisma.mentoring_records.upsert({
      where: { id: mr.id },
      update: {
        topicsDiscussed: mr.topicsDiscussed,
        mentorNotes: mr.mentorNotes,
        studentActionItems: mr.studentActionItems,
        followUpDate: mr.followUpDate,
        isPrivateNote: mr.isPrivateNote,
      },
      create: {
        id: mr.id,
        institutionId: institution.id,
        studentId: mr.studentId,
        mentorTeacherId: mr.mentorTeacherId,
        sessionDate: mr.sessionDate,
        topicsDiscussed: mr.topicsDiscussed,
        studentActionItems: mr.studentActionItems,
        followUpDate: mr.followUpDate,
        isPrivateNote: mr.isPrivateNote,
        mentorNotes: mr.mentorNotes,
      },
    })
  }
  console.log(`✅ ${mentoringRecordsData.length} Mentoring Records seeded`)

  // 4. Student Logbook Entries (log_book_entries)
  const studentLogsData = [
    {
      id: "lb-stu-01",
      studentId: "stu-sec-10a-01",
      activityType: "PROJECT",
      title: "Robotics Line Follower Infrared Sensor Tuning",
      description: "Tested and tuned dual infrared optical reflectance sensors on white background course with analog thresholds.",
      entryDate: new Date("2026-11-08T16:00:00.000Z"),
      hoursSpent: 3.5,
      status: "APPROVED",
      supervisorFeedback: "Excellent calibration logs and well-documented sensor threshold graphs.",
    },
    {
      id: "lb-stu-02",
      studentId: "stu-sec-10a-02",
      activityType: "LAB_WORK",
      title: "Chemistry Acid-Base Volumetric Titration",
      description: "Standardized oxalic acid against sodium hydroxide with phenolphthalein indicator to determine unknown normality.",
      entryDate: new Date("2026-11-10T15:00:00.000Z"),
      hoursSpent: 2.5,
      status: "SUBMITTED",
      supervisorFeedback: null,
    },
    {
      id: "lb-stu-03",
      studentId: "stu-sec-10a-03",
      activityType: "COMMUNITY_SERVICE",
      title: "Campus Botanical Garden QR Labeling Drive",
      description: "Cataloged 28 native tree species in school botanical section and generated laminated information cards.",
      entryDate: new Date("2026-11-11T16:30:00.000Z"),
      hoursSpent: 2.0,
      status: "SUBMITTED",
      supervisorFeedback: null,
    },
  ]

  for (const lb of studentLogsData) {
    await prisma.log_book_entries.upsert({
      where: { id: lb.id },
      update: {
        title: lb.title,
        description: lb.description,
        hoursSpent: lb.hoursSpent,
        status: lb.status,
        supervisorFeedback: lb.supervisorFeedback,
      },
      create: {
        id: lb.id,
        institutionId: institution.id,
        studentId: lb.studentId,
        activityType: lb.activityType,
        title: lb.title,
        description: lb.description,
        entryDate: lb.entryDate,
        hoursSpent: lb.hoursSpent,
        status: lb.status,
        supervisorFeedback: lb.supervisorFeedback,
      },
    })
  }
  console.log(`✅ ${studentLogsData.length} Student Logbook Entries seeded`)

  // 5. Faculty & Student Leave Requests (approval_requests with requestType: 'LEAVE')
  const leaveRequestsData = [
    {
      id: "apr-leave-tch-01",
      userId: teacherUser.id,
      requestType: "LEAVE",
      title: "Casual Leave: 2026-11-26 to 2026-11-27 (2 days)",
      status: "APPROVED",
      adminRemarks: "Approved by Principal. Substitute faculty informed.",
      requestedDataJson: JSON.stringify({
        leaveType: "Casual Leave",
        fromDate: "2026-11-26",
        toDate: "2026-11-27",
        daysCount: 2,
        reason: "Attending National Mathematics Educators Pedagogy Summit in Bengaluru",
        substituteTeacherName: "Prof. Rajesh Verma",
        handoverNotes: "Section 10A will complete Chapter 4 revision worksheet in period 3.",
      }),
      reviewedAt: new Date("2026-11-12T10:00:00.000Z"),
    },
    {
      id: "apr-leave-tch-02",
      userId: teacherUser.id,
      requestType: "LEAVE",
      title: "Sick Leave: 2026-12-05 to 2026-12-05 (1 day)",
      status: "PENDING",
      requestedDataJson: JSON.stringify({
        leaveType: "Sick Leave",
        fromDate: "2026-12-05",
        toDate: "2026-12-05",
        daysCount: 1,
        reason: "Routine medical consultation and blood profile checkup",
        substituteTeacherName: "Ms. Meera Nair",
        handoverNotes: "Independent study period assigned for Section 10B.",
      }),
    },
    {
      id: "apr-leave-stu-01",
      userId: "user-stu-sec-10a-01",
      requestType: "STUDENT_LEAVE",
      title: "Medical Leave: Aarav Kulkarni (2 days)",
      status: "PENDING",
      requestedDataJson: JSON.stringify({
        studentId: "stu-sec-10a-01",
        rollNo: "10A-01",
        studentName: "Aarav Kulkarni",
        className: "Class 10",
        section: "A",
        leaveType: "Medical",
        fromDate: "2026-11-18",
        toDate: "2026-11-19",
        daysCount: 2,
        reason: "Seasonal viral fever with doctor-advised bed rest.",
        guardianName: "Mahesh Kulkarni",
        guardianPhone: "+91 98765 43210",
      }),
    },
    {
      id: "apr-leave-stu-02",
      userId: "user-stu-sec-10a-02",
      requestType: "STUDENT_LEAVE",
      title: "Co-Curricular Leave: Ananya Gupta (3 days)",
      status: "APPROVED",
      adminRemarks: "Approved. All attendance credits granted as On-Duty.",
      requestedDataJson: JSON.stringify({
        studentId: "stu-sec-10a-02",
        rollNo: "10A-02",
        studentName: "Ananya Gupta",
        className: "Class 10",
        section: "A",
        leaveType: "Co-Curricular",
        fromDate: "2026-11-22",
        toDate: "2026-11-24",
        daysCount: 3,
        reason: "Representing Vidya Niketan in CBSE State Inter-School Chess Championship.",
        guardianName: "Sanjay Gupta",
        guardianPhone: "+91 98765 43211",
      }),
      reviewedAt: new Date("2026-11-11T12:00:00.000Z"),
    },
  ]

  for (const lr of leaveRequestsData) {
    await prisma.approval_requests.upsert({
      where: { id: lr.id },
      update: {
        title: lr.title,
        status: lr.status,
        adminRemarks: lr.adminRemarks,
        requestedDataJson: lr.requestedDataJson,
        reviewedAt: lr.reviewedAt,
      },
      create: {
        id: lr.id,
        institutionId: institution.id,
        userId: lr.userId,
        requestType: lr.requestType,
        title: lr.title,
        status: lr.status,
        adminRemarks: lr.adminRemarks,
        requestedDataJson: lr.requestedDataJson,
        reviewedAt: lr.reviewedAt,
      },
    })
  }
  console.log(`✅ ${leaveRequestsData.length} Faculty & Student Leave Approval Requests seeded`)

  // 6. Real-time Notifications & Announcements
  const notificationsData = [
    {
      id: "notif-demo-01",
      title: "Internal Assessment Moderation Approved",
      message: "Periodic Test 1 IA marks for Section 10A have been reviewed and approved by the Head of Department.",
      category: "ASSESSMENT",
      audienceRole: "TEACHER",
      recipients: [{ userId: teacherUser.id, isRead: false }],
    },
    {
      id: "notif-demo-02",
      title: "Mid-Term Examination Invigilation Duty Allocated",
      message: "You have been assigned as Chief Invigilator for Room 402 on 02-Dec-2026 (Morning Session: 09:30 AM – 12:30 PM).",
      category: "EXAM",
      audienceRole: "TEACHER",
      recipients: [{ userId: teacherUser.id, isRead: false }],
    },
    {
      id: "notif-demo-03",
      title: "Daily Morning Attendance Recorded",
      message: "Daily morning attendance for Section 10A has been safely verified and synchronized with the campus ERP.",
      category: "ATTENDANCE",
      audienceRole: "TEACHER",
      recipients: [{ userId: teacherUser.id, isRead: true }],
    },
    {
      id: "notif-demo-04",
      title: "Annual Science & Innovation Exhibition Circular",
      message: "All faculty members are invited to review student science models in the Senior Auditorium on Nov 25.",
      category: "ANNOUNCEMENT",
      audienceRole: "ALL",
      recipients: [{ userId: teacherUser.id, isRead: false }],
    },
  ]

  for (const n of notificationsData) {
    const notif = await prisma.notifications.upsert({
      where: { id: n.id },
      update: {
        title: n.title,
        message: n.message,
        category: n.category,
        audienceRole: n.audienceRole,
      },
      create: {
        id: n.id,
        institutionId: institution.id,
        title: n.title,
        message: n.message,
        category: n.category,
        audienceRole: n.audienceRole,
        createdAt: new Date("2026-11-12T08:00:00.000Z"),
      },
    })

    for (const rec of n.recipients) {
      await prisma.notification_recipients.upsert({
        where: {
          notificationId_userId: {
            notificationId: notif.id,
            userId: rec.userId,
          },
        },
        update: {
          isRead: rec.isRead,
        },
        create: {
          id: `rec-${notif.id}-${rec.userId}`,
          notificationId: notif.id,
          userId: rec.userId,
          isRead: rec.isRead,
        },
      })
    }
  }
  console.log(`✅ ${notificationsData.length} Notifications & Announcements seeded`)

  console.log("🎉 All Teacher Portal baseline & roster records seeded successfully!")
}

main()
  .catch((e) => {
    console.error("❌ Error while seeding database:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
