// Mock data simulating the structure returned by the real GitHub GraphQL API
import { GetRepoDataQuery } from './generated/graphql';

export type MockRepoDataType = {
  [key: string]: { repository: GetRepoDataQuery['repository'] };
};

export const mockRepoData: MockRepoDataType = {
  sigstore_cosign: {
    repository: {
      name: 'cosign',
      url: 'https://github.com/sigstore/cosign',
      description: 'Container Signing, Verification and Storage in an OCI registry.',
      releases: {
        nodes: [
          {
            name: 'v2.2.1',
            tagName: 'v2.2.1',
            url: 'https://github.com/sigstore/cosign/releases/tag/v2.2.1',
            createdAt: '2024-08-01T00:00:00Z',
            releaseAssets: {
              nodes: [
                { name: 'cosign_2.2.1_Linux_x86_64.tar.gz', downloadUrl: 'https://github.com/sigstore/cosign/releases/download/v2.2.1/cosign_2.2.1_Linux_x86_64.tar.gz' },
                { name: 'cosign_2.2.1_checksums.txt', downloadUrl: 'https://github.com/sigstore/cosign/releases/download/v2.2.1/cosign_2.2.1_checksums.txt' },
                { name: 'cosign_2.2.1_sbom.spdx.json', downloadUrl: 'https://github.com/sigstore/cosign/releases/download/v2.2.1/cosign_2.2.1_sbom.spdx.json' },
                { name: 'cosign_2.2.1.sig', downloadUrl: 'https://github.com/sigstore/cosign/releases/download/v2.2.1/cosign_2.2.1.sig' },
                { name: 'cosign_2.2.1.attestation', downloadUrl: 'https://github.com/sigstore/cosign/releases/download/v2.2.1/cosign_2.2.1.attestation' }
              ]
            }
          }
        ]
      },
      workflows: {
        entries: [
          {
            name: 'release.yml',
            object: { text: 'uses: goreleaser/goreleaser-action\nrun: syft' }
          }
        ]
      }
    }
  },
  anchore_syft: {
    repository: {
      name: 'syft',
      url: 'https://github.com/anchore/syft',
      description: 'CLI tool and library for generating SBOMs',
      releases: {
        nodes: [
          {
            name: 'v0.100.0',
            tagName: 'v0.100.0',
            url: 'https://github.com/anchore/syft/releases/tag/v0.100.0',
            createdAt: '2024-07-01T00:00:00Z',
            releaseAssets: {
              nodes: [
                { name: 'syft_0.100.0_Linux_x86_64.tar.gz', downloadUrl: 'https://github.com/anchore/syft/releases/download/v0.100.0/syft_0.100.0_Linux_x86_64.tar.gz' },
                { name: 'syft_0.100.0_sbom.cyclonedx.json', downloadUrl: 'https://github.com/anchore/syft/releases/download/v0.100.0/syft_0.100.0_sbom.cyclonedx.json' },
                { name: 'syft_0.100.0.sig', downloadUrl: 'https://github.com/anchore/syft/releases/download/v0.100.0/syft_0.100.0.sig' }
              ]
            }
          }
        ]
      },
      workflows: {
        entries: [
          {
            name: 'ci.yml',
            object: { text: 'run: syft\nuses: anchore/sbom-action' }
          }
        ]
      }
    }
  },
  github_docs: {
    repository: {
      name: 'docs',
      url: 'https://github.com/github/docs',
      description: 'Documentation for GitHub',
      releases: { nodes: [] },
      workflows: { entries: [] }
    }
  },
  nonexistent: { repository: null }
};
