import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number with comma separators for thousands
 * @param value - The number to format
 * @param decimals - Number of decimal places (default: 0)
 * @returns Formatted string with commas (e.g., 40000 -> "40,000")
 */
export function formatNumber(value: number | string | null | undefined, decimals: number = 0): string {
  if (value === null || value === undefined || value === "") return "0";
  
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  
  if (isNaN(numValue)) return "0";
  
  if (decimals > 0) {
    return numValue.toLocaleString("en-IN", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  
  return numValue.toLocaleString("en-IN");
}

/**
 * Format currency amount with comma separators and ₹ symbol
 * @param value - The amount to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string with ₹ symbol and commas (e.g., 40000 -> "₹40,000.00")
 */
export function formatCurrency(value: number | string | null | undefined, decimals: number = 2): string {
  return `₹${formatNumber(value, decimals)}`;
}
