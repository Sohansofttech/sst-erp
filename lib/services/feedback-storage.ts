import fs from "fs";
import path from "path";

export interface StoredFeedback {
  id: string;
  institutionId: string;
  studentId: string;
  category: string;
  subject: string;
  message: string;
  status: "PENDING" | "IN_PROGRESS" | "RESOLVED" | "REJECTED" | string;
  response: string | null;
  submittedAt: string;
  respondedAt: string | null;
  student?: {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string | null;
    rollNumber: string;
    admissionNumber: string;
    email?: string | null;
    phone?: string | null;
    currentDepartment?: {
      id: string;
      name: string;
      code: string;
    } | null;
    currentCourse?: {
      id: string;
      name: string;
      code: string;
    } | null;
    user?: {
      name: string | null;
      email: string | null;
      phone: string | null;
    } | null;
  };
}

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "feedbacks_store.json");

// Default initial seeded feedbacks (including yesterday's resolved Wi-Fi and today's 2 submissions)
function getDefaultFeedbacks(): StoredFeedback[] {
  return [
    {
      id: "fb_today_books_20261119",
      institutionId: "inst_apex",
      studentId: "student_john_doe",
      category: "ACADEMIC",
      subject: "about books",
      message: "i dont get required semester reference textbooks from library. Need updated editions for computer networks and operating systems.",
      status: "PENDING",
      response: null,
      submittedAt: "2026-11-19T04:30:00.000Z",
      respondedAt: null,
      student: {
        id: "student_john_doe",
        firstName: "John",
        lastName: "Doe",
        fullName: "John Doe",
        rollNumber: "23CS089",
        admissionNumber: "ADM-2023-CS089",
        email: "john.doe@student.apex.edu",
        phone: "+91 98765 43210",
        currentDepartment: { id: "dept_cse", name: "Computer Science and Engineering", code: "CSE" },
        currentCourse: { id: "crs_btech", name: "B.Tech Computer Science and Engineering", code: "CS" },
        user: { name: "John Doe", email: "john.doe@student.apex.edu", phone: "+91 98765 43210" },
      },
    },
    {
      id: "fb_today_food_20261119",
      institutionId: "inst_apex",
      studentId: "student_john_doe",
      category: "HOSTEL",
      subject: "about food",
      message: "food is not hot during lunch hours in Block B mess. Please improve food quality and hygiene standards.",
      status: "PENDING",
      response: null,
      submittedAt: "2026-11-19T04:35:00.000Z",
      respondedAt: null,
      student: {
        id: "student_john_doe",
        firstName: "John",
        lastName: "Doe",
        fullName: "John Doe",
        rollNumber: "23CS089",
        admissionNumber: "ADM-2023-CS089",
        email: "john.doe@student.apex.edu",
        phone: "+91 98765 43210",
        currentDepartment: { id: "dept_cse", name: "Computer Science and Engineering", code: "CSE" },
        currentCourse: { id: "crs_btech", name: "B.Tech Computer Science and Engineering", code: "CS" },
        user: { name: "John Doe", email: "john.doe@student.apex.edu", phone: "+91 98765 43210" },
      },
    },
    {
      id: "18585eb9-3592-4738-b44f-0a2b855942d2",
      institutionId: "inst_apex",
      studentId: "student_john_doe",
      category: "INFRASTRUCTURE",
      subject: "Wi-Fi Coverage in Library Reading Hall 3",
      message: "The 5GHz signal drops frequently near the west wing cubicles in Library Hall 3.",
      status: "RESOLVED",
      response: "IT Network team has installed an additional Cisco access point in West Wing. Tested and operational at 150 Mbps.",
      submittedAt: "2026-11-13T09:00:00.000Z",
      respondedAt: "2026-11-14T11:30:00.000Z",
      student: {
        id: "student_john_doe",
        firstName: "John",
        lastName: "Doe",
        fullName: "John Doe",
        rollNumber: "23CS089",
        admissionNumber: "ADM-2023-CS089",
        email: "john.doe@student.apex.edu",
        phone: "+91 98765 43210",
        currentDepartment: { id: "dept_cse", name: "Computer Science and Engineering", code: "CSE" },
        currentCourse: { id: "crs_btech", name: "B.Tech Computer Science and Engineering", code: "CS" },
        user: { name: "John Doe", email: "john.doe@student.apex.edu", phone: "+91 98765 43210" },
      },
    },
  ];
}

// In-memory cache synced with disk
let cachedStore: StoredFeedback[] | null = null;

export function loadAllPersistedFeedbacks(): StoredFeedback[] {
  if (cachedStore) return cachedStore;

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Merge with default seed items if any are missing
        const defaults = getDefaultFeedbacks();
        for (const def of defaults) {
          if (!parsed.some((p: any) => p.id === def.id || (p.subject === def.subject && p.category === def.category))) {
            parsed.push(def);
          }
        }
        cachedStore = parsed;
        return cachedStore;
      }
    }
  } catch (err) {
    console.warn("Failed reading persisted feedbacks file:", err);
  }

  // Initialize store file with defaults
  const defaults = getDefaultFeedbacks();
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(defaults, null, 2), "utf-8");
  } catch (err) {
    console.warn("Failed initializing persisted feedbacks file:", err);
  }

  cachedStore = defaults;
  return cachedStore;
}

export function saveAllPersistedFeedbacks(list: StoredFeedback[]): void {
  cachedStore = list;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(list, null, 2), "utf-8");
  } catch (err) {
    console.warn("Failed saving feedbacks to disk:", err);
  }
}

export function addOrUpdatePersistedFeedback(feedback: StoredFeedback): void {
  const all = loadAllPersistedFeedbacks();
  const index = all.findIndex((f) => f.id === feedback.id);
  if (index >= 0) {
    all[index] = { ...all[index], ...feedback };
  } else {
    all.unshift(feedback);
  }
  saveAllPersistedFeedbacks(all);
}

export function updatePersistedFeedbackStatus(
  feedbackId: string,
  status: string,
  response?: string,
  respondedAt?: string | null,
  institutionId?: string
): StoredFeedback | null {
  const all = loadAllPersistedFeedbacks();
  const target = all.find((f) => f.id === feedbackId);
  if (!target) return null;

  // Strict tenant isolation guard
  if (institutionId && target.institutionId && target.institutionId !== institutionId) {
    return null;
  }

  target.status = status;
  if (response !== undefined) {
    target.response = response;
  }
  if (respondedAt !== undefined) {
    target.respondedAt = respondedAt;
  } else if (response && response.trim().length > 0) {
    target.respondedAt = new Date().toISOString();
  }

  saveAllPersistedFeedbacks(all);
  return target;
}

