import { useEffect, useState } from 'preact/hooks';

interface Props {
  runQuery: (sql: string) => Promise<{ columns: string[]; rows: any[][] }>;
  onBrowseQueries?: () => void;
}

interface Stats {
  totalRepos: number | null;
  totalReleases: number | null;
  totalWorkflows: number | null;
  sbomPct: number | null;
  signingPct: number | null;
}

type LoadState = 'loading' | 'ready' | 'error';

function StatCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: string | null;
  loading: boolean;
}) {
  return (
    <div
      style={{
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: '0.5rem',
        padding: '1.25rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.375rem',
        minWidth: '160px',
      }}
    >
      <div
        style={{
          fontSize: '0.6875rem',
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#64748b',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: '2rem',
          fontWeight: 700,
          color: loading ? '#334155' : '#e2e8f0',
          lineHeight: 1.1,
          fontVariantNumeric: 'tabular-nums',
          minHeight: '2.4rem',
        }}
      >
        {loading ? (
          <span style={{ color: '#334155' }}>—</span>
        ) : value !== null ? (
          value
        ) : (
          <span style={{ color: '#475569', fontSize: '1.25rem' }}>N/A</span>
        )}
      </div>
    </div>
  );
}

export function FindingsOverview({ runQuery, onBrowseQueries }: Props) {
  const [stats, setStats] = useState<Stats>({
    totalRepos: null,
    totalReleases: null,
    totalWorkflows: null,
    sbomPct: null,
    signingPct: null,
  });
  const [loadState, setLoadState] = useState<LoadState>('loading');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [reposResult, releasesResult, execResult] = await Promise.all([
          runQuery('SELECT COUNT(*) AS c FROM base_repositories').catch(() => null),
          runQuery('SELECT COUNT(*) AS c FROM base_releases').catch(() => null),
          runQuery('SELECT * FROM agg_executive_summary').catch(() => null),
        ]);

        // Workflows — may not exist if data was stripped
        const workflowsResult = await runQuery(
          'SELECT COUNT(*) AS c FROM base_workflows',
        ).catch(() => null);

        if (cancelled) return;

        const totalRepos = reposResult?.rows?.[0]?.[0] ?? null;
        const totalReleases = releasesResult?.rows?.[0]?.[0] ?? null;
        const totalWorkflows = workflowsResult?.rows?.[0]?.[0] ?? null;

        let sbomPct: number | null = null;
        let signingPct: number | null = null;

        if (execResult && execResult.columns.length > 0) {
          const row = execResult.rows?.[0];
          if (row) {
            const colIdx = (name: string) =>
              execResult.columns.findIndex(
                (c) => c.toLowerCase() === name.toLowerCase(),
              );
            const sbomIdx = colIdx('sbom_adoption_pct');
            const sigIdx = colIdx('signature_adoption_pct');
            if (sbomIdx >= 0 && row[sbomIdx] != null) sbomPct = Number(row[sbomIdx]);
            if (sigIdx >= 0 && row[sigIdx] != null) signingPct = Number(row[sigIdx]);
          }
        }

        setStats({ totalRepos, totalReleases, totalWorkflows, sbomPct, signingPct });
        setLoadState('ready');
      } catch {
        if (!cancelled) setLoadState('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runQuery]);

  const loading = loadState === 'loading';

  const fmt = (n: number | null, decimals = 0): string | null => {
    if (n === null) return null;
    if (decimals > 0) return n.toFixed(decimals) + '%';
    return n.toLocaleString();
  };

  return (
    <div style={{ maxWidth: '860px' }}>
      {/* Heading */}
      <div style={{ marginBottom: '2rem' }}>
        <h2
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: '#f1f5f9',
            marginBottom: '0.5rem',
          }}
        >
          CNCF Supply Chain Security — Dataset Overview
        </h2>
        <p style={{ color: '#94a3b8', fontSize: '0.9375rem', lineHeight: 1.6 }}>
          Explore supply chain security adoption across CNCF projects using
          in-browser SQL. Select a query from the library to get started, or
          write your own below.
        </p>
      </div>

      {/* Stat cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem',
        }}
      >
        <StatCard
          label="Repositories"
          value={fmt(stats.totalRepos)}
          loading={loading}
        />
        <StatCard
          label="Releases"
          value={fmt(stats.totalReleases)}
          loading={loading}
        />
        <StatCard
          label="Workflows"
          value={stats.totalWorkflows !== null ? fmt(stats.totalWorkflows) : null}
          loading={loading}
        />
        <StatCard
          label="SBOM Adoption"
          value={fmt(stats.sbomPct, 1)}
          loading={loading}
        />
        <StatCard
          label="Signing Adoption"
          value={fmt(stats.signingPct, 1)}
          loading={loading}
        />
      </div>

      {/* Start exploring prompt */}
      <div
        style={{
          background: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '0.5rem',
          padding: '1.25rem 1.5rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: '0.25rem' }}
          >
            Start exploring
          </div>
          <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
            Choose a pre-built query from the library on the left, or write SQL
            directly in the editor below.
          </div>
        </div>
        {onBrowseQueries && (
          <button
            onClick={onBrowseQueries}
            style={{
              background: '#1e3a5f',
              border: '1px solid #2563eb',
              color: '#93c5fd',
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 500,
              whiteSpace: 'nowrap',
            }}
          >
            Browse queries
          </button>
        )}
      </div>

      {/* Methodology caveat */}
      <p
        style={{
          fontSize: '0.75rem',
          color: '#475569',
          lineHeight: 1.6,
          borderTop: '1px solid #1e293b',
          paddingTop: '1rem',
        }}
      >
        Based on GitHub release assets and GitHub Actions workflows. See
        methodology for coverage details.
      </p>
    </div>
  );
}
