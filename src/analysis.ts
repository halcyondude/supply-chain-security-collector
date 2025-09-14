import * as yaml from 'js-yaml';
import { GetRepoDataQuery } from './generated/graphql';

type Repository = GetRepoDataQuery['repository'];

// Keywords to identify potential SBOM/security artifacts
const ARTIFACT_KEYWORDS = {
  SBOM: /\b(sbom|spdx|cyclonedx)\b/i,
  SIGNATURE: /\.(sig|asc|pem|pub)$/i,
  ATTESTATION: /attestation/i,
};

// Keywords to identify security tools in CI workflows
const CI_TOOL_KEYWORDS = {
  SBOM_GENERATORS: /\b(syft|trivy|cdxgen|spdx-sbom-generator)\b/i,
  SIGNERS: /\b(cosign|sigstore|slsa-github-generator)\b/i,
  GORELEASER: /\b(goreleaser\/goreleaser-action)\b/i, // Goreleaser can generate SBOMs
};


export function analyzeRepositoryData(repo: Repository) {
  if (!repo) return null;

  type Artifact = {
    name: string;
    isSbom: boolean;
    isSignature: boolean;
    isAttestation: boolean;
  };
  type ReleaseInfo = {
    tagName: string;
    name: string | null | undefined;
    createdAt: any;
    artifacts: Artifact[];
  };
  type WorkflowInfo = {
    name: string;
    detectedSbomTools: string[];
  };
  type Analysis = {
    repository: {
      name: string;
      url: any;
      description?: string | null;
    };
    releases: ReleaseInfo[];
    workflows: WorkflowInfo[];
    summary: {
      hasSbomArtifact: boolean;
      hasSignatureArtifact: boolean;
      hasAttestationArtifact: boolean;
      sbomCiTools: string[] | Set<string>;
    };
  };

  const analysis: Analysis = {
    repository: {
      name: repo.name,
      url: repo.url,
      description: repo.description,
    },
    releases: [],
    workflows: [],
    summary: {
      hasSbomArtifact: false,
      hasSignatureArtifact: false,
      hasAttestationArtifact: false,
      sbomCiTools: new Set<string>(),
    },
  };

  // 1. Analyze Releases
  repo.releases.nodes?.forEach(release => {
    if (!release) return;
    const releaseInfo: ReleaseInfo = {
      tagName: release.tagName,
      name: release.name,
      createdAt: release.createdAt,
      artifacts: [],
    };

    release.releaseAssets?.nodes?.forEach(asset => {
      if (!asset) return;
      const artifact: Artifact = {
        name: asset.name,
        isSbom: ARTIFACT_KEYWORDS.SBOM.test(asset.name),
        isSignature: ARTIFACT_KEYWORDS.SIGNATURE.test(asset.name),
        isAttestation: ARTIFACT_KEYWORDS.ATTESTATION.test(asset.name),
      };
      releaseInfo.artifacts.push(artifact);

      if (artifact.isSbom) (analysis.summary.sbomCiTools as Set<string>).add('sbom');
      if (artifact.isSignature) (analysis.summary.sbomCiTools as Set<string>).add('signature');
      if (artifact.isAttestation) (analysis.summary.sbomCiTools as Set<string>).add('attestation');
      if (artifact.isSbom) analysis.summary.hasSbomArtifact = true;
      if (artifact.isSignature) analysis.summary.hasSignatureArtifact = true;
      if (artifact.isAttestation) analysis.summary.hasAttestationArtifact = true;
    });
    analysis.releases.push(releaseInfo);
  });


  // 2. Analyze CI Workflows
  const tree = repo.workflows as { entries?: any[] };
  if (tree && Array.isArray(tree.entries)) {
    tree.entries.forEach(entry => {
      if (!entry) return;
      const workflowInfo = {
        name: entry.name,
        detectedSbomTools: new Set<string>(),
      };
      const content = entry.object?.text;
      if (content) {
        try {
          const doc = yaml.load(content);
          const yamlStr = typeof doc === 'string' ? doc : JSON.stringify(doc);
          if (CI_TOOL_KEYWORDS.SBOM_GENERATORS.test(yamlStr)) {
            workflowInfo.detectedSbomTools.add('sbom-generator');
            (analysis.summary.sbomCiTools as Set<string>).add('sbom-generator');
          }
          if (CI_TOOL_KEYWORDS.SIGNERS.test(yamlStr)) {
            workflowInfo.detectedSbomTools.add('signer');
            (analysis.summary.sbomCiTools as Set<string>).add('signer');
          }
          if (CI_TOOL_KEYWORDS.GORELEASER.test(yamlStr)) {
            workflowInfo.detectedSbomTools.add('goreleaser');
            (analysis.summary.sbomCiTools as Set<string>).add('goreleaser');
          }
        } catch (e) {
          // Ignore YAML parse errors
        }
      }
      analysis.workflows.push({
        ...workflowInfo,
        detectedSbomTools: Array.from(workflowInfo.detectedSbomTools),
      });
    });
  }

  // Finalize summary
  analysis.summary.sbomCiTools = Array.from(analysis.summary.sbomCiTools as Set<string>);

  return analysis;
}
