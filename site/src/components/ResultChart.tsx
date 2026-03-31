export interface QueryResult {
  columns: string[];
  rows: any[][];
}

export interface ResultChartProps {
  result: QueryResult;
  enabled: boolean;
}

interface ChartConfig {
  labelCol: number;
  valueCol: number;
  valueLabel: string;
}

/**
 * Detect whether a value is numeric (number or numeric string).
 */
function isNumeric(v: any): boolean {
  if (typeof v === 'number') return !isNaN(v);
  if (typeof v === 'string') return v.trim() !== '' && !isNaN(Number(v));
  return false;
}

/**
 * Detect which columns should be used for a bar chart.
 * Returns null if the data is not suitable for charting.
 */
function detectChartConfig(
  columns: string[],
  rows: any[][],
): ChartConfig | null {
  if (columns.length < 2 || rows.length === 0) return null;

  // Find first string-like column and first numeric column
  let labelCol = -1;
  let valueCol = -1;

  for (let c = 0; c < columns.length; c++) {
    const sampleValues = rows.slice(0, 10).map((r) => r[c]);
    const numericCount = sampleValues.filter(isNumeric).length;
    const isNumericCol = numericCount >= Math.ceil(sampleValues.length * 0.8);

    if (!isNumericCol && labelCol === -1) {
      labelCol = c;
    } else if (isNumericCol && valueCol === -1) {
      valueCol = c;
    }
    if (labelCol !== -1 && valueCol !== -1) break;
  }

  if (labelCol === -1 || valueCol === -1) return null;
  return { labelCol, valueCol, valueLabel: columns[valueCol] };
}

const TEAL = '#14b8a6';
const TEAL_DARK = '#0d9488';
const BAR_BG = '#1e293b';
const TEXT_COLOR = '#e2e8f0';
const LABEL_COLOR = '#94a3b8';
const AXIS_COLOR = '#334155';

export function ResultChart({ result, enabled }: ResultChartProps) {
  if (!enabled) return null;

  const config = detectChartConfig(result.columns, result.rows);
  if (!config) {
    return (
      <div
        style={{
          padding: '1rem',
          color: '#64748b',
          fontSize: '0.875rem',
          fontStyle: 'italic',
        }}
      >
        Chart not available — needs at least one string column and one numeric
        column.
      </div>
    );
  }

  const { labelCol, valueCol, valueLabel } = config;

  // Build chart data — limit to 50 bars to keep SVG manageable
  const data = result.rows
    .slice(0, 50)
    .map((row) => ({
      label: row[labelCol] === null || row[labelCol] === undefined
        ? '(null)'
        : String(row[labelCol]),
      value: Number(row[valueCol]) || 0,
    }));

  const maxValue = Math.max(...data.map((d) => d.value), 1);

  // Layout constants
  const LABEL_WIDTH = 160;
  const BAR_AREA_WIDTH = 420;
  const ROW_HEIGHT = 28;
  const ROW_GAP = 4;
  const VALUE_PADDING = 8;
  const CHART_PADDING = { top: 24, right: 80, bottom: 24, left: 16 };

  const svgWidth =
    CHART_PADDING.left + LABEL_WIDTH + BAR_AREA_WIDTH + CHART_PADDING.right;
  const svgHeight =
    CHART_PADDING.top +
    data.length * (ROW_HEIGHT + ROW_GAP) -
    ROW_GAP +
    CHART_PADDING.bottom;

  const barX = CHART_PADDING.left + LABEL_WIDTH;

  return (
    <div style={{ overflowX: 'auto' }}>
      <div
        style={{
          fontSize: '0.75rem',
          color: LABEL_COLOR,
          marginBottom: '0.5rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {valueLabel}
        {result.rows.length > 50 && (
          <span style={{ color: '#64748b', marginLeft: '0.5rem' }}>
            (showing top 50 of {result.rows.length})
          </span>
        )}
      </div>
      <svg
        width={svgWidth}
        height={svgHeight}
        style={{ display: 'block', background: '#0f172a', borderRadius: '0.375rem' }}
        aria-label={`Bar chart: ${valueLabel}`}
      >
        {/* Axis line */}
        <line
          x1={barX}
          y1={CHART_PADDING.top - 4}
          x2={barX}
          y2={svgHeight - CHART_PADDING.bottom + 4}
          stroke={AXIS_COLOR}
          strokeWidth={1}
        />

        {data.map((d, i) => {
          const y = CHART_PADDING.top + i * (ROW_HEIGHT + ROW_GAP);
          const barWidth = maxValue > 0 ? (d.value / maxValue) * BAR_AREA_WIDTH : 0;
          const barWidthClamped = Math.max(barWidth, d.value !== 0 ? 2 : 0);
          const valueStr =
            Number.isInteger(d.value)
              ? d.value.toLocaleString()
              : d.value.toLocaleString(undefined, { maximumFractionDigits: 2 });
          const labelTruncated =
            d.label.length > 22 ? d.label.slice(0, 21) + '…' : d.label;

          return (
            <g key={i}>
              {/* Row background on hover — achieved via rect with opacity */}
              <rect
                x={CHART_PADDING.left}
                y={y - 2}
                width={svgWidth - CHART_PADDING.left - 4}
                height={ROW_HEIGHT + 2}
                fill="transparent"
              />

              {/* Label */}
              <text
                x={CHART_PADDING.left + LABEL_WIDTH - 8}
                y={y + ROW_HEIGHT / 2}
                dominantBaseline="middle"
                textAnchor="end"
                fill={LABEL_COLOR}
                fontSize={11}
                fontFamily="ui-monospace, monospace"
              >
                {labelTruncated}
              </text>

              {/* Bar background track */}
              <rect
                x={barX}
                y={y + 4}
                width={BAR_AREA_WIDTH}
                height={ROW_HEIGHT - 8}
                fill={BAR_BG}
                rx={2}
              />

              {/* Bar fill */}
              {barWidthClamped > 0 && (
                <rect
                  x={barX}
                  y={y + 4}
                  width={barWidthClamped}
                  height={ROW_HEIGHT - 8}
                  fill={i % 2 === 0 ? TEAL : TEAL_DARK}
                  rx={2}
                />
              )}

              {/* Value label */}
              <text
                x={barX + barWidthClamped + VALUE_PADDING}
                y={y + ROW_HEIGHT / 2}
                dominantBaseline="middle"
                textAnchor="start"
                fill={TEXT_COLOR}
                fontSize={11}
                fontFamily="ui-monospace, monospace"
              >
                {valueStr}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Returns true when the result has the right shape for a chart.
 * Used by the parent to decide whether to show the toggle.
 */
export function isChartable(result: QueryResult): boolean {
  return detectChartConfig(result.columns, result.rows) !== null;
}
