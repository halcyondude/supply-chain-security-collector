# GitHub GraphQL API Rate Limits: A Primer

This document provides essential information about GitHub's GraphQL API rate limits and how this tool avoids being flagged as abusive or triggering secondary rate limits.

**Official Documentation**: [GitHub GraphQL API Rate Limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)

---

## Overview

GitHub enforces multiple types of limits to protect API availability and prevent abuse:

1. **Primary Rate Limit**: Point-based quota per hour
2. **Secondary Rate Limits**: Multiple constraints on request patterns
3. **Node Limits**: Maximum objects per query
4. **Timeouts**: 10-second maximum query execution time
5. **Resource Limits**: CPU time and compute constraints

---

## Primary Rate Limit

### Points Quota

Each authenticated user gets **5,000 points per hour**. Queries consume points based on their complexity.

**How points are calculated:**

1. Count the number of API requests needed to fulfill all connections
2. Divide by 100 and round to get the point cost
3. Minimum cost is 1 point per query

**Our queries:**

- `GetRepoDataArtifacts`: ~1-2 points (fetches releases with artifacts)
- `GetRepoDataExtendedInfo`: ~2-3 points (adds workflows, security policies, branch protection)

**Example:** Processing 100 repositories in parallel mode:

- With artifacts query: ~100-200 points
- With extended query: ~200-300 points
- **Both well under the 5,000/hour limit**

### Checking Rate Limit Status

GitHub returns headers with every response:

```text
x-ratelimit-limit: 5000
x-ratelimit-remaining: 4800
x-ratelimit-used: 200
x-ratelimit-reset: 1696867200
```

**Our implementation:** We log these headers when errors occur, helping you diagnose rate limit issues.

---

## Secondary Rate Limits (The Real Risk)

Secondary rate limits are **undocumented abuse detection mechanisms** that can flag aggressive clients. These are the ones that get you (and your friends) blocked!

### Key Constraints

1. **Concurrent Requests Limit**
   - **Maximum: 100 concurrent requests** across REST + GraphQL
   - **Violation risk:** Parallel mode with large batches
   - **Our mitigation:** Default batch size of 5 (configurable via `--parallel=N`)

2. **Per-Minute Point Limit**
   - **Maximum: 2,000 points per minute** for GraphQL endpoint
   - **Violation risk:** Sustained high-volume parallel execution
   - **Our mitigation:**
     - 1-second delay between batches
     - Small batch sizes (5 default, max 20 recommended)

3. **CPU Time Limit**
   - **Maximum: 90 seconds CPU time per 60 seconds real time**
   - **GraphQL subset: 60 seconds CPU time max**
   - **Violation risk:** Complex queries (extended mode with large repos)
   - **Our mitigation:** Keep queries focused on specific fields, limit node counts

4. **Excessive Compute Resources**
   - **Undisclosed limits** on queries consuming too many resources in short bursts
   - **Violation risk:** Rapidly firing many extended queries
   - **Our mitigation:** Sequential mode available for sensitive environments

### What Happens When You Violate Secondary Limits

- **Response:** Status `200` or `403` with error message
- **Headers:** May include `retry-after` (seconds to wait)
- **Consequence:** Continued violations can result in **integration banning**
- **Recovery:** Exponential backoff, wait at least 1 minute between retries

---

## Tool Design: Safe Defaults

This tool is designed to **stay well under all limits by default** while still being fast.

### Default Configuration

| Setting | Default Value | Rationale |
|---------|--------------|-----------|
| Execution Mode | Sequential | Safest, easiest to debug, ordered output |
| Parallel Batch Size | 5 repos | Well under 100 concurrent limit |
| Batch Delay | 1 second | Prevents burst detection |
| Max Node Requests | ~50 releases/repo | Conservative to avoid resource limits |

### Recommended Settings by Dataset Size

**Small datasets (1-20 repos):**

```bash
# Sequential is fine, takes <1 minute
npm start -- --input input/test-single.jsonl
```

**Medium datasets (20-100 repos):**

```bash
# Parallel with default batch size (5)
npm start -- --input input/graduated.jsonl --parallel
```

**Large datasets (100-500 repos):**

```bash
# Parallel with small batches, extended mode adds minimal overhead
npm start -- --input input/incubation.jsonl --parallel=3 --extended
```

**Very large datasets (500+ repos):**

```bash
# Sequential or very small batches, consider splitting input file
npm start -- --input input/all-repos.jsonl --parallel=2 --extended

# OR split into multiple runs:
npm start -- --input input/all-repos-part1.jsonl --parallel=5
npm start -- --input input/all-repos-part2.jsonl --parallel=5
```

---

## Understanding Parallel Mode

### How Batching Works

When you run with `--parallel=5`:

1. Load all repositories from input file (e.g., 100 repos)
2. Split into batches of 5: [batch1, batch2, batch3, ..., batch20]
3. For each batch:
   - Fire 5 concurrent API requests
   - Wait for all 5 to complete (`Promise.allSettled`)
   - Log results
   - **Wait 1 second before next batch**
