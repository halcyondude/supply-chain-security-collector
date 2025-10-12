import type { GetRepoDataArtifactsQuery } from '../generated/graphql';

/**
 * Normalized tables extracted from GetRepoDataArtifacts query
 * Tables use 'base_' prefix to indicate normalized entity layer
 */
export interface GetRepoDataArtifactsNormalized {
    base_repositories: Repository[];
    base_releases: Release[];
    base_release_assets: ReleaseAsset[];
}

interface Repository {
    id: string;
    __typename: string;
    name: string;
    nameWithOwner: string;
}

interface Release {
    id: string;
    __typename: string;
    repository_id: string;  // FK to repositories
    name: string;
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

/**
 * Normalize GetRepoDataArtifacts responses into relational tables
 * 
 * This leverages TypeScript's type system and language features to extract
 * entities from the typed GraphQL response. The spread operator, flatMap,
 * and destructuring make this concise and type-safe.
 * 
 * @param responses Array of typed GraphQL responses
 * @returns Normalized tables with proper foreign keys
 */
export function normalizeGetRepoDataArtifacts(
    responses: GetRepoDataArtifactsQuery[]
): GetRepoDataArtifactsNormalized {
    
    // Extract repositories (one per response)
    // Filter out null repositories
    const repositories: Repository[] = responses
        .filter(r => r.repository !== null)
        .map(r => ({
            id: r.repository!.id,
            __typename: r.repository!.__typename || 'Repository',
            name: r.repository!.name,
            nameWithOwner: r.repository!.nameWithOwner
        }));

    // Extract releases with repository FK
    // Filter out null repositories, null nodes arrays, and null releases
    const releases: Release[] = responses
        .filter(r => r.repository !== null && r.repository.releases.nodes !== null)
        .flatMap(r =>
            r.repository!.releases.nodes!
                .filter((release): release is NonNullable<typeof release> => release !== null)
                .map(release => ({
                    id: release.id,
                    __typename: release.__typename || 'Release',
                    repository_id: r.repository!.id,  // Foreign key
                    name: release.name || '',  // Handle null name
                    tagName: release.tagName,
                    url: release.url,
                    createdAt: release.createdAt
                }))
        );

    // Extract release assets with release FK
    // Filter out nulls at all levels
    const release_assets: ReleaseAsset[] = responses
        .filter(r => r.repository !== null && r.repository.releases.nodes !== null)
        .flatMap(r =>
            r.repository!.releases.nodes!
                .filter((release): release is NonNullable<typeof release> => release !== null)
                .filter(release => release.releaseAssets.nodes !== null)
                .flatMap(release =>
                    release.releaseAssets.nodes!
                        .filter((asset): asset is NonNullable<typeof asset> => asset !== null)
                        .map(asset => ({
                            id: asset.id,
                            __typename: asset.__typename || 'ReleaseAsset',
                            release_id: release.id,  // Foreign key
                            name: asset.name,
                            downloadUrl: asset.downloadUrl
                        }))
                )
        );

    return {
        base_repositories: repositories,
        base_releases: releases,
        base_release_assets: release_assets
    };
}

/**
 * Get table statistics for logging
 */
export function getNormalizationStats(normalized: GetRepoDataArtifactsNormalized): string {
    return `
  Normalized ${normalized.base_repositories.length} repositories
  Extracted ${normalized.base_releases.length} releases
  Extracted ${normalized.base_release_assets.length} release assets
    `.trim();
}
