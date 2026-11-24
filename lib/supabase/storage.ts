import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ""

export const supabaseStorage = createClient(supabaseUrl, supabaseKey)

export const COURSE_MATERIALS_BUCKET = "course-materials"

export interface UploadMaterialParams {
  file: Buffer | Uint8Array | Blob | File
  filename: string
  contentType?: string
  institutionId?: string
  folder?: string
}

export interface UploadMaterialResult {
  publicUrl: string
  filePath: string
  fileSizeLabel?: string
}

/**
 * Uploads a course material or assignment attachment to Supabase Storage
 * bucket 'course-materials' and returns the accessible public URL.
 */
export async function uploadCourseMaterialFile({
  file,
  filename,
  contentType,
  institutionId,
  folder = "materials",
}: UploadMaterialParams): Promise<UploadMaterialResult> {
  if (!institutionId) {
    throw new Error("institutionId is required for storage tenant isolation.");
  }
  const sanitizedFilename = filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
  const timestamp = Date.now()
  const filePath = `${institutionId}/${folder}/${timestamp}_${sanitizedFilename}`

  const resolvedContentType =
    contentType || getMimeTypeFromFilename(sanitizedFilename)

  const { error: uploadError } = await supabaseStorage.storage
    .from(COURSE_MATERIALS_BUCKET)
    .upload(filePath, file, {
      contentType: resolvedContentType,
      upsert: true,
    })

  if (uploadError) {
    console.error(
      `[Supabase Storage] Failed to upload "${filePath}" to bucket "${COURSE_MATERIALS_BUCKET}":`,
      uploadError
    )
    throw new Error(
      `File upload failed: ${uploadError.message || "Unknown storage error"}`
    )
  }

  const { data: publicUrlData } = supabaseStorage.storage
    .from(COURSE_MATERIALS_BUCKET)
    .getPublicUrl(filePath)

  return {
    publicUrl: publicUrlData.publicUrl,
    filePath,
  }
}

function getMimeTypeFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase()
  switch (ext) {
    case "pdf":
      return "application/pdf"
    case "doc":
      return "application/msword"
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    case "ppt":
      return "application/vnd.ms-powerpoint"
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    case "xls":
      return "application/vnd.ms-excel"
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    case "mp4":
      return "video/mp4"
    case "png":
      return "image/png"
    case "jpg":
    case "jpeg":
      return "image/jpeg"
    case "txt":
      return "text/plain"
    default:
      return "application/octet-stream"
  }
}

