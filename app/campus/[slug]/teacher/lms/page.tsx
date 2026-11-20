"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useWatch } from "react-hook-form"
import { z } from "zod"
import {
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FileText,
  FolderOpen,
  Link2,
  Plus,
  Search,
  StickyNote,
  Trash2,
  UploadCloud,
  Video,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "@/components/shared"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  createLearningMaterial,
  deleteLearningMaterial,
  getLearningMaterials,
  getSubjectAllocations,
} from "@/lib/services/teacher.service"
import type {
  LearningMaterial,
  LearningMaterialType,
  SubjectAllocation,
} from "@/types/teacher"
import { useTeacherRole } from "../teacher-role-context"

const ALLOWED_EXTENSIONS = [".pdf", ".ppt", ".pptx", ".doc", ".docx", ".md"]
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

const addMaterialSchema = z
  .object({
    subjectAllocationId: z.string().min(1, "Select course / subject"),
    unit: z.string().min(3, "Unit / Chapter name is required"),
    title: z.string().min(3, "Material title must be at least 3 characters"),
    type: z.enum(["pdf", "video", "link", "note"]),
    description: z.string().optional(),
    resourceUrl: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.type === "video" || val.type === "link") {
      if (!val.resourceUrl || !/^https?:\/\/.+/.test(val.resourceUrl.trim())) {
        ctx.addIssue({
          code: "custom",
          path: ["resourceUrl"],
          message: "Enter a valid URL starting with http:// or https://",
        })
      }
    }
  })

type AddMaterialValues = z.infer<typeof addMaterialSchema>

const TYPE_META: Record<
  LearningMaterialType,
  { label: string; icon: React.ReactNode; badgeClass: string }
> = {
  pdf: {
    label: "PDF Notes",
    icon: <FileText className="size-4" />,
    badgeClass: "border-error/25 bg-error/10 text-error",
  },
  video: {
    label: "Video Link",
    icon: <Video className="size-4" />,
    badgeClass: "border-primary/25 bg-primary/10 text-primary",
  },
  link: {
    label: "Reference Link",
    icon: <Link2 className="size-4" />,
    badgeClass: "border-teal/30 bg-teal/12 text-teal-700",
  },
  note: {
    label: "Revision Note",
    icon: <StickyNote className="size-4" />,
    badgeClass: "border-warning/30 bg-warning/12 text-amber-700",
  },
}

