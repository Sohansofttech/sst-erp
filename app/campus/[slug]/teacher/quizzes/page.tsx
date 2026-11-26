"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useFieldArray, useForm, useWatch } from "react-hook-form"
import { z } from "zod"
import {
  CheckCircle2,
  Clock,
  FileCheck2,
  ListChecks,
  Plus,
  Send,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

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
  CardDescription,
  CardFooter,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  createQuiz,
  evaluateQuizSubmission,
  getQuizzes,
  getQuizSubmissions,
  getSubjectAllocations,
  updateQuizStatus,
} from "@/lib/services/teacher.service"
import type {
  Quiz,
  QuizSubmission,
  SubjectAllocation,
} from "@/types/teacher"
import { useTeacherRole } from "../teacher-role-context"

const getDefaultQuizSchedule = () => {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const yyyy = tomorrow.getFullYear()
  const mm = String(tomorrow.getMonth() + 1).padStart(2, "0")
  const dd = String(tomorrow.getDate()).padStart(2, "0")
  return {
    scheduledAt: `${yyyy}-${mm}-${dd}T09:00`,
    closesAt: `${yyyy}-${mm}-${dd}T18:00`,
  }
}

const quizQuestionSchema = z
  .object({
    prompt: z.string().min(4, "Question prompt must be at least 4 characters"),
    questionType: z.enum(["mcq", "short_answer"]),
    optionA: z.string().optional(),
    optionB: z.string().optional(),
    optionC: z.string().optional(),
    optionD: z.string().optional(),
    correctAnswer: z.string().min(1, "Correct answer / key is required"),
    marks: z
      .number({ error: "Marks required" })
      .min(1, "Min 1 mark")
      .max(50, "Max 50 marks"),
  })
  .superRefine((q, ctx) => {
    if (q.questionType === "mcq") {
      if (
        !q.optionA?.trim() ||
        !q.optionB?.trim() ||
        !q.optionC?.trim() ||
        !q.optionD?.trim()
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["optionA"],
          message: "All 4 MCQ options (A–D) are required",
        })
      }
    }
  })

const createQuizSchema = z
  .object({
    subjectAllocationId: z.string().min(1, "Select class & subject"),
    title: z.string().min(3, "Quiz title must be at least 3 characters"),
    description: z.string().optional(),
    scheduledAt: z
      .string()
      .min(1, "Start date-time is required")
      .refine(
        (val) => {
          const today = new Date().toISOString().slice(0, 10)
          return val.slice(0, 10) >= today
        },
        { message: "Scheduled start date cannot be in the past" }
      ),
    closesAt: z.string().min(1, "End date-time is required"),
    durationMinutes: z
      .number({ error: "Enter duration" })
      .min(5, "Min 5 minutes")
      .max(180, "Max 180 minutes"),
    questions: z
      .array(quizQuestionSchema)
      .min(1, "Add at least one question to the quiz"),
  })
  .refine((data) => data.closesAt > data.scheduledAt, {
    message: "End date-time must be after start date-time",
    path: ["closesAt"],
  })

type CreateQuizValues = z.infer<typeof createQuizSchema>

