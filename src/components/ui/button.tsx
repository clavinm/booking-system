import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva("button", {
  variants: {
    variant: {
      primary: "button-primary",
      outline: "button-outline",
      ghost: "button-ghost",
    },
    size: {
      default: "",
      small: "button-small",
    },
  },
  defaultVariants: { variant: "primary", size: "default" },
});

export function Button({
  className,
  variant,
  size,
  type = "button",
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
