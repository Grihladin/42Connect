"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ChangeEventHandler,
  FormEventHandler,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import logoMark from "../42_Logo.png";

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
    readyToHelp: boolean | null;
    vibe: string | null;
  };
  projects: {
    finished: ProjectSummary[];
    inProgress: ProjectSummary[];
    all: ProjectSummary[];
  };
};

type VibeMatch = {
  student: {
    login: string;
    displayName: string | null;
    campus: string | null;
    readyToHelp: boolean | null;
    vibe: string | null;
  };
  similarity: number;
  latestProject: ProjectSummary | null;
};

const AUTH_BASE_URL =
  process.env.NEXT_PUBLIC_AUTH_BASE_URL ?? "http://168.119.52.144:8000";

export default function Page() {
  const [session, setSession] = useState<SessionState>({ status: "loading" });
  const [profile, setProfile] = useState<StudentPayload | null>(null);
  const [profileStatus, setProfileStatus] =
    useState<"idle" | "loading" | "error">("idle");
  const [isLoggingOut, startLogout] = useTransition();
  const vibeMatchHandlerRef = useRef<(() => void) | null>(null);

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
              readyToHelp: data.student.readyToHelp ?? null,
              vibe: data.student.vibe ?? null,
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

  const handleReadyToHelpChange = async (value: boolean) => {
    try {
      const response = await fetch(`${AUTH_BASE_URL}/students/me/preferences`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ readyToHelp: value }),
      });
      if (!response.ok) {
        throw new Error("Failed to update preference");
      }
      const data = await response.json();
      setProfile((current) => {
        if (!current) return current;
        return {
          ...current,
          student: {
            ...current.student,
            readyToHelp: data.student.readyToHelp ?? null,
          },
        };
      });
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const handleVibeUpdate = async (value: string) => {
    try {
      const response = await fetch(`${AUTH_BASE_URL}/students/me/preferences`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ vibe: value }),
      });
      if (!response.ok) {
        throw new Error("Failed to update vibe");
      }
      const data = await response.json();
      const nextVibe = data.student?.vibe ?? value;
      setProfile((current) => {
        if (!current) return current;
        return {
          ...current,
          student: {
            ...current.student,
            vibe: nextVibe,
          },
        };
      });
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const fetchVibeMatches = async (): Promise<VibeMatch[]> => {
    try {
      const response = await fetch(`${AUTH_BASE_URL}/students/me/vibe-matches`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to load vibe matches");
      }
      const data = await response.json();
      const matches = Array.isArray(data.matches) ? data.matches : [];
      return matches.map((match: any) => ({
        student: {
          login: match.student?.login ?? "",
          displayName: match.student?.displayName ?? null,
          campus: match.student?.campus ?? null,
          readyToHelp: match.student?.readyToHelp ?? null,
          vibe: match.student?.vibe ?? null,
        },
        similarity: typeof match.similarity === "number" ? match.similarity : 0,
        latestProject: normalizeSingleProject(match.latestProject ?? null),
      }));
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const registerVibeMatchHandler = useCallback((callback: () => void) => {
    vibeMatchHandlerRef.current = callback;
  }, []);

  const handleHeaderVibeMatchClick = () => {
    vibeMatchHandlerRef.current?.();
  };

  return (
    <div className="page-shell">
      <header className="page-shell__header">
        <div className="page-shell__brand" aria-label="42Connect">
          <Image
            src={logoMark}
            alt="42 logo"
            className="page-shell__logo"
            priority
          />
          <span className="page-shell__brand-mark">
            <span className="page-shell__brand-mark--accent">Connect</span>
          </span>
        </div>
        <div className="page-shell__header-center">
          {session.status === "authenticated" ? (
            <div className="page-shell__cta-group">
              <button
                type="button"
                className="button button--secondary"
                onClick={handleHeaderVibeMatchClick}
              >
                Match vibe
              </button>
              <Link className="button button--secondary" href="/helpers">
                Get help
              </Link>
            </div>
          ) : null}
        </div>
        <div className="page-shell__header-meta" />
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
            onReadyToHelpChange={handleReadyToHelpChange}
            onVibeUpdate={handleVibeUpdate}
            onFetchVibeMatches={fetchVibeMatches}
            onRegisterVibeMatch={registerVibeMatchHandler}
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
  onReadyToHelpChange: (value: boolean) => Promise<void>;
  onVibeUpdate: (value: string) => Promise<void>;
  onFetchVibeMatches: () => Promise<VibeMatch[]>;
  onRegisterVibeMatch: (handler: () => void) => void;
};

function DashboardCard({
  sessionUser,
  profile,
  profileStatus,
  onLogout,
  isLoggingOut,
  onReadyToHelpChange,
  onVibeUpdate,
  onFetchVibeMatches,
  onRegisterVibeMatch,
}: DashboardCardProps) {
  const displayName = sessionUser.displayName || sessionUser.login;
  const campus = profile?.student.campus ?? null;
  const finished = profile?.projects.finished ?? [];
  const inProgress = profile?.projects.inProgress ?? [];
  const readyToHelpPreference = profile?.student.readyToHelp ?? false;
  const vibeValue = profile?.student.vibe ?? "";
  const sortedInProgress = [...inProgress].sort(
    (a, b) => getProjectUpdateTimestamp(b) - getProjectUpdateTimestamp(a)
  );
  const sortedFinished = [...finished].sort(
    (a, b) => getFinishedTimestamp(b) - getFinishedTimestamp(a)
  );
  const [helperPreference, setHelperPreference] = useState<boolean>(readyToHelpPreference);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [isUpdatingHelper, startPreferenceUpdate] = useTransition();
  const [vibeDraft, setVibeDraft] = useState<string>(vibeValue);
  const [isSavingVibe, startVibeSave] = useTransition();
  const [isMatchingVibe, startVibeMatch] = useTransition();
  const [vibeError, setVibeError] = useState<string | null>(null);
  const [vibeFeedback, setVibeFeedback] = useState<string | null>(null);
  const [vibeMatchError, setVibeMatchError] = useState<string | null>(null);
  const [vibeMatches, setVibeMatches] = useState<VibeMatch[]>([]);

  useEffect(() => {
    setHelperPreference(readyToHelpPreference);
  }, [readyToHelpPreference]);

  useEffect(() => {
    setVibeDraft(vibeValue);
    setVibeMatches([]);
    setVibeMatchError(null);
  }, [vibeValue]);

  const handleReadyToHelpToggle: ChangeEventHandler<HTMLInputElement> = (event) => {
    const nextValue = event.target.checked;
    const previousValue = helperPreference;
    setHelperPreference(nextValue);
    setPreferenceError(null);
    startPreferenceUpdate(async () => {
      try {
        await onReadyToHelpChange(nextValue);
      } catch (error) {
        console.error(error);
        setHelperPreference(previousValue);
        setPreferenceError("We couldn't update your availability. Please try again.");
      }
    });
  };

  const handleVibeInputChange: ChangeEventHandler<HTMLTextAreaElement> = (event) => {
    setVibeDraft(event.target.value);
    setVibeError(null);
    setVibeFeedback(null);
  };

  const handleVibeSave = () => {
    const trimmed = vibeDraft.trim();
    if (!trimmed) {
      setVibeError("Tell us a bit about your vibe before saving.");
      setVibeFeedback(null);
      return;
    }
    setVibeError(null);
    startVibeSave(async () => {
      try {
        await onVibeUpdate(trimmed);
        setVibeFeedback("Saved. Your vibe is live!");
      } catch (error) {
        console.error(error);
        setVibeFeedback(null);
        setVibeError("We couldn't update your vibe. Please try again.");
      }
    });
  };

  const triggerVibeMatch = useCallback(() => {
    if (!vibeValue.trim()) {
      setVibeMatchError("Share your vibe first, then we can match you up.");
      return;
    }
    setVibeMatchError(null);
    startVibeMatch(async () => {
      try {
        const matches = await onFetchVibeMatches();
        setVibeMatches(matches);
        if (matches.length === 0) {
          setVibeMatchError("No vibe buddies just yet. Try again after more students opt in.");
        }
      } catch (error) {
        console.error(error);
        setVibeMatchError("We couldn't check vibes right now. Please try again later.");
      }
    });
  }, [vibeValue, onFetchVibeMatches, startVibeMatch]);

  const handleVibeMatchFromHeader = useCallback(() => {
    triggerVibeMatch();
    const vibeSection = document.querySelector(".panel__section--vibe");
    if (vibeSection) {
      vibeSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [triggerVibeMatch]);

  useEffect(() => {
    onRegisterVibeMatch(handleVibeMatchFromHeader);
    return () => {
      onRegisterVibeMatch(() => {});
    };
  }, [handleVibeMatchFromHeader, onRegisterVibeMatch]);

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

      {profile ? (
        <>
          <section
            className="panel__section panel__section--preference"
            aria-label="Peer support preference"
          >
            <label
              className={`helper-preference${
                isUpdatingHelper ? " helper-preference--busy" : ""
              }`}
            >
              <input
                type="checkbox"
                className="helper-preference__input"
                checked={helperPreference}
                onChange={handleReadyToHelpToggle}
                disabled={isUpdatingHelper}
              />
              <span className="helper-preference__indicator" aria-hidden="true" />
              <span className="helper-preference__content">
                <span className="helper-preference__title">Available to help others</span>
                <span className="helper-preference__description">
                  When enabled, classmates can reach out for guidance on projects you&apos;ve
                  completed.
                </span>
              </span>
              <span
                className="helper-preference__status"
                role="status"
                aria-live="polite"
              >
                {isUpdatingHelper ? "Saving…" : helperPreference ? "On" : "Off"}
              </span>
            </label>
            {preferenceError ? (
              <p className="helper-preference__error" role="alert">
                {preferenceError}
              </p>
            ) : null}
          </section>

          <section className="panel__section panel__section--vibe" aria-label="Your vibe">
            <header className="vibe-header">
              <div>
                <h3>Share your vibe</h3>
                <p>
                  Describe how you like to collaborate so we can surface classmates who match
                  your energy.
                </p>
              </div>
            </header>
            <textarea
              className="vibe-input"
              rows={3}
              value={vibeDraft}
              onChange={handleVibeInputChange}
              placeholder="Example: Night owl, loves pair-programming, patient explainer."
              aria-label="Describe your vibe"
              disabled={isSavingVibe}
            />
            <div className="vibe-actions">
              <button
                type="button"
                className="button button--primary button--small"
                onClick={handleVibeSave}
                disabled={isSavingVibe}
              >
                {isSavingVibe ? "Saving…" : "Save vibe"}
              </button>
            </div>
            {vibeFeedback ? (
              <p className="vibe-message vibe-message--success" role="status">
                {vibeFeedback}
              </p>
            ) : null}
            {vibeError ? (
              <p className="vibe-message vibe-message--error" role="alert">
                {vibeError}
              </p>
            ) : null}
            {vibeMatchError ? (
              <p className="vibe-message vibe-message--error" role="alert">
                {vibeMatchError}
              </p>
            ) : null}
            {vibeMatches.length > 0 ? (
              <ul className="vibe-matches">
                {vibeMatches.map((match, index) => (
                  <li
                    key={match.student.login ? `${match.student.login}-${index}` : `vibe-match-${index}`}
                    className="vibe-match-card"
                  >
                    <div className="vibe-match-card__header">
                      <div>
                        <span className="vibe-match-card__name">
                          {match.student.displayName || match.student.login}
                        </span>
                        <span className="vibe-match-card__meta">
                          @{match.student.login}
                          {match.student.campus ? ` · ${match.student.campus}` : ""}
                        </span>
                      </div>
                      <span className="vibe-match-card__score">
                        {Math.round(match.similarity)}% vibe match
                      </span>
                    </div>
                    {match.student.vibe ? (
                      <p className="vibe-match-card__vibe">“{match.student.vibe}”</p>
                    ) : null}
                    <div className="vibe-match-card__footer">
                      {match.latestProject ? (
                        <span className="vibe-match-card__project">
                          Latest: {match.latestProject.name || match.latestProject.slug || "Untitled"}
                        </span>
                      ) : null}
                      {match.student.readyToHelp ? (
                        <span className="vibe-match-card__badge">Ready to help</span>
                      ) : null}
                      <button
                        type="button"
                        className="vibe-match-card__cta"
                        onClick={() =>
                          window.open(
                            `https://slack.com/app_redirect?channel=${encodeURIComponent(match.student.login)}`,
                            "_blank"
                          )
                        }
                      >
                        Ping on Slack
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </>
      ) : null}

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
      ? "Work ordered by latest activity."
      : "Recently completed projects, newest first.";
  const countLabel = `${projects.length} ${
    projects.length === 1 ? "project" : "projects"
  }`;

  return (
    <section className={`project-card${variantClass}`}>
      <header className="project-card__header">
        <h3 className="project-card__title">
          {title}
          <span className="project-card__count" aria-label={countLabel}>
            {countLabel}
          </span>
        </h3>
        <p className="project-card__subtitle">{subtitleText}</p>
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
        <h1>Welcome in! Ready to share your vibe?</h1>
        <p>
          Sign in with your 42 account to sync your projects, signal your vibe, and
          connect with classmates who match your energy.
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
          : parseTrailingPercentage(project.name, project.slug ?? null);
      const baseName =
        parsedPercent && parsedPercent.cleanedName !== undefined
          ? parsedPercent.cleanedName
          : project.name;
      const normalizedName =
        ensureModuleIdentifier(baseName ?? null, project.slug ?? null) ?? baseName ?? null;
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

function normalizeSingleProject(project: ProjectSummary | null): ProjectSummary | null {
  if (!project) return null;
  const normalized = normalizeProjects([project]);
  if (normalized.length > 0) {
    return normalized[0];
  }
  return {
    ...project,
    progressPercent: clampProgress(project.progressPercent ?? null),
  };
}

function shouldDisplayProject(project: ProjectSummary): boolean {
  const name = (project.name ?? project.slug ?? "").toLowerCase();
  return !name.includes("piscine");
}

function parseTrailingPercentage(
  name?: string | null,
  slug?: string | null
):
  | { percent: number; cleanedName: string | null }
  | undefined {
  if (!name) return undefined;
  const match = name.match(/\b(\d{1,3})\s*$/);
  if (!match) return undefined;
  const percent = Number(match[1]);
  if (Number.isNaN(percent)) return undefined;
  const cleanedName = name.slice(0, match.index).trimEnd();

  if (shouldTreatAsIdentifier(percent, cleanedName, slug ?? null)) {
    return undefined;
  }

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

function shouldTreatAsIdentifier(percent: number, cleanedName?: string | null, slug?: string | null): boolean {
  if (percent <= 9) {
    const identifierPatterns = /\bmodule\b/i;
    if (cleanedName && identifierPatterns.test(cleanedName)) {
      return true;
    }
    if (slug) {
      if (identifierPatterns.test(slug)) {
        return true;
      }
      const slugMatch = slug.match(/(\d+)$/);
      if (slugMatch && Number(slugMatch[1]) === percent) {
        return true;
      }
    }
  }
  return false;
}

function ensureModuleIdentifier(name?: string | null, slug?: string | null): string | null | undefined {
  if (!name) return name ?? null;
  const hasModuleNumber = /\bmodule\s*\d{1,2}\b/i.test(name);
  if (hasModuleNumber) {
    return name;
  }
  const slugMatch = slug?.match(/cpp[-_]?module[-_]?(\d{1,2})$/i);
  if (!slugMatch) {
    return name;
  }
  const moduleNumber = slugMatch[1].padStart(2, "0");
  return name.replace(/\bmodule\b/i, (match) => `${match} ${moduleNumber}`);
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
