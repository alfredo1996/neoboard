import { z } from "zod";
export { handleRouteError } from "@/lib/api-utils";

/** Max size for preview image data URIs (500 KB). */
const MAX_PREVIEW_SIZE = 500 * 1024;

export const previewImageUrlSchema = z
  .string()
  .refine((s) => s.startsWith("data:image/"), "Must be a data:image/ URI")
  .refine((s) => s.length <= MAX_PREVIEW_SIZE, `Preview image must be under ${MAX_PREVIEW_SIZE / 1024}KB`)
  .optional();