4. Continue until all batches processed

### Why This Is Safe

- **Concurrent requests:** Max 5 at a time (far below 100 limit)
- **Per-minute points:** ~10-15 points/minute (well below 2,000 limit)
- **CPU time:** Small queries with pauses stay well within bounds
- **Resource consumption:** Gradual, not bursty

### When to Use Sequential

Use `--no-parallel` (sequential mode) when:

- **Debugging:** Need ordered, readable console output
- **Shared IP:** Multiple people using the same network/PAT
- **Conservative environments:** High security, strict monitoring
- **Rate limit concerns:** Already close to limits from other tools

---

## Query Optimization

Our queries are optimized to minimize point cost and resource usage:

### Artifacts Query (`GetRepoDataArtifacts`)

```graphql
query GetRepoDataArtifacts($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    # Basic fields (no additional requests)
    name
    url
    description
    
    # Single connection: last 5 releases
    releases(last: 5, orderBy: {field: CREATED_AT, direction: DESC}) {
      nodes {
        tagName
        name
        createdAt
        
        # Single nested connection: first 100 assets
        releaseAssets(first: 100) {
          nodes {
            name
            downloadUrl
          }
        }
      }
    }
  }
}
```

**Point calculation:**

- 1 repository request
- 5 release requests (implicit)
- 5 × 100 = 500 asset requests (implicit)
- Total: ~506 requests → **~5 points** (506/100 rounded)

### Extended Query (`GetRepoDataExtendedInfo`)

Adds:

- Workflows (last 50)
- Security policy (1 file)
- Branch protection (1 query)
- Dependabot config (1 file)

**Additional point cost:** ~1-2 points

**Total for extended:** ~6-7 points per repository

---

## Best Practices for Large Runs

### 1. Start Small

Always test with a small dataset first:

```bash
npm start -- --input input/test-single.jsonl --mock  # No API calls
npm start -- --input input/test-three-repos.jsonl    # 3 real API calls
```

### 2. Monitor Rate Limits

Watch the console output for rate limit warnings:

```text
⚠️  API Error: [...]
  Rate Limit Remaining: 4500
  Rate Limit Resets At: 3:45:00 PM
```

### 3. Use Mock Mode for Development

```bash
npm start -- --input input/test-single.jsonl --mock
```

No API calls, instant results, test analysis logic.

### 4. Adjust Batch Size Conservatively

```bash
# If you get secondary rate limit errors:
npm start -- --parallel=2        # Reduce from default 5
npm start -- --no-parallel       # Switch to sequential
```

### 5. Pause Between Large Runs

If running multiple datasets back-to-back:

```bash
npm start -- --input input/graduated.jsonl --parallel=5
sleep 60  # Wait 1 minute before next run
npm start -- --input input/incubation.jsonl --parallel=5
```

### 6. Check GitHub Status

If you encounter unexpected errors: [githubstatus.com](https://www.githubstatus.com/)

---

## Troubleshooting

### "You have exceeded a secondary rate limit"

**Cause:** Too many concurrent requests or too many requests per minute.

**Solution:**

```bash
# Reduce batch size
npm start -- --parallel=2 --input input/yourfile.jsonl

# Or switch to sequential
npm start -- --no-parallel --input input/yourfile.jsonl
```

### "API request timed out"

**Cause:** Query took >10 seconds to execute (usually large repos with many releases).

**Solution:**

- This is rare with our queries (we limit to 5 releases)
- If it happens, the tool will skip that repo and continue
- Try again later or exclude that specific repo

### "We couldn't process your request"

**Cause:** Resource limits exceeded (CPU time, compute resources).

**Solution:**

- Use sequential mode: `--no-parallel`
- Avoid extended mode for very large repos
- Split input file into smaller chunks

### Rate limit remaining is 0

**Cause:** Used all 5,000 points this hour.

**Solution:**

- Wait until `x-ratelimit-reset` timestamp
- Check if other tools/scripts are using your PAT
- Consider using a different PAT if available

---

## Summary: Safe Operation Guidelines

✅ **DO:**

- Use default settings for most datasets (sequential or `--parallel=5`)
- Test with small datasets first
- Monitor console output for rate limit warnings
- Use mock mode for development
- Wait between large runs

❌ **DON'T:**

- Use batch sizes >20 (`--parallel=20` is aggressive)
- Run multiple instances simultaneously with same PAT
- Ignore rate limit warnings
- Fire rapid back-to-back runs without pauses
- Use in CI/CD without rate limit awareness

**Default configuration is production-safe:** Sequential mode with optional parallel mode (batch size 5) keeps you well under all limits while still being reasonably fast.

---

**Questions or issues?** Open an issue with:

- Input file size (number of repos)
- Command used (including flags)
- Error message and rate limit headers
- Whether it's a shared PAT/network
