"""Unit tests for key parsing, slugs and repo-list handling (no network)."""

from sbom_corpus.keys import parse
from sbom_corpus.ref import rows, slugify


def test_slugify_matches_cncf_sbom_rule() -> None:
    assert slugify("Argo") == "argo"
    assert slugify("Aeraki Mesh") == "aeraki-mesh"
    assert slugify("Open Policy Agent (OPA)") == "open-policy-agent-opa"


def test_parse_project_key() -> None:
    k = parse("cncf-project-sboms", "argo/3.3.14/argo_3_3_14_spdx.json")
    assert (k.project_slug, k.subproject, k.version, k.kind) == ("argo", None, "3.3.14", "spdx")
    assert k.is_sbom


def test_parse_subproject_and_release_keys() -> None:
    k = parse("cncf-subproject-sboms", "argo/argo-workflows/4.1.4/argo_argo-workflows_4_1_4_spdx.json")
    assert (k.project_slug, k.subproject, k.version) == ("argo", "argo-workflows", "4.1.4")
    r = parse("cncf-project-sboms", "cosign/3.1.3/cosign_3_1_3_release_spdx.json")
    assert r.kind == "release_spdx"


def test_bomhort_copies_are_not_sboms() -> None:
    k = parse("cncf-project-sboms", "_bomhort/originals/0123/coredns_1_11_0_spdx.json.gz")
    assert k.is_bomhort_copy and not k.is_sbom


def test_discovered_parent_falls_back_to_discovered_by() -> None:
    cncf = "repositories:\n  - {owner: argoproj, repo: argo-cd, name: Argo, project_status: graduated}\n"
    disc = ("repositories:\n  - {owner: argoproj, repo: argo-workflows, name: argo-workflows,"
            " discovered_by: org-scan from argoproj/argo-cd}\n")
    out = {r["owner_repo"]: r for r in rows({"cncf": cncf, "manual": "repositories: []", "discovered": disc})}
    assert out["argoproj/argo-workflows"]["project_slug"] == "argo"
    assert out["argoproj/argo-cd"]["project_slug"] == "argo"
