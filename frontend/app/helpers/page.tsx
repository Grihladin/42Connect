"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import logoMark from "../../42_Logo.png";

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

type HelperStudent = {
  login: string;
  displayName: string | null;
  campus: string | null;
  readyToHelp: boolean | null;
  vibe: string | null;
};

type HelperMatch = {
  student: HelperStudent;
  finishedAt: string | null;
  finalMark: number | null;
};

type HelperProject = {
  project: {
    id: number;
    name: string | null;
    slug: string | null;
  };
  helpers: HelperMatch[];
};

type HelpersPayload = {
  projects: HelperProject[];
};

const AUTH_BASE_URL =
  process.env.NEXT_PUBLIC_AUTH_BASE_URL ?? "http://168.119.52.144:8000";

export default function HelpersPage() {
  const [session, setSession] = useState<SessionState>({ status: "loading" });
  const [helpers, setHelpers] = useState<HelperProject[]>([]);
  const [helpersStatus, setHelpersStatus] =
    useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    async function fetchSession() {
      try {
        const response = await fetch(`${AUTH_BASE_URL}/auth/session`, {
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error("Session lookup failed");
        }
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
      setHelpers([]);
      setHelpersStatus("idle");
      return;
    }

    let cancelled = false;
    async function fetchHelpers() {
      setHelpersStatus("loading");
      try {
        const response = await fetch(`${AUTH_BASE_URL}/students/me/helpers`, {
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error("Failed to load helpers");
        }
        const data: HelpersPayload = await response.json();
        if (!cancelled) {
          setHelpers(normalizeProjects(data.projects));
          setHelpersStatus("idle");
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setHelpers([]);
          setHelpersStatus("error");
        }
      }
    }

    void fetchHelpers();
    return () => {
      cancelled = true;
    };
  }, [session.status]);

  const activeProjectCount = useMemo(
    () => helpers.filter((project) => project.helpers.length > 0).length,
    [helpers]
  );

  return (
    <div className="page-shell">
      <header className="page-shell__header">
        <div className="page-shell__brand" aria-label="42Connect helpers">
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
          <Link className="button button--primary button--small" href="/helpers">
            Get help
          </Link>
        </div>
        <div className="page-shell__header-meta">
          <Link className="button button--ghost button--small" href="/">
            Back to dashboard
          </Link>
        </div>
      </header>

      <div className="page-shell__content">
        {session.status === "loading" ? (
          <section className="helpers-panel helpers-panel--loading" aria-live="polite">
            <span className="helpers-panel__spinner" aria-hidden="true" />
            <p>Checking your session…</p>
          </section>
        ) : null}

        {session.status === "unauthenticated" ? (
          <section className="helpers-panel">
            <header className="helpers-panel__header">
              <h1>Sign in to see study helpers</h1>
              <p>
                Connect your 42 account to view classmates who recently completed
                projects you&apos;re working on.
              </p>
            </header>
            <div className="helpers-panel__actions">
              <a className="button button--primary" href={`${AUTH_BASE_URL}/auth/login`}>
                Sign in with 42
              </a>
            </div>
          </section>
        ) : null}

        {session.status === "authenticated" ? (
          <section className="helpers-panel" aria-live="polite">
            <header className="helpers-panel__header">
              <div>
                <h1>Find a project helper</h1>
                <p>
                  We found {activeProjectCount}{" "}
                  {activeProjectCount === 1 ? "project" : "projects"} with available
                  helpers based on your current workload.
                </p>
              </div>
            </header>

            {helpersStatus === "loading" ? (
              <div className="helpers-panel__status">
                <span className="helpers-panel__spinner" aria-hidden="true" />
                <p>Looking for classmates who recently finished your projects…</p>
              </div>
            ) : null}

            {helpersStatus === "error" ? (
              <div className="helpers-panel__status helpers-panel__status--error" role="alert">
                <p>
                  We couldn&apos;t load helper suggestions right now. Please try again
                  shortly.
                </p>
              </div>
            ) : null}

            {helpersStatus === "idle" && helpers.length === 0 ? (
              <div className="helpers-panel__status">
                <p>No active projects were found. Start a project to see available helpers.</p>
              </div>
            ) : null}

            <div className="helpers-projects">
              {helpers.map((project) => (
                <HelperProjectCard key={project.project.id} project={project} />
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <footer className="page-shell__footer">
        <p>Peer guidance powered by Project Pulse.</p>
      </footer>
    </div>
  );
}

type NormalizedHelperProject = HelperProject;

function HelperProjectCard({ project }: { project: NormalizedHelperProject }) {
  const projectName = project.project.name || project.project.slug || "Untitled project";
  const hasHelpers = project.helpers.length > 0;

  return (
    <section className="helper-project" aria-live="polite">
      <header className="helper-project__header">
        <div>
          <h2 className="helper-project__title">{projectName}</h2>
          <p className="helper-project__subtitle">
            {hasHelpers
              ? "Helpers are ordered by the most recent completion date."
              : "No helpers available yet. Check back soon!"}
          </p>
        </div>
        <span className="helper-project__count" aria-label={`${project.helpers.length} helpers`}>
          {project.helpers.length}
        </span>
      </header>
      <ul className="helper-project__list">
        {hasHelpers ? (
          project.helpers.map((helper) => (
            <HelperCard key={`${project.project.id}-${helper.student.login}`} helper={helper} />
          ))
        ) : (
          <li className="helper-project__empty">
            Nobody has marked this project as finished yet. Once someone does, you&apos;ll see them here.
          </li>
        )}
      </ul>
    </section>
  );
}

function HelperCard({ helper }: { helper: HelperMatch }) {
  const displayName = helper.student.displayName || helper.student.login;
  const campus = helper.student.campus ?? undefined;
  const vibe = helper.student.vibe ?? undefined;
  const finishedAtLabel = helper.finishedAt
    ? `Completed ${formatDate(helper.finishedAt)}`
    : "Completion date unavailable";

  return (
    <li className="helper-card">
      <div className="helper-card__main">
        <span className="helper-card__name">{displayName}</span>
        <span className="helper-card__meta">
          @{helper.student.login}
          {campus ? ` · ${campus}` : ""}
        </span>
      </div>
      <div className="helper-card__details">
        <span className="helper-card__tag">{finishedAtLabel}</span>
        {helper.finalMark !== null ? (
          <span className="helper-card__score" aria-label="Final mark">
            {helper.finalMark}
          </span>
        ) : null}
        {vibe ? <span className="helper-card__note">{vibe}</span> : null}
        <button
          type="button"
          className="helper-card__cta"
          onClick={() =>
            window.open(
              `https://slack.com/app_redirect?channel=${encodeURIComponent(helper.student.login)}`,
              "_blank"
            )
          }
        >
          Ping on Slack
        </button>
      </div>
    </li>
  );
}

function normalizeProjects(payload: HelperProject[]): HelperProject[] {
  return payload.map((project) => {
    const helpers = [...project.helpers].sort(
      (a, b) => getTimestamp(b.finishedAt) - getTimestamp(a.finishedAt)
    );
    return {
      project: project.project,
      helpers,
    };
  });
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function getTimestamp(value: string | null): number {
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}
