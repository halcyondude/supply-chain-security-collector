// Typed GetRepoDataExtendedInfo responses for collection-stage tests.
// Typing against the generated query type means schema or codegen drift
// breaks `npm run typecheck`, not just the test run.
import type { GetRepoDataExtendedInfoQuery } from '../../src/generated/graphql';

type Repo = NonNullable<GetRepoDataExtendedInfoQuery['repository']>;

export interface RepoSpec {
    owner: string;
    name: string;
    /** release tag -> asset file names */
    releases?: Record<string, string[]>;
    /** workflow file name -> YAML content */
    workflows?: Record<string, string>;
}

export function repoResponse(spec: RepoSpec): GetRepoDataExtendedInfoQuery {
    const slug = `${spec.owner}/${spec.name}`;
    const id = `R_${spec.owner}_${spec.name}`;
    const releases = Object.entries(spec.releases ?? {}).map(([tag, assets], i) => ({
        __typename: 'Release' as const,
        id: `RE_${id}_${i}`,
        name: tag,
        tagName: tag,
        url: `https://github.com/${slug}/releases/tag/${tag}`,
        createdAt: `2026-0${(i % 9) + 1}-01T00:00:00Z`,
        releaseAssets: {
            nodes: assets.map((asset, j) => ({
                __typename: 'ReleaseAsset' as const,
                id: `RA_${id}_${i}_${j}`,
                name: asset,
                downloadUrl: `https://github.com/${slug}/releases/download/${tag}/${asset}`,
            })),
        },
    }));
    const workflowEntries = Object.entries(spec.workflows ?? {}).map(([file, text], i) => ({
        __typename: 'TreeEntry' as const,
        name: file,
        object: { __typename: 'Blob' as const, id: `B_${id}_wf_${i}`, text },
    }));
    const repository: Repo = {
        __typename: 'Repository',
        id,
        name: spec.name,
        nameWithOwner: slug,
        url: `https://github.com/${slug}`,
        description: `${slug} test fixture`,
        hasVulnerabilityAlertsEnabled: false,
        licenseInfo: { __typename: 'License', id: 'L_apache', key: 'apache-2.0', name: 'Apache License 2.0', spdxId: 'Apache-2.0' },
        defaultBranchRef: { __typename: 'Ref', id: `REF_${id}`, name: 'main', branchProtectionRule: null },
        branchProtectionRules: { nodes: [] },
        securityPolicy: null,
        dependabot: null,
        releases: { nodes: releases },
        workflows: workflowEntries.length > 0 ? { __typename: 'Tree', entries: workflowEntries } : null,
        insightsFileRootUpper: null,
        insightsFileRootLower: null,
        insightsFileGithubUpper: null,
        insightsFileGithubLower: null,
    };
    return { repository };
}
