/**
 * JournalPanel — collapsible panel showing the query history.
 *
 * Features:
 *  - List of recent entries with timestamp, row count, and execution time
 *  - Click an entry to reload its SQL into the editor
 *  - Inline note editing per entry
 *  - Export-as-Markdown download
 *  - Clear with confirmation
 */

import { useState, useCallback } from 'preact/hooks';
import {
  getEntries,
  addNote,
  clearJournal,
  exportAsMarkdown,
  type JournalEntry,
} from '../db/journal';

interface JournalPanelProps {
  /** Called when the user clicks an entry to reload its SQL. */
  onLoadSQL: (sql: string) => void;
  /**
   * Increment this to force the panel to re-read localStorage after a new
   * entry has been written (signals don't cross module boundary here).
   */
  refreshToken: number;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EntryRow({
  entry,
  onLoadSQL,
  onNoteChange,
}: {
  entry: JournalEntry;
  onLoadSQL: (sql: string) => void;
  onNoteChange: (id: number, note: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.note ?? '');

  const commitNote = () => {
    setEditing(false);
    onNoteChange(entry.id, draft);
  };

  const preview = entry.sql.trim().replace(/\s+/g, ' ').slice(0, 80);
  const truncated = entry.sql.trim().length > 80;

  return (
    <div
      style={{
        borderBottom: '1px solid #1e293b',
        padding: '0.6rem 0.5rem',
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '0.25rem',
        }}
      >
        <span style={{ color: '#64748b', fontSize: '0.75rem', flexShrink: 0 }}>
          #{entry.id} {formatTimestamp(entry.timestamp)}
        </span>
        <span
          style={{
            color: '#94a3b8',
            fontSize: '0.75rem',
            flexShrink: 0,
          }}
        >
          {entry.rowCount} {entry.rowCount === 1 ? 'row' : 'rows'} ·{' '}
          {formatDuration(entry.executionTimeMs)}
        </span>
      </div>

      {/* SQL preview — click to reload */}
      <div
        onClick={() => onLoadSQL(entry.sql)}
        title="Click to reload this query"
        style={{
          fontFamily: 'monospace',
          fontSize: '0.78rem',
          color: '#7dd3fc',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          padding: '0.2rem 0.4rem',
          borderRadius: '0.25rem',
          background: '#0f172a',
          border: '1px solid #1e293b',
          marginBottom: '0.25rem',
        }}
      >
        {preview}
        {truncated && (
          <span style={{ color: '#475569' }}>…</span>
        )}
      </div>

      {/* Note */}
      {editing ? (
        <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.25rem' }}>
          <input
            autoFocus
            value={draft}
            onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitNote();
              if (e.key === 'Escape') setEditing(false);
            }}
            placeholder="Add a note…"
            style={{
              flex: 1,
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '0.25rem',
              padding: '0.2rem 0.4rem',
              color: '#e2e8f0',
              fontSize: '0.78rem',
              outline: 'none',
            }}
          />
          <button
            onClick={commitNote}
            style={smallBtnStyle('#134e4a', '#5eead4')}
          >
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            style={smallBtnStyle('#1e293b', '#94a3b8')}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            marginTop: '0.2rem',
          }}
        >
          {entry.note ? (
            <span
              style={{ color: '#94a3b8', fontSize: '0.75rem', fontStyle: 'italic', flex: 1 }}
            >
              {entry.note}
            </span>
          ) : null}
          <button
            onClick={() => { setDraft(entry.note ?? ''); setEditing(true); }}
            style={smallBtnStyle('#1e293b', '#64748b')}
          >
            {entry.note ? 'Edit note' : '+ note'}
          </button>
        </div>
      )}
    </div>
  );
}

