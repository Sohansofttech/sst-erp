export type UserRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "INSTITUTION_ADMIN"
  | "ADMISSIONS_OFFICER"
  | "ACCOUNTANT"
  | "HOSTEL_WARDEN"
  | "TRANSPORT_OFFICER"
  | "TEACHER"
  | "STUDENT"
  | "PARENT";

export interface InstitutionDetails {
  id: string;
  name: string;
  code: string | null;
  slug: string | null;
  logo?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postalCode?: string | null;
}

export interface SessionUser {
  userId: string;
  email: string;
  fullName: string;
  name?: string; // Canonical alias for full name
  role: UserRole;
  institutionId: string;
  institutionName: string;
  institutionCode?: string | null;
  institutionSlug?: string | null;
  institution?: InstitutionDetails;
  studentId?: string; // Present if role is STUDENT
  guardianId?: string; // Present if role is PARENT
  activeChildId?: string; // Currently active child for PARENT
  permissions?: string[]; // Server-resolved permission codes
  assignedRoles?: string[]; // Server-resolved institutional role codes
  mustChangePassword?: boolean; // Force password change flag
  passwordSig?: string; // Full SHA-256 fingerprint of passwordHash for zero-migration session revocation
  supportInstitutionId?: string;
  supportSessionId?: string;
  supportExpiresAt?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface AttendanceSummary {
  overallPercentage: number;
  totalClasses: number;
  attendedClasses: number;
  absentClasses: number;
  lateClasses: number;
  subjectWise: {
    subjectId: string;
    subjectCode: string;
    subjectName: string;
    totalClasses: number;
    attended: number;
    percentage: number;
  }[];
}

export interface TimetableSlotView {
  id: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  roomNumber: string;
  subject: {
    code: string;
    name: string;
    isElective: boolean;
  };
  teacher?: {
    fullName: string;
  };
}

export interface FeeSummary {
  totalFee: number;
  totalPaid: number;
  totalOutstanding: number;
  invoices: {
    id: string;
    invoiceNumber: string;
    title: string;
    dueDate: string;
    totalAmount: number;
    paidAmount: number;
    outstandingAmount: number;
    status: string;
    items: {
      description: string;
      amount: number;
    }[];
  }[];
  recentPayments: {
    id: string;
    amount: number;
    paymentMethod: string;
    transactionRef: string;
    status: string;
    createdAt: string;
    receipt?: {
      receiptNumber: string;
      issuedDate: string;
    };
  }[];
}
