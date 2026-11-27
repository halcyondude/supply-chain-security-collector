"""Parse cncf/sbom bucket object keys into typed records.

Layouts (cncf/sbom README "S3 Object Naming Convention"):
  project:    <project>/<version>/<project>_<version_>_spdx.json
  subproject: <project>/<subproject>/<version>/<project>_<subproject>_<version_>_spdx.json
The public snapshot also holds legacy and irregular keys, e.g. subprojects under
the parent's owner folder, versions with dots in the filename, or no version
folder at all. Parsing is lenient and records what it could not determine.
"""

from __future__ import annotations

from pydantic import BaseModel

from .config import BOMHORT_PREFIX, KIND_SUFFIXES, PROJECT_BUCKET


class ObjectKey(BaseModel):
    bucket: str
    key: str
    kind: str | None
    is_bomhort_copy: bool
    project_slug: str | None
    subproject: str | None
    version: str | None

    @property
    def is_sbom(self) -> bool:
        return self.kind is not None and not self.is_bomhort_copy


def kind_of(filename: str) -> str | None:
    name = filename.removesuffix(".gz")
    for suffix, kind in KIND_SUFFIXES.items():
        if name.endswith(suffix):
            return kind
    return None


def parse(bucket: str, key: str) -> ObjectKey:
    parts = key.split("/")
    bomhort = key.startswith(BOMHORT_PREFIX)
    kind = kind_of(parts[-1])
    slug = sub = ver = None
    if not bomhort and len(parts) >= 2:
        slug = parts[0]
        if bucket == PROJECT_BUCKET:
            # <slug>/<version>/<file>; irregular keys keep the folder as version.
            ver = parts[-2] if len(parts) >= 3 else None
        else:
            sub = parts[1] if len(parts) >= 3 else None
            ver = parts[-2] if len(parts) >= 4 else None
    return ObjectKey(
        bucket=bucket, key=key, kind=kind, is_bomhort_copy=bomhort,
        project_slug=slug, subproject=sub, version=ver,
    )
