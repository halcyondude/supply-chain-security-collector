// API-layer tests with a stub client: no network.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ClientError, type GraphQLClient } from 'graphql-request';
import {
    BRANCH_PROTECTION_RULES_FIELD,
    fetchRepositoryExtendedInfo,
    isForbiddenOnlyAt,
} from '../src/api';
import { normalizeGetRepoDataExtendedInfo } from '../src/normalizers/GetRepoDataExtendedInfoNormalizer';
import { repoResponse } from './fixtures/extended-info';

const VARS = { owner: 'acme', name: 'widget' };
const REQUEST = { query: 'query GetRepoDataExtendedInfo { __typename }' };

function forbiddenAt(...paths: string[][]): ClientError {
    return new ClientError(
        {
            status: 200,
            headers: new Headers(),
            data: { repository: null },
            errors: paths.map((p) => ({
                type: 'FORBIDDEN',
                path: p,
                message: 'Resource not accessible by integration',
            })) as unknown as ConstructorParameters<typeof ClientError>[0]['errors'],
        },
        REQUEST,
    );
}

/** Stub that replays `outcomes` in order and records the variables of each call. */
function stubClient(outcomes: Array<unknown | Error>) {
    const calls: Array<Record<string, unknown>> = [];
    const client = {
        request: async (_doc: unknown, variables: Record<string, unknown>) => {
            calls.push(variables);
            const next = outcomes[calls.length - 1];
            if (next instanceof Error) throw next;
            return next;
        },
    } as unknown as GraphQLClient;
    return { client, calls };
}

describe('isForbiddenOnlyAt', () => {
    test('true when every error is FORBIDDEN at the field', () => {
        assert.equal(isForbiddenOnlyAt(forbiddenAt(['repository', BRANCH_PROTECTION_RULES_FIELD]), BRANCH_PROTECTION_RULES_FIELD), true);
    });
    test('false when another field is also forbidden', () => {
        const err = forbiddenAt(['repository', BRANCH_PROTECTION_RULES_FIELD], ['repository', 'securityPolicy']);
        assert.equal(isForbiddenOnlyAt(err, BRANCH_PROTECTION_RULES_FIELD), false);
    });
    test('false for non-GraphQL errors', () => {
        assert.equal(isForbiddenOnlyAt(new Error('boom'), BRANCH_PROTECTION_RULES_FIELD), false);
    });
});

describe('fetchRepositoryExtendedInfo', () => {
    const DATA = repoResponse({ owner: VARS.owner, name: VARS.name });

    test('retries without branch protection rules when they are forbidden', async () => {
        const { client, calls } = stubClient([forbiddenAt(['repository', BRANCH_PROTECTION_RULES_FIELD]), DATA]);
        const result = await fetchRepositoryExtendedInfo(client, VARS, false);
        assert.equal(result, DATA);
        assert.deepEqual(
            calls.map((c) => c.includeBranchProtectionRules),
            [true, false],
        );
    });

    test('makes one request when the token has access', async () => {
        const { client, calls } = stubClient([DATA]);
        assert.equal(await fetchRepositoryExtendedInfo(client, VARS, false), DATA);
        assert.equal(calls.length, 1);
    });

    test('returns null without retrying on other errors', async () => {
        const { client, calls } = stubClient([forbiddenAt(['repository', 'securityPolicy'])]);
        assert.equal(await fetchRepositoryExtendedInfo(client, VARS, false), null);
        assert.equal(calls.length, 1);
    });
});

describe('normalizer without branch protection rules', () => {
    test('a response fetched with includeBranchProtectionRules=false normalizes', () => {
        const data = repoResponse({ owner: VARS.owner, name: VARS.name });
        delete data.repository!.branchProtectionRules;
        const normalized = normalizeGetRepoDataExtendedInfo([data]);
        assert.equal(normalized.base_repositories.length, 1);
    });
});
