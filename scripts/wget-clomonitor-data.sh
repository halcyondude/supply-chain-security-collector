#!/usr/bin/env bash

set -euo pipefail
set -x

# Determine repository root using git so the script can be run from anywhere
if ! ROOT_DIR=$(git rev-parse --show-toplevel 2>/dev/null); then
	echo "Error: Not inside a Git repository (git rev-parse failed)." >&2
	exit 1
fi

# Ensure wget is available (macOS users can: brew install wget)
if ! command -v wget >/dev/null 2>&1; then
	echo "Error: 'wget' is required but not installed. Install it and retry." >&2
	exit 1
fi

# Target directory for downloaded CLOMonitor landscape files
TARGET_DIR="${ROOT_DIR}/input/clomonitor"

# TODO: get the rest of the other landscape files and clomonitor configs. also add foundation to the data model

# cncf/clomonitor has a more in depth set of repos for CNCF, not just one repo-per project.
mkdir -p "${TARGET_DIR}"
wget --output-document="${TARGET_DIR}/clomonitor-aswf.yaml" https://raw.githubusercontent.com/cncf/clomonitor/refs/heads/main/data/aswf.yaml
wget --output-document="${TARGET_DIR}/clomonitor-cdf.yaml" https://raw.githubusercontent.com/cncf/clomonitor/refs/heads/main/data/cdf.yaml
wget --output-document="${TARGET_DIR}/clomonitor-cncf.yaml" https://raw.githubusercontent.com/cncf/clomonitor/refs/heads/main/data/cncf.yaml
wget --output-document="${TARGET_DIR}/clomonitor-lfaidata.yaml" https://raw.githubusercontent.com/cncf/clomonitor/refs/heads/main/data/lfaidata.yaml
wget --output-document="${TARGET_DIR}/clomonitor-lfenergy.yaml" https://raw.githubusercontent.com/cncf/clomonitor/refs/heads/main/data/lfenergy.yaml
wget --output-document="${TARGET_DIR}/clomonitor-lfnetworking.yaml" https://raw.githubusercontent.com/cncf/clomonitor/refs/heads/main/data/lfnetworking.yaml
wget --output-document="${TARGET_DIR}/clomonitor-openmainframeproject.yaml" https://raw.githubusercontent.com/cncf/clomonitor/refs/heads/main/data/openmainframeproject.yaml


wc -l "${TARGET_DIR}"/*.yaml
