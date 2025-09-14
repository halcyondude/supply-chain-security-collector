import type { CodegenConfig } from '@graphql-codegen/cli';
import 'dotenv/config';

const config: CodegenConfig = {
  overwrite: true,
  schema: 'schema/github-v15.26.0.graphql',
  documents: 'src/graphql/**/*.graphql',
  generates: {
    'src/generated/': {
      preset: 'client',
      plugins: [],
      presetConfig: {
        gqlTagName: 'gql',
      },
    },
  },
  ignoreNoDocuments: true,
};

export default config;
