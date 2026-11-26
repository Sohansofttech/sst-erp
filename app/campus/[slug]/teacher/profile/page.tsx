"use client"

import * as React from "react"
import {
  Award,
  Building2,
  CheckCircle2,
  FileText,
  Lock,
  Mail,
  MapPin,
  Phone,
  Save,
  ShieldAlert,
} from "lucide-react"
import { toast } from "sonner"

import {
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "@/components/shared"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import {
  getInstitutionContext,
  getTeacherProfile,
  updateTeacherProfile,
} from "@/lib/services/teacher.service"
import type { Institution } from "@/types/common"
import type { TeacherProfile } from "@/types/teacher"
import { useTeacherRole } from "../teacher-role-context"

interface FacultyDocumentItem {
  id: string
  title: string
  category: string
  uploadedOn: string
  status: "Approved" | "Locked"
}

const FACULTY_DOCUMENTS: FacultyDocumentItem[] = [
  {
    id: "doc-1",
    title: "Institutional Appointment Order",
    category: "HR & Service Record",
    uploadedOn: "2018-06-04",
    status: "Locked",
  },
  {
    id: "doc-2",
    title: "Ph.D. & M.Sc. Mathematics Degree Certificates",
    category: "Academic Qualification",
    uploadedOn: "2018-06-04",
    status: "Approved",
  },
  {
    id: "doc-3",
    title: "B.Ed. Teaching Eligibility Certificate",
    category: "Teaching Credential",
    uploadedOn: "2018-06-04",
    status: "Approved",
  },
  {
    id: "doc-4",
    title: "CBSE Competency-Based Pedagogy Certification",
    category: "Professional Development",
    uploadedOn: "2026-07-19",
    status: "Approved",
  },
]

export default function TeacherProfilePage() {
  const { slug } = useTeacherRole()

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [profile, setProfile] = React.useState<TeacherProfile | null>(null)
  const [institution, setInstitution] = React.useState<Institution | null>(null)

  // Editable personal contact fields
  const [phone, setPhone] = React.useState("")
  const [officeRoom, setOfficeRoom] = React.useState("")
  const [specialization, setSpecialization] = React.useState("")
  const [bio, setBio] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const fetchProfileData = React.useCallback(async () => {
    const [profileData, tenantCtx] = await Promise.all([
      getTeacherProfile(),
      getInstitutionContext(slug),
    ])
    return { profileData, tenantCtx }
  }, [slug])

  const loadData = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { profileData, tenantCtx } = await fetchProfileData()
      setProfile(profileData)
      setInstitution(tenantCtx.institution)
      setPhone(profileData.phone)
      setOfficeRoom(profileData.officeRoom ?? "")
      setSpecialization(profileData.specialization ?? "")
      setBio(profileData.bio ?? "")
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load teacher profile."
      )
    } finally {
      setLoading(false)
    }
  }, [fetchProfileData])

  React.useEffect(() => {
    let active = true
    fetchProfileData()
      .then(({ profileData, tenantCtx }) => {
        if (!active) return
        setProfile(profileData)
        setInstitution(tenantCtx.institution)
        setPhone(profileData.phone)
        setOfficeRoom(profileData.officeRoom ?? "")
        setSpecialization(profileData.specialization ?? "")
        setBio(profileData.bio ?? "")
        setError(null)
      })
      .catch((err) => {
        if (!active) return
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load teacher profile."
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [fetchProfileData])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phone.trim()) {
      toast.error("Contact phone number is required.")
      return
    }
    setSaving(true)
    try {
      const updated = await updateTeacherProfile({
        phone: phone.trim(),
        officeRoom: officeRoom.trim(),
        specialization: specialization.trim(),
        bio: bio.trim(),
      })
      setProfile(updated)
      toast.success("Personal contact details updated")
    } catch {
      toast.error("Could not save profile changes.")
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    if (!profile) return
    setPhone(profile.phone)
    setOfficeRoom(profile.officeRoom ?? "")
    setSpecialization(profile.specialization ?? "")
    setBio(profile.bio ?? "")
    toast.info("Reverted unsaved changes")
  }

  if (loading) {
    return (
      <LoadingState
        title="Loading Teacher Profile"
        description="Fetching faculty profile, department details, and verified documents..."
      />
    )
  }

  if (error || !profile) {
    return (
      <ErrorState
        title="Unable to load profile"
        description={error ?? "Profile data unavailable."}
        onRetry={() => void loadData()}
      />
    )
  }

  const initials = profile.fullName
    .split(" ")
    .filter((p) => !p.endsWith("."))
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("")

  const hasChanges =
    phone !== profile.phone ||
    officeRoom !== (profile.officeRoom ?? "") ||
    specialization !== (profile.specialization ?? "") ||
    bio !== (profile.bio ?? "")

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Faculty Profile"
        subtitle="Manage your personal contact information and inspect verified institutional records."
        badge={<StatusBadge status="Approved" />}
      />

      {/* Profile Summary Banner */}
      <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
        <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <Avatar className="size-16 border-2 border-[#F5A000]/40">
              <AvatarFallback className="bg-[#123B5A] text-lg font-bold text-white">
                {initials || "FM"}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-[#202936]">
                  {profile.fullName}
                </h2>
                <Badge variant="outline" className="border-[#E5E9EF] bg-[#EEF1F5] font-mono text-[11px] font-bold text-[#123B5A]">
                  {profile.employeeCode}
                </Badge>
                {profile.isClassTeacher && profile.classTeacherOf && (
                  <Badge variant="outline" className="border-amber-300 bg-amber-50 font-semibold text-amber-800">
                    Class Teacher: {profile.classTeacherOf}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-[#788391]">
                {profile.designation} · {profile.departmentName}
              </p>
              <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-[#788391]">
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="size-3.5 text-[#F5A000]" />
                  {profile.email}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-3.5 text-[#F5A000]" />
                  {profile.phone || "Not provided"}
                </span>
                {profile.officeRoom && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-3.5 text-[#F5A000]" />
                    {profile.officeRoom}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-1 rounded-xl border border-[#E5E9EF] bg-[#EEF1F5]/60 px-5 py-3.5 text-left sm:text-right w-full sm:w-auto">
            <span className="text-xs font-semibold text-[#788391]">
              Total Experience
            </span>
            <span className="text-2xl font-bold text-[#202936]">
              {profile.experienceYears} Years
            </span>
            <span className="text-xs text-[#788391]">
              Joined {profile.joiningDate}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Editable Personal Contact Info */}
        <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
          <form onSubmit={(e) => void handleSave(e)}>
            <CardHeader>
              <CardTitle className="text-lg font-bold text-[#202936]">Personal Contact & Teaching Bio</CardTitle>
              <CardDescription className="text-sm text-[#788391]">
                You can update your contact phone, staff room desk, and faculty bio directly.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="teacher-phone" className="text-xs font-semibold text-[#202936]">Mobile / Contact Number</Label>
                <Input
                  id="teacher-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Enter contact number"
                  className="rounded-xl border-[#E5E9EF] bg-white text-[#202936] focus-visible:ring-[#F5A000]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="teacher-office" className="text-xs font-semibold text-[#202936]">Staff Room / Cabin</Label>
                <Input
                  id="teacher-office"
                  value={officeRoom}
                  onChange={(e) => setOfficeRoom(e.target.value)}
                  placeholder="e.g. Staff Room 2, Block B"
                  className="rounded-xl border-[#E5E9EF] bg-white text-[#202936] focus-visible:ring-[#F5A000]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="teacher-spec" className="text-xs font-semibold text-[#202936]">Academic Specialization</Label>
                <Input
                  id="teacher-spec"
                  value={specialization}
                  onChange={(e) => setSpecialization(e.target.value)}
                  placeholder="e.g. Subject Pedagogy & Mentoring"
                  className="rounded-xl border-[#E5E9EF] bg-white text-[#202936] focus-visible:ring-[#F5A000]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="teacher-bio" className="text-xs font-semibold text-[#202936]">Faculty Bio</Label>
                <Textarea
                  id="teacher-bio"
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Brief teaching overview or academic profile..."
                  className="rounded-xl border-[#E5E9EF] bg-white text-[#202936] focus-visible:ring-[#F5A000]"
                />
              </div>
            </CardContent>
            <CardFooter className="flex-col-reverse sm:flex-row justify-end gap-2 border-t border-[#E5E9EF] pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={!hasChanges || saving}
                onClick={handleReset}
                className="w-full sm:w-auto rounded-xl border-[#E5E9EF] text-[#202936] hover:bg-[#EEF1F5]"
              >
                Reset
              </Button>
              <Button type="submit" disabled={!hasChanges || saving} className="w-full sm:w-auto rounded-xl bg-[#F5A000] text-[#123B5A] font-bold hover:bg-[#E09200]">
                <Save className="size-4" />
                {saving ? "Saving..." : "Save Contact Info"}
              </Button>
            </CardFooter>
          </form>
        </Card>

        {/* Locked Official Institutional Fields */}
        <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-bold text-[#202936]">
              <Lock className="size-4 text-[#123B5A]" />
              Official Institutional Record
            </CardTitle>
            <CardDescription className="text-sm text-[#788391]">
              Verified HR and campus assignment details.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-700" />
              <div>
                <span className="font-bold">Admin approval required:</span>{" "}
                Official fields such as name, employee code, department, designation, and qualification are locked. Contact Campus Administration to request corrections.
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[#788391]">Official Name</Label>
                <Input value={profile.fullName} disabled className="rounded-xl border-[#E5E9EF] bg-[#EEF1F5] text-[#202936] font-semibold" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[#788391]">Employee Code</Label>
                <Input
                  value={profile.employeeCode}
                  disabled
                  className="rounded-xl border-[#E5E9EF] bg-[#EEF1F5] font-mono font-bold text-[#123B5A]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[#788391]">
                  Official Email
                </Label>
                <Input value={profile.email} disabled className="rounded-xl border-[#E5E9EF] bg-[#EEF1F5] text-[#202936] font-medium" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[#788391]">Department</Label>
                <Input
                  value={profile.departmentName}
                  disabled
                  className="rounded-xl border-[#E5E9EF] bg-[#EEF1F5] text-[#202936] font-medium"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[#788391]">Designation</Label>
                <Input
                  value={profile.designation}
                  disabled
                  className="rounded-xl border-[#E5E9EF] bg-[#EEF1F5] text-[#202936] font-medium"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[#788391]">
                  Assigned Institution
                </Label>
                <Input
                  value={institution?.name ? `${institution.name} (${institution.boardOrUniversity ?? "CBSE"})` : "Assigned Campus Institution"}
                  disabled
                  className="rounded-xl border-[#E5E9EF] bg-[#EEF1F5] text-[#202936] font-medium"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#788391]">
                Verified Qualifications
              </Label>
              <Input
                value={profile.qualification || "Not provided"}
                disabled
                className="rounded-xl border-[#E5E9EF] bg-[#EEF1F5] text-[#202936] font-medium"
              />
            </div>

            <Separator className="bg-[#E5E9EF]" />

            <div className="space-y-2">
              <p className="text-xs font-bold text-[#788391]">
                Assigned Subjects (Current AY)
              </p>
              <div className="flex flex-wrap gap-2">
                {profile.subjectsHandled.length > 0 ? (
                  profile.subjectsHandled.map((sub) => (
                    <Badge key={sub} variant="outline" className="gap-1 border-[#E5E9EF] bg-[#EEF1F5] text-[#123B5A] font-semibold">
                      <Building2 className="size-3 text-[#123B5A]" />
                      {sub}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-[#788391]">No subjects assigned in current academic term.</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Verified Documents */}
      <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-bold text-[#202936]">
            <Award className="size-4 text-[#F5A000]" />
            Credentials & Institutional Documents
          </CardTitle>
          <CardDescription className="text-sm text-[#788391]">
            Academic degrees, teaching eligibility, and HR appointment documents on file.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            {FACULTY_DOCUMENTS.map((doc) => (
              <div
                key={doc.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-[#E5E9EF] p-4 bg-white hover:border-[#123B5A]/30 transition-all"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-[#F5A000]">
                    <FileText className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#202936]">
                      {doc.title}
                    </p>
                    <p className="text-xs text-[#788391]">
                      {doc.category} · Uploaded {doc.uploadedOn}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center justify-between sm:justify-start gap-2 w-full sm:w-auto">
                  <StatusBadge status={doc.status} />
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    className="rounded-lg border-[#E5E9EF] text-[#202936] hover:bg-[#EEF1F5]"
                    onClick={() =>
                      toast.info(`Verified document: ${doc.title}`, {
                        description: "Digital verification active.",
                      })
                    }
                  >
                    <CheckCircle2 className="size-3.5 text-emerald-600" />
                    Inspect
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

