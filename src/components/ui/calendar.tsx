"use client";

import * as React from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { es } from "react-day-picker/locale";
import "react-day-picker/style.css";

import { cn } from "@/lib/utils";

type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, timeZone, ...props }: CalendarProps) {
  return (
    <DayPicker
      animate
      locale={es}
      weekStartsOn={1}
      showOutsideDays
      timeZone={timeZone ?? "UTC"}
      className={cn("p-3 bg-white rounded-md", className)}
      classNames={{
        root: "rdp-root",
        months: "flex flex-col",
        month: "space-y-2",
        month_caption:
          "flex items-center justify-center h-9 relative px-10",
        caption_label:
          "text-[13px] font-semibold text-[#1B4332] capitalize tracking-tight",
        dropdowns:
          "flex items-center justify-center gap-1.5 relative z-0",
        dropdown_root:
          "relative inline-flex items-center gap-1 h-8 rounded-md bg-[#f5f5f0] px-2.5 text-[12.5px] font-semibold text-[#1B4332] hover:bg-[#ebe9e0] focus-within:ring-2 focus-within:ring-[#1B4332]/30 transition-colors",
        dropdown:
          "absolute inset-0 cursor-pointer appearance-none bg-transparent text-[12px] opacity-0",
        months_dropdown: "capitalize",
        years_dropdown: "font-mono tabular-nums",
        nav:
          "absolute inset-y-0 inset-x-0 flex items-center justify-between pointer-events-none z-10",
        button_previous:
          "pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-[#1B4332] hover:bg-[#f0f6f2] disabled:opacity-30 disabled:pointer-events-none transition-colors",
        button_next:
          "pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-[#1B4332] hover:bg-[#f0f6f2] disabled:opacity-30 disabled:pointer-events-none transition-colors",
        month_grid: "w-full border-collapse",
        weekdays:
          "flex border-b border-[#f0f0ec] mb-1 pb-1",
        weekday:
          "w-9 h-7 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#737373] flex items-center justify-center",
        week: "flex w-full mt-1",
        day:
          "h-9 w-9 p-0 text-center text-[13px] font-mono tabular-nums",
        day_button:
          "h-8 w-8 mx-auto rounded-md inline-flex items-center justify-center text-[#1a1a1a] hover:bg-[#f0f6f2] hover:text-[#1B4332] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B4332]/30 transition-colors aria-selected:opacity-100",
        today:
          "[&_button]:ring-1 [&_button]:ring-[#B8960C] [&_button]:ring-inset [&_button]:font-semibold",
        outside: "[&_button]:text-[#a3a3a3] [&_button]:font-normal",
        disabled: "[&_button]:text-[#d4d4d4] pointer-events-none",
        hidden: "invisible",
        selected:
          "[&_button]:bg-[#1B4332] [&_button]:text-white [&_button]:font-semibold [&_button]:shadow-sm [&_button]:hover:bg-[#153327] [&_button]:hover:text-white",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => {
          if (orientation === "left") return <ChevronLeft className="h-4 w-4" />;
          if (orientation === "right") return <ChevronRight className="h-4 w-4" />;
          if (orientation === "up") return <ChevronUp className="h-3 w-3 opacity-60" />;
          return <ChevronDown className="h-3 w-3 opacity-60" />;
        },
      }}
      {...props}
    />
  );
}

export { Calendar };
