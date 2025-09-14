export interface RepositoryTarget {
  owner: string;
  name: string;
}

export const repositories: RepositoryTarget[] = [
  { owner: 'kubernetes', name: 'kubernetes' },
  { owner: 'sigstore', name: 'cosign' },
  { owner: 'anchore', name: 'syft' },
  { owner: 'spiffe', name: 'spire' },
  { owner: 'babel', name: 'babel' },
  { owner: 'tensorflow', name: 'tensorflow' },
];
