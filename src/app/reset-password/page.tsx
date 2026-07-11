"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { AuthCard, AUTH_INPUT_CLASS, AUTH_LABEL_CLASS } from "@/components/AuthCard";
import { PasswordChecklist } from "@/components/PasswordChecklist";
import { CONTAINER_CLASS } from "@/lib/layout";
import { allPasswordRulesMet, checkPasswordRules } from "@/lib/passwordRules";

type LinkStatus = "checking" | "valid" | "invalid";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [linkStatus, setLinkStatus] = useState<LinkStatus>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Arriving here via a valid reset-link email establishes a short-lived
    // "recovery" session automatically (Supabase parses the token from the
    // URL on init — detectSessionInUrl, on by default). That's exactly what
    // distinguishes a real reset link from someone just navigating to
    // /reset-password directly with no token at all.
    //
    // Deliberately NOT using useRedirectIfAuthed() here, unlike /login,
    // /signup, and /forgot-password — that hook would immediately bounce
    // this very recovery session away to "/", defeating the whole page.
    supabase.auth.getSession().then(({ data }) => {
      setLinkStatus(data.session ? "valid" : "invalid");
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setLinkStatus("valid");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const rules = checkPasswordRules(password, confirmPassword);
  const canSubmit = allPasswordRulesMet(password, confirmPassword);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    // Sign out the temporary recovery session — the user should land on
    // /login and sign in fresh with their new password, not be silently
    // left logged in from the recovery link (and if we didn't sign out,
    // /login's own useRedirectIfAuthed() would immediately bounce them to
    // "/" before they ever saw the success message).
    await supabase.auth.signOut();
    router.push("/login?reset=success");
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <main className={`${CONTAINER_CLASS} flex justify-center py-16`}>
        {linkStatus === "checking" ? null : linkStatus === "invalid" ? (
          <AuthCard
            title="Reset link invalid"
            description="This password reset link is invalid or has expired."
          >
            <Link
              href="/forgot-password"
              className="mt-4 inline-block w-full cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white shadow-sm transition-all duration-150 hover:-translate-y-px hover:bg-blue-700 hover:shadow-md active:translate-y-0 active:shadow-sm"
            >
              Request a new link
            </Link>
          </AuthCard>
        ) : (
          <AuthCard title="Reset password" description="Choose a new password." error={error}>
            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <div>
                <label className={AUTH_LABEL_CLASS}>New password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  required
                  className={AUTH_INPUT_CLASS}
                />
              </div>
              <div>
                <label className={AUTH_LABEL_CLASS}>Confirm new password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className={AUTH_INPUT_CLASS}
                />
              </div>

              <PasswordChecklist rules={rules} />

              <button
                type="submit"
                disabled={loading || !canSubmit}
                className="w-full cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:-translate-y-px hover:bg-blue-700 hover:shadow-md active:translate-y-0 active:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
              >
                {loading ? "Saving…" : "Reset password"}
              </button>
            </form>
          </AuthCard>
        )}
      </main>
    </div>
  );
}
