import { useEffect, useMemo, useState } from "react";
import {
  addNote,
  editNote,
  getBalance,
  getFeed,
  getMyTips,
  listNotes,
  removeNote,
  tip,
  togglePin,
  toggleShare,
} from "./thebes";
import type { FeedNote, TipRecord } from "./thebes";
import { useMemphisConnect } from "./lib/useMemphisConnect";
import type { MemphisConnectAuth } from "./lib/useMemphisConnect";

type Note = {
  id: bigint;
  title: string;
  body: string;
  category: string;
  pinned: boolean;
  isShared: boolean;
  color: string;
  createdAt: bigint;
  updatedAt: bigint;
};

const NOTE_COLORS = [
  "#F7F3E8",
  "#EAF2FF",
  "#EEF8EE",
  "#FFF0F0",
  "#F4ECFF",
  "#FFF7DD",
];

const CATEGORIES = [
  "Personal",
  "Work",
  "Study",
  "Ideas",
];

function formatDate(timestamp: bigint): string {
  try {
    const date = new Date(Number(timestamp / 1_000_000n));

    return date.toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "";
  }
}

// Task 2: Memphis passkey authentication via memphis-connect (origin-scoped
// token). The app is served from its own origin, so the ceremony runs in a
// window at the Memphis origin and hands back a token minted for THIS origin.
export default function App() {
  const auth = useMemphisConnect("my-dapp"); // stable app name — do not change after deploy

  if (!auth.signedIn || !auth.token) {
    return <ConnectGate auth={auth} />;
  }

  return (
    <>
      <ConnectGate auth={auth} />
      <NotesApp tokenHex={auth.token} />
    </>
  );
}

function ConnectGate({ auth }: { auth: MemphisConnectAuth }) {
  return (
    <div className="memphis-gate">
      {auth.signedIn ? (
        <span>
          Signed in as {auth.displayName}
          <button type="button" onClick={auth.signOut}>
            Sign out
          </button>
        </span>
      ) : (
        <button
          type="button"
          disabled={auth.busy}
          onClick={() => {
            auth.signIn({ mode: "auto" }).catch(() => {});
          }}
        >
          {auth.busy ? "Signing in…" : "Sign in"}
        </button>
      )}
      {auth.error && <p className="error">{auth.error}</p>}
    </div>
  );
}

