"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { AuthCard, AUTH_INPUT_CLASS, AUTH_LABEL_CLASS } from "@/components/AuthCard";
import { CONTAINER_CLASS } from "@/lib/layout";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setConfirmMessage(null);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setLoading(false);
    // If email confirmation is required (Supabase project setting), signUp()
    // returns a user but no session yet — the account isn't usable until
    // they click the confirmation link, so don't redirect as if logged in.
    if (data.session) {
      router.push("/");
    } else {
      setConfirmMessage("Account created — check your email to confirm it, then log in.");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <main className={`${CONTAINER_CLASS} flex justify-center py-16`}>
        <AuthCard title="Sign up" description="Create an account to get started." error={error}>
          {confirmMessage ? (
            <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
              {confirmMessage}
            </p>
          ) : (
            <>
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
                <div>
                  <label className={AUTH_LABEL_CLASS}>Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className={AUTH_INPUT_CLASS}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:-translate-y-px hover:bg-blue-700 hover:shadow-md active:translate-y-0 active:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
                >
                  {loading ? "Creating account…" : "Sign up"}
                </button>
              </form>

              <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Log in
                </Link>
              </p>
            </>
          )}
        </AuthCard>
      </main>
    </div>
  );
}
