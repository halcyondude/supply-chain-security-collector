#!/bin/sh
# Download the exact, unmodified GitHub GraphQL schema SDL for v15.26.0
# Usage: ./download-schema.sh

curl -sSL https://raw.githubusercontent.com/octokit/graphql-schema/v15.26.0/schema.graphql -o github-v15.26.0.graphql
