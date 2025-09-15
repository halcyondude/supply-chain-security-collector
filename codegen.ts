import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  overwrite: true,
  // The schema is the single source of truth.
  schema: 'schema/github-v15.26.0.graphql',
  // Point to where your GraphQL operations are defined.
  documents: ['src/graphql/**/*.graphql'],
  // Prune old files to keep the generated directory clean.
  prune: true,
  generates: {
    // A single output directory for all generated artifacts.
    'src/generated/': {
      preset: 'client',
      // Add the eslint-disable banner.
      plugins: [
        {
          add: { content: '/* eslint-disable */' },
        },
      ],
      presetConfig: {
        // This is good practice and aligns with your guide.
        gqlTagName: 'gql',
      },
      // All plugin configurations go here, applied to the entire preset.
      config: {
        avoidOptionals: true,
        strictScalars: true,
        enumsAsTypes: true,
        scalars: {
          DateTime: 'string',
          Date: 'string',
          URI: 'string',
          GitObjectID: 'string',
          GitTimestamp: 'string',
          HTML: 'string',
          X509Certificate: 'string',
          Base64String: 'string',
          BigInt: 'string',
          GitRefname: 'string',
          GitSSHRemote: 'string',
          PreciseDateTime: 'string',
        },
      },
    },
  },
  ignoreNoDocuments: true,
};

export default config;