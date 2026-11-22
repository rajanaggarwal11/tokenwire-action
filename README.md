# tokenwire-action

**Size-limit for prompts.** Every PR that touches a system prompt, a tool definition or the code that builds a request changes what each LLM call costs, and whether the prompt cache still hits. This action puts that in the PR, before it ships:

```
tokenwire diff  467 → 1,151 input tokens per run  +684 (+146.5%)

  system prompt                     60 →        90       +30
  tool definitions (3 → 4)         139 →       451      +312
    + search_knowledge_base +312

✗ cache: request 2 stops repeating request 1 at the system prompt, char 221: "39.785" → "41.328"
  (a timestamp or id rendered in on every request) — 553 tokens from
  there on can't be served from cache
  cost +$41.04/day at 20,000 runs/day, $3/MTok
```

It runs your scenario through [tokenwire](https://github.com/rajanaggarwal11/tokenwire) **offline**: every request your app builds is recorded exactly and answered locally, in the format the SDK expects. **No API key, nothing sent, no cost, the same result every run.**

## Setup

**1. Create the baseline on your machine and commit it.** The action compares every PR against `tokenwire.snapshot.json`. If the file is missing, the action writes one on the CI runner, and the runner is thrown away when the job ends, so nothing is compared until you commit one yourself:

```bash
npx tokenwire@0.2.0 wrap --offline -- node test/agent-scenario.js   # your scenario command
npx tokenwire@0.2.0 snapshot                                       # writes tokenwire.snapshot.json
git add tokenwire.snapshot.json && git commit -m "Add the tokenwire baseline"
```

**2. Add the workflow.**

```yaml
on: pull_request
permissions:
  contents: read
  pull-requests: write # for the comment

jobs:
  prompts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false # the scenario cannot read the job token from .git/config
      - uses: actions/setup-node@v7
        with: { node-version: 22 }
      - run: npm ci
      - uses: rajanaggarwal11/tokenwire-action@v1
        with:
          run: node test/agent-scenario.js
          max-increase: 10%
          price: 3 # USD per million input tokens
          runs-per-day: 20000
```

`@v1` follows the latest v1 release. To run exactly the code you reviewed, pin the full commit SHA of a release tag instead, and keep the tag in a comment so Dependabot can update it:

```yaml
      - uses: rajanaggarwal11/tokenwire-action@<commit-sha> # v1.x.y
```

`git ls-remote https://github.com/rajanaggarwal11/tokenwire-action 'refs/tags/v1*'` lists the tags and their SHAs.

## What the PR gets

One comment, updated on every push, plus the same report in the job summary:

- **Input tokens per run**, base → this change, by section: system prompt, tool definitions, first message.
- **Tools** added, removed and changed, with what each costs.
- **Prompt caching**: where a request stops repeating the one before it — the section, the character, the tokens that can no longer be cached — and any timestamp or id in the prompt that changes every run.
- **Cost** per day and month, if you give it a price.

The step **fails** when the change introduces a cache break, or grows input tokens past `max-increase`.

## The baseline

`tokenwire.snapshot.json` holds token counts and hashes for every section, and the text of the system prompt and tool definitions only — never what users typed or what tools returned.

To accept a change, update the baseline in the same PR, so it is reviewed with the code that caused it:

```bash
npx tokenwire@0.2.0 wrap --offline -- node test/agent-scenario.js
npx tokenwire@0.2.0 snapshot
```

Deleting the baseline does not get a PR through. On `pull_request` events, when the snapshot is missing, the action fetches the base branch first; if the file exists there, the step fails before the scenario runs. A repository that has never had a baseline still gets one written on the runner, with a notice to create and commit it locally.

## Pull requests from forks

On a `pull_request` event from a fork, GitHub gives the job a read-only token, whatever `permissions:` says. The action cannot post its comment there: the step warns, and the full report is still in the job summary, and the check still passes or fails.

If you want comments on fork PRs, keep the workflow above as it is and add a second workflow on `workflow_run` that downloads the report (upload `${{ steps.<id>.outputs.report }}` with `actions/upload-artifact`) and posts it. That workflow has a write token but never runs code from the fork. Do not switch this workflow to `pull_request_target` with a checkout of the PR's code: that runs the fork's code with a write token and your secrets.

## What sees the token

The token (`github-token`, by default the job's `GITHUB_TOKEN`) is passed only to the step that fetches the base branch and the step that posts the comment. The step that runs your scenario and the tokenwire package from npm does not have it, and the scenario runs with `GITHUB_ENV` and `GITHUB_PATH` unset. This narrows what code from a PR can reach; it is not a sandbox, since the scenario runs on the same runner as the rest of the job. `actions/checkout` stores the job token in `.git/config` unless you set `persist-credentials: false`, as the example does.

The PR comment is updated in place. The action only edits a comment that starts with its marker **and** was posted by its own identity (`github-actions[bot]`, or the user a personal access token belongs to), so a marker pasted into someone else's comment is left alone.

## Inputs

| Input                 | Default                   | What it does                                                                                         |
| --------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `run`                 | _required_                | Command that runs your scenario. Run with `bash -c`.                                                 |
| `snapshot`            | `tokenwire.snapshot.json` | The committed baseline. If missing, written on the runner only; commit your own.                    |
| `max-increase`        |                           | Fail above this growth in input tokens per run: `10%` or `2k`. Empty never fails on size.            |
| `fail-on-cache-break` | `true`                    | Fail when the change breaks prompt caching.                                                          |
| `price`               |                           | USD per million input tokens, for the cost line.                                                     |
| `runs-per-day`        |                           | With `price`: production volume, for cost per day and month.                                         |
| `offline`             | `true`                    | `false` calls the real provider; your scenario then needs a key and the run costs money.             |
| `reply`               |                           | With offline: assistant text every request gets back, if your app needs some to proceed.             |
| `comment`             | `true`                    | Keep one comment on the PR up to date. Needs `pull-requests: write`; without it the step only warns. |
| `github-token`        | `github.token`            | Token for the comment and for fetching the base branch. Never given to the scenario.                 |
| `version`             | `0.2.0`                   | tokenwire version: an exact version, a dist-tag such as `latest`, or a path to a packed tarball.     |
| `working-directory`   | `.`                       | Where to run.                                                                                        |

## Which tokenwire runs

Each release of the action runs one exact tokenwire version, the one its tests ran against: `0.2.0` for this release. Set `version` to run another:

```yaml
      - uses: rajanaggarwal11/tokenwire-action@v1
        with:
          run: node test/agent-scenario.js
          version: 0.2.1 # or `latest` to follow npm
```

Use the same version locally when you write the baseline.

## Outputs

`input-tokens`, `base-input-tokens`, `delta-tokens`, `delta-pct`, `cache-break` (`true`/`false`), `baseline-written`, and `report` (path to the JSON report).

## Exit status

The step fails on a cache break (unless `fail-on-cache-break: false`) or growth over `max-increase`. A scenario that exits non-zero, or that makes no chat requests, fails the step too — a check that silently measured nothing would be worse than none.

## License

MIT