function NotesApp({ tokenHex }: { tokenHex: string }) {
  const [notes, setNotes] = useState<Note[]>([]);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("Personal");
  const [color, setColor] = useState(NOTE_COLORS[0]);

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const [editingId, setEditingId] =
    useState<bigint | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [deleteId, setDeleteId] =
    useState<bigint | null>(null);

  const [darkMode, setDarkMode] = useState(false);

  const [view, setView] = useState<"mine" | "feed" | "history">("mine");
  const [feedNotes, setFeedNotes] = useState<FeedNote[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [tipAmounts, setTipAmounts] = useState<Record<string, string>>({});
  const [tipBusyId, setTipBusyId] = useState<bigint | null>(null);

  const [history, setHistory] = useState<TipRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const [balance, setBalance] = useState<bigint | null>(null);

  async function loadBalance() {
    try {
      const result = await getBalance(tokenHex);

      setBalance(result);
    } catch (e) {
      // Non-fatal — the points pill just stays hidden if this fails.
      console.error(e);
    }
  }

  async function loadFeed() {
    try {
      setFeedError("");
      setFeedLoading(true);

      const result = await getFeed(tokenHex);

      setFeedNotes(result);
    } catch (e) {
      setFeedError(String(e));
    } finally {
      setFeedLoading(false);
    }
  }

  async function loadHistory() {
    try {
      setHistoryError("");
      setHistoryLoading(true);

      const result = await getMyTips(tokenHex);

      setHistory(result);
    } catch (e) {
      setHistoryError(String(e));
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleTip(noteId: bigint) {
    const raw = tipAmounts[noteId.toString()] ?? "";
    const parsed = Number(raw);

    if (!raw.trim() || !Number.isInteger(parsed) || parsed <= 0) {
      setFeedError("Enter a whole number of points greater than 0.");
      return;
    }

    try {
      setTipBusyId(noteId);
      setFeedError("");

      await tip(tokenHex, noteId, BigInt(parsed));

      setTipAmounts((prev) => ({ ...prev, [noteId.toString()]: "" }));

      await Promise.all([loadFeed(), loadBalance()]);
    } catch (e) {
      setFeedError(String(e));
    } finally {
      setTipBusyId(null);
    }
  }

  async function loadNotes() {
    try {
      setError("");

      const result = await listNotes(tokenHex);

      setNotes(result);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    void loadNotes();
    void loadBalance();
    // Reload whenever the signed-in identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenHex]);

  useEffect(() => {
    if (view === "feed") {
      void loadFeed();
    }

    if (view === "history") {
      void loadHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, tokenHex]);

  useEffect(() => {
    document.documentElement.dataset.theme =
      darkMode ? "dark" : "light";
  }, [darkMode]);

  const categories = useMemo(() => {
    const existing = notes
      .map((note) => note.category)
      .filter(Boolean);

    return [
      "All",
      ...Array.from(new Set([...CATEGORIES, ...existing])),
    ];
  }, [notes]);

  const filteredNotes = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = notes.filter((note) => {
      const matchesSearch =
        !query ||
        note.title.toLowerCase().includes(query) ||
        note.body.toLowerCase().includes(query) ||
        note.category.toLowerCase().includes(query);

      const matchesCategory =
        selectedCategory === "All" ||
        note.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });

    return [...filtered].sort((a, b) => {
      if (a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1;
      }

      return Number(b.updatedAt - a.updatedAt);
    });
  }, [notes, search, selectedCategory]);

  function clearForm() {
    setTitle("");
    setBody("");
    setCategory("Personal");
    setColor(NOTE_COLORS[0]);
    setEditingId(null);
  }

  async function handleSubmit(
    e: React.FormEvent
  ) {
    e.preventDefault();

    if (!title.trim() || !body.trim()) {
      setError(
        "Please enter a title and body."
      );
      return;
    }

    try {
      setLoading(true);
      setError("");

      if (editingId !== null) {
        await editNote(
          tokenHex,
          editingId,
          title.trim(),
          body.trim(),
          category,
          color
        );
      } else {
        await addNote(
          tokenHex,
          title.trim(),
          body.trim(),
          category,
          color
        );
      }

      clearForm();

      await loadNotes();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function startEdit(note: Note) {
    setEditingId(note.id);
    setTitle(note.title);
    setBody(note.body);
    setCategory(note.category);
    setColor(note.color);
    setError("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function handlePin(id: bigint) {
    try {
      setLoading(true);
      setError("");

      await togglePin(tokenHex, id);

      await loadNotes();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleShare(id: bigint) {
    try {
      setLoading(true);
      setError("");

      await toggleShare(tokenHex, id);

      await loadNotes();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function confirmDelete() {
    if (deleteId === null) {
      return;
    }

    try {
      setLoading(true);
      setError("");

      await removeNote(tokenHex, deleteId);

      setDeleteId(null);

      await loadNotes();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="notes-page">

      {/* ───────────────── Header ───────────────── */}

      <header className="notes-header">

        <div>
          <p className="eyebrow">
            MY-DAPP
          </p>

          <h1>
            Your ideas.
            <br />
            Your space.
          </h1>

          <p>
            Capture, organize and manage
            your thoughts.
          </p>
        </div>

        <div className="header-actions">

          <button
            className="theme-toggle"
            type="button"
            onClick={() =>
              setDarkMode((value) => !value)
            }
            aria-label="Toggle dark mode"
          >
            {darkMode ? "☀" : "☾"}
          </button>

          <div className="note-count">
            {notes.length}
            <span>
              {notes.length === 1
                ? " note"
                : " notes"}
            </span>
          </div>

          {balance !== null && (
            <div className="note-count points-pill">
              {balance.toString()}
              <span> points</span>
            </div>
          )}

        </div>

      </header>

      {/* ───────────────── View tabs ───────────────── */}

      <div className="view-tabs">

        <button
          type="button"
          className={view === "mine" ? "active" : ""}
          onClick={() => setView("mine")}
        >
          My Notes
        </button>

        <button
          type="button"
          className={view === "feed" ? "active" : ""}
          onClick={() => setView("feed")}
        >
          Feed
        </button>

        <button
          type="button"
          className={view === "history" ? "active" : ""}
          onClick={() => setView("history")}
        >
          History
        </button>

      </div>

      {view === "feed" ? (

        <FeedSection
          notes={feedNotes}
          loading={feedLoading}
          error={feedError}
          tipAmounts={tipAmounts}
          onTipAmountChange={(id, value) =>
            setTipAmounts((prev) => ({ ...prev, [id]: value }))
          }
          onTip={handleTip}
          tipBusyId={tipBusyId}
        />

      ) : view === "history" ? (

        <HistorySection
          tips={history}
          loading={historyLoading}
          error={historyError}
        />

      ) : (

      <>

      {/* ───────────────── Create / Edit ───────────────── */}

      <section className="note-form-card">

        <div className="form-heading">

          <div>
            <p className="form-label">
              {editingId !== null
                ? "EDITING"
                : "NEW NOTE"}
            </p>

            <h2>
              {editingId !== null
                ? "Update your note"
                : "Create something new"}
            </h2>
          </div>

          {editingId !== null && (
            <button
              type="button"
              className="secondary-button"
              onClick={clearForm}
            >
              Cancel
            </button>
          )}

        </div>

        <form onSubmit={handleSubmit}>

          <label>
            Title

            <input
              value={title}
              onChange={(e) =>
                setTitle(e.target.value)
              }
              placeholder="Give your note a title..."
            />
          </label>

          <label>
            Note

            <textarea
              value={body}
              onChange={(e) =>
                setBody(e.target.value)
              }
              placeholder="Start writing..."
              rows={6}
            />
          </label>

          <div className="note-options">

            <label>
              Category

              <select
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value)
                }
              >
                {categories
                  .filter(
                    (item) => item !== "All"
                  )
                  .map((item) => (
                    <option
                      key={item}
                      value={item}
                    >
                      {item}
                    </option>
                  ))}
              </select>
            </label>

            <div className="color-picker">

              <span>Color</span>

              <div className="color-options">

                {NOTE_COLORS.map(
                  (noteColor) => (
                    <button
                      key={noteColor}
                      type="button"
                      className={`color-dot ${
                        color === noteColor
                          ? "selected"
                          : ""
                      }`}
                      style={{
                        backgroundColor:
                          noteColor,
                      }}
                      onClick={() =>
                        setColor(noteColor)
                      }
                      aria-label={`Choose ${noteColor}`}
                    />
                  )
                )}

              </div>

            </div>

          </div>

          <div className="form-actions">

            <button
              type="submit"
              disabled={loading}
            >
              {loading
                ? "Saving..."
                : editingId !== null
                ? "Save Changes"
                : "Create Note"}
            </button>

          </div>

        </form>

      </section>

      {/* ───────────────── Error ───────────────── */}

      {error && (
        <div className="error">
          {error}
        </div>
      )}

      {/* ───────────────── Notes ───────────────── */}

      <section className="notes-section">

        <div className="section-title">

          <div>
            <p className="section-eyebrow">
              COLLECTION
            </p>

            <h2>Your Notes</h2>
          </div>

          <div className="note-stats">
            {notes.filter(
              (note) => note.pinned
            ).length}{" "}
            pinned
          </div>

        </div>

        {/* Search */}

        <div className="notes-toolbar">

          <div className="search-box">

            <span>⌕</span>

            <input
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              placeholder="Search notes..."
            />

            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
              >
                ×
              </button>
            )}

          </div>

          <div className="category-filter">

            {categories.map(
              (item) => (
                <button
                  key={item}
                  type="button"
                  className={
                    selectedCategory === item
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    setSelectedCategory(item)
                  }
                >
                  {item}
                </button>
              )
            )}

          </div>

        </div>

        {/* Notes */}

        {filteredNotes.length === 0 ? (

          <div className="empty-state">

            <div className="empty-icon">
              {search
                ? "⌕"
                : "✦"}
            </div>

            <h3>
              {search
                ? "No matching notes"
                : "Your space is empty"}
            </h3>

            <p>
              {search
                ? "Try another search or category."
                : "Create your first note to get started."}
            </p>

          </div>

        ) : (

          <div className="notes-grid">

            {filteredNotes.map(
              (note) => (

                <article
                  className={`note-card ${
                    note.pinned
                      ? "is-pinned"
                      : ""
                  }`}
                  key={note.id.toString()}
                  style={{
                    backgroundColor:
                      note.color,
                  }}
                >

                  <div className="note-top">

                    <div className="note-category">
                      {note.category}
                      {note.isShared && (
                        <span className="shared-badge">
                          {" "}
                          · Shared
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      className={`pin-button ${
                        note.pinned
                          ? "pinned"
                          : ""
                      }`}
                      onClick={() =>
                        handlePin(note.id)
                      }
                      disabled={loading}
                      aria-label={
                        note.pinned
                          ? "Unpin note"
                          : "Pin note"
                      }
                    >
                      {note.pinned
                        ? "★"
                        : "☆"}
                    </button>

                  </div>

                  <h3>
                    {note.title}
                  </h3>

                  <p className="note-body">
                    {note.body}
                  </p>

                  <div className="note-meta">

                    <span>
                      {note.updatedAt !==
                      note.createdAt
                        ? "Updated "
                        : "Created "}
                      {formatDate(
                        note.updatedAt
                      )}
                    </span>

                  </div>

                  <div className="note-actions">

                    <button
                      type="button"
                      onClick={() =>
                        handleShare(note.id)
                      }
                      disabled={loading}
                    >
                      {note.isShared
                        ? "Unshare"
                        : "Share"}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        startEdit(note)
                      }
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      className="delete-button"
                      onClick={() =>
                        setDeleteId(note.id)
                      }
                      disabled={loading}
                    >
                      Delete
                    </button>

                  </div>

                </article>

              )
            )}

          </div>

        )}

      </section>

      </>

      )}

      {/* ───────────────── Delete Modal ───────────────── */}

      {deleteId !== null && (

        <div
          className="modal-overlay"
          onClick={() =>
            setDeleteId(null)
          }
        >

          <div
            className="delete-modal"
            onClick={(e) =>
              e.stopPropagation()
            }
          >

            <div className="delete-icon">
              !
            </div>

            <p className="form-label">
              DELETE NOTE
            </p>

            <h2>
              Are you sure?
            </h2>

            <p>
              This note will be permanently
              removed from your collection.
            </p>

            <div className="modal-actions">

              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setDeleteId(null)
                }
              >
                Keep Note
              </button>

              <button
                type="button"
                className="delete-confirm-button"
                onClick={confirmDelete}
                disabled={loading}
              >
                {loading
                  ? "Deleting..."
                  : "Delete Note"}
              </button>

            </div>

          </div>

        </div>

      )}

    </main>
  );
}

function FeedSection({
  notes,
  loading,
  error,
  tipAmounts,
  onTipAmountChange,
  onTip,
  tipBusyId,
}: {
  notes: FeedNote[];
  loading: boolean;
  error: string;
  tipAmounts: Record<string, string>;
  onTipAmountChange: (id: string, value: string) => void;
  onTip: (id: bigint) => void;
  tipBusyId: bigint | null;
}) {
  return (
    <section className="notes-section">

      <div className="section-title">

        <div>
          <p className="section-eyebrow">
            PUBLIC
          </p>

          <h2>Feed</h2>
        </div>

      </div>

      {error && (
        <div className="error">
          {error}
        </div>
      )}

      {loading ? (

        <p>Loading feed...</p>

      ) : notes.length === 0 ? (

        <div className="empty-state">

          <div className="empty-icon">✦</div>

          <h3>Nothing shared yet</h3>

          <p>
            When someone shares a note, it
            will show up here.
          </p>

        </div>

      ) : (

        <div className="notes-grid">

          {[...notes]
            .sort((a, b) =>
              Number(b.updatedAt - a.updatedAt)
            )
            .map((note) => (

              <article
                className="note-card"
                key={note.id.toString()}
                style={{
                  backgroundColor: note.color,
                }}
              >

                <div className="note-top">

                  <div className="note-category">
                    {note.category}
                  </div>

                </div>

                <h3>{note.title}</h3>

                <p className="note-body">
                  {note.body}
                </p>

                <div className="note-meta">
                  <span>{note.author}</span>
                </div>

                <div className="tip-form">

                  <input
                    type="number"
                    min={1}
                    step={1}
                    placeholder="Points"
                    value={
                      tipAmounts[note.id.toString()] ?? ""
                    }
                    onChange={(e) =>
                      onTipAmountChange(
                        note.id.toString(),
                        e.target.value
                      )
                    }
                    disabled={tipBusyId !== null}
                  />

                  <button
                    type="button"
                    onClick={() => onTip(note.id)}
                    disabled={tipBusyId !== null}
                  >
                    {tipBusyId === note.id
                      ? "Sending..."
                      : "Tip"}
                  </button>

                </div>

              </article>

            ))}

        </div>

      )}

    </section>
  );
}

function HistorySection({
  tips,
  loading,
  error,
}: {
  tips: TipRecord[];
  loading: boolean;
  error: string;
}) {
  return (
    <section className="notes-section">

      <div className="section-title">

        <div>
          <p className="section-eyebrow">
            ACTIVITY
          </p>

          <h2>History</h2>
        </div>

      </div>

      {error && (
        <div className="error">
          {error}
        </div>
      )}

      {loading ? (

        <p>Loading history...</p>

      ) : tips.length === 0 ? (

        <div className="empty-state">

          <div className="empty-icon">✦</div>

          <h3>No tips yet</h3>

          <p>
            Points you send or receive will
            show up here.
          </p>

        </div>

      ) : (

        <div className="history-list">

          {[...tips]
            .sort((a, b) =>
              Number(b.timestamp - a.timestamp)
            )
            .map((entry, index) => (

              <div
                className="history-row"
                key={index}
              >

                <span className="history-amount">
                  {entry.amount.toString()} pts
                </span>

                <span className="history-detail">
                  {entry.from} → {entry.to}
                  {" · note #"}
                  {entry.noteId.toString()}
                </span>

                <span className="history-date">
                  {formatDate(entry.timestamp)}
                </span>

              </div>

            ))}

        </div>

      )}

    </section>
  );
}