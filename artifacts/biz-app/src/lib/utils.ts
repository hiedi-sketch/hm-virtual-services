import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function fmtHours(hours: number): string {
  // Round to 2 decimal places and strip trailing zeros (e.g. 1.0666 → 1.07, 1.50 → 1.5, 2.00 → 2)
  return parseFloat(hours.toFixed(2)).toString();
}
