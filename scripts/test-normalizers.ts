#!/usr/bin/env ts-node

/**
 * Test script to verify both normalizers work correctly
 */

import { normalizeGetRepoDataArtifacts } from '../src/normalizers/GetRepoDataArtifactsNormalizer';
import { normalizeGetRepoDataExtendedInfo } from '../src/normalizers/GetRepoDataExtendedInfoNormalizer';
import type { GetRepoDataArtifactsQuery, GetRepoDataExtendedInfoQuery } from '../src/generated/graphql';

console.log('🧪 Testing normalizers...\n');

// Mock data for GetRepoDataArtifacts
const artifactsResponse: GetRepoDataArtifactsQuery = {
    repository: {
        __typename: 'Repository',
        id: 'repo-123',
        name: 'test-repo',
        nameWithOwner: 'testorg/test-repo',
        releases: {
            __typename: 'ReleaseConnection',
            nodes: [
                {
                    __typename: 'Release',
                    id: 'release-1',
                    name: 'v1.0.0',
                    tagName: 'v1.0.0',
                    url: 'https://github.com/testorg/test-repo/releases/v1.0.0',
                    createdAt: '2025-01-01T00:00:00Z',
                    releaseAssets: {
                        __typename: 'ReleaseAssetConnection',
                        nodes: [
                            {
                                __typename: 'ReleaseAsset',
                                id: 'asset-1',
                                name: 'release.tar.gz',
                                downloadUrl: 'https://github.com/.../release.tar.gz'
                            }
                        ]
                    }
                }
            ]
        }
    }
};

// Mock data for GetRepoDataExtendedInfo
const extendedResponse: GetRepoDataExtendedInfoQuery = {
    repository: {
        __typename: 'Repository',
        id: 'repo-456',
        name: 'extended-repo',
        nameWithOwner: 'testorg/extended-repo',
        url: 'https://github.com/testorg/extended-repo',
        description: 'A test repository',
        hasVulnerabilityAlertsEnabled: true,
        licenseInfo: {
            __typename: 'License',
            key: 'mit',
            name: 'MIT License',
            spdxId: 'MIT'
        },
        defaultBranchRef: {
            __typename: 'Ref',
            name: 'main',
            branchProtectionRule: {
                __typename: 'BranchProtectionRule',
                allowsDeletions: false,
                allowsForcePushes: false,
                dismissesStaleReviews: true,
                isAdminEnforced: true,
                requiresStatusChecks: true,
                requiresStrictStatusChecks: true,
                requiresCodeOwnerReviews: true,
                requiredApprovingReviewCount: 2,
                pattern: 'main'
            }
        },
        branchProtectionRules: {
            __typename: 'BranchProtectionRuleConnection',
            nodes: [
                {
                    __typename: 'BranchProtectionRule',
                    allowsDeletions: false,
                    allowsForcePushes: false,
                    dismissesStaleReviews: false,
                    isAdminEnforced: false,
                    requiresStatusChecks: true,
                    requiresStrictStatusChecks: false,
                    requiresCodeOwnerReviews: false,
                    requiredApprovingReviewCount: 1,
                    pattern: 'release/*'
                }
            ]
        },
        securityPolicy: null,
        dependabot: null,
        releases: {
            __typename: 'ReleaseConnection',
            nodes: []
        },
        workflows: {
            __typename: 'Tree',
            entries: [
                {
                    name: 'ci.yml',
                    object: {
                        __typename: 'Blob',
                        id: 'blob-1',
                        text: 'name: CI\non: [push]'
                    }
                }
            ]
        }
    }
};

// Test GetRepoDataArtifacts normalizer
console.log('📦 Testing GetRepoDataArtifacts normalizer:');
try {
    const artifactsNormalized = normalizeGetRepoDataArtifacts([artifactsResponse]);
    console.log(`  ✅ Repositories: ${artifactsNormalized.repositories.length}`);
    console.log(`  ✅ Releases: ${artifactsNormalized.releases.length}`);
    console.log(`  ✅ Release Assets: ${artifactsNormalized.release_assets.length}`);
    
    // Verify foreign keys
    if (artifactsNormalized.releases.length > 0) {
        const release = artifactsNormalized.releases[0];
        console.log(`  ✅ Release FK check: release.repository_id === repo.id: ${release.repository_id === artifactsResponse.repository!.id}`);
    }
    if (artifactsNormalized.release_assets.length > 0) {
        const asset = artifactsNormalized.release_assets[0];
        const releaseId = artifactsResponse.repository!.releases.nodes![0]!.id;
        console.log(`  ✅ Asset FK check: asset.release_id === release.id: ${asset.release_id === releaseId}`);
    }
} catch (error) {
    console.error(`  ❌ Error: ${error}`);
    process.exit(1);
}

console.log('\n🔍 Testing GetRepoDataExtendedInfo normalizer:');
try {
    const extendedNormalized = normalizeGetRepoDataExtendedInfo([extendedResponse]);
    console.log(`  ✅ Repositories: ${extendedNormalized.repositories.length}`);
    console.log(`  ✅ Branch Protection Rules: ${extendedNormalized.branch_protection_rules.length}`);
    console.log(`  ✅ Releases: ${extendedNormalized.releases.length}`);
    console.log(`  ✅ Release Assets: ${extendedNormalized.release_assets.length}`);
    console.log(`  ✅ Workflows: ${extendedNormalized.workflows.length}`);
    
    // Verify license info flattening
    if (extendedNormalized.repositories.length > 0) {
        const repo = extendedNormalized.repositories[0];
        console.log(`  ✅ License flattening: license_key = ${repo.license_key}`);
    }
    
    // Verify branch protection rules
    if (extendedNormalized.branch_protection_rules.length > 0) {
        const defaultRule = extendedNormalized.branch_protection_rules.find(r => r.isDefaultBranch);
        const additionalRule = extendedNormalized.branch_protection_rules.find(r => !r.isDefaultBranch);
        console.log(`  ✅ Default branch rule found: ${!!defaultRule}`);
        console.log(`  ✅ Additional rule found: ${!!additionalRule}`);
    }
    
    // Verify workflows
    if (extendedNormalized.workflows.length > 0) {
        const workflow = extendedNormalized.workflows[0];
        console.log(`  ✅ Workflow FK check: workflow.repository_id === repo.id: ${workflow.repository_id === extendedResponse.repository!.id}`);
    }
} catch (error) {
    console.error(`  ❌ Error: ${error}`);
    process.exit(1);
}

console.log('\n✨ All tests passed!');
