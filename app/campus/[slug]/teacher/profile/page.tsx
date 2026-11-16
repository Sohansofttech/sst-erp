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
      <Card>
        <CardContent className="flex flex-col gap-5 px-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <Avatar className="size-16 border-2 border-teal/30">
              <AvatarFallback className="bg-brand text-lg font-bold text-white">
                {initials || "AS"}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[19px] font-semibold text-foreground">
                  {profile.fullName}
                </h2>
                <Badge variant="brand" className="font-mono text-[11px]">
                  {profile.employeeCode}
                </Badge>
                {profile.isClassTeacher && profile.classTeacherOf && (
                  <Badge variant="teal">
                    Class Teacher: {profile.classTeacherOf}
                  </Badge>
                )}
              </div>
              <p className="text-[14px] text-muted-foreground">
                {profile.designation} · {profile.departmentName}
              </p>
              <div className="flex flex-wrap items-center gap-4 pt-1 text-[13px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="size-3.5 text-primary" />
                  {profile.email}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-3.5 text-primary" />
                  {profile.phone}
                </span>
                {profile.officeRoom && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-3.5 text-primary" />
                    {profile.officeRoom}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-1 rounded-xl border bg-background px-4 py-3 text-left sm:text-right">
            <span className="text-[12px] font-medium text-muted-foreground">
              Total Experience
            </span>
            <span className="text-xl font-bold text-foreground">
              {profile.experienceYears} Years
            </span>
            <span className="text-[12px] text-muted-foreground">
              Joined {profile.joiningDate}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Editable Personal Contact Info */}
        <Card>
          <form onSubmit={(e) => void handleSave(e)}>
            <CardHeader>
              <CardTitle>Personal Contact & Teaching Bio</CardTitle>
              <CardDescription>
                You can update your contact phone, staff room desk, and faculty bio directly.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="teacher-phone">Mobile / Contact Number</Label>
                <Input
                  id="teacher-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98450 00000"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="teacher-office">Staff Room / Cabin</Label>
                <Input
                  id="teacher-office"
                  value={officeRoom}
                  onChange={(e) => setOfficeRoom(e.target.value)}
                  placeholder="Staff Room 2, Block B"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="teacher-spec">Academic Specialization</Label>
                <Input
                  id="teacher-spec"
                  value={specialization}
                  onChange={(e) => setSpecialization(e.target.value)}
                  placeholder="e.g., Algebra & Olympiad Mentoring"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="teacher-bio">Faculty Bio</Label>
                <Textarea
                  id="teacher-bio"
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Brief teaching overview..."
                />
              </div>
            </CardContent>
            <CardFooter className="justify-end gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={!hasChanges || saving}
                onClick={handleReset}
              >
                Reset
              </Button>
              <Button type="submit" disabled={!hasChanges || saving}>
                <Save className="size-4" />
                {saving ? "Saving..." : "Save Contact Info"}
              </Button>
            </CardFooter>
          </form>
        </Card>

        {/* Locked Official Institutional Fields */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="size-4 text-brand" />
              Official Institutional Record
            </CardTitle>
            <CardDescription>
              Verified HR and campus assignment details.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-2.5 rounded-lg border border-warning/35 bg-warning/10 p-3 text-[13px] text-amber-900">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              <div>
                <span className="font-semibold">Admin approval required:</span>{" "}
                Official fields such as name, employee code, department, designation, and qualification are locked. Contact Campus Administration to request corrections.
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-muted-foreground">Official Name</Label>
                <Input value={profile.fullName} disabled className="bg-muted" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground">Employee Code</Label>
                <Input
                  value={profile.employeeCode}
                  disabled
                  className="bg-muted font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground">
                  Official Email
                </Label>
                <Input value={profile.email} disabled className="bg-muted" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground">Department</Label>
                <Input
                  value={profile.departmentName}
                  disabled
                  className="bg-muted"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground">Designation</Label>
                <Input
                  value={profile.designation}
                  disabled
                  className="bg-muted"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground">
                  Assigned Institution
                </Label>
                <Input
                  value={`${institution?.name ?? "Vidya Niketan Public School"} (${institution?.boardOrUniversity ?? "CBSE"})`}
                  disabled
                  className="bg-muted"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-muted-foreground">
                Verified Qualifications
              </Label>
              <Input
                value={profile.qualification}
                disabled
                className="bg-muted"
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <p className="text-[13px] font-medium text-muted-foreground">
                Assigned Subjects (Current AY)
              </p>
              <div className="flex flex-wrap gap-2">
                {profile.subjectsHandled.map((sub) => (
                  <Badge key={sub} variant="secondary" className="gap-1">
                    <Building2 className="size-3 text-brand" />
                    {sub}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Verified Documents */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="size-4 text-primary" />
            Credentials & Institutional Documents
          </CardTitle>
          <CardDescription>
            Academic degrees, teaching eligibility, and HR appointment documents on file.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {FACULTY_DOCUMENTS.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-3 rounded-xl border p-4"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileText className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-foreground">
                      {doc.title}
                    </p>
                    <p className="text-[12.5px] text-muted-foreground">
                      {doc.category} · Uploaded {doc.uploadedOn}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={doc.status} />
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      toast.info(`Verified document: ${doc.title}`, {
                        description: "Digital verification active.",
                      })
                    }
                  >
                    <CheckCircle2 className="size-3.5 text-success" />
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

