---
name: commit-and-push
description: Run tests, stage changes, generate a conventional commit message, and push. Use when the user says /ship, "ship it", or "commit and push".
---

## Commit and Push

Test, commit, and push changes in one workflow.

### Steps

1. **Run tests first:**
   ```bash
   python -m pytest tests/ -v --tb=short
   ```
   If tests fail: STOP. Report failures. Do not commit.

2. **Check what changed:**
   ```bash
   git status
   git diff
   ```

3. **Stage relevant files:**
   - Stage only files related to the current work
   - Never stage `.env`, credentials, or secrets
   - Never use `git add -A` — be explicit about what's staged

4. **Generate commit message:**
   Use conventional commits format:
   - `feat:` — new feature
   - `fix:` — bug fix
   - `docs:` — documentation
   - `test:` — tests
   - `refactor:` — code restructuring
   - `chore:` — maintenance

   Message should be 1-2 sentences focused on the "why".

5. **Commit:**
   ```bash
   git commit -m "<type>: <description>"
   ```

6. **Push:**
   ```bash
   git push origin HEAD
   ```
   If the remote branch doesn't exist yet, use `git push -u origin HEAD`.

### Rules
- NEVER commit if tests fail
- NEVER use `--no-verify` or `--force`
- NEVER commit secrets or `.env` files
- Ask the user before force-pushing
- If pre-commit hooks fail, fix the issue and create a NEW commit (don't amend)
