import type { GetRepoDataExtendedInfoQuery } from '../generated/graphql';

/**
 * Normalized tables extracted from GetRepoDataExtendedInfo query
 * Tables use 'base_' prefix to indicate normalized entity layer
 */
export interface GetRepoDataExtendedInfoNormalized {
    base_repositories: Repository[];
    base_branch_protection_rules: BranchProtectionRule[];
    base_releases: Release[];
    base_release_assets: ReleaseAsset[];
    base_workflows: Workflow[];
}

interface Repository {
    id: string;
    __typename: string;
    name: string;
    nameWithOwner: string;
    url: string;
    description: string | null;
    hasVulnerabilityAlertsEnabled: boolean;
    // License info (flattened)
    license_key: string | null;
    license_name: string | null;
    license_spdxId: string | null;
    // Default branch info
    defaultBranch_name: string | null;
}

interface BranchProtectionRule {
    id: string;  // Generated from repository_id + index
    __typename: string;
    repository_id: string;  // FK to repositories
    allowsDeletions: boolean;
    allowsForcePushes: boolean;
    dismissesStaleReviews: boolean;
    isAdminEnforced: boolean;
    requiresStatusChecks: boolean;
    requiresStrictStatusChecks: boolean;
    requiresCodeOwnerReviews: boolean;
    requiredApprovingReviewCount: number | null;
    pattern: string;
    isDefaultBranch: boolean;  // true if this is the default branch rule
}

interface Release {
    id: string;
    __typename: string;
    repository_id: string;  // FK to repositories
    name: string | null;
    tagName: string;
    url: string;
    createdAt: string;
}

interface ReleaseAsset {
    id: string;
    __typename: string;
    release_id: string;  // FK to releases
    name: string;
    downloadUrl: string;
}

interface Workflow {
    id: string;  // Generated from repository_id + filename
    __typename: string;
    repository_id: string;  // FK to repositories
    filename: string;
    content: string | null;
}

/**
 * Normalize GetRepoDataExtendedInfo responses into relational tables
 * 
 * This leverages TypeScript's type system to extract entities with proper FKs.
 * Handles polymorphic types (Blob unions) and nested structures.
 * 
 * @param responses Array of typed GraphQL responses
 * @returns Normalized tables with proper foreign keys
 */
