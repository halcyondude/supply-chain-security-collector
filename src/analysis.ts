// src/analysis.ts

// Regex patterns to identify potential SBOM/security artifacts in release asset names
const ARTIFACT_KEYWORDS = {
  // Legacy patterns for backward compatibility
  SBOM: /\b(sbom|spdx|cyclonedx)\b/i,
  SIGNATURE: /\.(sig|asc|pem|pub)$/i,
  ATTESTATION: /attestation/i,
  
  // Enhanced supply chain security patterns
  SPDX_SBOM: /\b(spdx|\.spdx)\b/i,
  CYCLONEDX_SBOM: /\b(cyclonedx|cdx|\.cdx)\b/i,
  VEX_DOCUMENT: /\b(vex|\.vex)\b/i,
  SLSA_PROVENANCE: /\b(provenance|slsa|\.intoto\.jsonl)\b/i,
  IN_TOTO_LINK: /\b(link|\.link)\b/i,
  IN_TOTO_LAYOUT: /\b(layout|\.layout)\b/i,
  CONTAINER_ATTESTATION: /\b(cosign|rekor|fulcio)\b/i,
  LICENSE_FILE: /\b(license|copying|notice)\b/i,
};

// CI/CD tool detection patterns for workflow analysis
const CI_TOOL_KEYWORDS = {
  SBOM_GENERATORS: /\b(syft|trivy|cdxgen|spdx-sbom-generator)\b/i,
  SIGNERS: /\b(cosign|sigstore|slsa-github-generator)\b/i,
  GORELEASER: /\b(goreleaser\/goreleaser-action)\b/i,
  VULNERABILITY_SCANNERS: /\b(snyk|anchore|twistlock|aqua|clair)\b/i,
  DEPENDENCY_SCANNERS: /\b(dependabot|renovate|whitesource|fossa)\b/i,
  CODE_SCANNERS: /\b(codeql|semgrep|bandit|eslint-security)\b/i,
  CONTAINER_SCANNERS: /\b(docker-scout|grype|trivy)\b/i,
};

/**
 * Analyze arbitrary repository data for supply chain security signals.
 * This function accepts any object structure and extracts security artifacts
 * using runtime checks. Works with any GraphQL query response.
 * 
 * @param repo - Any object that might contain repository data
 * @returns Analysis object with releases, workflows, and summary flags, or null if invalid
 */
