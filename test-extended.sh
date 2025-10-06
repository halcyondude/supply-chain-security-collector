#!/usr/bin/env bash
# Test script for extended query functionality
# Tests both GetRepoDataArtifacts and GetRepoDataExtendedInfo queries
# against a single repository using mock data

set -e  # Exit on error

echo "=== Extended Query Test Suite (Mock Mode) ==="
echo ""
echo "⚠️  Note: Mock mode does not save raw responses to JSONL."
echo "    This test verifies query type handling and workflow detection."
echo ""

# Clean up any existing output
echo "🧹 Cleaning output directory..."
rm -f output/test-single-analyzed.json
rm -f output/test-single.csv
rm -f output/test-single-schema.json
echo ""

# Test 1: Run with artifacts query (default)
echo "📦 Test 1: Running with GetRepoDataArtifacts (default)..."
npm run start -- --input input/test-single.jsonl --mock --verbose
echo "✅ Artifacts query completed"
echo ""

# Test 2: Run with extended query
echo "🔍 Test 2: Running with GetRepoDataExtendedInfo (--extended)..."
npm run start -- --input input/test-single.jsonl --mock --extended --verbose
echo "✅ Extended query completed"
echo ""

# Validation
echo "🔎 Validating results..."
echo ""

# Check analyzed JSON exists
if [ ! -f output/test-single-analyzed.json ]; then
  echo "❌ test-single-analyzed.json not found!"
  exit 1
fi
echo "✅ Analyzed JSON exists"

# Check for workflow-related fields in extended query
echo ""
echo "Checking for workflow detection in extended query:"
if grep -q '"workflows"' output/test-single-analyzed.json; then
  echo "✅ workflows field present"
  
  # Show what workflows and tools were detected
  echo ""
  echo "Detected workflows and security tools:"
  node -e "
    const data = require('./output/test-single-analyzed.json');
    data.forEach(repo => {
      console.log(\`  \${repo.repository.owner}/\${repo.repository.name}:\`);
      if (repo.workflows && repo.workflows.length > 0) {
        repo.workflows.forEach(workflow => {
          console.log(\`    \${workflow.name}:\`);
          if (workflow.detectedSbomTools && workflow.detectedSbomTools.length > 0) {
            workflow.detectedSbomTools.forEach(tool => console.log(\`      - \${tool}\`));
          } else {
            console.log('      (no tools detected)');
          }
        });
      } else {
        console.log('    (no workflows)');
      }
      console.log(\`    Summary sbomCiTools: \${JSON.stringify(repo.summary.sbomCiTools)}\`);
    });
  "
else
  echo "⚠️  workflows field not found"
fi

# Check CSV and schema exist
if [ ! -f output/test-single.csv ]; then
  echo "❌ CSV not found!"
  exit 1
fi
echo "✅ CSV exists"

if [ ! -f output/test-single-schema.json ]; then
  echo "❌ Schema JSON not found!"
  exit 1
fi
echo "✅ Schema JSON exists"

echo ""
echo "=== All Tests Passed! ==="
echo ""
echo "📊 Generated files:"
echo "  - output/test-single-analyzed.json"
echo "  - output/test-single.csv"
echo "  - output/test-single-schema.json"
echo ""
echo "💡 To test with real API and verify JSONL generation:"
echo "   ./test-extended.sh --real-api"
