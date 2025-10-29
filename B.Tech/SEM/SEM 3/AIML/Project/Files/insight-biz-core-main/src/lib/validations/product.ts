import { z } from "zod";

export const productSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Product name is required")
    .max(200, "Product name must be less than 200 characters"),
  sku: z
    .string()
    .trim()
    .min(1, "SKU is required")
    .max(50, "SKU must be less than 50 characters")
    .regex(/^[A-Za-z0-9-_]+$/, "SKU can only contain letters, numbers, hyphens, and underscores"),
  description: z
    .string()
    .max(1000, "Description must be less than 1000 characters")
    .optional(),
  category_id: z.string().uuid().optional(),
  supplier: z
    .string()
    .max(200, "Supplier name must be less than 200 characters")
    .optional(),
  cost_price: z
    .number()
    .min(0, "Cost price cannot be negative")
    .max(1000000, "Cost price cannot exceed 1,000,000")
    .optional(),
  selling_price: z
    .number()
    .min(0.01, "Selling price must be at least 0.01")
    .max(1000000, "Selling price cannot exceed 1,000,000"),
  stock_quantity: z
    .number()
    .int("Stock quantity must be a whole number")
    .min(0, "Stock quantity cannot be negative")
    .max(1000000, "Stock quantity cannot exceed 1,000,000")
    .optional(),
  low_stock_threshold: z
    .number()
    .int("Low stock threshold must be a whole number")
    .min(0, "Low stock threshold cannot be negative")
    .max(10000, "Low stock threshold cannot exceed 10,000")
    .optional(),
});

export type ProductFormData = z.infer<typeof productSchema>;