export function analyzeRepositoryData(repo: unknown) {
  if (!repo || typeof repo !== 'object') return null;
  
  const repoObj = repo as Record<string, unknown>;

  // --- Data shape definitions for clarity ---
  // Artifact: describes a single release asset and its detected security properties
  type Artifact = {
    name: string;
    isSbom: boolean;
    isSignature: boolean;
    isAttestation: boolean;
    sbomFormat: string; // 'spdx' | 'cyclonedx' | 'unknown' | ''
    isVex: boolean;
    isSlsaProvenance: boolean;
    isInTotoLink: boolean;
    isContainerAttestation: boolean;
    downloadUrl?: string;
  };
  // ReleaseInfo: describes a single release and its artifacts
  type ReleaseInfo = {
    tagName: string;
    name: string | null | undefined;
    createdAt: string;
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
      id: string;
      owner: string;
      name: string;
      url: string;
      description?: string | null;
    };
    releases: ReleaseInfo[];
    workflows: WorkflowInfo[];
    summary: {
      hasSbomArtifact: boolean;
      hasSignatureArtifact: boolean;
      hasAttestationArtifact: boolean;
      // FIX: Ensure this is always an array for consistency
      sbomCiTools: string[];
    };
  };

  // Use a local Set to collect CI tools detected, then convert to array at the end
  const collectedSbomCiTools = new Set<string>();

  // Initialize the analysis object for this repository
  const analysis: Analysis = {
    repository: {
      id: String(repoObj.id || 'unknown'),
      owner: String(repoObj.nameWithOwner || '').split('/')[0] || 'unknown',
      name: String(repoObj.name || 'unknown'),
      url: `https://github.com/${String(repoObj.nameWithOwner || 'unknown/unknown')}`,
      description: repoObj.description ? String(repoObj.description) : undefined,
    },
    releases: [],
    workflows: [],
    summary: {
      hasSbomArtifact: false,
      hasSignatureArtifact: false,
      hasAttestationArtifact: false,
      sbomCiTools: [], // FIX: Initialize as an empty array
    },
  };

  // --- Analyze Releases ---
  // Extract releases.nodes array if it exists
  const releases = repoObj.releases as Record<string, unknown> | undefined;
  const nodes = releases?.nodes;
  if (Array.isArray(nodes)) {
    nodes.forEach((release: unknown) => {
      if (!release || typeof release !== 'object') return;
      const releaseObj = release as Record<string, unknown>;
      
      const releaseInfo: ReleaseInfo = {
        tagName: String(releaseObj.tagName || ''),
        name: releaseObj.name ? String(releaseObj.name) : null,
        createdAt: String(releaseObj.createdAt || ''),
        artifacts: [],
      };

      // Extract releaseAssets.nodes array if it exists
      const releaseAssets = releaseObj.releaseAssets as Record<string, unknown> | undefined;
      const assetNodes = releaseAssets?.nodes;
      if (Array.isArray(assetNodes)) {
        assetNodes.forEach((asset: unknown) => {
          if (!asset || typeof asset !== 'object') return;
          const assetObj = asset as Record<string, unknown>;
          
          const assetName = String(assetObj.name || '');
          
          // Determine SBOM format
          let sbomFormat = '';
          if (ARTIFACT_KEYWORDS.SPDX_SBOM.test(assetName)) {
            sbomFormat = 'spdx';
          } else if (ARTIFACT_KEYWORDS.CYCLONEDX_SBOM.test(assetName)) {
            sbomFormat = 'cyclonedx';
          } else if (ARTIFACT_KEYWORDS.SBOM.test(assetName)) {
            sbomFormat = 'unknown';
          }
          
          const artifact: Artifact = {
            name: assetName,
            isSbom: ARTIFACT_KEYWORDS.SBOM.test(assetName),
            isSignature: ARTIFACT_KEYWORDS.SIGNATURE.test(assetName),
            isAttestation: ARTIFACT_KEYWORDS.ATTESTATION.test(assetName),
            sbomFormat,
            isVex: ARTIFACT_KEYWORDS.VEX_DOCUMENT.test(assetName),
            isSlsaProvenance: ARTIFACT_KEYWORDS.SLSA_PROVENANCE.test(assetName),
            isInTotoLink: ARTIFACT_KEYWORDS.IN_TOTO_LINK.test(assetName),
            isContainerAttestation: ARTIFACT_KEYWORDS.CONTAINER_ATTESTATION.test(assetName),
            downloadUrl: assetObj.downloadUrl ? String(assetObj.downloadUrl) : undefined,
          };
          releaseInfo.artifacts.push(artifact);

          // Track which types of artifacts are present for summary and reporting
          if (artifact.isSbom) collectedSbomCiTools.add('sbom');
          if (artifact.isSignature) collectedSbomCiTools.add('signature');
          if (artifact.isAttestation) collectedSbomCiTools.add('attestation');
          if (artifact.isVex) collectedSbomCiTools.add('vex');
          if (artifact.isSlsaProvenance) collectedSbomCiTools.add('slsa-provenance');
          if (artifact.isInTotoLink) collectedSbomCiTools.add('in-toto-link');
          if (artifact.isContainerAttestation) collectedSbomCiTools.add('container-attestation');
          
          if (artifact.isSbom) analysis.summary.hasSbomArtifact = true;
          if (artifact.isSignature) analysis.summary.hasSignatureArtifact = true;
          if (artifact.isAttestation) analysis.summary.hasAttestationArtifact = true;
        });
      }
      analysis.releases.push(releaseInfo);
    });
  }


  // --- Analyze CI Workflows ---
  // Extract workflows if present (only in extended query)
  if ('workflows' in repoObj && repoObj.workflows && typeof repoObj.workflows === 'object') {
    const workflows = repoObj.workflows as Record<string, unknown>;
    if ('entries' in workflows && Array.isArray(workflows.entries)) {
      const workflowEntries = workflows.entries;
      
      workflowEntries.forEach((entry: unknown) => {
        if (!entry || typeof entry !== 'object') return;
        const typedEntry = entry as Record<string, unknown>;
        
        if (!('object' in typedEntry) || !typedEntry.object || typeof typedEntry.object !== 'object') return;
        const entryObject = typedEntry.object as Record<string, unknown>;
        
        if (!('text' in entryObject)) return;
        
        const workflowYaml = String(entryObject.text || '');
        const detectedTools: string[] = [];
        
        // Check for each CI tool category
        if (CI_TOOL_KEYWORDS.SBOM_GENERATORS.test(workflowYaml)) {
          detectedTools.push('sbom-generator');
          collectedSbomCiTools.add('sbom-generator');
        }
        if (CI_TOOL_KEYWORDS.SIGNERS.test(workflowYaml)) {
          detectedTools.push('signer');
          collectedSbomCiTools.add('signer');
        }
        if (CI_TOOL_KEYWORDS.GORELEASER.test(workflowYaml)) {
          detectedTools.push('goreleaser');
          collectedSbomCiTools.add('goreleaser');
        }
        if (CI_TOOL_KEYWORDS.VULNERABILITY_SCANNERS.test(workflowYaml)) {
          detectedTools.push('vulnerability-scanner');
        }
        if (CI_TOOL_KEYWORDS.DEPENDENCY_SCANNERS.test(workflowYaml)) {
          detectedTools.push('dependency-scanner');
        }
        if (CI_TOOL_KEYWORDS.CODE_SCANNERS.test(workflowYaml)) {
          detectedTools.push('code-scanner');
        }
        if (CI_TOOL_KEYWORDS.CONTAINER_SCANNERS.test(workflowYaml)) {
          detectedTools.push('container-scanner');
        }
        
        analysis.workflows.push({
          name: String(typedEntry.name || 'unknown'),
          detectedSbomTools: detectedTools,
        });
      });
    }
  }

  // Finalize summary: convert collectedSbomCiTools Set to array for serialization
  analysis.summary.sbomCiTools = Array.from(collectedSbomCiTools);

  // Return the full analysis object for this repository
  return analysis;
}