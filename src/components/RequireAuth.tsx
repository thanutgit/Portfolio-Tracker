"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { ReactNode } from "react";

type Status = "checking" | "authed" | "unauthed";

interface Props {
  children: ReactNode;
}

// Wraps any page that requires a logged-in user. Client-side only (matches
// the rest of this app's auth — no middleware/SSR session yet, see
// DECISIONS.md for why), so there's a brief "checking" render with nothing
// shown before either the content or the redirect happens — RLS already
// blocks the underlying data either way, this just avoids flashing an
// empty/broken-looking page instead of bouncing to /login.
export function RequireAuth({ children }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setStatus(data.session ? "authed" : "unauthed");
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setStatus(session ? "authed" : "unauthed");
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (status === "unauthed") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status !== "authed") return null;
  return <>{children}</>;
}
