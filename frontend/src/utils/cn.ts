// A utility function to conditionally combine and merge Tailwind CSS classes without conflicts.
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// This function first uses `clsx` to handle conditional class logic,
// then `tailwind-merge` to resolve any conflicting Tailwind utility classes.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
