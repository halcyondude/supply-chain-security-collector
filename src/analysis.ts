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

  const analysis = {
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
    const releaseInfo = {
      tagName: release.tagName,
      name: release.name,
      createdAt: release.createdAt,
      artifacts: [],
    };

    release.releaseAssets.nodes?.forEach(asset => {
      const artifact = {
        name: asset.name,
        isSbom: ARTIFACT_KEYWORDS.SBOM.test(asset.name),
        isSignature: ARTIFACT_KEYWORDS.SIGNATURE.test(asset.name),
        isAttestation: ARTIFACT_KEYWORDS.ATTESTATION.test(asset.name),
      };
      releaseInfo.artifacts.push(artifact);

      if (artifact.isSbom) analysis.summary.hasSbomArtifact = true;
      if (artifact.isSignature) analysis.summary.hasSignatureArtifact = true;
      if (artifact.isAttestation) analysis.summary.hasAttestationArtifact = true;
    });
    analysis.releases.push(releaseInfo);
  });

  // 2. Analyze CI Workflows
  const tree = repo.workflows as { entries: any[] };
  if (tree && tree.entries) {
    tree.entries.forEach(entry => {
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
            analysis.summary.sbomCiTools.add('sbom-generator');
          }
          if (CI_TOOL_KEYWORDS.SIGNERS.test(yamlStr)) {
            workflowInfo.detectedSbomTools.add('signer');
            analysis.summary.sbomCiTools.add('signer');
          }
          if (CI_TOOL_KEYWORDS.GORELEASER.test(yamlStr)) {
            workflowInfo.detectedSbomTools.add('goreleaser');
            analysis.summary.sbomCiTools.add('goreleaser');
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
  analysis.summary.sbomCiTools = Array.from(analysis.summary.sbomCiTools);

  return analysis;
}
