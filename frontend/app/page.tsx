"use client";

import { useEffect, useState } from "react";

type SessionState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | {
      status: "authenticated";
      user: { id: number; login: string; displayName: string; imageUrl?: string | null };
    };

const AUTH_BASE_URL =
  process.env.NEXT_PUBLIC_AUTH_BASE_URL ?? "http://localhost:8000";

export default function Page() {
  const [session, setSession] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    async function fetchSession() {
      try {
        const response = await fetch(
          `${AUTH_BASE_URL}/auth/session`,
          { credentials: "include" }
        );
        if (!response.ok) throw new Error("Session lookup failed");
        const data = await response.json();
        setSession({ status: "authenticated", user: data.user });
      } catch {
        setSession({ status: "unauthenticated" });
      }
    }

    void fetchSession();
  }, []);

  const loginUrl = `${AUTH_BASE_URL}/auth/login`;
  const logoutUrl = `${AUTH_BASE_URL}/auth/logout`;

  return (
    <div className="w-full space-y-6 rounded-3xl border border-slate-800 bg-slate-900/60 p-10 shadow-xl">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold text-sky-200">
          Sign in with 42 Intra
        </h1>
        <p className="text-slate-400">
          Authenticate with your 42 credentials to access the dashboard.
        </p>
      </div>

      {session.status === "loading" && (
        <p className="text-center text-slate-400">Checking your session…</p>
      )}

      {session.status === "unauthenticated" && (
        <div className="flex flex-col items-center gap-4">
          <a
            href={loginUrl}
            className="inline-flex items-center justify-center rounded-full bg-sky-500 px-6 py-3 text-lg font-medium text-slate-950 transition hover:bg-sky-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
          >
            Continue with 42
          </a>
          <p className="text-sm text-slate-500">
            You will be redirected to the official 42 login page.
          </p>
        </div>
      )}

      {session.status === "authenticated" && (
        <div className="space-y-4 text-center">
          <p className="text-lg">
            Welcome back,{" "}
            <span className="font-semibold text-sky-200">
              {session.user.displayName || session.user.login}
            </span>
            !
          </p>
          <div className="flex justify-center">
            <form action={logoutUrl} method="post">
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-full border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
