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

The scenario is any command that makes the requests your app makes — usually a script that calls your agent once with a representative input. Anthropic Messages, OpenAI Chat Completions and OpenAI Responses all work, through their SDKs or plain `fetch`, streaming or not, because tokenwire sets `ANTHROPIC_BASE_URL` and `OPENAI_BASE_URL` for it.

## What the PR gets

One comment, updated on every push, plus the same report in the job summary:

- **Input tokens per run**, base → this change, by section: system prompt, tool definitions, first message.
- **Tools** added, removed and changed, with what each costs.
- **Prompt caching**: where a request stops repeating the one before it — the section, the character, the tokens that can no longer be cached — and any timestamp or id in the prompt that changes every run.
- **Cost** per day and month, if you give it a price.

The step **fails** when the change introduces a cache break, or grows input tokens past `max-increase`.

## The baseline

The first run writes `tokenwire.snapshot.json` and passes. Commit it. It holds token counts and hashes for every section, and the text of the system prompt and tool definitions only — never what users typed or what tools returned.

To accept a change, update the baseline in the same PR, so it is reviewed with the code that caused it:

```bash
npx tokenwire wrap --offline -- node test/agent-scenario.js
npx tokenwire snapshot
```

## Inputs

| Input                 | Default                   | What it does                                                                                         |
| --------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `run`                 | _required_                | Command that runs your scenario. Run with `bash -c`.                                                 |
| `snapshot`            | `tokenwire.snapshot.json` | The committed baseline. Written on the first run if missing.                                         |
| `max-increase`        |                           | Fail above this growth in input tokens per run: `10%` or `2k`. Empty never fails on size.            |
| `fail-on-cache-break` | `true`                    | Fail when the change breaks prompt caching.                                                          |
| `price`               |                           | USD per million input tokens, for the cost line.                                                     |
| `runs-per-day`        |                           | With `price`: production volume, for cost per day and month.                                         |
| `offline`             | `true`                    | `false` calls the real provider; your scenario then needs a key and the run costs money.             |
| `reply`               |                           | With offline: assistant text every request gets back, if your app needs some to proceed.             |
| `comment`             | `true`                    | Keep one comment on the PR up to date. Needs `pull-requests: write`; without it the step only warns. |
| `version`             | `latest`                  | tokenwire version, or a path to a packed tarball.                                                    |
| `working-directory`   | `.`                       | Where to run.                                                                                        |

## Outputs

`input-tokens`, `base-input-tokens`, `delta-tokens`, `delta-pct`, `cache-break` (`true`/`false`), `baseline-written`, and `report` (path to the JSON report).

## Exit status

The step fails on a cache break (unless `fail-on-cache-break: false`) or growth over `max-increase`. A scenario that exits non-zero, or that makes no chat requests, fails the step too — a check that silently measured nothing would be worse than none.

## License

MIT
