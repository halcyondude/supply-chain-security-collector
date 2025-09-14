#!/usr/bin/env bash
# validate.sh - Run all validation checks for the GitHub Supply Chain Security Analyzer
# Usage: ./validate.sh

set -euo pipefail

# 1. Lint (if available)
if npx eslint --version >/dev/null 2>&1; then
  echo "🔍 Running ESLint..."
  npx eslint src/ || { echo "❌ ESLint failed"; exit 1; }
else
  echo "⚠️  ESLint not installed. Skipping lint."
fi

# 2. Type check
if npx tsc --noEmit; then
  echo "✅ TypeScript type check passed."
else
  echo "❌ TypeScript type check failed."; exit 1;
fi

# 3. Run tests (if test script exists)
if npm run | grep -q "test"; then
  echo "🧪 Running tests..."
  npm test || { echo "❌ Tests failed"; exit 1; }
else
  echo "⚠️  No test script defined in package.json. Skipping tests."
fi

# 4. Try mock run
export MOCK_GITHUB=1
INPUT_FILE=input/test-single.jsonl
if [ -f "$INPUT_FILE" ]; then
  echo "🚦 Running CLI in mock mode with $INPUT_FILE..."
  npx ts-node src/main.ts --mock --input "$INPUT_FILE"
else
  echo "⚠️  $INPUT_FILE not found. Skipping mock run."
fi

echo "🎉 Validation complete."
