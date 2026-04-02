/**
 * Exploration journal — persists query history to localStorage.
 *
 * Intentionally simple: no IndexedDB, no external deps. Each entry records
 * the SQL that was run, its outcome, and an optional user annotation. Entries
 * are stored as a JSON array under a single key and are returned newest-first.
 */

export interface JournalEntry {
  id: number;
  timestamp: string;       // ISO-8601
  sql: string;
  rowCount: number;
  executionTimeMs: number;
  note?: string;           // user annotation added after the fact
  parentId?: number;       // links a follow-up query to its predecessor
}

const STORAGE_KEY = 'exploration-journal';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function loadAll(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as JournalEntry[];
  } catch {
    return [];
  }
}

function saveAll(entries: JournalEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function nextId(entries: JournalEntry[]): number {
  if (entries.length === 0) return 1;
  return Math.max(...entries.map((e) => e.id)) + 1;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Append a new entry. Returns the saved entry with its auto-assigned id. */
export function saveEntry(
  entry: Omit<JournalEntry, 'id'>,
): JournalEntry {
  const entries = loadAll();
  const saved: JournalEntry = { id: nextId(entries), ...entry };
  entries.push(saved);
  saveAll(entries);
  return saved;
}

/** Return all entries, newest first. */
export function getEntries(): JournalEntry[] {
  return loadAll().slice().reverse();
}

/** Add or replace the note on an existing entry. No-op if id not found. */
export function addNote(id: number, note: string): void {
  const entries = loadAll();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return;
  entries[idx] = { ...entries[idx], note };
  saveAll(entries);
}

/** Wipe all journal entries. */
export function clearJournal(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function sqlFence(sql: string): string {
  return '```sql\n' + sql.trim() + '\n```';
}

/**
 * Render the journal as a Markdown document suitable for download.
 *
 * Top-level entries are H2 sections. Follow-up queries (parentId set) are
 * nested under the parent as H3 subsections.
 */
export function exportAsMarkdown(): string {
  const entries = loadAll(); // chronological order for narrative
  if (entries.length === 0) return '# Exploration Journal\n\n_No entries._\n';

  const lines: string[] = [
    '# Exploration Journal',
    '',
    `_Exported ${new Date().toISOString()}_`,
    '',
  ];

  const childrenOf = new Map<number, JournalEntry[]>();
  const roots: JournalEntry[] = [];

  for (const e of entries) {
    if (e.parentId != null) {
      const bucket = childrenOf.get(e.parentId) ?? [];
      bucket.push(e);
      childrenOf.set(e.parentId, bucket);
    } else {
      roots.push(e);
    }
  }

  const renderEntry = (e: JournalEntry, level: number) => {
    const heading = '#'.repeat(level);
    const ts = new Date(e.timestamp).toLocaleString();
    lines.push(`${heading} Query #${e.id} — ${ts}`);
    lines.push('');
    lines.push(sqlFence(e.sql));
    lines.push('');
    lines.push(
      `**Result:** ${e.rowCount} ${e.rowCount === 1 ? 'row' : 'rows'} in ${formatDuration(e.executionTimeMs)}`,
    );
    if (e.note) {
      lines.push('');
      lines.push(`**Note:** ${e.note}`);
    }
    lines.push('');

    const children = childrenOf.get(e.id) ?? [];
    for (const child of children) {
      renderEntry(child, level + 1);
    }
  };

  for (const root of roots) {
    renderEntry(root, 2);
  }

  return lines.join('\n');
}
