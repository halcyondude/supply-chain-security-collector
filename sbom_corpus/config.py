"""Constants and settings for reading the cncf/sbom corpus.

Every value that names a host, bucket or layout lives here, so the rest of the
package never hardcodes them.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, Field

# Public, anonymously readable S3-compatible endpoint of the OCI buckets that
# cncf/sbom writes to (see cncf/sbom README "Required GitHub Secrets & Variables").
S3_ENDPOINT: str = "https://axtwf1hkrwcy.compat.objectstorage.us-sanjose-1.oraclecloud.com"
S3_NAMESPACE: str = "http://s3.amazonaws.com/doc/2006-03-01/"
S3_PAGE_SIZE: int = 1000

PROJECT_BUCKET: str = "cncf-project-sboms"
SUBPROJECT_BUCKET: str = "cncf-subproject-sboms"
BUCKETS: tuple[str, ...] = (PROJECT_BUCKET, SUBPROJECT_BUCKET)

# BOMHort, the CNCF deployment that ingests the same buckets (OSV, VEX, licenses).
BOMHORT_API: str = "https://bomhort.cncf.io/api/v1"

# Object kinds by filename suffix (cncf/sbom README "Release-attached SBOMs").
KIND_SUFFIXES: dict[str, str] = {
    "_release_spdx3.json": "release_spdx3",
    "_release_spdx.json": "release_spdx",
    "_release_cdx.json": "release_cdx",
    "_spdx3.json": "spdx3",
    "_spdx.json": "spdx",
    "_cdx.json": "cdx",
}
# Prefix BOMHort writes into the project bucket for its own copies.
BOMHORT_PREFIX: str = "_bomhort/"

# SPDX relationship types that are dependency edges, mapped to a lifecycle scope.
DEPENDENCY_SCOPES: dict[str, str] = {
    "DEPENDS_ON": "runtime",
    "DEPENDENCY_OF": "runtime",
    "BUILD_DEPENDENCY_OF": "build",
    "DEV_DEPENDENCY_OF": "dev",
    "TEST_DEPENDENCY_OF": "test",
    "OPTIONAL_DEPENDENCY_OF": "optional",
    "PROVIDED_DEPENDENCY_OF": "provided",
    "RUNTIME_DEPENDENCY_OF": "runtime",
}
# Relationship types written "dependency OF dependent" (edge must be reversed).
REVERSED_DEPENDENCY_TYPES: frozenset[str] = frozenset(
    t for t in DEPENDENCY_SCOPES if t.endswith("_OF")
)

DEFAULT_DATA_DIR: Path = Path("output/sbom-corpus")


class HttpSettings(BaseModel):
    """Client behaviour for every outbound request."""

    timeout_s: float = 120.0
    max_retries: int = 5
    backoff_base_s: float = 1.0
    backoff_max_s: float = 30.0
    max_requests_per_s: float = 8.0
    max_concurrency: int = 8
    user_agent: str = "sbom-corpus-reader/0.1 (+https://github.com/halcyondude/supply-chain-security-collector)"


class DuckDbSettings(BaseModel):
    """DuckDB limits; spill to disk instead of holding the corpus in memory."""

    memory_limit: str = "4GB"
    threads: int = 4
    temp_directory: str = Field(default="output/sbom-corpus/duckdb-tmp")
    # Largest single SBOM seen in the bucket is ~40 MB; leave headroom.
    maximum_object_size: int = 256 * 1024 * 1024
    # Files per INSERT batch; bounds peak memory independent of corpus size.
    batch_files: int = 25
