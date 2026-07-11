"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { AuthCard, AUTH_INPUT_CLASS, AUTH_LABEL_CLASS } from "@/components/AuthCard";
import { Toast } from "@/components/Toast";
import { CONTAINER_CLASS } from "@/lib/layout";
import { useRedirectIfAuthed } from "@/lib/hooks/useRedirectIfAuthed";

export default function LoginPage() {
  useRedirectIfAuthed();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    // Read via window.location.search rather than useSearchParams() — this
    // only needs a one-time read right after a fresh navigation from
    // /reset-password, not reactive tracking of in-page query changes, so
    // it doesn't need the Suspense-boundary that useSearchParams() would
    // require here.
    if (new URLSearchParams(window.location.search).get("reset") === "success") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setToastMessage("Password reset — you can now log in with your new password.");
      router.replace("/login");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push("/");
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <main className={`${CONTAINER_CLASS} flex justify-center py-16`}>
        <AuthCard title="Log in" description="Welcome back." error={error}>
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
                className={AUTH_INPUT_CLASS}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:-translate-y-px hover:bg-blue-700 hover:shadow-md active:translate-y-0 active:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
            >
              {loading ? "Logging in…" : "Log in"}
            </button>
          </form>

          <p className="mt-3 text-center text-sm">
            <Link
              href="/forgot-password"
              className="font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Forgot password?
            </Link>
          </p>

          <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              className="font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Sign up
            </Link>
          </p>
        </AuthCard>
      </main>

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </div>
  );
}
