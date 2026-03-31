import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { initDB, runQuery } from './db/engine';
import { queryLibrary, categories, type CatalogQuery } from './db/queries';
import { QueryEditor } from './components/QueryEditor';
import { QueryLibrary } from './components/QueryLibrary';
import { FindingsOverview } from './components/FindingsOverview';

type Status = 'loading' | 'ready' | 'error' | 'no-data';

const status = signal<Status>('loading');
const statusMessage = signal('Initializing DuckDB-WASM...');
const repoCount = signal<number | null>(null);
const queryResult = signal<{ columns: string[]; rows: any[][] } | null>(null);
const activeQuery = signal<CatalogQuery | null>(null);
const errorMessage = signal<string | null>(null);
const isRunning = signal(false);
// SQL text currently loaded in the editor (drives initialSQL prop re-render).
const editorSQL = signal<string | undefined>(undefined);

export function App() {
  useEffect(() => {
    (async () => {
      try {
        statusMessage.value = 'Loading DuckDB-WASM engine...';
        await initDB();

        // Try to get repo count to verify data is loaded
        try {
          const result = await runQuery(
            'SELECT COUNT(*) AS count FROM base_repositories',
          );
          repoCount.value = result.rows[0]?.[0] ?? 0;
          status.value = 'ready';
          statusMessage.value = 'Ready';
        } catch {
          // No base data loaded — engine works but no data
          status.value = 'no-data';
          statusMessage.value =
            'DuckDB engine ready (no base data loaded — run export-db first)';
        }
      } catch (err) {
        status.value = 'error';
        statusMessage.value = `Failed to initialize: ${err}`;
      }
    })();
  }, []);

  // Selecting a query from the library populates the editor; execution is
  // triggered explicitly by the user via the Run button or Ctrl+Enter.
  const handleQueryClick = (query: CatalogQuery) => {
    activeQuery.value = query;
    editorSQL.value = query.sql;
    errorMessage.value = null;
  };

  const handleExecute = async (sql: string) => {
    isRunning.value = true;
    errorMessage.value = null;
    try {
      queryResult.value = await runQuery(sql);
    } catch (err) {
      errorMessage.value = String(err);
      queryResult.value = null;
    } finally {
      isRunning.value = false;
    }
  };

  return (
    <div>
      <header style={{ marginBottom: '2rem' }}>
        <h1>CNCF Supply Chain Security Explorer</h1>
        <p style={{ color: '#94a3b8', marginTop: '0.5rem' }}>
          In-browser SQL exploration of CNCF project supply chain security data
        </p>
        <div style={{ marginTop: '1rem' }}>
          <StatusBadge />
        </div>
      </header>

      {status.value === 'ready' && (
        <div style={{ display: 'flex', gap: '2rem' }}>
          <aside
            style={{
              width: '260px',
              flexShrink: 0,
              borderRight: '1px solid #1e293b',
              paddingRight: '1.5rem',
            }}
          >
            <QueryLibrary
              queries={queryLibrary}
              categories={categories}
              onSelect={handleQueryClick}
              selectedId={activeQuery.value?.id}
            />
          </aside>
          <main style={{ flex: 1, minWidth: 0 }}>
            {/* Show findings overview until the user picks a query */}
            {!activeQuery.value && (
              <div style={{ marginBottom: '2rem' }}>
                <FindingsOverview runQuery={runQuery} />
              </div>
            )}

            {activeQuery.value && (
              <div style={{ marginBottom: '0.75rem' }}>
                <h2 style={{ fontSize: '1.25rem' }}>
                  {activeQuery.value.name}
                </h2>
                <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                  {activeQuery.value.description}
                </p>
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <QueryEditor
                onExecute={handleExecute}
                initialSQL={editorSQL.value}
                isLoading={isRunning.value}
              />
            </div>

            {errorMessage.value && (
              <div
                style={{
                  background: '#7f1d1d',
                  padding: '0.75rem',
                  borderRadius: '0.375rem',
                  marginBottom: '1rem',
                }}
              >
                {errorMessage.value}
              </div>
            )}
            {queryResult.value && <ResultTable result={queryResult.value} />}
          </main>
        </div>
      )}
    </div>
  );
}

function StatusBadge() {
  const colors: Record<Status, string> = {
    loading: '#eab308',
    ready: '#22c55e',
    error: '#ef4444',
    'no-data': '#3b82f6',
  };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.25rem 0.75rem',
        borderRadius: '9999px',
        fontSize: '0.875rem',
        background: '#1e293b',
      }}
    >
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: colors[status.value],
        }}
      />
      {statusMessage.value}
      {repoCount.value !== null && (
        <span style={{ color: '#94a3b8' }}>
          {' '}
          | {repoCount.value} repositories
        </span>
      )}
    </span>
  );
}


function ResultTable({ result }: { result: { columns: string[]; rows: any[][] } }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.875rem',
        }}
      >
        <thead>
          <tr>
            {result.columns.map((col) => (
              <th
                key={col}
                style={{
                  textAlign: 'left',
                  padding: '0.5rem',
                  borderBottom: '1px solid #334155',
                  color: '#94a3b8',
                  whiteSpace: 'nowrap',
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  style={{
                    padding: '0.5rem',
                    borderBottom: '1px solid #1e293b',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {cell === null || cell === undefined
                    ? ''
                    : typeof cell === 'boolean'
                      ? cell ? 'true' : 'false'
                      : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '0.5rem' }}>
        {result.rows.length} rows
      </div>
    </div>
  );
}
