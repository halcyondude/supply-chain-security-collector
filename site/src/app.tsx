import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { initDB, runQuery } from './db/engine';
import { queryLibrary, categories, type CatalogQuery } from './db/queries';
import { QueryEditor } from './components/QueryEditor';
import { QueryLibrary } from './components/QueryLibrary';
import { FindingsOverview } from './components/FindingsOverview';
import { ResultTable } from './components/ResultTable';
import { ResultChart, isChartable } from './components/ResultChart';

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
// Whether the chart view is active (only visible when result is chartable).
const showChart = signal(false);

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
    showChart.value = false;
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

            {queryResult.value && (
              <ResultArea result={queryResult.value} />
            )}
          </main>
        </div>
      )}
    </div>
  );
}

function ResultArea({
  result,
}: {
  result: { columns: string[]; rows: any[][] };
}) {
  const chartable = isChartable(result);

  return (
    <div>
      {chartable && (
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            marginBottom: '0.75rem',
          }}
        >
          <ViewToggleButton
            label="Table"
            active={!showChart.value}
            onClick={() => { showChart.value = false; }}
          />
          <ViewToggleButton
            label="Chart"
            active={showChart.value}
            onClick={() => { showChart.value = true; }}
          />
        </div>
      )}

      {showChart.value && chartable ? (
        <ResultChart result={result} enabled={true} />
      ) : (
        <ResultTable result={result} />
      )}
    </div>
  );
}

function ViewToggleButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '0.25rem 0.75rem',
        borderRadius: '0.25rem',
        border: '1px solid',
        borderColor: active ? '#14b8a6' : '#334155',
        background: active ? '#134e4a' : 'transparent',
        color: active ? '#5eead4' : '#94a3b8',
        fontSize: '0.8rem',
        cursor: 'pointer',
        fontWeight: active ? 600 : 400,
        transition: 'all 0.1s',
      }}
    >
      {label}
    </button>
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
