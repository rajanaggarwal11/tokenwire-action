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
          persist-credentials: false # keeps the job token out of .git/config
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

If a pull request deletes the baseline, the action does not quietly write a new one. On `pull_request`, `pull_request_target` and `merge_group` events, when the snapshot is missing (or is a symlink or a directory, which never counts as a baseline), the action fetches the base branch first; if the file exists there, the step fails before the scenario runs. A repository that has never had a baseline still gets one written on the runner, with a notice to create and commit it locally.

This catches a deleted or replaced file. It cannot stop a PR that also edits the workflow, for example to change the `snapshot:` input or drop the step, because the PR controls the workflow it runs with. Review workflow changes, and require this check on the base branch.

## Untrusted code in the scenario

The scenario is code from the pull request, and it runs on the same runner as the rest of the job. The action keeps the token out of the scenario's environment: only the base-branch fetch and the comment step get it, and on Linux the scenario's leftover processes are killed before the comment step. That is best effort, not isolation. Code that runs in a job can change what later steps in that job do: for example it can write to the runner's environment file so that the comment step runs something else, or keep a process running outside its process group. Treat anything in the same job as reachable from the scenario.

What that means in practice:

- **PRs from forks** get a read-only `GITHUB_TOKEN`, whatever `permissions:` says. The scenario cannot do more with it than read, and the action cannot comment: the step warns, the report is in the job summary, and the check still passes or fails.
- **PRs from branches of your repository** are written by people who can push anyway. The one-job setup above is fine for them.
- **If you do not want PR code in the same job as a write token**, run the action with `comment: false` and post the comment from a second job that runs no PR code:

```yaml
on: pull_request
permissions:
  contents: read

jobs:
  prompts:
    runs-on: ubuntu-latest
    outputs:
      report: ${{ steps.tokenwire.outputs.markdown != '' }}
    steps:
      - uses: actions/checkout@v7
        with: { persist-credentials: false }
      - uses: actions/setup-node@v7
        with: { node-version: 22 }
      - run: npm ci
      - id: tokenwire
        uses: rajanaggarwal11/tokenwire-action@v1
        with:
          run: node test/agent-scenario.js
          max-increase: 10%
          comment: false
      - if: ${{ !cancelled() && steps.tokenwire.outputs.markdown != '' }}
        uses: actions/upload-artifact@v7
        with:
          name: tokenwire-report
          path: ${{ steps.tokenwire.outputs.markdown }}

  comment:
    needs: prompts
    # Fork PRs get a read-only token here too; see below for those.
    if: ${{ !cancelled() && needs.prompts.outputs.report == 'true' && github.event.pull_request.head.repo.full_name == github.repository }}
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: actions/download-artifact@v8
        with: { name: tokenwire-report }
      - env:
          GH_TOKEN: ${{ github.token }}
          COMMENTS: repos/${{ github.repository }}/issues/${{ github.event.pull_request.number }}/comments
        run: |
          mine='.[] | select(.user.login == "github-actions[bot]" and ((.body // "") | startswith("<!-- tokenwire-diff -->"))) | .id'
          id=$(gh api "$COMMENTS" --paginate --jq "$mine" | head -n1)
          if [ -n "$id" ]; then
            gh api -X PATCH "repos/$GITHUB_REPOSITORY/issues/comments/$id" -F body=@tokenwire.diff.md >/dev/null
          else
            gh api -X POST "$COMMENTS" -F body=@tokenwire.diff.md >/dev/null
          fi
```

The `comment` job only reads a Markdown file the first job wrote, so the worst PR code can do there is choose the comment's text.

**Comments on fork PRs** need a workflow that runs in the context of your repository: a second workflow on `workflow_run`. It runs after the one above (upload the PR number next to the report), never checks out or runs the fork's code, and checks that the PR number from the artifact matches the run's commit:

```yaml
# In the first workflow, before the upload step, and upload both files:
#   - run: echo "$PR" > "$RUNNER_TEMP/pr-number"
#     env: { PR: "${{ github.event.pull_request.number }}" }
#   path: |
#     ${{ steps.tokenwire.outputs.markdown }}
#     ${{ runner.temp }}/pr-number
name: tokenwire comment
on:
  workflow_run:
    workflows: [prompts] # the `name:` of the first workflow
    types: [completed]
permissions:
  actions: read
  pull-requests: write

jobs:
  comment:
    if: github.event.workflow_run.event == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v8
        with:
          name: tokenwire-report
          run-id: ${{ github.event.workflow_run.id }}
          github-token: ${{ github.token }}
      - env:
          GH_TOKEN: ${{ github.token }}
          HEAD_SHA: ${{ github.event.workflow_run.head_sha }}
        run: |
          pr=$(cat pr-number)
          case "$pr" in ''|*[!0-9]*) echo "not a PR number"; exit 1 ;; esac
          [ "$(gh api "repos/$GITHUB_REPOSITORY/pulls/$pr" --jq .head.sha)" = "$HEAD_SHA" ] \
            || { echo "PR $pr is not at $HEAD_SHA"; exit 1; }
          comments="repos/$GITHUB_REPOSITORY/issues/$pr/comments"
          mine='.[] | select(.user.login == "github-actions[bot]" and ((.body // "") | startswith("<!-- tokenwire-diff -->"))) | .id'
          id=$(gh api "$comments" --paginate --jq "$mine" | head -n1)
          if [ -n "$id" ]; then
            gh api -X PATCH "repos/$GITHUB_REPOSITORY/issues/comments/$id" -F body=@tokenwire.diff.md >/dev/null
          else
            gh api -X POST "$comments" -F body=@tokenwire.diff.md >/dev/null
          fi
```

Do not switch to `pull_request_target` with a checkout of the PR's code: that runs the fork's code with a write token and your secrets.

## Which comment is updated

The action only edits a comment that starts with its marker **and** was posted by the identity it posts as: the `comment-author` input if you set it, otherwise the token's user if the token can say who it is (a personal access token), otherwise any bot (the default `GITHUB_TOKEN` and GitHub App tokens cannot read their own login). A marker pasted into a person's comment is left alone. With a GitHub App token, set `comment-author: <app-slug>[bot]` so only the app's own comment is updated. If the comments cannot be listed, the action warns and does not post, rather than risk a second comment.

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
| `comment`             | `true`                    | Keep one comment on the PR up to date. Needs `pull-requests: write`; without it the step only warns. `false` for the two-job setup. |
| `comment-author`      |                           | Login the comment is posted as, e.g. `my-app[bot]`. Empty: the token's user if readable, else any bot. |
| `github-token`        | `github.token`            | Token for the comment and for fetching the base branch. Not in the scenario's environment.           |
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

`input-tokens`, `base-input-tokens`, `delta-tokens`, `delta-pct`, `cache-break` (`true`/`false`), `baseline-written`, `report` (path to the JSON report) and `markdown` (path to the Markdown report, the comment's body).

## Exit status

The step fails on a cache break (unless `fail-on-cache-break: false`) or growth over `max-increase`. A scenario that exits non-zero, or that makes no chat requests, fails the step too — a check that silently measured nothing would be worse than none.

## License

MIT
