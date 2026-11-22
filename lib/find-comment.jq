# The comment tokenwire-action keeps up to date: it starts with the marker AND was posted
# by the identity the action posts as (TW_AUTHOR), or, when that is unknown (empty), by a
# bot. Run per page of GET /repos/{owner}/{repo}/issues/{number}/comments, with TW_MARKER
# and TW_AUTHOR in the environment.
.[]
| select(
    ((.body // "") | startswith(env.TW_MARKER))
    and (if (env.TW_AUTHOR // "") != "" then .user.login == env.TW_AUTHOR else .user.type == "Bot" end)
  )
| .id
