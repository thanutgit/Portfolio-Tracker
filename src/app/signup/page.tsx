"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { AuthCard, AUTH_INPUT_CLASS, AUTH_LABEL_CLASS } from "@/components/AuthCard";
import { CONTAINER_CLASS } from "@/lib/layout";
import { allPasswordRulesMet, checkPasswordRules } from "@/lib/passwordRules";

// Same blue-for-met / gray-for-not-yet treatment as TaxHoldingBadge (D62,
// D74-adjacent) — deliberately not green/red, which DESIGN.md reserves for
// P&L only.
const MET_CLASS = "text-blue-600 dark:text-blue-400";
const UNMET_CLASS = "text-gray-400 dark:text-gray-500";

function CheckIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 10.5l3.5 3.5L16 6" />
    </svg>
  );
}

function DotIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className}>
      <circle cx="10" cy="10" r="3" fill="currentColor" />
    </svg>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);

  const rules = checkPasswordRules(password, confirmPassword);
  const canSubmit = allPasswordRulesMet(password, confirmPassword);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Defensive guard in addition to the disabled button — Enter-to-submit
    // shouldn't bypass the rules either.
    if (!canSubmit) return;
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
                    className={AUTH_INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className={AUTH_LABEL_CLASS}>Confirm password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className={AUTH_INPUT_CLASS}
                  />
                </div>

                <ul className="space-y-1 pt-1">
                  {rules.map((rule) => (
                    <li
                      key={rule.key}
                      className={`flex items-center gap-1.5 text-xs ${rule.met ? MET_CLASS : UNMET_CLASS}`}
                    >
                      {rule.met ? (
                        <CheckIcon className="h-3.5 w-3.5 flex-shrink-0" />
                      ) : (
                        <DotIcon className="h-3.5 w-3.5 flex-shrink-0" />
                      )}
                      {rule.label}
                    </li>
                  ))}
                </ul>

                <button
                  type="submit"
                  disabled={loading || !canSubmit}
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
