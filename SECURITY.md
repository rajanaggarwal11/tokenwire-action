# Security

## Reporting a vulnerability

Please report it privately: on this repository, open **Security → Report a vulnerability**. Do not open a public issue.

Include the workflow that shows the problem (or a minimal one), what you expected, and what happened.

## Scope

This repository: the `tokenwire-action` GitHub Action — `action.yml`, the files it runs, and its own workflows. Problems in the tokenwire CLI itself belong in [rajanaggarwal11/tokenwire](https://github.com/rajanaggarwal11/tokenwire).

The scenario the action runs is code from the pull request, in the same job as the action's own steps. The action keeps the token out of the scenario's environment and kills its leftover processes on Linux, but that is best effort: code in a job can influence later steps of the same job, so a scenario reaching the comment step's token by that route is a known limit, documented in the README with the two-job setup that avoids it. On pull requests from forks the token is read-only.

Examples that are in scope: the token appearing in the scenario's environment, a pull request getting past the check without the baseline it is compared against, the action editing a comment it did not post, output or summary injection.

## Supported versions

The latest major version (`v1`). Fixes ship as a new v1 release; older tags are not patched.
