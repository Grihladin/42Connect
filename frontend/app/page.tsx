"use client";

import { useEffect, useState, useTransition } from "react";

type SessionState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | {
      status: "authenticated";
      user: { id: number; login: string; displayName: string; imageUrl?: string | null };
    };

type ProjectSummary = {
  id: number;
  name: string | null;
  slug: string | null;
  status: string | null;
  finalMark: number | null;
  validated: boolean | null;
  progressPercent?: number | null;
};

type StudentPayload = {
  student: {
    login: string;
    displayName: string | null;
    campus: string | null;
  };
  projects: {
    finished: ProjectSummary[];
    inProgress: ProjectSummary[];
    all: ProjectSummary[];
  };
};

const AUTH_BASE_URL =
  process.env.NEXT_PUBLIC_AUTH_BASE_URL ?? "http://localhost:8000";

export default function Page() {
  const [session, setSession] = useState<SessionState>({ status: "loading" });
  const [profile, setProfile] = useState<StudentPayload | null>(null);
  const [profileStatus, setProfileStatus] = useState<"idle" | "loading" | "error">("idle");
  const [isLoggingOut, startLogout] = useTransition();

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

  useEffect(() => {
    if (session.status !== "authenticated") {
      setProfile(null);
      setProfileStatus("idle");
      return;
    }

    let cancelled = false;
    async function fetchProfile() {
      setProfileStatus("loading");
      try {
        const response = await fetch(`${AUTH_BASE_URL}/students/me`, {
          credentials: "include",
        });
        if (!response.ok) throw new Error("Failed to load profile");
        const data = await response.json();
        if (!cancelled) {
          setProfile({
            student: {
              login: data.student.login,
              displayName: data.student.displayName,
              campus: data.student.campus ?? null,
            },
            projects: {
              finished: normalizeProjects(data.projects.finished),
              inProgress: normalizeProjects(data.projects.inProgress),
              all: normalizeProjects(data.projects.all),
            },
          });
          setProfileStatus("idle");
        }
      } catch (error) {
        if (!cancelled) {
          console.error(error);
          setProfile(null);
          setProfileStatus("error");
        }
      }
    }

    void fetchProfile();
    return () => {
      cancelled = true;
    };
  }, [session.status]);

const loginUrl = `${AUTH_BASE_URL}/auth/login`;
const logoutUrl = `${AUTH_BASE_URL}/auth/logout`;

function normalizeProjects(projects: ProjectSummary[]): ProjectSummary[] {
  return projects
    .filter(shouldDisplayProject)
    .map((project) => {
      const parsedPercent =
        typeof project.progressPercent === "number"
          ? { percent: project.progressPercent, cleanedName: project.name }
          : parseTrailingPercentage(project.name);
      const normalizedName =
        parsedPercent && parsedPercent.cleanedName !== undefined
          ? parsedPercent.cleanedName
          : project.name;
      return {
        ...project,
        name: normalizedName,
        progressPercent: parsedPercent?.percent ?? null,
      };
    });
}

function shouldDisplayProject(project: ProjectSummary): boolean {
  const name = (project.name ?? project.slug ?? "").toLowerCase();
  return !name.includes("piscine");
}

function parseTrailingPercentage(name?: string | null):
  | { percent: number; cleanedName: string | null }
  | undefined {
  if (!name) return undefined;
  const match = name.match(/\b(\d{1,3})\s*$/);
  if (!match) return undefined;
  const percent = Number(match[1]);
  if (Number.isNaN(percent)) return undefined;
  const cleanedName = name.slice(0, match.index).trimEnd();
  return {
    percent: Math.min(percent, 100),
    cleanedName: cleanedName.length ? cleanedName : null,
  };
}

const handleLogout: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    startLogout(async () => {
      try {
        const response = await fetch(logoutUrl, {
          method: "POST",
          credentials: "include",
        });
        if (response.redirected) {
          window.location.href = response.url;
        } else if (response.ok) {
          window.location.href = "/";
        } else {
          throw new Error("Logout failed");
        }
      } catch (error) {
        console.error(error);
      }
    });
  };

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
            <form onSubmit={handleLogout}>
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-full border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isLoggingOut}
              >
                {isLoggingOut ? "Signing out…" : "Sign out"}
              </button>
            </form>
          </div>

          <div className="mt-6 space-y-3 text-left">
            {profileStatus === "loading" && (
              <p className="text-sm text-slate-500">Syncing your latest 42 data…</p>
            )}
            {profileStatus === "error" && (
              <p className="text-sm text-rose-400">
                We could not load your projects. Please try again shortly.
              </p>
            )}
            {profile && (
              <>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                  <h2 className="text-left text-xl font-semibold text-sky-200">
                    {profile.student.displayName || profile.student.login}
                  </h2>
                  <p className="text-sm text-slate-400">
                    Intraname: <span className="font-mono text-slate-200">{profile.student.login}</span>
                    {profile.student.campus && (
                      <>
                        {" "}· Campus: <span className="text-slate-300">{profile.student.campus}</span>
                      </>
                    )}
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <section className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                    <header className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-sky-200">Finished projects</h3>
                      <span className="text-sm text-slate-400">
                        {profile.projects.finished.length}
                      </span>
                    </header>
                    <ul className="space-y-2 text-sm text-slate-300">
                      {profile.projects.finished.length === 0 && (
                        <li className="text-slate-500">No finished projects yet.</li>
                      )}
                      {profile.projects.finished.map((project) => (
                        <li key={project.id} className="flex justify-between gap-2">
                          <span>{project.name || project.slug || "Untitled project"}</span>
                          <span className="flex items-center gap-2">
                            {typeof project.progressPercent === "number" && (
                              <span className="font-mono text-slate-500">
                                {project.progressPercent}%
                              </span>
                            )}
                            {project.finalMark !== null && (
                              <span className="font-mono text-slate-400">{project.finalMark}</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                    <header className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-sky-200">In progress</h3>
                      <span className="text-sm text-slate-400">
                        {profile.projects.inProgress.length}
                      </span>
                    </header>
                    <ul className="space-y-2 text-sm text-slate-300">
                      {profile.projects.inProgress.length === 0 && (
                        <li className="text-slate-500">No projects in progress.</li>
                      )}
                      {profile.projects.inProgress.slice(0, 5).map((project) => (
                        <li key={project.id} className="flex justify-between gap-2">
                          <span>{project.name || project.slug || "Untitled project"}</span>
                          <span className="flex items-center gap-2">
                            {typeof project.progressPercent === "number" && (
                              <span className="font-mono text-slate-500">
                                {project.progressPercent}%
                              </span>
                            )}
                            {project.status && (
                              <span className="ml-2 font-mono uppercase tracking-wide text-slate-500">
                                {project.status.replace(/_/g, " ")}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
