import type { ReactNode } from "react";

export const AUTH_INPUT_CLASS =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-950";
export const AUTH_LABEL_CLASS = "mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300";

interface Props {
  title: string;
  description: string;
  error?: string | null;
  children: ReactNode;
}

// Shared chrome for /login and /signup — same card treatment as the
// app's existing modals (NewPortfolioModal etc.: rounded-xl border
// shadow-lg), not the Supabase Auth UI's own prebuilt component, so the
// two auth pages match the rest of the app's visual language.
export function AuthCard({ title, description, error, children }: Props) {
  return (
    <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-800 dark:bg-gray-900">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}
      {children}
    </div>
  );
}
