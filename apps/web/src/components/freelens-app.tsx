"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

type User = {
  id: string;
  email: string;
  display_name: string;
  organization_id: string;
  organization_name: string;
  role: "owner" | "admin" | "operations_manager" | "viewer";
};

type AgencyMembership = {
  id: string;
  name: string;
  role: User["role"];
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  remembered?: boolean;
};
type Screen = "loading" | "setup" | "login" | "workspace";

const prompts = [
  "Who has worked with this client before?",
  "Find similar React projects",
  "What contract renewals are coming up?",
];

function readCookie(name: string) {
  if (typeof document === "undefined") return "";
  const item = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.split("=").slice(1).join("=")) : "";
}

function Icon({
  name,
  className = "h-5 w-5",
}: {
  name: string;
  className?: string;
}) {
  const paths: Record<string, React.ReactNode> = {
    chat: (
      <>
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        <path d="M8 9h8M8 13h5" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </>
    ),
    people: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    folder: (
      <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    ),
    file: (
      <>
        <path d="M6 2h9l5 5v15H6z" />
        <path d="M14 2v6h6M9 13h6M9 17h6" />
      </>
    ),
    brain: (
      <>
        <path d="M9.5 4A3.5 3.5 0 0 0 6 7.5v.2A3.5 3.5 0 0 0 4 14a4 4 0 0 0 4 4h1.5" />
        <path d="M14.5 4A3.5 3.5 0 0 1 18 7.5v.2a3.5 3.5 0 0 1 2 6.3 4 4 0 0 1-4 4h-1.5M12 2v20M8 10h4M12 14h4" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    send: (
      <>
        <path d="m22 2-7 20-4-9-9-4z" />
        <path d="M22 2 11 13" />
      </>
    ),
    moon: <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />,
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
      </>
    ),
    logout: (
      <>
        <path d="M10 17l5-5-5-5M15 12H3" />
        <path d="M21 19V5a2 2 0 0 0-2-2h-5" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.14.37.36.7.64.98.3.28.68.43 1.08.42H21v4h-.1a1.7 1.7 0 0 0-1.5.6z" />
      </>
    ),
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    spark: (
      <>
        <path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />
        <path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
      </>
    ),
  };
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="relative grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-[#8879ff] to-[#5846d8] text-white shadow-[0_10px_30px_rgba(102,87,232,.3)]">
        <Icon name="brain" className="h-5 w-5" />
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#121827] bg-emerald-400" />
      </div>
      <div>
        <p className="text-[1.05rem] font-semibold tracking-[-0.02em] text-white">
          HindsightOps
        </p>
        <p className="text-xs text-slate-400">Freelens AI</p>
      </div>
    </div>
  );
}

function Field(
  props: React.InputHTMLAttributes<HTMLInputElement> & {
    label: string;
    name: string;
  },
) {
  const { label, ...inputProps } = props;
  return (
    <label className="block text-sm font-medium">
      <span className="mb-2 block">{label}</span>
      <input
        required
        {...inputProps}
        className="h-12 w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 text-base text-[var(--foreground)] shadow-sm transition placeholder:text-slate-400 hover:border-slate-300 focus:border-[var(--brand)]"
      />
    </label>
  );
}