export function normalizeGetRepoDataExtendedInfo(
    responses: GetRepoDataExtendedInfoQuery[]
): GetRepoDataExtendedInfoNormalized {
    
    // Extract repositories with flattened license info
    const repositories: Repository[] = responses
        .filter(r => r.repository !== null)
        .map(r => ({
            id: r.repository!.id,
            __typename: r.repository!.__typename || 'Repository',
            name: r.repository!.name,
            nameWithOwner: r.repository!.nameWithOwner,
            url: r.repository!.url,
            description: r.repository!.description,
            hasVulnerabilityAlertsEnabled: r.repository!.hasVulnerabilityAlertsEnabled,
            // Flatten license info
            license_key: r.repository!.licenseInfo?.key || null,
            license_name: r.repository!.licenseInfo?.name || null,
            license_spdxId: r.repository!.licenseInfo?.spdxId || null,
            // Default branch name
            defaultBranch_name: r.repository!.defaultBranchRef?.name || null,
        }));

    // Extract branch protection rules (both default branch and additional rules)
    const branch_protection_rules: BranchProtectionRule[] = [];
    
    for (const r of responses.filter(r => r.repository !== null)) {
        const repoId = r.repository!.id;
        
        // Add default branch protection rule if it exists
        if (r.repository!.defaultBranchRef?.branchProtectionRule) {
            const rule = r.repository!.defaultBranchRef.branchProtectionRule;
            branch_protection_rules.push({
                id: `${repoId}_default`,
                __typename: rule.__typename || 'BranchProtectionRule',
                repository_id: repoId,
                allowsDeletions: rule.allowsDeletions,
                allowsForcePushes: rule.allowsForcePushes,
                dismissesStaleReviews: rule.dismissesStaleReviews,
                isAdminEnforced: rule.isAdminEnforced,
                requiresStatusChecks: rule.requiresStatusChecks,
                requiresStrictStatusChecks: rule.requiresStrictStatusChecks,
                requiresCodeOwnerReviews: rule.requiresCodeOwnerReviews,
                requiredApprovingReviewCount: rule.requiredApprovingReviewCount,
                pattern: rule.pattern,
                isDefaultBranch: true,
            });
        }
        
        // Add additional branch protection rules
        if (r.repository!.branchProtectionRules.nodes) {
            r.repository!.branchProtectionRules.nodes
                .filter((rule): rule is NonNullable<typeof rule> => rule !== null)
                .forEach((rule, idx) => {
                    branch_protection_rules.push({
                        id: `${repoId}_rule_${idx}`,
                        __typename: rule.__typename || 'BranchProtectionRule',
                        repository_id: repoId,
                        allowsDeletions: rule.allowsDeletions,
                        allowsForcePushes: rule.allowsForcePushes,
                        dismissesStaleReviews: rule.dismissesStaleReviews,
                        isAdminEnforced: rule.isAdminEnforced,
                        requiresStatusChecks: rule.requiresStatusChecks,
                        requiresStrictStatusChecks: rule.requiresStrictStatusChecks,
                        requiresCodeOwnerReviews: rule.requiresCodeOwnerReviews,
                        requiredApprovingReviewCount: rule.requiredApprovingReviewCount,
                        pattern: rule.pattern,
                        isDefaultBranch: false,
                    });
                });
        }
    }

    // Extract releases with repository FK
    const releases: Release[] = responses
        .filter(r => r.repository !== null && r.repository.releases.nodes !== null)
        .flatMap(r =>
            r.repository!.releases.nodes!
                .filter((rel): rel is NonNullable<typeof rel> => rel !== null)
                .map(release => ({
                    id: release.id,
                    __typename: release.__typename || 'Release',
                    repository_id: r.repository!.id,
                    name: release.name,
                    tagName: release.tagName,
                    url: release.url,
                    createdAt: release.createdAt,
                }))
        );

    // Extract release assets with release FK
    const release_assets: ReleaseAsset[] = responses
        .filter(r => r.repository !== null && r.repository.releases.nodes !== null)
        .flatMap(r =>
            r.repository!.releases.nodes!
                .filter((rel): rel is NonNullable<typeof rel> => rel !== null)
                .filter(release => release.releaseAssets.nodes !== null)
                .flatMap(release =>
                    release.releaseAssets.nodes!
                        .filter((asset): asset is NonNullable<typeof asset> => asset !== null)
                        .map(asset => ({
                            id: asset.id,
                            __typename: asset.__typename || 'ReleaseAsset',
                            release_id: release.id,
                            name: asset.name,
                            downloadUrl: asset.downloadUrl,
                        }))
                )
        );

    // Extract workflows (polymorphic Tree type)
    const workflows: Workflow[] = [];
    
    for (const r of responses.filter(r => r.repository !== null)) {
        const repoId = r.repository!.id;
        const workflowsObj = r.repository!.workflows;
        
        // Check if it's a Tree type with entries
        if (workflowsObj && '__typename' in workflowsObj && workflowsObj.__typename === 'Tree') {
            const tree = workflowsObj;
            if (tree.entries) {
                tree.entries.forEach(entry => {
                    // Check if the entry's object is a Blob
                    if (entry.object && '__typename' in entry.object && entry.object.__typename === 'Blob') {
                        const blob = entry.object;
                        workflows.push({
                            id: `${repoId}_${entry.name}`,
                            __typename: 'WorkflowFile',
                            repository_id: repoId,
                            filename: entry.name,
                            content: blob.text,
                        });
                    }
                });
            }
        }
    }

    return {
        base_repositories: repositories,
        base_branch_protection_rules: branch_protection_rules,
        base_releases: releases,
        base_release_assets: release_assets,
        base_workflows: workflows,
    };
}

/**
 * Get table statistics for logging
 */
export function getNormalizationStats(normalized: GetRepoDataExtendedInfoNormalized): string {
    return `
  Normalized ${normalized.base_repositories.length} repositories
  Extracted ${normalized.base_branch_protection_rules.length} branch protection rules
  Extracted ${normalized.base_releases.length} releases
  Extracted ${normalized.base_release_assets.length} release assets
  Extracted ${normalized.base_workflows.length} workflow files
    `.trim();
}
