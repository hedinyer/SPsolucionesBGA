"use client";

import { useState, type ReactNode } from "react";

/** Details that only mount children while open (avoids GPS/network work when closed). */
export function LazyDetails({
  summary,
  children,
  className,
  summaryClassName,
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
  summaryClassName?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <details
      className={className}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className={summaryClassName}>{summary}</summary>
      {open ? children : null}
    </details>
  );
}