export default function TeacherLMSPage() {
  const { academicYear } = useTeacherRole()

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [materials, setMaterials] = React.useState<LearningMaterial[]>([])
  const [subjectAllocs, setSubjectAllocs] = React.useState<SubjectAllocation[]>(
    []
  )
  const [subjectFilter, setSubjectFilter] = React.useState("all")
  const [searchQuery, setSearchQuery] = React.useState("")

  // Upload/Add dialog state
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [selectedFile, setSelectedFile] = React.useState<{
    name: string
    sizeLabel: string
  } | null>(null)
  const [fileError, setFileError] = React.useState<string | null>(null)
  const [isDragging, setIsDragging] = React.useState(false)

  const {
    register,
    control,
    handleSubmit,
    setValue,
    reset,
    formState: { errors: formErrors, isSubmitting },
  } = useForm<AddMaterialValues>({
    resolver: zodResolver(addMaterialSchema),
    defaultValues: {
      subjectAllocationId: "",
      unit: "",
      title: "",
      type: "pdf",
      description: "",
      resourceUrl: "",
    },
  })

  const selectedAllocId = useWatch({ control, name: "subjectAllocationId" })
  const materialType = useWatch({ control, name: "type" })

  const fetchInitial = React.useCallback(async () => {
    const [mats, allocs] = await Promise.all([
      getLearningMaterials(),
      getSubjectAllocations(),
    ])
    return { mats, allocs }
  }, [])

  const retryLoad = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { mats, allocs } = await fetchInitial()
      setMaterials(mats)
      setSubjectAllocs(allocs)
      if (allocs[0]) setValue("subjectAllocationId", allocs[0].id)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load LMS study materials."
      )
    } finally {
      setLoading(false)
    }
  }, [fetchInitial, setValue])

  React.useEffect(() => {
    let active = true
    fetchInitial()
      .then(({ mats, allocs }) => {
        if (!active) return
        setMaterials(mats)
        setSubjectAllocs(allocs)
        if (allocs[0]) setValue("subjectAllocationId", allocs[0].id)
        setError(null)
      })
      .catch((err) => {
        if (!active) return
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load LMS study materials."
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [fetchInitial, setValue])

  const validateAndAcceptFile = (file?: File) => {
    if (!file) return
    const lowerName = file.name.toLowerCase()
    const validExt = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))
    if (!validExt) {
      setFileError(
        `Unsupported file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`
      )
      setSelectedFile(null)
      return
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileError("File size exceeds the 10 MB maximum limit.")
      setSelectedFile(null)
      return
    }
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2)
    const sizeLabel =
      Number(sizeMB) < 0.1
        ? `${Math.max(1, Math.round(file.size / 1024))} KB`
        : `${sizeMB} MB`
    setFileError(null)
    setSelectedFile({ name: file.name, sizeLabel })
  }

  const onCreateMaterial = async (values: AddMaterialValues) => {
    const isFileMode = values.type === "pdf" || values.type === "note"
    if (isFileMode && !selectedFile) {
      setFileError("Please attach a valid file (max 10 MB) before uploading.")
      return
    }

    const alloc = subjectAllocs.find((s) => s.id === values.subjectAllocationId)
    if (!alloc) return

    try {
      const created = await createLearningMaterial({
        classId: alloc.classId,
        className: alloc.className,
        section: alloc.section,
        subjectId: alloc.subjectId,
        subjectName: alloc.subjectName,
        unit: values.unit.trim(),
        title: values.title.trim(),
        description: values.description?.trim() || undefined,
        type: values.type,
        fileUrl: isFileMode
          ? `/materials/${selectedFile?.name ?? "resource.pdf"}`
          : (values.resourceUrl?.trim() ?? ""),
        fileSizeLabel: isFileMode ? selectedFile?.sizeLabel : undefined,
        isPublished: true,
      })

      setMaterials((prev) => [created, ...prev])
      setDialogOpen(false)
      setSelectedFile(null)
      setFileError(null)
      reset({
        subjectAllocationId: alloc.id,
        unit: "",
        title: "",
        type: "pdf",
        description: "",
        resourceUrl: "",
      })
      toast.success(`Added "${created.title}" to ${created.unit}`)
    } catch {
      toast.error("Failed to save study material.")
    }
  }

  const handleDelete = async (material: LearningMaterial) => {
    try {
      await deleteLearningMaterial(material.id)
      setMaterials((prev) => prev.filter((m) => m.id !== material.id))
      toast.info(`Removed "${material.title}"`)
    } catch {
      toast.error("Could not delete study material.")
    }
  }

  if (loading) {
    return (
      <LoadingState
        title="Loading LMS Study Material"
        description="Organizing course resources by units and chapters..."
      />
    )
  }

  if (error) {
    return (
      <ErrorState
        title="Unable to load study materials"
        description={error}
        onRetry={() => void retryLoad()}
      />
    )
  }

  // Unique courses by subjectId
  const uniqueCourses = Array.from(
    new Map(subjectAllocs.map((s) => [s.subjectId, s])).values()
  )

  const filteredMaterials = materials.filter((item) => {
    if (subjectFilter !== "all" && item.subjectId !== subjectFilter) {
      return false
    }
    const q = searchQuery.trim().toLowerCase()
    if (!q) return true
    return (
      item.title.toLowerCase().includes(q) ||
      item.unit.toLowerCase().includes(q) ||
      item.subjectName.toLowerCase().includes(q)
    )
  })

  // Group by Unit / Chapter
  const groupedByUnit = filteredMaterials.reduce<
    Record<string, LearningMaterial[]>
  >((acc, item) => {
    const key = item.unit || "General Resources"
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})

  const unitNames = Object.keys(groupedByUnit)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Study Material (LMS)"
        subtitle={`Organize lecture PDFs, video lessons, and reference links by unit · AY ${academicYear}`}
        action={
          <Button type="button" className="w-full sm:w-auto" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" />
            Add Study Material
          </Button>
        }
      />

      {/* Filter Bar */}
      <Card className="py-4 rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
        <CardContent className="flex flex-col gap-3 px-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 w-full sm:w-auto">
            <Select value={subjectFilter} onValueChange={setSubjectFilter}>
              <SelectTrigger className="w-full sm:w-64 border-[#E5E9EF]">
                <SelectValue placeholder="All Courses / Subjects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Courses & Subjects</SelectItem>
                {uniqueCourses.map((course) => (
                  <SelectItem key={course.subjectId} value={course.subjectId}>
                    {course.subjectName} ({course.subjectCode})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#788391]" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search title or unit..."
                className="pl-9 w-full"
              />
            </div>
          </div>

          <Badge variant="secondary" className="rounded-full bg-[#EEF1F5] text-[#202936] font-semibold w-fit">
            {filteredMaterials.length} Resources · {unitNames.length} Units
          </Badge>
        </CardContent>
      </Card>

      {/* Unit / Chapter Grouped Sections */}
      {unitNames.length === 0 ? (
        <EmptyState
          title="No study materials found"
          description="Upload PDF notes or attach video/reference links for your students."
          action={
            <Button type="button" className="rounded-xl bg-[#F5A000] text-white font-bold hover:bg-[#E09200]" onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" />
              Add Study Material
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          {unitNames.map((unitName) => (
            <Card key={unitName} className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
              <CardHeader className="border-b border-[#E5E9EF] pb-4">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-[#202936]">
                    <FolderOpen className="size-4 text-[#F5A000]" />
                    {unitName}
                  </CardTitle>
                  <Badge variant="outline" className="rounded-full border-[#E5E9EF] text-[#788391]">
                    {groupedByUnit[unitName].length} item(s)
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 pt-4 md:grid-cols-2">
                {groupedByUnit[unitName].map((item) => {
                  const meta = TYPE_META[item.type]
                  return (
                    <div
                      key={item.id}
                      className="flex flex-col justify-between gap-3 rounded-xl border border-[#E5E9EF] bg-white p-4 shadow-xs"
                    >
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                              meta.badgeClass
                            )}
                          >
                            {meta.icon}
                            {meta.label}
                          </span>
                          <StatusBadge
                            status={item.isPublished ? "Published" : "Draft"}
                          />
                        </div>

                        <h3 className="text-[14.5px] font-bold text-[#202936]">
                          {item.title}
                        </h3>
                        {item.description && (
                          <p className="text-[13px] text-[#788391]">
                            {item.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between border-t border-[#E5E9EF] pt-3 text-[12.5px] text-[#788391]">
                        <div className="flex items-center gap-2">
                          <BookOpen className="size-3.5 text-[#123B5A]" />
                          <span>
                            {item.className} ({item.section}) ·{" "}
                            {item.subjectName}
                          </span>
                          {item.fileSizeLabel && (
                            <span className="font-mono text-[11px] text-[#788391]">
                              ({item.fileSizeLabel})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            className="rounded-lg border-[#E5E9EF] text-[#202936] hover:bg-[#EEF1F5]"
                            onClick={() =>
                              toast.info(`Opening ${item.title}`, {
                                description: item.fileUrl,
                              })
                            }
                          >
                            <ExternalLink className="size-3.5" />
                            Open
                          </Button>
                          <Button
                            type="button"
                            size="icon-xs"
                            variant="ghost"
                            className="rounded-lg hover:bg-rose-50"
                            aria-label={`Delete ${item.title}`}
                            onClick={() => void handleDelete(item)}
                          >
                            <Trash2 className="size-3.5 text-rose-600" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Upload / Add Material Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto w-[calc(100vw-2rem)] sm:max-w-lg">
          <form onSubmit={handleSubmit(onCreateMaterial)}>
            <DialogHeader>
              <DialogTitle>Add Study Material</DialogTitle>
              <DialogDescription>
                Upload lecture PDFs (max 10 MB) or share curated video and web reference links.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="lms-alloc">Course & Class</Label>
                  <Select
                    value={selectedAllocId}
                    onValueChange={(val) =>
                      setValue("subjectAllocationId", val, {
                        shouldValidate: true,
                      })
                    }
                  >
                    <SelectTrigger id="lms-alloc" className="w-full">
                      <SelectValue placeholder="Select course" />
                    </SelectTrigger>
                    <SelectContent>
                      {subjectAllocs.map((alloc) => (
                        <SelectItem key={alloc.id} value={alloc.id}>
                          {alloc.className}-{alloc.section} ·{" "}
                          {alloc.subjectName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formErrors.subjectAllocationId && (
                    <p className="text-xs font-medium text-error">
                      {formErrors.subjectAllocationId.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="lms-type">Material Type</Label>
                  <Select
                    value={materialType}
                    onValueChange={(val) => {
                      setValue("type", val as LearningMaterialType, {
                        shouldValidate: true,
                      })
                      setFileError(null)
                    }}
                  >
                    <SelectTrigger id="lms-type" className="w-full">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pdf">PDF Notes</SelectItem>
                      <SelectItem value="video">Video Link</SelectItem>
                      <SelectItem value="link">Reference Link</SelectItem>
                      <SelectItem value="note">Revision Note (File)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="lms-unit">Unit / Chapter</Label>
                <Input
                  id="lms-unit"
                  placeholder="e.g., Unit 5: Arithmetic Progressions"
                  {...register("unit")}
                />
                {formErrors.unit && (
                  <p className="text-xs font-medium text-error">
                    {formErrors.unit.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="lms-title">Title</Label>
                <Input
                  id="lms-title"
                  placeholder="e.g., NCERT Solved Exemplar Sheet"
                  {...register("title")}
                />
                {formErrors.title && (
                  <p className="text-xs font-medium text-error">
                    {formErrors.title.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="lms-desc">Description (Optional)</Label>
                <Textarea
                  id="lms-desc"
                  rows={2}
                  placeholder="Key takeaways or study instructions..."
                  {...register("description")}
                />
              </div>

              {materialType === "pdf" || materialType === "note" ? (
                <div className="space-y-1.5">
                  <Label>File Upload Dropzone</Label>
                  <label
                    htmlFor="lms-dropzone"
                    onDragOver={(e) => {
                      e.preventDefault()
                      setIsDragging(true)
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault()
                      setIsDragging(false)
                      validateAndAcceptFile(e.dataTransfer.files?.[0])
                    }}
                    className={cn(
                      "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors",
                      isDragging
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/40"
                    )}
                  >
                    <UploadCloud className="size-8 text-primary" />
                    {selectedFile ? (
                      <div className="mt-2 flex items-center gap-2 text-[13.5px] font-semibold text-success">
                        <CheckCircle2 className="size-4" />
                        <span>
                          {selectedFile.name} ({selectedFile.sizeLabel})
                        </span>
                      </div>
                    ) : (
                      <>
                        <p className="mt-2 text-[13.5px] font-semibold text-foreground">
                          Drag & drop file here, or click to browse
                        </p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                          Allowed: PDF, PPT/PPTX, DOC/DOCX, MD · Max size 10 MB
                        </p>
                      </>
                    )}
                    <input
                      id="lms-dropzone"
                      type="file"
                      accept={ALLOWED_EXTENSIONS.join(",")}
                      className="sr-only"
                      onChange={(e) =>
                        validateAndAcceptFile(e.target.files?.[0])
                      }
                    />
                  </label>
                  {fileError && (
                    <p className="text-xs font-semibold text-error">
                      {fileError}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="lms-url">Resource URL</Label>
                  <Input
                    id="lms-url"
                    type="url"
                    placeholder="https://..."
                    {...register("resourceUrl")}
                  />
                  {formErrors.resourceUrl && (
                    <p className="text-xs font-semibold text-error">
                      {formErrors.resourceUrl.message}
                    </p>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                {isSubmitting ? "Uploading..." : "Add Material"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

