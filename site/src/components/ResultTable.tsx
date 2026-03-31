import { useState } from 'preact/hooks';

export interface QueryResult {
  columns: string[];
  rows: any[][];
}

type SortDir = 'asc' | 'desc';

interface SortState {
  col: number;
  dir: SortDir;
}

function cellText(cell: any): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'boolean') return cell ? 'true' : 'false';
  return String(cell);
}

export function ResultTable({ result }: { result: QueryResult }) {
  const [sort, setSort] = useState<SortState | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (result.rows.length === 0) {
    return (
      <div
        style={{
          padding: '2rem',
          textAlign: 'center',
          color: '#64748b',
          background: '#0f172a',
          borderRadius: '0.375rem',
          border: '1px solid #1e293b',
        }}
      >
        No results
      </div>
    );
  }

  const handleSort = (colIdx: number) => {
    setSort((prev) => {
      if (prev?.col === colIdx) {
        return { col: colIdx, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { col: colIdx, dir: 'asc' };
    });
  };

  const sorted = sort
    ? [...result.rows].sort((a, b) => {
        const av = a[sort.col];
        const bv = b[sort.col];
        // Numeric compare when both sides are numbers
        if (typeof av === 'number' && typeof bv === 'number') {
          return sort.dir === 'asc' ? av - bv : bv - av;
        }
        const as = cellText(av);
        const bs = cellText(bv);
        const cmp = as.localeCompare(bs);
        return sort.dir === 'asc' ? cmp : -cmp;
      })
    : result.rows;

  const TRUNCATE_AT = 60;

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const sortIndicator = (colIdx: number) => {
    if (sort?.col !== colIdx) return ' ↕';
    return sort.dir === 'asc' ? ' ↑' : ' ↓';
  };

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.875rem',
            tableLayout: 'auto',
          }}
        >
          <thead>
            <tr>
              {result.columns.map((col, i) => (
                <th
                  key={col}
                  onClick={() => handleSort(i)}
                  style={{
                    textAlign: 'left',
                    padding: '0.5rem 0.75rem',
                    borderBottom: '2px solid #334155',
                    color: sort?.col === i ? '#38bdf8' : '#94a3b8',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    userSelect: 'none',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    background: '#0f172a',
                  }}
                >
                  {col}
                  <span style={{ opacity: 0.6, fontSize: '0.75em' }}>
                    {sortIndicator(i)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                style={{
                  background: rowIdx % 2 === 0 ? '#0f172a' : '#111827',
                }}
              >
                {row.map((cell, colIdx) => {
                  const text = cellText(cell);
                  const isTruncatable = text.length > TRUNCATE_AT;
                  const key = `${rowIdx}-${colIdx}`;
                  const isExpanded = expanded.has(key);
                  const displayed =
                    isTruncatable && !isExpanded
                      ? text.slice(0, TRUNCATE_AT) + '…'
                      : text;

                  return (
                    <td
                      key={colIdx}
                      onClick={isTruncatable ? () => toggleExpand(key) : undefined}
                      title={isTruncatable && !isExpanded ? text : undefined}
                      style={{
                        padding: '0.4rem 0.75rem',
                        borderBottom: '1px solid #1e293b',
                        color: '#e2e8f0',
                        maxWidth: isExpanded ? 'none' : '320px',
                        whiteSpace: isExpanded ? 'pre-wrap' : 'nowrap',
                        overflow: 'hidden',
                        textOverflow: isExpanded ? 'unset' : 'ellipsis',
                        cursor: isTruncatable ? 'pointer' : 'default',
                        wordBreak: isExpanded ? 'break-word' : 'normal',
                      }}
                    >
                      {displayed}
                      {isTruncatable && (
                        <span
                          style={{
                            color: '#38bdf8',
                            fontSize: '0.75em',
                            marginLeft: '0.25rem',
                          }}
                        >
                          {isExpanded ? ' [less]' : ''}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        style={{
          color: '#64748b',
          fontSize: '0.75rem',
          marginTop: '0.5rem',
          padding: '0.25rem 0',
          borderTop: '1px solid #1e293b',
        }}
      >
        {result.rows.length} {result.rows.length === 1 ? 'row' : 'rows'}
      </div>
    </div>
  );
}
