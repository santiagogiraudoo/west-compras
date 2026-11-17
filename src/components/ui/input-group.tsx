import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Bordered field shell per the design-system input spec
 * (docs/design-system/components-inputs.html): 1px #e8e8e3 border, 6px
 * radius, white bg, green focus border + soft ring. Optional prefix/suffix
 * segments render units ("días", "%", "$") inside the box on a panel bg.
 *
 * Inner inputs should pass `inputGroupInputClass` so the shell owns all the
 * chrome (the base Input's ghost border/focus ring would double up).
 */
export function InputGroup({
  prefix,
  suffix,
  className,
  children,
}: {
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex h-9 items-stretch overflow-hidden rounded-md border border-[#e8e8e3] bg-white transition-all",
        "focus-within:border-[#1B4332] focus-within:ring-[3px] focus-within:ring-[#1B4332]/20",
        className,
      )}
    >
      {prefix != null && (
        <span className="flex select-none items-center border-r border-[#f0f0ec] bg-[#fafaf7] px-2.5 text-xs font-medium text-[#737373]">
          {prefix}
        </span>
      )}
      {children}
      {suffix != null && (
        <span className="flex select-none items-center border-l border-[#f0f0ec] bg-[#fafaf7] px-2.5 text-xs font-medium text-[#737373]">
          {suffix}
        </span>
      )}
    </div>
  );
}

export const inputGroupInputClass =
  "h-full flex-1 rounded-none border-0 bg-transparent shadow-none hover:border-transparent focus-visible:border-transparent focus-visible:ring-0";

/**
 * Standalone bordered chrome matching the design-system input spec, for forms
 * where the base ghost Input/Textarea (transparent border until hover) reads
 * unfinished. Pass to a standalone Input/Textarea/NumericInput `className`
 * (or DateInput's `inputClassName`).
 */
export const borderedInputClass =
  "border-[#e8e8e3] bg-white hover:border-[#d8d8d2] focus-visible:border-[#1B4332] focus-visible:ring-[3px] focus-visible:ring-[#1B4332]/20";
