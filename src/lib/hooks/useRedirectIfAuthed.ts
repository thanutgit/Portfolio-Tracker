"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// Used by /login and /signup — if a session already exists there's nothing
// to log in/sign up for, so bounce to Overview instead of showing the form.
export function useRedirectIfAuthed() {
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/");
      }
    });
  }, [router]);
}
