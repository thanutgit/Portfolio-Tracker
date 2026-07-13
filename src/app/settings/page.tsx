"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CONTAINER_CLASS } from "@/lib/layout";
import { Toast } from "@/components/Toast";
import { PageHeader } from "@/components/PageHeader";
import { RequireAuth } from "@/components/RequireAuth";
import { DatePicker } from "@/components/DatePicker";

export default function SettingsPage() {
  const [rowId, setRowId] = useState<string | null>(null);
  const [birthDate, setBirthDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("user_settings")
      .select("id, birth_date")
      .limit(1)
      .maybeSingle();
    if (error) {
      setError(error.message);
    } else if (data) {
      setRowId(data.id);
      setBirthDate(data.birth_date ?? "");
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = { birth_date: birthDate || null };
    let result;
    if (rowId) {
      result = await supabase.from("user_settings").update(payload).eq("id", rowId).select("id").single();
    } else {
      // A fresh row needs user_id set explicitly — once RLS is on (Phase 7
      // step 2), a row inserted without it would become invisible to
      // everyone (including the user who just created it), since
      // `auth.uid() = user_id` can never match a null user_id.
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      result = await supabase
        .from("user_settings")
        .insert({ ...payload, user_id: userId })
        .select("id")
        .single();
    }
    const { data, error } = result;

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setRowId(data.id);
    setToastMessage("Settings saved.");
    setSaving(false);
  }

  return (
    <RequireAuth>
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <main className={`${CONTAINER_CLASS} py-10`}>
        <PageHeader
          title="Settings"
          description="Personal details used for Thai tax-advantaged fund (RMF/SSF/ThaiESG) holding-period checks."
        />

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : (
          <div className="max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Birth date
                </label>
                <DatePicker value={birthDate} onChange={setBirthDate} />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Used only to check RMF&apos;s 55-and-older condition. SSF and ThaiESG have no age
                  condition.
                </p>
                {!birthDate && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    Enter your birth date to see RMF&apos;s age condition.
                  </p>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:-translate-y-px hover:bg-blue-700 hover:shadow-md active:translate-y-0 active:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        )}
      </main>

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </div>
    </RequireAuth>
  );
}
