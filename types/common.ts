export type InstitutionType = "school" | "pu_college" | "engineering_college"

export interface Institution {
  id: string
  name: string
  slug: string
  type: InstitutionType
  code?: string
  city?: string
  state?: string
  boardOrUniversity?: string
  logoUrl?: string
}

export interface AcademicYear {
  id: string
  institutionId: string
  name: string
  isCurrent: boolean
  startDate?: string
  endDate?: string
}

export type ApprovalStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "returned"
  | "approved"
  | "rejected"
  | "locked"

export type DayOfWeek =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"

export interface TenantContext {
  institution: Institution
  academicYears: AcademicYear[]
  currentAcademicYear: AcademicYear
}

