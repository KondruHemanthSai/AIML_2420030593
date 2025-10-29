import { z } from "zod";

export const tableNumberSchema = z
  .string()
  .trim()
  .max(50, "Table number must be less than 50 characters")
  .regex(/^[A-Za-z0-9\s-]+$/, "Table number can only contain letters, numbers, spaces, and hyphens")
  .optional();

export const cartItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  selling_price: z.number().positive(),
  quantity: z.number().int().positive().max(1000, "Quantity cannot exceed 1000"),
  stock_quantity: z.number().int().min(0),
});

export const checkoutSchema = z.object({
  tableNumber: tableNumberSchema,
  cart: z.array(cartItemSchema).min(1, "Cart cannot be empty"),
});

export type CartItem = z.infer<typeof cartItemSchema>;
export type CheckoutData = z.infer<typeof checkoutSchema>;