export default function TeacherQuizzesPage() {
  const { academicYear } = useTeacherRole()

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [quizzes, setQuizzes] = React.useState<Quiz[]>([])
  const [subjectAllocs, setSubjectAllocs] = React.useState<SubjectAllocation[]>(
    []
  )
  const [activeTab, setActiveTab] = React.useState("list")

  // Quiz Results tab state
  const [selectedQuizId, setSelectedQuizId] = React.useState("")
  const [submissions, setSubmissions] = React.useState<QuizSubmission[]>([])
  const [loadingResults, setLoadingResults] = React.useState(false)

  // Manual Evaluation dialog state
  const [evaluatingSub, setEvaluatingSub] =
    React.useState<QuizSubmission | null>(null)
  const [evalScore, setEvalScore] = React.useState("")
  const [evalFeedback, setEvalFeedback] = React.useState("")
  const [savingEval, setSavingEval] = React.useState(false)

  const {
    register,
    control,
    handleSubmit,
    setValue,
    reset,
    formState: { errors: formErrors, isSubmitting },
  } = useForm<CreateQuizValues>({
    resolver: zodResolver(createQuizSchema),
    defaultValues: {
      subjectAllocationId: "",
      title: "",
      description: "",
      ...getDefaultQuizSchedule(),
      durationMinutes: 20,
      questions: [
        {
          prompt: "",
          questionType: "mcq",
          optionA: "",
          optionB: "",
          optionC: "",
          optionD: "",
          correctAnswer: "Option A",
          marks: 2,
        },
      ],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: "questions",
  })

  const watchedQuestions = useWatch({ control, name: "questions" }) ?? []
  const selectedAllocId = useWatch({ control, name: "subjectAllocationId" })
  const computedTotalMarks = watchedQuestions.reduce(
    (sum, q) => sum + (Number.isFinite(q.marks) ? Number(q.marks) : 0),
    0
  )

  const fetchInitial = React.useCallback(async () => {
    const [quizList, allocs] = await Promise.all([
      getQuizzes(),
      getSubjectAllocations(),
    ])
    const firstQuizId = quizList[0]?.id ?? ""
    const firstSubs = firstQuizId
      ? await getQuizSubmissions(firstQuizId)
      : []
    return { quizList, allocs, firstQuizId, firstSubs }
  }, [])

  const retryLoad = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { quizList, allocs, firstQuizId, firstSubs } = await fetchInitial()
      setQuizzes(quizList)
      setSubjectAllocs(allocs)
      if (allocs[0]) setValue("subjectAllocationId", allocs[0].id)
      setSelectedQuizId(firstQuizId)
      setSubmissions(firstSubs)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load quizzes.")
    } finally {
      setLoading(false)
    }
  }, [fetchInitial, setValue])

  React.useEffect(() => {
    let active = true
    fetchInitial()
      .then(({ quizList, allocs, firstQuizId, firstSubs }) => {
        if (!active) return
        setQuizzes(quizList)
        setSubjectAllocs(allocs)
        if (allocs[0]) setValue("subjectAllocationId", allocs[0].id)
        setSelectedQuizId(firstQuizId)
        setSubmissions(firstSubs)
        setError(null)
      })
      .catch((err) => {
        if (!active) return
        setError(
          err instanceof Error ? err.message : "Failed to load quizzes."
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [fetchInitial, setValue])

  const handleSelectResultQuiz = async (quizId: string) => {
    setSelectedQuizId(quizId)
    setActiveTab("results")
    setLoadingResults(true)
    try {
      const subs = await getQuizSubmissions(quizId)
      setSubmissions(subs)
    } catch {
      toast.error("Failed to fetch quiz attempts.")
    } finally {
      setLoadingResults(false)
    }
  }

  const handleToggleStatus = async (quiz: Quiz) => {
    const nextStatus = quiz.status === "published" ? "closed" : "published"
    try {
      const updated = await updateQuizStatus(quiz.id, nextStatus)
      setQuizzes((prev) =>
        prev.map((q) => (q.id === updated.id ? updated : q))
      )
      toast.success(
        nextStatus === "published"
          ? `Quiz "${updated.title}" published to students`
          : `Quiz "${updated.title}" closed`
      )
    } catch {
      toast.error("Could not update quiz status.")
    }
  }

  const onCreateQuiz = async (values: CreateQuizValues) => {
    const alloc = subjectAllocs.find((s) => s.id === values.subjectAllocationId)
    if (!alloc) return

    try {
      const created = await createQuiz({
        classId: alloc.classId,
        className: alloc.className,
        sectionId: alloc.sectionId,
        section: alloc.section,
        subjectId: alloc.subjectId,
        subjectName: alloc.subjectName,
        title: values.title.trim(),
        description: values.description?.trim() || undefined,
        durationMinutes: values.durationMinutes,
        scheduledAt: values.scheduledAt,
        closesAt: values.closesAt,
        status: "published",
        questions: values.questions.map((q, idx) => {
          if (q.questionType === "mcq") {
            const options = [
              q.optionA?.trim() ?? "",
              q.optionB?.trim() ?? "",
              q.optionC?.trim() ?? "",
              q.optionD?.trim() ?? "",
            ]
            const resolvedCorrect =
              q.correctAnswer === "Option A"
                ? options[0]
                : q.correctAnswer === "Option B"
                  ? options[1]
                  : q.correctAnswer === "Option C"
                    ? options[2]
                    : q.correctAnswer === "Option D"
                      ? options[3]
                      : q.correctAnswer
            return {
              questionNumber: idx + 1,
              prompt: q.prompt.trim(),
              questionType: "mcq" as const,
              options,
              correctAnswer: resolvedCorrect,
              marks: q.marks,
            }
          }
          return {
            questionNumber: idx + 1,
            prompt: q.prompt.trim(),
            questionType: "short_answer" as const,
            correctAnswer: q.correctAnswer.trim(),
            marks: q.marks,
          }
        }),
      })

      setQuizzes((prev) => [created, ...prev])
      reset({
        subjectAllocationId: alloc.id,
        title: "",
        description: "",
        ...getDefaultQuizSchedule(),
        durationMinutes: 20,
        questions: [
          {
            prompt: "",
            questionType: "mcq",
            optionA: "",
            optionB: "",
            optionC: "",
            optionD: "",
            correctAnswer: "Option A",
            marks: 2,
          },
        ],
      })
      toast.success(`Quiz "${created.title}" published (${created.totalMarks} marks)`)
      setActiveTab("list")
    } catch {
      toast.error("Failed to create quiz.")
    }
  }

  const handleSaveEvaluation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!evaluatingSub) return
    const parsed = Number(evalScore)
    if (
      evalScore.trim() === "" ||
      Number.isNaN(parsed) ||
      parsed < 0 ||
      parsed > evaluatingSub.totalMarks
    ) {
      toast.error(`Score must be between 0 and ${evaluatingSub.totalMarks}`)
      return
    }

    setSavingEval(true)
    try {
      const updated = await evaluateQuizSubmission(
        evaluatingSub.id,
        parsed,
        evalFeedback.trim() || undefined
      )
      setSubmissions((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s))
      )
      setEvaluatingSub(null)
      toast.success(`Updated score for ${updated.studentName}`)
    } catch {
      toast.error("Could not save evaluation.")
    } finally {
      setSavingEval(false)
    }
  }

  if (loading) {
    return (
      <LoadingState
        title="Loading Quiz Management"
        description="Fetching quizzes, question banks, and student attempts..."
      />
    )
  }

  if (error) {
    return (
      <ErrorState
        title="Unable to load quizzes"
        description={error}
        onRetry={() => void retryLoad()}
      />
    )
  }

  const activeResultQuiz = quizzes.find((q) => q.id === selectedQuizId)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quiz Management"
        subtitle={`Build formative MCQ & short-answer quizzes, schedule timed windows, and review scores · AY ${academicYear}`}
        action={
          <Button type="button" className="w-full sm:w-auto" onClick={() => setActiveTab("create")}>
            <Plus className="size-4" />
            Create Quiz
          </Button>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="overflow-x-auto pb-1">
          <TabsList className="inline-flex w-auto min-w-full sm:grid sm:max-w-lg sm:grid-cols-3">
            <TabsTrigger value="list" className="shrink-0">All Quizzes ({quizzes.length})</TabsTrigger>
            <TabsTrigger value="create" className="shrink-0">Create Quiz Wizard</TabsTrigger>
            <TabsTrigger value="results" className="shrink-0">Quiz Results</TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Quizzes List */}
        <TabsContent value="list" className="mt-4">
          {quizzes.length === 0 ? (
            <EmptyState
              title="No quizzes created yet"
              description="Use the Create Quiz Wizard to build your first quiz."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {quizzes.map((quiz) => (
                <Card key={quiz.id} className="flex flex-col justify-between rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="brand" className="rounded-full bg-[#123B5A]/10 text-[#123B5A] border-[#123B5A]/20 font-bold">
                            {quiz.className}-{quiz.section}
                          </Badge>
                          <Badge variant="secondary" className="rounded-full bg-[#EEF1F5] text-[#202936] font-semibold">{quiz.subjectName}</Badge>
                        </div>
                        <CardTitle className="pt-1 text-[#202936]">{quiz.title}</CardTitle>
                      </div>
                      <StatusBadge
                        status={
                          quiz.status === "published"
                            ? "Published"
                            : quiz.status === "closed"
                              ? "Locked"
                              : "Draft"
                        }
                      />
                    </div>
                    {quiz.description && (
                      <CardDescription className="text-[#788391]">{quiz.description}</CardDescription>
                    )}
                  </CardHeader>

                  <CardContent className="space-y-3 text-[13px] text-[#788391]">
                    <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#EEF1F5] p-2.5 text-center">
                      <div>
                        <p className="text-[11.5px] font-medium text-[#788391]">Duration</p>
                        <p className="font-extrabold text-[#202936]">
                          {quiz.durationMinutes} min
                        </p>
                      </div>
                      <div>
                        <p className="text-[11.5px] font-medium text-[#788391]">Total Marks</p>
                        <p className="font-extrabold text-[#202936]">
                          {quiz.totalMarks}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11.5px] font-medium text-[#788391]">Attempts</p>
                        <p className="font-extrabold text-[#F5A000]">
                          {quiz.attemptCount}/{quiz.totalStudents}
                        </p>
                      </div>
                    </div>

                    <p className="flex items-center gap-1.5 text-[12.5px] text-[#788391]">
                      <Clock className="size-3.5 text-[#F5A000]" />
                      Window: {quiz.scheduledAt.slice(0, 16).replace("T", " ")}{" "}
                      → {quiz.closesAt.slice(0, 16).replace("T", " ")}
                    </p>
                  </CardContent>

                  <CardFooter className="flex-col sm:flex-row gap-2 border-t border-[#E5E9EF] pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:flex-1 rounded-xl border-[#E5E9EF] text-[#202936] hover:bg-[#EEF1F5]"
                      onClick={() => void handleToggleStatus(quiz)}
                    >
                      {quiz.status === "published" ? "Close Quiz" : "Publish"}
                    </Button>
                    <Button
                      type="button"
                      className="w-full sm:flex-1 rounded-xl bg-[#F5A000] text-[#123B5A] font-bold hover:bg-[#E09200]"
                      onClick={() => void handleSelectResultQuiz(quiz.id)}
                    >
                      <ListChecks className="size-4" />
                      View Results
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Create Quiz Wizard */}
        <TabsContent value="create" className="mt-4">
          <form onSubmit={handleSubmit(onCreateQuiz)} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Step 1: Quiz Metadata & Schedule</CardTitle>
                <CardDescription>
                  Configure target class, timing window, and duration.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="qz-alloc">Class & Subject</Label>
                  <Select
                    value={selectedAllocId}
                    onValueChange={(val) =>
                      setValue("subjectAllocationId", val, {
                        shouldValidate: true,
                      })
                    }
                  >
                    <SelectTrigger id="qz-alloc" className="w-full">
                      <SelectValue placeholder="Select class & subject" />
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
                  <Label htmlFor="qz-title">Quiz Title</Label>
                  <Input
                    id="qz-title"
                    placeholder="e.g., Arithmetic Progressions Quick Check"
                    {...register("title")}
                  />
                  {formErrors.title && (
                    <p className="text-xs font-medium text-error">
                      {formErrors.title.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="qz-desc">Instructions (Optional)</Label>
                  <Input
                    id="qz-desc"
                    placeholder="Single attempt only; calculators not permitted."
                    {...register("description")}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="qz-start">Start Date & Time</Label>
                  <Input
                    id="qz-start"
                    type="datetime-local"
                    {...register("scheduledAt")}
                  />
                  {formErrors.scheduledAt && (
                    <p className="text-xs font-medium text-error">
                      {formErrors.scheduledAt.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="qz-end">End Date & Time</Label>
                  <Input
                    id="qz-end"
                    type="datetime-local"
                    {...register("closesAt")}
                  />
                  {formErrors.closesAt && (
                    <p className="text-xs font-medium text-error">
                      {formErrors.closesAt.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="qz-dur">Duration (Minutes)</Label>
                  <Input
                    id="qz-dur"
                    type="number"
                    {...register("durationMinutes", { valueAsNumber: true })}
                  />
                  {formErrors.durationMinutes && (
                    <p className="text-xs font-medium text-error">
                      {formErrors.durationMinutes.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label>Total Marks (Auto-calculated)</Label>
                  <div className="flex h-9 items-center justify-between rounded-md border bg-muted/50 px-3 text-sm font-semibold text-foreground">
                    <span>{fields.length} Question(s)</span>
                    <span className="text-primary">
                      {computedTotalMarks} Marks
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Step 2: Question Builder */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle>Step 2: Question Builder</CardTitle>
                  <CardDescription>
                    Add MCQ or Short Answer questions with correct answer keys and marks.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    append({
                      prompt: "",
                      questionType: "mcq",
                      optionA: "",
                      optionB: "",
                      optionC: "",
                      optionD: "",
                      correctAnswer: "Option A",
                      marks: 2,
                    })
                  }
                >
                  <Plus className="size-4" />
                  Add Question
                </Button>
              </CardHeader>

              <CardContent className="space-y-4">
                {fields.map((field, index) => {
                  const qType = watchedQuestions[index]?.questionType ?? "mcq"
                  const qErrors = formErrors.questions?.[index]
                  return (
                    <div
                      key={field.id}
                      className="space-y-4 rounded-xl border bg-background/50 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge variant="brand">Question {index + 1}</Badge>
                        <div className="flex items-center gap-2">
                          <Select
                            value={qType}
                            onValueChange={(val) => {
                              const nextType = val as "mcq" | "short_answer"
                              setValue(
                                `questions.${index}.questionType`,
                                nextType
                              )
                              setValue(
                                `questions.${index}.correctAnswer`,
                                nextType === "mcq" ? "Option A" : ""
                              )
                            }}
                          >
                            <SelectTrigger size="sm" className="w-40 bg-card">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="mcq">Multiple Choice</SelectItem>
                              <SelectItem value="short_answer">
                                Short Answer
                              </SelectItem>
                            </SelectContent>
                          </Select>

                          {fields.length > 1 && (
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => remove(index)}
                              aria-label={`Remove question ${index + 1}`}
                            >
                              <Trash2 className="size-4 text-error" />
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label>Question Prompt</Label>
                        <Textarea
                          rows={2}
                          placeholder="Enter the question statement..."
                          {...register(`questions.${index}.prompt`)}
                        />
                        {qErrors?.prompt && (
                          <p className="text-xs font-medium text-error">
                            {qErrors.prompt.message}
                          </p>
                        )}
                      </div>

                      {qType === "mcq" ? (
                        <div className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Input
                              placeholder="Option A"
                              {...register(`questions.${index}.optionA`)}
                            />
                            <Input
                              placeholder="Option B"
                              {...register(`questions.${index}.optionB`)}
                            />
                            <Input
                              placeholder="Option C"
                              {...register(`questions.${index}.optionC`)}
                            />
                            <Input
                              placeholder="Option D"
                              {...register(`questions.${index}.optionD`)}
                            />
                          </div>
                          {qErrors?.optionA && (
                            <p className="text-xs font-medium text-error">
                              {qErrors.optionA.message}
                            </p>
                          )}
                        </div>
                      ) : null}

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>Correct Answer</Label>
                          {qType === "mcq" ? (
                            <Select
                              value={
                                watchedQuestions[index]?.correctAnswer ??
                                "Option A"
                              }
                              onValueChange={(val) =>
                                setValue(
                                  `questions.${index}.correctAnswer`,
                                  val,
                                  { shouldValidate: true }
                                )
                              }
                            >
                              <SelectTrigger className="w-full bg-card">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Option A">Option A</SelectItem>
                                <SelectItem value="Option B">Option B</SelectItem>
                                <SelectItem value="Option C">Option C</SelectItem>
                                <SelectItem value="Option D">Option D</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              placeholder="Expected short answer / key"
                              {...register(`questions.${index}.correctAnswer`)}
                            />
                          )}
                          {qErrors?.correctAnswer && (
                            <p className="text-xs font-medium text-error">
                              {qErrors.correctAnswer.message}
                            </p>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <Label>Marks</Label>
                          <Input
                            type="number"
                            {...register(`questions.${index}.marks`, {
                              valueAsNumber: true,
                            })}
                          />
                          {qErrors?.marks && (
                            <p className="text-xs font-medium text-error">
                              {qErrors.marks.message}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </CardContent>

              <CardFooter className="flex-col-reverse sm:flex-row justify-end gap-2 border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => setActiveTab("list")}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                  <Send className="size-4" />
                  {isSubmitting ? "Publishing..." : "Publish Quiz"}
                </Button>
              </CardFooter>
            </Card>
          </form>
        </TabsContent>

        {/* Tab 3: Quiz Results */}
        <TabsContent value="results" className="mt-4 space-y-4">
          <Card className="py-4">
            <CardContent className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-3 px-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
                <Label htmlFor="res-quiz" className="whitespace-nowrap">Select Quiz:</Label>
                <Select
                  value={selectedQuizId}
                  onValueChange={(val) => void handleSelectResultQuiz(val)}
                >
                  <SelectTrigger id="res-quiz" className="w-full sm:w-80">
                    <SelectValue placeholder="Choose quiz" />
                  </SelectTrigger>
                  <SelectContent>
                    {quizzes.map((q) => (
                      <SelectItem key={q.id} value={q.id}>
                        {q.title} ({q.className}-{q.section})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {activeResultQuiz && (
                <Badge variant="secondary" className="w-fit">
                  {submissions.length} of {activeResultQuiz.totalStudents}{" "}
                  Attempts · Total {activeResultQuiz.totalMarks} Marks
                </Badge>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCheck2 className="size-4 text-primary" />
                Student Quiz Attempts & Scores
              </CardTitle>
              <CardDescription>
                Auto-graded MCQ scores with manual evaluation overrides for short-answer or partial credit.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingResults ? (
                <LoadingState compact title="Loading quiz results..." />
              ) : submissions.length === 0 ? (
                <EmptyState
                  compact
                  title="No student attempts yet"
                  description="Student scores will appear here once attempts are submitted."
                />
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table className="min-w-[650px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24 sticky left-0 bg-white z-10 shadow-xs">Roll No</TableHead>
                        <TableHead>Student</TableHead>
                        <TableHead>Submitted At</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {submissions.map((sub) => (
                        <TableRow key={sub.id}>
                          <TableCell className="font-mono text-[13px] font-semibold sticky left-0 bg-white z-10 shadow-xs">
                            {sub.rollNo}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-foreground">
                                {sub.studentName}
                              </p>
                              {sub.feedback && (
                                <p className="text-xs text-muted-foreground">
                                  Note: {sub.feedback}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {sub.submittedAt
                              ? sub.submittedAt.slice(0, 16).replace("T", " ")
                              : "In Progress"}
                          </TableCell>
                          <TableCell className="font-mono font-semibold text-foreground">
                            {sub.score !== null ? sub.score : "—"} /{" "}
                            {sub.totalMarks}
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              status={
                                sub.status === "graded" ? "Approved" : "Pending"
                              }
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              onClick={() => {
                                setEvaluatingSub(sub)
                                setEvalScore(
                                  sub.score !== null ? String(sub.score) : ""
                                )
                                setEvalFeedback(sub.feedback ?? "")
                              }}
                            >
                              Manual Evaluate
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Manual Evaluation Modal */}
      <Dialog
        open={Boolean(evaluatingSub)}
        onOpenChange={(open) => {
          if (!open) setEvaluatingSub(null)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto w-[calc(100vw-2rem)] sm:max-w-md">
          <form onSubmit={(e) => void handleSaveEvaluation(e)}>
            <DialogHeader>
              <DialogTitle>Manual Quiz Evaluation</DialogTitle>
              <DialogDescription>
                {evaluatingSub?.studentName} ({evaluatingSub?.rollNo}) · Max{" "}
                {evaluatingSub?.totalMarks} marks
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="eval-score">
                  Final Score (0 – {evaluatingSub?.totalMarks})
                </Label>
                <Input
                  id="eval-score"
                  type="number"
                  step="0.5"
                  value={evalScore}
                  onChange={(e) => setEvalScore(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="eval-fb">Evaluator Feedback (Optional)</Label>
                <Textarea
                  id="eval-fb"
                  rows={2}
                  value={evalFeedback}
                  onChange={(e) => setEvalFeedback(e.target.value)}
                  placeholder="Partial credit or remark..."
                />
              </div>
            </div>
            <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setEvaluatingSub(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingEval} className="w-full sm:w-auto">
                <CheckCircle2 className="size-4" />
                {savingEval ? "Saving..." : "Save Score"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

