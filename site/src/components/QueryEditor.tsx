import { useEffect, useRef, useState } from 'preact/hooks';

export interface QueryEditorProps {
  onExecute: (sql: string) => void;
  initialSQL?: string;
  isLoading: boolean;
}

export function QueryEditor({ onExecute, initialSQL, isLoading }: QueryEditorProps) {
  const [sql, setSql] = useState(initialSQL ?? '');
  const [execTime, setExecTime] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // When the library selects a new query, replace editor contents.
  useEffect(() => {
    if (initialSQL !== undefined) {
      setSql(initialSQL);
      setExecTime(null);
    }
  }, [initialSQL]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleRun();
    }
  };

  const handleRun = () => {
    if (isLoading || !sql.trim()) return;
    const start = performance.now();
    // Wrap onExecute so we can record wall-clock time for the UI.
    // The parent resolves async; we use a Promise trick to measure end-to-end.
    Promise.resolve()
      .then(() => {
        onExecute(sql);
      })
      .finally(() => {
        setExecTime(performance.now() - start);
      });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div
        style={{
          borderRadius: '0.375rem',
          overflow: 'hidden',
          border: '1px solid #334155',
        }}
      >
        <textarea
          ref={textareaRef}
          value={sql}
          onInput={(e) => setSql((e.target as HTMLTextAreaElement).value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          spellcheck={false}
          placeholder="SELECT * FROM base_repositories LIMIT 10;"
          style={{
            display: 'block',
            width: '100%',
            minHeight: '200px',
            resize: 'vertical',
            background: '#1e1e1e',
            color: '#d4d4d4',
            fontFamily:
              '"JetBrains Mono", "Cascadia Code", "Fira Code", ui-monospace, "Courier New", monospace',
            fontSize: '0.875rem',
            lineHeight: '1.6',
            padding: '0.75rem',
            border: 'none',
            outline: 'none',
            boxSizing: 'border-box',
            caretColor: '#60a5fa',
            opacity: isLoading ? 0.6 : 1,
          }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button
          onClick={handleRun}
          disabled={isLoading || !sql.trim()}
          style={{
            padding: '0.375rem 1rem',
            background: isLoading ? '#334155' : '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: isLoading || !sql.trim() ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            opacity: !sql.trim() ? 0.5 : 1,
          }}
        >
          {isLoading ? (
            <>
              <Spinner />
              Running...
            </>
          ) : (
            'Run'
          )}
        </button>

        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
          {isLoading ? 'Executing...' : 'Ctrl+Enter to run'}
        </span>

        {execTime !== null && !isLoading && (
          <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: 'auto' }}>
            Completed in {execTime < 1000 ? `${Math.round(execTime)}ms` : `${(execTime / 1000).toFixed(2)}s`}
          </span>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '12px',
        height: '12px',
        border: '2px solid rgba(255,255,255,0.3)',
        borderTopColor: '#fff',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }}
    />
  );
}
