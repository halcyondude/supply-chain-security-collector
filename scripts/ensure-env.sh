#!/usr/bin/env bash
# scripts/ensure-env.sh
# Ensure .env exists; otherwise print helpful message and exit 1.

set -euo pipefail

if [ -f .env ]; then
  exit 0
fi

echo "Error: .env file not found."
echo "Copy the template and add your GitHub token:"
echo "  cp .env.template .env"
echo "Set GITHUB_PAT in .env with a Personal Access Token. Create one here:" 
echo "  https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token"
exit 1
