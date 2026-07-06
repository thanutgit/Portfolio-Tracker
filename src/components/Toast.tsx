"use client";

import { useEffect } from "react";

interface Props {
  message: string | null;
  onDismiss: () => void;
  durationMs?: number;
}

// Transient success notification — auto-dismisses, doesn't block anything
// underneath it. Not for errors (those stay inline so they don't disappear
// before the user has a chance to read/act on them).
export function Toast({ message, onDismiss, durationMs = 3000 }: Props) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [message, durationMs, onDismiss]);

  if (!message) return null;

  return (
    <div className="fixed right-4 top-4 z-[70] flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 shadow-lg dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100">
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 10l4 4 8-8" />
      </svg>
      {message}
    </div>
  );
}
