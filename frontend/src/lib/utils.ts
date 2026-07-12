import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

const customTwMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "bg-color": [
        "bg-brand", "bg-brand-hover", "bg-brand-light", "bg-brand-dark", 
        "bg-primary", "bg-secondary", "bg-blue", "bg-emerald", "bg-amber", "bg-red"
      ],
      "text-color": [
        "text-brand", "text-brand-light", "text-brand-foreground", 
        "text-primary", "text-secondary"
      ],
      "border-color": [
        "border-brand", "border-brand-light", "border-primary"
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return customTwMerge(clsx(inputs))
}