function smallBtnStyle(bg: string, color: string) {
  return {
    background: bg,
    border: '1px solid #334155',
    borderRadius: '0.2rem',
    padding: '0.15rem 0.4rem',
    color,
    fontSize: '0.72rem',
    cursor: 'pointer',
    flexShrink: 0,
  } as const;
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function JournalPanel({ onLoadSQL, refreshToken }: JournalPanelProps) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<JournalEntry[]>(() => getEntries());
  const [confirmClear, setConfirmClear] = useState(false);

  // Refresh when refreshToken changes (new entry written externally)
  const prevToken = useState(refreshToken)[0];
  if (refreshToken !== prevToken || (open && entries.length === 0 && getEntries().length > 0)) {
    setEntries(getEntries());
  }

  // Also refresh on open
  const handleToggle = () => {
    if (!open) setEntries(getEntries());
    setOpen((v) => !v);
    setConfirmClear(false);
  };

  const handleNoteChange = useCallback((id: number, note: string) => {
    addNote(id, note);
    setEntries(getEntries());
  }, []);

  const handleExport = () => {
    const md = exportAsMarkdown();
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `exploration-journal-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    clearJournal();
    setEntries([]);
    setConfirmClear(false);
  };

  return (
    <div
      style={{
        borderTop: '1px solid #1e293b',
        marginTop: '2rem',
        background: '#0d1929',
      }}
    >
      {/* Toggle bar */}
      <div
        onClick={handleToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 1rem',
          cursor: 'pointer',
          userSelect: 'none',
          color: '#94a3b8',
          fontSize: '0.85rem',
        }}
      >
        <span style={{ fontWeight: 600 }}>
          {open ? '▼' : '▶'} Query Journal
        </span>
        {entries.length > 0 && (
          <span
            style={{
              background: '#1e293b',
              borderRadius: '9999px',
              padding: '0.1rem 0.5rem',
              fontSize: '0.72rem',
              color: '#64748b',
            }}
          >
            {entries.length}
          </span>
        )}
      </div>

      {/* Panel body */}
      {open && (
        <div
          style={{
            borderTop: '1px solid #1e293b',
            padding: '0.75rem 1rem',
          }}
        >
          {/* Toolbar */}
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              marginBottom: '0.75rem',
              alignItems: 'center',
            }}
          >
            <button
              onClick={handleExport}
              disabled={entries.length === 0}
              style={toolbarBtnStyle(entries.length > 0)}
            >
              Export Markdown
            </button>
            <button
              onClick={handleClear}
              disabled={entries.length === 0}
              style={toolbarBtnStyle(entries.length > 0, confirmClear)}
            >
              {confirmClear ? 'Confirm clear?' : 'Clear'}
            </button>
            {confirmClear && (
              <button
                onClick={() => setConfirmClear(false)}
                style={toolbarBtnStyle(true)}
              >
                Cancel
              </button>
            )}
          </div>

          {/* Entry list */}
          {entries.length === 0 ? (
            <div
              style={{
                color: '#475569',
                fontSize: '0.8rem',
                padding: '1rem 0',
                textAlign: 'center',
              }}
            >
              No queries recorded yet. Run a query to start the journal.
            </div>
          ) : (
            <div
              style={{
                maxHeight: '320px',
                overflowY: 'auto',
                border: '1px solid #1e293b',
                borderRadius: '0.375rem',
              }}
            >
              {entries.map((e) => (
                <EntryRow
                  key={e.id}
                  entry={e}
                  onLoadSQL={(sql) => {
                    onLoadSQL(sql);
                    setOpen(false);
                  }}
                  onNoteChange={handleNoteChange}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function toolbarBtnStyle(enabled: boolean, danger = false) {
  return {
    background: danger ? '#7f1d1d' : '#1e293b',
    border: `1px solid ${danger ? '#dc2626' : '#334155'}`,
    borderRadius: '0.25rem',
    padding: '0.3rem 0.75rem',
    color: enabled ? (danger ? '#fca5a5' : '#94a3b8') : '#334155',
    fontSize: '0.8rem',
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.5,
  } as const;
}
