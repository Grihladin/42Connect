"use client";

import Image from "next/image";
import { FormEventHandler, useEffect, useState, useTransition } from "react";

type SessionUser = {
  id: number;
  login: string;
  displayName: string;
  imageUrl?: string | null;
};

type SessionState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; user: SessionUser };

type ProjectSummary = {
  id: number;
  name: string | null;
  slug: string | null;
  status: string | null;
  finalMark: number | null;
  validated: boolean | null;
  progressPercent?: number | null;
  syncedAt?: string | null;
  finishedAt?: string | null;
  markedAt?: string | null;
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
  const [profileStatus, setProfileStatus] =
    useState<"idle" | "loading" | "error">("idle");
  const [isLoggingOut, startLogout] = useTransition();

  useEffect(() => {
    async function fetchSession() {
      try {
        const response = await fetch(`${AUTH_BASE_URL}/auth/session`, {
          credentials: "include",
        });
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

  const handleLogout: FormEventHandler<HTMLFormElement> = (event) => {
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
    <div className="page-shell">
      <header className="page-shell__header">
        <div className="page-shell__brand" aria-label="42 Project Pulse">
          <span className="page-shell__glyph">42</span>
          <span>Project Pulse</span>
        </div>
        {session.status === "authenticated" ? (
          <span className="session-chip session-chip--online">Signed in</span>
        ) : (
          <span className="session-chip session-chip--offline">Guest</span>
        )}
      </header>

      <div className="page-shell__content">
        {session.status === "loading" && (
          <LoadingCard message="Checking your session…" />
        )}

        {session.status === "unauthenticated" && (
          <LoginCard loginUrl={loginUrl} />
        )}

        {session.status === "authenticated" && (
          <DashboardCard
            sessionUser={session.user}
            profile={profile}
            profileStatus={profileStatus}
            onLogout={handleLogout}
            isLoggingOut={isLoggingOut}
          />
        )}
      </div>

      <footer className="page-shell__footer">
        <p>Secure authentication powered by 42 Intra.</p>
      </footer>
    </div>
  );
}

type DashboardCardProps = {
  sessionUser: SessionUser;
  profile: StudentPayload | null;
  profileStatus: "idle" | "loading" | "error";
  onLogout: FormEventHandler<HTMLFormElement>;
  isLoggingOut: boolean;
};

function DashboardCard({
  sessionUser,
  profile,
  profileStatus,
  onLogout,
  isLoggingOut,
}: DashboardCardProps) {
  const displayName = sessionUser.displayName || sessionUser.login;
  const campus = profile?.student.campus ?? null;
  const finished = profile?.projects.finished ?? [];
  const inProgress = profile?.projects.inProgress ?? [];
  const tracked = profile?.projects.all ?? [];
  const sortedInProgress = [...inProgress].sort(
    (a, b) => getProjectUpdateTimestamp(b) - getProjectUpdateTimestamp(a)
  );
  const sortedFinished = [...finished].sort(
    (a, b) => getFinishedTimestamp(b) - getFinishedTimestamp(a)
  );

  const stats = [
    { label: "Finished", value: finished.length },
    { label: "In progress", value: inProgress.length },
    { label: "Tracked", value: tracked.length },
  ];

  return (
    <section className="panel panel--dashboard" aria-live="polite">
      <header className="panel__heading">
        <div className="identity">
          <div className="identity__avatar" aria-hidden="true">
            {sessionUser.imageUrl ? (
              <Image
                src={sessionUser.imageUrl}
                alt=""
                fill
                sizes="(max-width: 720px) 56px, 64px"
                className="identity__image"
              />
            ) : (
              <span className="identity__initials">{getInitials(displayName)}</span>
            )}
          </div>
          <div className="identity__details">
            <h2>Welcome back, {displayName}</h2>
            <p>
              <span className="identity__handle">@{sessionUser.login}</span>
              {campus ? <span> · {campus}</span> : null}
            </p>
          </div>
        </div>
        <form onSubmit={onLogout} className="panel__actions">
          <button
            type="submit"
            className="button button--ghost"
            disabled={isLoggingOut}
          >
            {isLoggingOut ? "Signing out…" : "Sign out"}
          </button>
        </form>
      </header>

      <section className="panel__section" aria-label="Project overview">
        <ul className="stats">
          {stats.map((stat) => (
            <li key={stat.label} className="stats__item">
              <span className="stats__value">{stat.value}</span>
              <span className="stats__label">{stat.label}</span>
            </li>
          ))}
        </ul>
      </section>

      {profileStatus === "loading" && (
        <p className="panel__notice panel__notice--loading">
          Syncing your latest 42 data…
        </p>
      )}

      {profileStatus === "error" && (
        <p className="panel__notice panel__notice--error">
          We could not load your projects. Please try again shortly.
        </p>
      )}

      {profile && (
        <div className="panel__sections">
          <ProjectList
            title="In Progress"
            projects={sortedInProgress}
            emptyMessage="You're all caught up. No projects in progress."
            context="in-progress"
          />
          <ProjectList
            title="Completed"
            projects={sortedFinished}
            emptyMessage="No completed projects yet."
            context="completed"
          />
        </div>
      )}
    </section>
  );
}

type ProjectListProps = {
  title: string;
  projects: ProjectSummary[];
  emptyMessage: string;
  context: "in-progress" | "completed";
};

function ProjectList({ title, projects, emptyMessage, context }: ProjectListProps) {
  const statusLabel = context === "in-progress" ? "In progress" : "Finished";
  const variantClass =
    context === "in-progress" ? " project-card--in-progress" : " project-card--completed";
  const subtitleText =
    context === "in-progress"
      ? "Current work, ordered by latest activity."
      : "Recently completed projects, newest first.";

  return (
    <section className={`project-card${variantClass}`}>
      <header className="project-card__header">
        <div>
          <h3 className="project-card__title">{title}</h3>
          <p className="project-card__subtitle">{subtitleText}</p>
        </div>
        <span className="project-card__count" aria-label={`${projects.length} projects`}>
          {projects.length}
          <span className="project-card__count-label">
            {projects.length === 1 ? "project" : "projects"}
          </span>
        </span>
      </header>
      <ul className="project-card__list">
        {projects.length === 0 ? (
          <li className="project-card__empty">{emptyMessage}</li>
        ) : (
          projects.map((project) => {
            const projectName = project.name || project.slug || "Untitled project";
            const progressValue = clampProgress(project.progressPercent);
            const showScore = context === "completed" && project.finalMark !== null;
            const showProgress =
              context === "in-progress"
                ? progressValue !== null
                : !showScore && progressValue !== null;
            const fallbackLabel =
              !showScore && !showProgress
                ? context === "in-progress"
                  ? "Awaiting updates"
                  : "Score pending"
                : null;
            const needsRetake = project.validated === false;

            return (
              <li key={project.id} className="project-row">
                <div className="project-row__main">
                  <span className="project-row__name">{projectName}</span>
                  <span className="project-row__status">{statusLabel}</span>
                </div>
                <div className="project-row__meta">
                  {showProgress && progressValue !== null ? (
                    <div
                      className="project-progress"
                      role="progressbar"
                      aria-label={`${projectName} progress`}
                      aria-valuenow={progressValue}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div className="project-progress__track">
                        <div
                          className="project-progress__fill"
                          style={{ width: `${progressValue}%` }}
                        />
                      </div>
                      <span className="project-progress__value">
                        {progressValue}%
                      </span>
                    </div>
                  ) : null}
                  {showScore ? (
                    <span className="project-row__score">{project.finalMark}</span>
                  ) : null}
                  {fallbackLabel ? (
                    <span className="project-row__note">{fallbackLabel}</span>
                  ) : null}
                  {needsRetake ? (
                    <span className="project-row__badge project-row__badge--invalid">
                      Retake
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}

type LoginCardProps = {
  loginUrl: string;
};

function LoginCard({ loginUrl }: LoginCardProps) {
  return (
    <section className="panel panel--auth">
      <div className="panel__lead">
        <h1>Sign in with 42 Intra</h1>
        <p>
          Connect your campus account to unlock a focused dashboard of your
          progress.
        </p>
      </div>
      <div className="panel__actions">
        <a className="button button--primary" href={loginUrl}>
          Continue with 42
        </a>
        <p className="panel__message">
          Redirects to the official 42 authentication portal.
        </p>
      </div>
    </section>
  );
}

type LoadingCardProps = {
  message: string;
};

function LoadingCard({ message }: LoadingCardProps) {
  return (
    <section className="panel panel--loading" aria-live="polite">
      <span className="panel__spinner" aria-hidden="true" />
      <p>{message}</p>
    </section>
  );
}

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
        progressPercent: clampProgress(parsedPercent?.percent ?? null),
        finishedAt: project.finishedAt ?? null,
        syncedAt: project.syncedAt ?? null,
        markedAt: project.markedAt ?? null,
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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "42";
  const [first, second] = parts;
  if (!second) return first.slice(0, 2).toUpperCase();
  return `${first[0]}${second[0]}`.toUpperCase();
}

function clampProgress(value?: number | null): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return Math.max(0, Math.min(Math.round(value), 100));
}

function getTimestamp(value?: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getProjectUpdateTimestamp(project: ProjectSummary): number {
  return (
    getTimestamp(project.syncedAt) ||
    getTimestamp(project.markedAt) ||
    getTimestamp(project.finishedAt)
  );
}

function getFinishedTimestamp(project: ProjectSummary): number {
  return getTimestamp(project.finishedAt) || getProjectUpdateTimestamp(project);
}
