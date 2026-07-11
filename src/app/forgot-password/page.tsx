"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { AuthCard, AUTH_INPUT_CLASS, AUTH_LABEL_CLASS } from "@/components/AuthCard";
import { CONTAINER_CLASS } from "@/lib/layout";
import { useRedirectIfAuthed } from "@/lib/hooks/useRedirectIfAuthed";

export default function ForgotPasswordPage() {
  useRedirectIfAuthed();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    // Always show the same message whether or not this email actually has
    // an account — Supabase's own API already doesn't distinguish the two
    // cases on success (this only branches on a real error, e.g. rate
    // limit, which applies regardless of which email was submitted and so
    // doesn't leak anything about a specific account).
    setSubmitted(true);
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <main className={`${CONTAINER_CLASS} flex justify-center py-16`}>
        <AuthCard
          title="Forgot password?"
          description="Enter your email and we'll send you a reset link."
          error={error}
        >
          {submitted ? (
            <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
              If an account exists for this email, a reset link has been sent.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <div>
                <label className={AUTH_LABEL_CLASS}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                  required
                  className={AUTH_INPUT_CLASS}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:-translate-y-px hover:bg-blue-700 hover:shadow-md active:translate-y-0 active:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}

          <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
            <Link
              href="/login"
              className="font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Back to login
            </Link>
          </p>
        </AuthCard>
      </main>
    </div>
  );
}
