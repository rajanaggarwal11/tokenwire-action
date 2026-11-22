# Security

## Reporting a vulnerability

Please report it privately: on this repository, open **Security → Report a vulnerability**. Do not open a public issue.

Include the workflow that shows the problem (or a minimal one), what you expected, and what happened. You will get a reply within a week.

## Scope

This repository: the `tokenwire-action` GitHub Action — `action.yml`, the files it runs, and its own workflows. Problems in the tokenwire CLI itself belong in [rajanaggarwal11/tokenwire](https://github.com/rajanaggarwal11/tokenwire).

Examples that are in scope: the job token reaching the scenario, a pull request getting past the check without the baseline it is compared against, the action editing a comment it did not post, output or summary injection.

## Supported versions

The latest major version (`v1`). Fixes ship as a new v1 release; older tags are not patched.
