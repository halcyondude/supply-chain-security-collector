#!/bin/bash
# Fetch the CNCF landscape YAML and generate repo lists for Sandbox, Incubation, and Graduated projects.
set -e

CNCF_YML_URL="https://raw.githubusercontent.com/cncf/landscape/refs/heads/master/landscape.yml"
YML_FILE="landscape.yml"

# Download the latest CNCF landscape.yml
echo "Downloading CNCF landscape.yml..."
curl -sSL "$CNCF_YML_URL" -o "$YML_FILE"

# Parse and extract repo lists for each maturity level using yq (requires yq installed)
for maturity in sandbox incubation graduated; do
  echo "Extracting $maturity projects..."
  yq -r \
    '.landscape[] | select(.maturity == "'"$maturity'"') | .repo_url' \
    "$YML_FILE" | \
    grep -Eo 'github.com/[^/]+/[^/]+$' | \
    awk -F/ '{print "{ \"owner\": \"" $2 "\", \"name\": \"" $3 "\" },"}' > "input/$maturity.jsonl"
done

echo "Done. See input/sandbox.jsonl, input/incubation.jsonl, input/graduated.jsonl."
