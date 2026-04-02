import type { GetOrgReposQuery } from '../generated/graphql.d.ts';
import type { OrgRepo } from '../config';

/**
 * Normalized output from GetOrgRepos query.
 * Phase 1 only produces repo metadata -- no workflow content.
 */
export interface GetOrgReposNormalized {
    base_org_repos: OrgRepo[];
}

/**
 * Normalize GetOrgRepos responses into a flat array of OrgRepo records.
 *
 * Each org result is mapped to a CNCF project name so downstream analysis
 * can attribute repos back to their project. A single org may map to
 * multiple CNCF projects (handled by the caller passing the correct
 * cncf_project_name per org).
 *
 * @param orgResults - Array of tuples: [cncf_project_name, GetOrgReposQuery]
 * @returns Normalized base_org_repos table
 */
export function normalizeGetOrgRepos(
    orgResults: Array<{ cncfProjectName: string; data: GetOrgReposQuery }>
): GetOrgReposNormalized {

    const repos: OrgRepo[] = [];

    for (const { cncfProjectName, data } of orgResults) {
        const org = data.organization;
        if (!org) continue; // personal account -- already filtered upstream

        const nodes = org.repositories.nodes ?? [];
        for (const node of nodes) {
            if (!node) continue;

            // Extract primary language (first in the list, ordered by size)
            const languages = node.languages?.nodes ?? [];
            const primaryLanguage = languages.find((l: { name: string } | null) => l !== null)?.name ?? '';

            repos.push({
                id: node.id,
                org: org.login,
                name: node.name,
                nameWithOwner: node.nameWithOwner,
                url: node.url,
                description: node.description ?? '',
                isArchived: node.isArchived,
                isFork: node.isFork,
                defaultBranch: node.defaultBranchRef?.name ?? 'main',
                primaryLanguage,
                cncf_project_name: cncfProjectName,
            });
        }
    }

    return { base_org_repos: repos };
}

/**
 * Returns a human-readable summary of normalization results.
 */
export function getOrgReposNormalizationStats(normalized: GetOrgReposNormalized): string {
    const uniqueOrgs = new Set(normalized.base_org_repos.map(r => r.org));
    const archived = normalized.base_org_repos.filter(r => r.isArchived).length;
    const forked = normalized.base_org_repos.filter(r => r.isFork).length;

    return [
        `Normalized ${normalized.base_org_repos.length} org repos across ${uniqueOrgs.size} orgs`,
        `  ${archived} archived, ${forked} forks`,
    ].join('\n');
}
