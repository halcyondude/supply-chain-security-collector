#!/usr/bin/env bash
# scripts/run-target.sh
# Usage: ./scripts/run-target.sh <dataset>
# dataset is one of: sandbox, incubation, graduated

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <dataset>"
  exit 2
fi

DATASET=$1
INPUT_FILE="input/${DATASET}.jsonl"

./scripts/ensure-env.sh

if [ ! -f "$INPUT_FILE" ]; then
  echo "Input file not found: $INPUT_FILE"
  exit 1
fi

echo "Running pipeline for dataset: $DATASET"

# Generate codegen types (idempotent)
npm run codegen

# Run the CLI against the dataset
npx ts-node src/neo.ts --input "$INPUT_FILE" --queries GetRepoDataExtendedInfo --parallel

echo "Done: output for $DATASET should be in output/"
