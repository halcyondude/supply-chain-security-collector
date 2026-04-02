import { useState } from 'preact/hooks';
import { type CatalogQuery } from '../db/queries';

interface Category {
  id: string;
  name: string;
}

interface Props {
  queries: CatalogQuery[];
  categories: Category[];
  onSelect: (query: CatalogQuery) => void;
  selectedId?: string;
}

export function QueryLibrary({ queries, categories, onSelect, selectedId }: Props) {
  // Track which categories are collapsed; none collapsed by default.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCategory = (catId: string) => {
    setCollapsed((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  return (
    <div style={{ fontSize: '0.875rem' }}>
      <div
        style={{
          fontSize: '0.6875rem',
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#64748b',
          marginBottom: '0.75rem',
          paddingBottom: '0.5rem',
          borderBottom: '1px solid #1e293b',
        }}
      >
        Query Library
      </div>

      {categories.map((cat) => {
        const catQueries = queries.filter((q) => q.category === cat.id);
        if (catQueries.length === 0) return null;
        const isCollapsed = collapsed[cat.id] ?? false;

        return (
          <div key={cat.id} style={{ marginBottom: '0.25rem' }}>
            {/* Category header */}
            <button
              onClick={() => toggleCategory(cat.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                background: 'transparent',
                border: 'none',
                padding: '0.375rem 0.25rem',
                cursor: 'pointer',
                color: '#94a3b8',
                fontSize: '0.6875rem',
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                borderRadius: '0.25rem',
              }}
              aria-expanded={!isCollapsed}
            >
              <span>{cat.name}</span>
              <span
                style={{
                  display: 'inline-block',
                  transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.15s ease',
                  fontSize: '0.625rem',
                  lineHeight: 1,
                }}
              >
                ▾
              </span>
            </button>

            {/* Query list */}
            {!isCollapsed && (
              <div style={{ marginBottom: '0.5rem' }}>
                {catQueries.map((q) => {
                  const isSelected = q.id === selectedId;
                  return (
                    <button
                      key={q.id}
                      onClick={() => onSelect(q)}
                      title={q.description}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        background: isSelected ? '#1e3a5f' : 'transparent',
                        border: isSelected
                          ? '1px solid #2563eb'
                          : '1px solid transparent',
                        color: isSelected ? '#93c5fd' : '#cbd5e1',
                        padding: '0.3125rem 0.5rem',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                        fontSize: '0.8125rem',
                        marginBottom: '1px',
                        lineHeight: 1.4,
                        transition: 'background 0.1s ease, color 0.1s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          (e.currentTarget as HTMLButtonElement).style.background =
                            '#0f172a';
                          (e.currentTarget as HTMLButtonElement).style.color = '#e2e8f0';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          (e.currentTarget as HTMLButtonElement).style.background =
                            'transparent';
                          (e.currentTarget as HTMLButtonElement).style.color = '#cbd5e1';
                        }
                      }}
                    >
                      <div style={{ fontWeight: isSelected ? 500 : 400 }}>{q.name}</div>
                      <div
                        style={{
                          fontSize: '0.6875rem',
                          color: isSelected ? '#60a5fa' : '#475569',
                          marginTop: '0.125rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {q.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
