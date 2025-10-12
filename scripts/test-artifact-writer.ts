#!/usr/bin/env ts-node

/**
 * Test the ArtifactWriter with real data
 */

import * as fs from 'fs';
import * as path from 'path';
import { writeArtifacts } from '../src/ArtifactWriter';
import type { GetRepoDataArtifactsQuery } from '../src/generated/graphql';

const inputFile = process.argv[2] || 'input/test-single.jsonl';
const outputDir = 'output/test-artifact-writer';

console.log('🧪 Testing ArtifactWriter with real data\n');
console.log(`📂 Input: ${inputFile}`);
console.log(`📂 Output: ${outputDir}\n`);

// Read the input file
if (!fs.existsSync(inputFile)) {
    console.error(`❌ Input file not found: ${inputFile}`);
    process.exit(1);
}

// Create output directory
if (fs.existsSync(outputDir)) {
    console.log('🗑️  Removing existing output directory...');
    fs.rmSync(outputDir, { recursive: true, force: true });
}
fs.mkdirSync(outputDir, { recursive: true });

// For testing, we'll create a mock response
// In reality, this would come from the GraphQL API
const mockResponse: GetRepoDataArtifactsQuery = {
    repository: {
        __typename: 'Repository',
        id: 'MDEwOlJlcG9zaXRvcnkyMDU4MDQ5ODY=',
        name: 'flux',
        nameWithOwner: 'fluxcd/flux',
        releases: {
            __typename: 'ReleaseConnection',
            nodes: [
                {
                    __typename: 'Release',
                    id: 'RE_1',
                    name: 'v1.0.0',
                    tagName: 'v1.0.0',
                    url: 'https://github.com/fluxcd/flux/releases/tag/v1.0.0',
                    createdAt: '2025-01-01T00:00:00Z',
                    releaseAssets: {
                        __typename: 'ReleaseAssetConnection',
                        nodes: [
                            {
                                __typename: 'ReleaseAsset',
                                id: 'RA_1',
                                name: 'flux-v1.0.0-linux-amd64.tar.gz',
                                downloadUrl: 'https://github.com/fluxcd/flux/releases/download/v1.0.0/flux-v1.0.0-linux-amd64.tar.gz'
                            },
                            {
                                __typename: 'ReleaseAsset',
                                id: 'RA_2',
                                name: 'flux-v1.0.0.sbom.json',
                                downloadUrl: 'https://github.com/fluxcd/flux/releases/download/v1.0.0/flux-v1.0.0.sbom.json'
                            }
                        ]
                    }
                },
                {
                    __typename: 'Release',
                    id: 'RE_2',
                    name: 'v0.9.0',
                    tagName: 'v0.9.0',
                    url: 'https://github.com/fluxcd/flux/releases/tag/v0.9.0',
                    createdAt: '2024-12-01T00:00:00Z',
                    releaseAssets: {
                        __typename: 'ReleaseAssetConnection',
                        nodes: [
                            {
                                __typename: 'ReleaseAsset',
                                id: 'RA_3',
                                name: 'flux-v0.9.0-linux-amd64.tar.gz',
                                downloadUrl: 'https://github.com/fluxcd/flux/releases/download/v0.9.0/flux-v0.9.0-linux-amd64.tar.gz'
                            }
                        ]
                    }
                }
            ]
        }
    }
};

async function main() {
    try {
        console.log('⏳ Running ArtifactWriter...\n');
        
        await writeArtifacts(
            [mockResponse],
            outputDir,
            'GetRepoDataArtifacts'
        );
        
        console.log('\n✅ ArtifactWriter completed successfully!\n');
        console.log('📊 Inspect the database:');
        console.log(`   duckdb ${outputDir}/database.db -c "SHOW TABLES"`);
        console.log(`   duckdb ${outputDir}/database.db -c "SELECT * FROM repositories"`);
        console.log(`   duckdb ${outputDir}/database.db -c "SELECT * FROM releases"`);
        console.log(`   duckdb ${outputDir}/database.db -c "SELECT * FROM release_assets"`);
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

main();
