# Worktree Workflow — Parallel Development with Claude Code

## Why Worktrees?

Git worktrees let you have multiple working copies of your repo, each on a different branch, in separate directories. Combined with Claude Code, this unlocks parallel development:

- **Isolation** — each worktree has its own branch and working state
- **Parallel sessions** — run 3-5 Claude sessions simultaneously on independent tasks
- **No context bleed** — each Claude session only sees its own worktree

## Quick Start

```bash
# Start a new worktree session (creates branch + directory automatically)
claude --worktree feature-auth

# In a separate terminal, start another
claude --worktree feature-api-endpoints

# And another
claude --worktree bugfix-login-error
```

## The Parallel Pattern

Run 3-5 terminal tabs, each with its own Claude worktree session:

| Terminal | Worktree | Task |
|----------|----------|------|
| 1 | feature-auth | Authentication system |
| 2 | feature-api | API endpoints |
| 3 | feature-viz | 3D visualization |
| 4 | bugfix-123 | Bug fix from issue #123 |
| 5 | refactor-models | ML model refactor |

**Tip:** Number your terminal tabs 1-5. Enable system notifications so you know when a Claude session needs your input.

## Naming Convention

- `feature-*` — new functionality
- `bugfix-*` — bug fixes (use issue number if available)
- `refactor-*` — code restructuring
- `docs-*` — documentation updates
- `test-*` — test additions

## Merging Back

When a worktree task is done:

1. In the worktree session, run tests: `/test`
2. Review changes: `/review`
3. Commit and push: `/ship`
4. Create a PR or merge to main
5. Claude Code will prompt you to clean up the worktree on session exit

## Tips

- **Start with plan mode** for complex tasks — invest in the plan so Claude can 1-shot the implementation
- **Use subagents** — append "use subagents" to requests where you want Claude to parallelize work
- **Update CLAUDE.md** — after every correction, tell Claude: "Update CLAUDE.md so you don't make that mistake again"
- **Voice dictation** — you speak 3x faster than you type, and prompts get more detailed
- **Challenge Claude** — say "Grill me on these changes" to make Claude act as your reviewer
