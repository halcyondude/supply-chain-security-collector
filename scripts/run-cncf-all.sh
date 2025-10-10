#!/usr/bin/env bash
# scripts/run-cncf-all.sh
# Run sandbox, incubation, and graduated sequentially.
# Merging of outputs is intentionally left to DuckDB (or external tools) so rows
# retain their `maturity` column and can be combined there.

set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

echo "Running sandbox dataset..."
./scripts/run-target.sh graduated

echo "Running incubation dataset..."
./scripts/run-target.sh incubation

echo "Running sandbox dataset..."
./scripts/run-target.sh sandbox

echo "All runs complete. Check the timestamped directories under output/."
echo "Combine datasets in DuckDB by reading the CSV/JSON/Parquet files and filtering on the 'maturity' column."

*** End Patch