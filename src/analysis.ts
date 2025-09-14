
// Import YAML parser for extracting workflow tool info from GitHub Actions YAML files
import * as yaml from 'js-yaml';
// Import the generated GraphQL types for type safety and data shape reference
import { GetRepoDataQuery } from './generated/graphql';

// The Repository type matches the shape of the 'repository' field returned by the GetRepoData GraphQL query
type Repository = GetRepoDataQuery['repository'];

// Regex patterns to identify potential SBOM/security artifacts in release asset names
const ARTIFACT_KEYWORDS = {
  SBOM: /\b(sbom|spdx|cyclonedx)\b/i,
  SIGNATURE: /\.(sig|asc|pem|pub)$/i,
  ATTESTATION: /attestation/i,
};

// Regex patterns to identify security tools in GitHub Actions workflow YAML content
const CI_TOOL_KEYWORDS = {
  SBOM_GENERATORS: /\b(syft|trivy|cdxgen|spdx-sbom-generator)\b/i,
  SIGNERS: /\b(cosign|sigstore|slsa-github-generator)\b/i,
  GORELEASER: /\b(goreleaser\/goreleaser-action)\b/i, // Goreleaser can generate SBOMs
};



/**
 * Analyze a single repository's data for supply chain security signals.
 * @param repo - The repository object as returned by the GraphQL query (may be null/undefined)
 * @returns Analysis object with releases, workflows, and summary flags
 */
  if (!repo) return null;


  // --- Data shape definitions for clarity ---
  // Artifact: describes a single release asset and its detected security properties
  type Artifact = {
    name: string;
    isSbom: boolean;
    isSignature: boolean;
    isAttestation: boolean;
  };
  // ReleaseInfo: describes a single release and its artifacts
  type ReleaseInfo = {
    tagName: string;
    name: string | null | undefined;
    createdAt: any;
    artifacts: Artifact[];
  };
  // WorkflowInfo: describes a single GitHub Actions workflow and detected tools
  type WorkflowInfo = {
    name: string;
    detectedSbomTools: string[];
  };
  // Analysis: the main output structure for a repository
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

  // Initialize the analysis object for this repository
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

  // --- Analyze Releases ---
  // For each release, extract artifact info and flag SBOM/signature/attestation presence
  repo.releases.nodes?.forEach(release => {
    if (!release) return;
    const releaseInfo: ReleaseInfo = {
      tagName: release.tagName,
      name: release.name,
      createdAt: release.createdAt,
      artifacts: [],
    };

    // For each asset in the release, check for SBOM, signature, attestation by filename
    release.releaseAssets?.nodes?.forEach(asset => {
      if (!asset) return;
      const artifact: Artifact = {
        name: asset.name,
        isSbom: ARTIFACT_KEYWORDS.SBOM.test(asset.name),
        isSignature: ARTIFACT_KEYWORDS.SIGNATURE.test(asset.name),
        isAttestation: ARTIFACT_KEYWORDS.ATTESTATION.test(asset.name),
      };
      releaseInfo.artifacts.push(artifact);

      // Track which types of artifacts are present for summary and reporting
      if (artifact.isSbom) (analysis.summary.sbomCiTools as Set<string>).add('sbom');
      if (artifact.isSignature) (analysis.summary.sbomCiTools as Set<string>).add('signature');
      if (artifact.isAttestation) (analysis.summary.sbomCiTools as Set<string>).add('attestation');
      if (artifact.isSbom) analysis.summary.hasSbomArtifact = true;
      if (artifact.isSignature) analysis.summary.hasSignatureArtifact = true;
      if (artifact.isAttestation) analysis.summary.hasAttestationArtifact = true;
    });
    analysis.releases.push(releaseInfo);
  });


  // --- Analyze CI Workflows ---
  // If workflows are present, parse each YAML and look for security tool usage
  const tree = repo.workflows as { entries?: any[] };
  if (tree && Array.isArray(tree.entries)) {
    tree.entries.forEach(entry => {
      if (!entry) return;
      // Each workflow file is represented as a tree entry with a name and text content
      const workflowInfo = {
        name: entry.name,
        detectedSbomTools: new Set<string>(),
      };
      const content = entry.object?.text;
      if (content) {
        try {
          // Parse YAML and flatten to string for regex matching
          const doc = yaml.load(content);
          const yamlStr = typeof doc === 'string' ? doc : JSON.stringify(doc);
          // Detect SBOM generators, signers, and goreleaser usage in workflow
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
          // Ignore YAML parse errors; not all workflow files are valid YAML
        }
      }
      // Store detected tools for this workflow
      analysis.workflows.push({
        ...workflowInfo,
        detectedSbomTools: Array.from(workflowInfo.detectedSbomTools),
      });
    });
  }

  // Finalize summary: convert sbomCiTools Set to array for serialization
  analysis.summary.sbomCiTools = Array.from(analysis.summary.sbomCiTools as Set<string>);

  // Return the full analysis object for this repository
  return analysis;
}