function AuthScreen({
  mode,
  onAuthenticated,
}: {
  mode: "setup" | "login";
  onAuthenticated: (user: User, csrf: string) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const body =
      mode === "setup"
        ? {
            display_name: form.get("display_name"),
            organization_name: form.get("organization_name"),
            email: form.get("email"),
            password: form.get("password"),
          }
        : { email: form.get("email"), password: form.get("password") };
    try {
      const response = await fetch(
        `${API_URL}/auth/${mode === "setup" ? "bootstrap" : "login"}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Unable to sign in");
      onAuthenticated(data.user, data.csrf_token);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to continue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-[var(--background)] lg:grid-cols-[minmax(360px,0.82fr)_1.18fr]">
      <section className="relative flex min-h-[32vh] flex-col justify-between overflow-hidden bg-[#111827] p-7 text-white sm:p-10 lg:min-h-screen lg:p-14">
        <Brand />
        <div className="relative z-10 max-w-xl py-12 lg:py-0">
          <p className="mb-5 flex items-center gap-2 text-sm font-medium text-violet-300">
            <Icon name="spark" className="h-4 w-4" /> Operations memory, always
            available
          </p>
          <h1 className="text-4xl font-semibold leading-[1.08] tracking-[-0.045em] sm:text-5xl lg:text-6xl">
            Your agency&apos;s context, carried forward.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-slate-300">
            HindsightOps recalls the clients, people, projects, contracts, and
            decisions behind every request.
          </p>
        </div>
        <p className="text-xs text-slate-500">
          Private workspace · Hindsight-powered memory
        </p>
        <div className="pointer-events-none absolute bottom-[-16rem] left-[-12rem] h-[34rem] w-[34rem] rounded-full bg-violet-600/20 blur-3xl" />
      </section>
      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-9">
            <p className="text-sm font-medium text-[var(--brand)]">
              {mode === "setup" ? "Workspace setup" : "Welcome back"}
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">
              {mode === "setup"
                ? "Create your agency workspace"
                : "Sign in to HindsightOps"}
            </h2>
            <p className="mt-3 text-base leading-6 text-[var(--muted)]">
              {mode === "setup"
                ? "The first account becomes the workspace owner."
                : "Use the account created for this private workspace."}
            </p>
          </div>
          <form onSubmit={submit} className="space-y-5">
            {mode === "setup" && (
              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  label="Your name"
                  name="display_name"
                  autoComplete="name"
                  placeholder="Aarav Rao"
                />
                <Field
                  label="Agency name"
                  name="organization_name"
                  autoComplete="organization"
                  placeholder="Northstar Studio"
                />
              </div>
            )}
            <Field
              label="Work email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@agency.com"
            />
            <Field
              label="Password"
              name="password"
              type="password"
              autoComplete={
                mode === "setup" ? "new-password" : "current-password"
              }
              placeholder="At least 12 characters"
              minLength={12}
            />
            {error && (
              <p
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
              >
                {error}
              </p>
            )}
            <button
              disabled={busy}
              className="flex h-12 w-full items-center justify-center rounded-xl bg-[var(--brand)] px-5 text-base font-semibold text-white shadow-[0_12px_28px_rgba(102,87,232,.25)] transition hover:bg-[var(--brand-strong)] disabled:cursor-wait disabled:opacity-60"
            >
              {busy
                ? "Please wait…"
                : mode === "setup"
                  ? "Create workspace"
                  : "Sign in"}
            </button>
          </form>
          <p className="mt-6 text-center text-xs leading-5 text-[var(--muted)]">
            Authentication data stays separate from agency memory. Passwords and
            secrets are never sent to Hindsight.
          </p>
        </div>
      </section>
    </main>
  );
}

type WorkspaceView =
  "chat" | "overview" | "people" | "projects" | "contracts" | "knowledge";

const viewLabels: Record<WorkspaceView, string> = {
  chat: "M1887",
  overview: "Overview",
  people: "People & clients",
  projects: "Projects",
  contracts: "Contracts",
  knowledge: "Knowledge",
};

const viewCards: Record<
  Exclude<WorkspaceView, "chat">,
  Array<{ title: string; description: string; prompt: string }>
> = {
  overview: [
    {
      title: "Agency snapshot",
      description: "Summarize the people, clients, and active work in memory.",
      prompt:
        "Give me a concise overview of everything currently known about this agency.",
    },
    {
      title: "Open priorities",
      description:
        "Surface deadlines, renewals, risks, and decisions needing attention.",
      prompt:
        "What agency priorities, deadlines, renewals, or risks need attention?",
    },
    {
      title: "Recent context",
      description: "Review the most useful facts added to agency memory.",
      prompt: "Summarize the most recently mentioned agency information.",
    },
  ],
  people: [
    {
      title: "Team directory",
      description: "List remembered team members, roles, and contact details.",
      prompt:
        "List all known team members with their roles and contact details.",
    },
    {
      title: "Client ownership",
      description: "See who owns each client relationship.",
      prompt: "Map every known client to its relationship owner or manager.",
    },
    {
      title: "Experience finder",
      description:
        "Find people with relevant skills or previous client experience.",
      prompt: "Summarize the skills and experience of every known team member.",
    },
  ],
  projects: [
    {
      title: "Active projects",
      description: "Review known projects, owners, status, and next steps.",
      prompt:
        "List all known projects with their owner, status, and next step.",
    },
    {
      title: "Delivery risks",
      description: "Find delays, blockers, and unresolved project decisions.",
      prompt:
        "Which projects have delivery risks, blockers, or missing information?",
    },
    {
      title: "Similar work",
      description: "Find relevant past work and reusable experience.",
      prompt: "Find similar past projects and explain what can be reused.",
    },
  ],
  contracts: [
    {
      title: "Renewals",
      description: "Find upcoming renewal dates and required action.",
      prompt: "List upcoming contract renewals and the action needed for each.",
    },
    {
      title: "Commercial terms",
      description:
        "Summarize known contract values, billing, and engagement models.",
      prompt: "Summarize all known contract and billing terms.",
    },
    {
      title: "Missing details",
      description:
        "Identify contracts with incomplete dates, owners, or terms.",
      prompt: "Which contracts have missing or unclear information?",
    },
  ],
  knowledge: [
    {
      title: "What M1887 knows",
      description: "Get an organized index of the agency memory.",
      prompt:
        "Organize everything you know into people, clients, projects, contracts, and decisions.",
    },
    {
      title: "Decisions",
      description: "Review remembered decisions and their rationale.",
      prompt:
        "List the decisions in agency memory and explain their rationale.",
    },
    {
      title: "Add information",
      description: "Open chat with a structured template for saving new facts.",
      prompt: "Remember:\nCategory: \nName: \nDetails: ",
    },
  ],
};

function NavItem({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: string;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? "bg-violet-500/15 font-medium text-violet-200" : "text-slate-400 hover:bg-white/[.05] hover:text-slate-200"}`}
    >
      <Icon name={icon} className="h-[18px] w-[18px]" /> {label}
    </button>
  );
}

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="markdown-answer">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

function WorkspaceSection({
  view,
  onAsk,
}: {
  view: Exclude<WorkspaceView, "chat">;
  onAsk: (prompt: string) => void;
}) {
  const descriptions: Record<Exclude<WorkspaceView, "chat">, string> = {
    overview:
      "A quick route into the operational context stored in agency memory.",
    people:
      "Explore team members, freelancers, clients, roles, and relationship ownership.",
    projects:
      "Review delivery context, project ownership, progress, blockers, and reusable work.",
    contracts:
      "Inspect renewals, commercial terms, dates, and gaps in contract memory.",
    knowledge:
      "Browse and extend the facts, decisions, and organizational context M1887 can recall.",
  };

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8 sm:py-10">
      <div className="max-w-2xl">
        <p className="text-sm font-medium text-[var(--brand)]">
          Agency workspace
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
          {viewLabels[view]}
        </h2>
        <p className="mt-3 text-base leading-7 text-[var(--muted)]">
          {descriptions[view]}
        </p>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {viewCards[view].map((card) => (
          <article
            key={card.title}
            className="flex min-h-52 flex-col rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm"
          >
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-100 text-[var(--brand)] dark:bg-violet-500/15">
              <Icon
                name={
                  view === "people"
                    ? "people"
                    : view === "projects"
                      ? "folder"
                      : view === "contracts"
                        ? "file"
                        : view === "knowledge"
                          ? "brain"
                          : "grid"
                }
                className="h-5 w-5"
              />
            </div>
            <h3 className="mt-5 text-base font-semibold">{card.title}</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              {card.description}
            </p>
            <button
              type="button"
              onClick={() => onAsk(card.prompt)}
              className="mt-auto flex items-center gap-2 pt-5 text-sm font-semibold text-[var(--brand)] hover:text-[var(--brand-strong)]"
            >
              Ask M1887 <span aria-hidden="true">→</span>
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function Workspace({
  user,
  csrf,
  onLogout,
  onAgencyChanged,
  onAccountDeleted,
}: {
  user: User;
  csrf: string;
  onLogout: () => void;
  onAgencyChanged: (user: User, csrf: string) => void;
  onAccountDeleted: (bootstrapRequired: boolean) => void;
}) {
  const [activeView, setActiveView] = useState<WorkspaceView>("chat");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [memoryOnline, setMemoryOnline] = useState(true);
  const [agencyPanelOpen, setAgencyPanelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agencies, setAgencies] = useState<AgencyMembership[]>([]);
  const [agencyName, setAgencyName] = useState("");
  const [agencyBusy, setAgencyBusy] = useState(false);
  const [agencyError, setAgencyError] = useState("");
  const [deleteAgencyOpen, setDeleteAgencyOpen] = useState(false);
  const [deleteAgencyConfirmation, setDeleteAgencyConfirmation] = useState("");
  const [conversationId, setConversationId] = useState(() =>
    crypto.randomUUID(),
  );
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("freelens-theme");
    const initial = saved === "dark" ? "dark" : "light";
    const frame = requestAnimationFrame(() => {
      setTheme(initial);
      document.documentElement.classList.toggle("dark", initial === "dark");
    });
    fetch(`${API_URL}/health`)
      .then((res) => res.json())
      .then((data) => setMemoryOnline(Boolean(data.hindsight)))
      .catch(() => setMemoryOnline(false));
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/auth/agencies`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load agencies");
        return (await response.json()) as AgencyMembership[];
      })
      .then((data) => {
        if (!cancelled) setAgencies(data);
      })
      .catch(() => {
        if (!cancelled) setAgencyError("Unable to load your agencies");
      });
    return () => {
      cancelled = true;
    };
  }, [user.organization_id]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("freelens-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  }
  function selectView(view: WorkspaceView) {
    setActiveView(view);
    setSidebarOpen(false);
  }
  function newConversation() {
    setMessages([]);
    setConversationId(crypto.randomUUID());
    setError("");
    selectView("chat");
  }
  function askFromSection(prompt: string) {
    setMessage(prompt);
    setError("");
    selectView("chat");
  }

  function resetForAgency() {
    setMessages([]);
    setMessage("");
    setConversationId(crypto.randomUUID());
    setError("");
    setAgencyPanelOpen(false);
    selectView("chat");
  }

  async function createAgency(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = agencyName.trim();
    if (!name || agencyBusy) return;
    setAgencyBusy(true);
    setAgencyError("");
    try {
      const response = await fetch(`${API_URL}/auth/agencies`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf || readCookie("freelens_csrf"),
        },
        body: JSON.stringify({ name }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.detail ?? "Unable to create agency");
      setAgencyName("");
      onAgencyChanged(data.user, data.csrf_token);
      resetForAgency();
    } catch (reason) {
      setAgencyError(
        reason instanceof Error ? reason.message : "Unable to create agency",
      );
    } finally {
      setAgencyBusy(false);
    }
  }

  async function switchAgency(organizationId: string) {
    if (organizationId === user.organization_id || agencyBusy) {
      setAgencyPanelOpen(false);
      return;
    }
    setAgencyBusy(true);
    setAgencyError("");
    try {
      const response = await fetch(
        `${API_URL}/auth/agencies/${organizationId}/switch`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "X-CSRF-Token": csrf || readCookie("freelens_csrf"),
          },
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.detail ?? "Unable to switch agency");
      onAgencyChanged(data.user, data.csrf_token);
      resetForAgency();
    } catch (reason) {
      setAgencyError(
        reason instanceof Error ? reason.message : "Unable to switch agency",
      );
    } finally {
      setAgencyBusy(false);
    }
  }

  async function deleteCurrentAgency(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (deleteAgencyConfirmation !== user.organization_name || agencyBusy)
      return;
    setAgencyBusy(true);
    setAgencyError("");
    try {
      const response = await fetch(
        `${API_URL}/auth/agencies/${user.organization_id}`,
        {
          method: "DELETE",
          credentials: "include",
          headers: {
            "X-CSRF-Token": csrf || readCookie("freelens_csrf"),
          },
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.detail ?? "Unable to delete agency");
      setDeleteAgencyConfirmation("");
      setDeleteAgencyOpen(false);
      setSettingsOpen(false);
      if (data.auth) {
        onAgencyChanged(data.auth.user, data.auth.csrf_token);
        resetForAgency();
      } else {
        onAccountDeleted(Boolean(data.bootstrap_required));
      }
    } catch (reason) {
      setAgencyError(
        reason instanceof Error ? reason.message : "Unable to delete agency",
      );
    } finally {
      setAgencyBusy(false);
    }
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const content = message.trim();
    if (!content || busy) return;
    setMessage("");
    setError("");
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content },
    ]);
    setBusy(true);
    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf || readCookie("freelens_csrf"),
        },
        body: JSON.stringify({
          message: content,
          conversation_id: conversationId,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.detail ?? "HindsightOps could not answer");
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.answer,
          remembered: data.remembered,
        },
      ]);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "HindsightOps could not answer",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {sidebarOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {agencyPanelOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4">
          <button
            type="button"
            aria-label="Close agency panel"
            className="absolute inset-0"
            onClick={() => setAgencyPanelOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="agency-panel-title"
            className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="agency-panel-title" className="text-xl font-semibold">
                  Agencies
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Switch workspace or create a separate agency.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAgencyPanelOpen(false)}
                className="rounded-lg px-2 py-1 text-xl text-[var(--muted)] hover:bg-[var(--panel-muted)]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-5 space-y-2">
              {agencies.map((agency) => (
                <button
                  type="button"
                  key={agency.id}
                  disabled={agencyBusy}
                  onClick={() => void switchAgency(agency.id)}
                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${agency.id === user.organization_id ? "border-violet-400 bg-violet-50 dark:bg-violet-500/10" : "border-[var(--line)] hover:bg-[var(--panel-muted)]"}`}
                >
                  <span>
                    <span className="block text-sm font-semibold">
                      {agency.name}
                    </span>
                    <span className="block text-xs capitalize text-[var(--muted)]">
                      {agency.role.replace("_", " ")}
                    </span>
                  </span>
                  {agency.id === user.organization_id && (
                    <span className="text-xs font-medium text-[var(--brand)]">
                      Current
                    </span>
                  )}
                </button>
              ))}
            </div>
            <form
              onSubmit={createAgency}
              className="mt-6 border-t border-[var(--line)] pt-5"
            >
              <label className="text-sm font-medium" htmlFor="agency-name">
                New agency name
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="agency-name"
                  required
                  minLength={2}
                  maxLength={160}
                  value={agencyName}
                  onChange={(event) => setAgencyName(event.target.value)}
                  placeholder="Acme Studio"
                  className="h-11 min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 outline-none focus:border-[var(--brand)]"
                />
                <button
                  disabled={agencyBusy || agencyName.trim().length < 2}
                  className="rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {agencyBusy ? "Creating…" : "Create"}
                </button>
              </div>
              {agencyError && (
                <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                  {agencyError}
                </p>
              )}
            </form>
          </section>
        </div>
      )}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4">
          <button
            type="button"
            aria-label="Close settings"
            className="absolute inset-0"
            onClick={() => setSettingsOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="settings-title" className="text-xl font-semibold">
                  Settings
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {user.organization_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="rounded-lg px-2 py-1 text-xl text-[var(--muted)] hover:bg-[var(--panel-muted)]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/60 dark:bg-red-950/20">
              <h3 className="font-semibold text-red-700 dark:text-red-400">
                Danger zone
              </h3>
              {!deleteAgencyOpen ? (
                <div className="mt-2 flex items-center justify-between gap-4">
                  <p className="text-sm text-red-700/80 dark:text-red-300/80">
                    Permanently delete this agency and its memories.
                  </p>
                  <button
                    type="button"
                    disabled={user.role !== "owner"}
                    onClick={() => {
                      setAgencyError("");
                      setDeleteAgencyOpen(true);
                    }}
                    className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                  >
                    Delete agency
                  </button>
                </div>
              ) : (
                <form onSubmit={deleteCurrentAgency} className="mt-3">
                  <p className="text-sm leading-6 text-red-800 dark:text-red-200">
                    Type <strong>{user.organization_name}</strong> to confirm.
                    If this is your only agency, your account is also removed.
                  </p>
                  <input
                    autoFocus
                    value={deleteAgencyConfirmation}
                    onChange={(event) =>
                      setDeleteAgencyConfirmation(event.target.value)
                    }
                    className="mt-3 h-11 w-full rounded-xl border border-red-300 bg-[var(--panel)] px-3 outline-none focus:border-red-500 dark:border-red-800"
                    aria-label="Agency name confirmation"
                  />
                  {agencyError && (
                    <p className="mt-2 text-sm text-red-700 dark:text-red-300">
                      {agencyError}
                    </p>
                  )}
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteAgencyOpen(false);
                        setDeleteAgencyConfirmation("");
                      }}
                      className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-sm font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={
                        agencyBusy ||
                        deleteAgencyConfirmation !== user.organization_name
                      }
                      className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      {agencyBusy ? "Deleting…" : "Delete permanently"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </section>
        </div>
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col overflow-y-auto bg-[#121827] p-5 text-slate-300 transition-transform lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <Brand />
        <button
          onClick={newConversation}
          className="mt-8 flex h-11 items-center justify-center gap-2 rounded-xl bg-white/[.08] px-4 text-sm font-medium text-white transition hover:bg-white/[.13]"
        >
          <Icon name="plus" className="h-4 w-4" /> New conversation
        </button>
        <button
          type="button"
          onClick={() => {
            setAgencyError("");
            setAgencyPanelOpen(true);
          }}
          className="mt-2 flex h-10 items-center justify-center gap-2 rounded-xl border border-white/[.09] px-4 text-sm text-slate-300 transition hover:bg-white/[.06] hover:text-white"
        >
          <Icon name="plus" className="h-4 w-4" /> Create / switch agency
        </button>
        <nav aria-label="Main navigation" className="mt-7 space-y-1">
          <NavItem
            icon="chat"
            label="M1887"
            active={activeView === "chat"}
            onClick={() => selectView("chat")}
          />
          <NavItem
            icon="grid"
            label="Overview"
            active={activeView === "overview"}
            onClick={() => selectView("overview")}
          />
          <NavItem
            icon="people"
            label="People & clients"
            active={activeView === "people"}
            onClick={() => selectView("people")}
          />
          <NavItem
            icon="folder"
            label="Projects"
            active={activeView === "projects"}
            onClick={() => selectView("projects")}
          />
          <NavItem
            icon="file"
            label="Contracts"
            active={activeView === "contracts"}
            onClick={() => selectView("contracts")}
          />
          <NavItem
            icon="brain"
            label="Knowledge"
            active={activeView === "knowledge"}
            onClick={() => selectView("knowledge")}
          />
        </nav>
        <div className="mt-auto rounded-2xl border border-white/[.08] bg-white/[.04] p-4">
          <p className="text-xs font-medium uppercase tracking-[.14em] text-slate-500">
            Memory service
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm text-slate-200">
            <span
              className={`h-2 w-2 rounded-full ${memoryOnline ? "bg-emerald-400" : "bg-amber-400"}`}
            />{" "}
            {memoryOnline ? "Connected" : "Needs attention"}
          </p>
        </div>
      </aside>
      <main className="min-w-0 lg:ml-[248px]">
        <header className="sticky top-0 z-20 flex h-18 items-center justify-between border-b border-[var(--line)] bg-[var(--panel)]/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
              className="rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--panel-muted)] lg:hidden"
            >
              <Icon name="menu" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold sm:text-lg">
                {viewLabels[activeView]}
              </h1>
              <p className="truncate text-xs text-[var(--muted)]">
                {user.organization_name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setAgencyError("");
                setDeleteAgencyOpen(false);
                setDeleteAgencyConfirmation("");
                setSettingsOpen(true);
              }}
              aria-label="Settings"
              title="Settings"
              className="rounded-xl border border-[var(--line)] p-2.5 text-[var(--muted)] transition hover:bg-[var(--panel-muted)]"
            >
              <Icon name="settings" className="h-4 w-4" />
            </button>
            <button
              onClick={toggleTheme}
              aria-label={`Use ${theme === "light" ? "dark" : "light"} theme`}
              className="rounded-xl border border-[var(--line)] p-2.5 text-[var(--muted)] transition hover:bg-[var(--panel-muted)]"
            >
              <Icon
                name={theme === "light" ? "moon" : "sun"}
                className="h-4 w-4"
              />
            </button>
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium">{user.display_name}</p>
              <p className="text-xs capitalize text-[var(--muted)]">
                {user.role.replace("_", " ")}
              </p>
            </div>
            <button
              onClick={onLogout}
              aria-label="Sign out"
              className="rounded-xl p-2.5 text-[var(--muted)] transition hover:bg-[var(--panel-muted)]"
            >
              <Icon name="logout" className="h-4 w-4" />
            </button>
          </div>
        </header>
        <div className="min-h-[calc(100vh-4.5rem)]">
          {activeView === "chat" ? (
            <section className="flex min-h-[calc(100vh-4.5rem)] min-w-0 flex-col">
              <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-6 sm:px-8 sm:py-8">
                {messages.length === 0 ? (
                  <div className="m-auto w-full max-w-2xl py-10 text-center">
                    <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-100 text-[var(--brand)] dark:bg-violet-500/15">
                      <Icon name="spark" className="h-7 w-7" />
                    </div>
                    <h2 className="mt-5 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
                      What can I help you remember?
                    </h2>
                    <p className="mx-auto mt-3 max-w-lg text-base leading-7 text-[var(--muted)]">
                      Ask about your agency&apos;s people, clients, contracts,
                      projects, or past decisions.
                    </p>
                    <div className="mt-8 grid gap-3 sm:grid-cols-3">
                      {prompts.map((prompt) => (
                        <button
                          key={prompt}
                          onClick={() => setMessage(prompt)}
                          className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 text-left text-sm leading-5 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md dark:hover:border-violet-700"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6 pb-7">
                    {messages.map((item) => (
                      <article
                        key={item.id}
                        className={`flex gap-3 ${item.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        {item.role === "assistant" && (
                          <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-violet-100 text-[var(--brand)] dark:bg-violet-500/15">
                            <Icon name="brain" className="h-4 w-4" />
                          </div>
                        )}
                        <div
                          className={`max-w-[85%] rounded-2xl px-4 py-3 text-[0.95rem] leading-7 sm:max-w-[76%] ${item.role === "user" ? "rounded-br-md bg-[var(--brand)] text-white" : "rounded-bl-md border border-[var(--line)] bg-[var(--panel)] shadow-sm"}`}
                        >
                          {item.role === "assistant" ? (
                            <MarkdownMessage content={item.content} />
                          ) : (
                            <p className="whitespace-pre-wrap">
                              {item.content}
                            </p>
                          )}
                          {item.role === "assistant" && item.remembered && (
                            <p className="mt-3 border-t border-[var(--line)] pt-2 text-xs text-[var(--muted)]">
                              Saved to agency memory
                            </p>
                          )}
                        </div>
                      </article>
                    ))}
                    {busy && (
                      <div className="flex items-center gap-3">
                        <div className="grid h-8 w-8 place-items-center rounded-xl bg-violet-100 text-[var(--brand)] dark:bg-violet-500/15">
                          <Icon name="brain" className="h-4 w-4" />
                        </div>
                        <div className="flex gap-1 rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-4">
                          <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--muted)]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--muted)] [animation-delay:120ms]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--muted)] [animation-delay:240ms]" />
                        </div>
                      </div>
                    )}
                    <div ref={endRef} />
                  </div>
                )}
                <div className="sticky bottom-0 mt-auto bg-gradient-to-t from-[var(--background)] via-[var(--background)] to-transparent pt-5">
                  {error && (
                    <p
                      role="alert"
                      className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
                    >
                      {error}
                    </p>
                  )}
                  <form
                    onSubmit={send}
                    className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-2 shadow-[0_12px_35px_rgba(29,38,60,.10)] focus-within:border-violet-400"
                  >
                    <textarea
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void send();
                        }
                      }}
                      rows={2}
                      placeholder="Ask about a client, freelancer, project, contract, or decision…"
                      className="max-h-40 min-h-14 w-full resize-none bg-transparent px-3 py-2 text-base leading-6 outline-none placeholder:text-slate-400"
                    />
                    <div className="flex items-center justify-between gap-3 px-2 pb-1">
                      <p className="text-xs text-[var(--muted)]">
                        Enter to send · Shift + Enter for a new line
                      </p>
                      <button
                        disabled={!message.trim() || busy}
                        aria-label="Send message"
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--brand)] text-white transition hover:bg-[var(--brand-strong)] disabled:opacity-40"
                      >
                        <Icon name="send" className="h-4 w-4" />
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </section>
          ) : (
            <WorkspaceSection view={activeView} onAsk={askFromSection} />
          )}
        </div>
      </main>
    </div>
  );
}

export function FreelensApp() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [csrf, setCsrf] = useState("");
  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const meResponse = await fetch(`${API_URL}/auth/me`, {
          credentials: "include",
        });
        if (cancelled) return;
        if (meResponse.ok) {
          setUser(await meResponse.json());
          if (cancelled) return;
          setCsrf(readCookie("freelens_csrf"));
          setScreen("workspace");
          return;
        }

        const setupResponse = await fetch(`${API_URL}/auth/setup-status`, {
          credentials: "include",
        });
        const setup = await setupResponse.json();
        if (!cancelled) setScreen(setup.bootstrap_required ? "setup" : "login");
      } catch {
        if (!cancelled) setScreen("login");
      }
    }

    void initialize();
    return () => {
      cancelled = true;
    };
  }, []);
  async function logout() {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrf || readCookie("freelens_csrf") },
      });
    } finally {
      setUser(null);
      setCsrf("");
      setScreen("login");
    }
  }
  if (screen === "loading")
    return (
      <div className="grid min-h-screen place-items-center bg-[#111827] text-white">
        <div className="text-center">
          <Brand />
          <p className="mt-5 text-sm text-slate-400">Opening your workspace…</p>
        </div>
      </div>
    );
  if (screen === "setup" || screen === "login")
    return (
      <AuthScreen
        mode={screen}
        onAuthenticated={(nextUser, nextCsrf) => {
          setUser(nextUser);
          setCsrf(nextCsrf);
          setScreen("workspace");
        }}
      />
    );
  return user ? (
    <Workspace
      user={user}
      csrf={csrf}
      onLogout={logout}
      onAgencyChanged={(nextUser, nextCsrf) => {
        setUser(nextUser);
        setCsrf(nextCsrf);
      }}
      onAccountDeleted={(bootstrapRequired) => {
        setUser(null);
        setCsrf("");
        setScreen(bootstrapRequired ? "setup" : "login");
      }}
    />
  ) : null;
}
