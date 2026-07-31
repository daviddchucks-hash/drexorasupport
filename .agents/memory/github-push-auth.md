---
name: GitHub push authentication
description: Authenticated GitHub pushes may require an ephemeral token URL even when API bearer authentication works.
---

For GitHub repository pushes in this workspace, use the configured GitHub secret through an ephemeral `https://x-access-token:TOKEN@github.com/owner/repo.git` remote rather than writing credentials to git config. If the remote already has an initial commit, fetch and merge it with `--allow-unrelated-histories` before pushing.

**Why:** GitHub API authentication succeeded while the Git `http.extraheader` form was rejected, and the target repository already contained an unrelated initial commit.

**How to apply:** Keep the token out of files and permanent remotes; verify the remote head after pushing.