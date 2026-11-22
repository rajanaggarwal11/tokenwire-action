# The comment tokenwire-action keeps up to date: it starts with the marker AND was posted
# by the identity the action posts as. Run per page of
# GET /repos/{owner}/{repo}/issues/{number}/comments, with TW_MARKER and TW_AUTHOR set.
.[]
| select(.user.login == env.TW_AUTHOR and ((.body // "") | startswith(env.TW_MARKER)))
| .id
