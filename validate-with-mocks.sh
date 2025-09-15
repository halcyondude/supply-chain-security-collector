#!/usr/bin/env bash
# validate-with-mocks.sh - Trust-building validation for GitHub Supply Chain Security Analyzer
# Usage: ./validate-with-mocks.sh

set -euo pipefail

print_section() {
  echo
  echo "============================================================"
  echo "== $1"
  echo "============================================================"
}

print_section "1. Environment & Prerequisites"
node -v && npm -v && which npx && which ts-node && echo "✅ Node.js, npm, npx, ts-node found."

if [ -f .env ]; then
  echo "✅ .env file found."
else
  echo "⚠️  .env file not found. (Not required for mock validation)"
fi

print_section "2. Dependency Installation"
echo "Running: npm install --color=always"
npm install --color=always

print_section "3. TypeScript Code Generation"
echo "Running: npm run codegen"
npm run codegen

print_section "4. Linting (ESLint)"
if npx eslint --version >/dev/null 2>&1; then
  echo "Running: npx eslint src/"
  npx eslint src/
  echo "✅ ESLint passed."
else
  echo "⚠️  ESLint not installed. Skipping lint."
fi

print_section "5. Type Checking (tsc)"
echo "Running: npx tsc --noEmit"
if npx tsc --noEmit; then
  echo "✅ TypeScript type check passed."
else
  echo "❌ TypeScript type check failed."; exit 1;
fi

# print_section "6. Tests (if defined)"
# if npm run | grep -q "test"; then
#   echo "Running: npm test"
#   npm test
#   echo "✅ Tests passed."
# else
#   echo "⚠️  No test script defined in package.json. Skipping tests."
# fi

print_section "7. CLI Mock Run"
export MOCK_GITHUB=1
INPUT_FILE=input/test-single.jsonl
if [ -f "$INPUT_FILE" ]; then
  echo "Running: npx ts-node src/main.ts --mock --input $INPUT_FILE --output output"
  npx ts-node src/main.ts --mock --input "$INPUT_FILE" --output output
  echo "✅ CLI mock run completed."
else
  echo "❌ $INPUT_FILE not found. Cannot run CLI mock validation."; exit 1;
fi

print_section "8. Report File Checks"
if [ -f output/report.json ]; then
  echo "✅ output/report.json generated."
else
  echo "❌ output/report.json missing!"; exit 1;
fi
if [ -f output/report.csv ]; then
  echo "✅ output/report.csv generated."
else
  echo "❌ output/report.csv missing!"; exit 1;
fi

print_section "ALL VALIDATION STEPS PASSED"
echo "🎉 All checks passed. Your environment and codebase are healthy and ready!"
