import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-primary/30 bg-primary/15 text-primary shadow-[0_0_8px_hsla(210,100%,56%,0.2)]",
        secondary: "border-secondary bg-secondary/80 text-secondary-foreground",
        destructive: "border-destructive/30 bg-destructive/15 text-destructive shadow-[0_0_8px_hsla(0,72%,51%,0.2)]",
        outline: "text-foreground border-border/50",
        success: "border-success/30 bg-success/15 text-success shadow-[0_0_8px_hsla(160,84%,39%,0.2)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
