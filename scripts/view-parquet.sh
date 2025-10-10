#!/usr/bin/env bash
# scripts/view-parquet.sh
# Interactive DuckDB session for exploring Parquet files
#
# Usage:
#   ./scripts/view-parquet.sh <parquet-file>
#   ./scripts/view-parquet.sh output/run-20250108-120000/test-single-analyzed.parquet
#
# This script opens an interactive DuckDB session with the specified Parquet file
# loaded as a table named 'data'. You can then run SQL queries interactively.

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check for required arguments
if [ $# -eq 0 ]; then
    echo -e "${RED}Error: No Parquet file specified${NC}"
    echo ""
    echo "Usage: $0 <parquet-file>"
    echo ""
    echo "Examples:"
    echo "  $0 output/run-20250108-120000/test-single-analyzed.parquet"
    echo "  $0 output/latest/sandbox-analyzed.parquet"
    exit 1
fi

PARQUET_FILE="$1"

# Check if file exists
if [ ! -f "$PARQUET_FILE" ]; then
    echo -e "${RED}Error: File not found: $PARQUET_FILE${NC}"
    exit 1
fi

# Check if duckdb is installed
if ! command -v duckdb &> /dev/null; then
    echo -e "${RED}Error: DuckDB is not installed${NC}"
    echo ""
    echo "Install DuckDB using one of these methods:"
    echo "  - macOS: brew install duckdb"
    echo "  - Linux/macOS: curl https://install.duckdb.org | sh"
    echo ""
    echo "See https://duckdb.org/docs/installation/ for more options"
    exit 1
fi

# Get file size
FILE_SIZE=$(du -h "$PARQUET_FILE" | cut -f1)

# Print welcome message
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}  ${BLUE}DuckDB Interactive Parquet Explorer${NC}                          ${GREEN}║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}File:${NC} $PARQUET_FILE"
echo -e "${YELLOW}Size:${NC} $FILE_SIZE"
echo ""
echo -e "${BLUE}💡 TIP: For a visual interface, use the DuckDB Local UI:${NC}"
echo -e "   ${GREEN}duckdb -cmd \"CREATE VIEW data AS FROM '$PARQUET_FILE';\" -ui${NC}"
echo ""
echo -e "${BLUE}Your Parquet file is loaded as a table named 'data'.${NC}"
echo ""
echo -e "${YELLOW}Quick Start Commands:${NC}"
echo -e "  ${GREEN}DESCRIBE data;${NC}                           -- Show schema"
echo -e "  ${GREEN}SELECT COUNT(*) FROM data;${NC}               -- Count rows"
echo -e "  ${GREEN}SELECT * FROM data LIMIT 10;${NC}             -- View first 10 rows"
echo ""
echo -e "${YELLOW}Metadata Commands:${NC}"
echo -e "  ${GREEN}SELECT * FROM parquet_kv_metadata('$PARQUET_FILE');${NC}"
echo -e "  ${GREEN}SELECT * FROM parquet_schema('$PARQUET_FILE');${NC}"
echo ""
echo -e "${YELLOW}Analysis Examples:${NC}"
echo -e "  ${GREEN}SELECT has_sbom, has_signatures, COUNT(*) FROM data GROUP BY has_sbom, has_signatures;${NC}"
echo -e "  ${GREEN}SELECT repo_owner, repo_name FROM data WHERE has_sbom = true LIMIT 10;${NC}"
echo ""
echo -e "${YELLOW}Export Results:${NC}"
echo -e "  ${GREEN}COPY (SELECT * FROM data WHERE has_sbom = true) TO 'results.csv' (HEADER);${NC}"
echo ""
echo -e "Type ${GREEN}.help${NC} for DuckDB commands, ${GREEN}.quit${NC} to exit"
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════════════${NC}"
echo ""

# Create a temporary SQL file with the CREATE VIEW statement
TEMP_SQL=$(mktemp)
trap "rm -f $TEMP_SQL" EXIT

# Write initialization SQL
cat > "$TEMP_SQL" <<EOF
-- Create a view named 'data' that references the Parquet file
CREATE OR REPLACE VIEW data AS SELECT * FROM '$PARQUET_FILE';

-- Show basic info
.mode box
SELECT 
    COUNT(*) as total_rows,
    (SELECT COUNT(DISTINCT repo_owner || '/' || repo_name) FROM data) as unique_repos
FROM data;
EOF

# Launch DuckDB with the initialization script
duckdb -init "$TEMP_SQL"
