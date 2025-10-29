import { z } from "zod";

export const profileSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(1, "Full name is required")
    .max(100, "Full name must be less than 100 characters"),
  email: z
    .string()
    .trim()
    .email("Invalid email address")
    .max(255, "Email must be less than 255 characters"),
  business_name: z
    .string()
    .trim()
    .max(200, "Business name must be less than 200 characters")
    .optional(),
});

export type ProfileFormData = z.infer<typeof profileSchema>;
