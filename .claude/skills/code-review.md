---
name: code-review
description: Review staged git changes against project conventions. Use when the user says /review, "review my code", or "check this".
---

## Code Review

Review staged changes against CLAUDE.md conventions and security best practices.

### Steps

1. Read `CLAUDE.md` to load current project conventions.

2. Run `git diff --cached` to get staged changes.

3. If nothing is staged, run `git diff` and review unstaged changes instead.

4. Check each changed file against these criteria:

   **Conventions (from CLAUDE.md):**
   - Type hints on all function signatures
   - Pydantic models for API request/response schemas
   - Async endpoints (not sync)
   - Absolute imports, properly grouped
   - Snake_case for JSON fields
   - API error format matches convention

   **Security (OWASP Top 10):**
   - No SQL injection (use parameterized queries)
   - No hardcoded secrets or credentials
   - Input validation on all endpoints
   - No unsafe deserialization
   - Proper authentication/authorization checks

   **Code Quality:**
   - No unused imports or variables
   - No commented-out code blocks
   - Functions under 50 lines
   - Clear naming (no abbreviations)

5. Report findings grouped by severity:
   - **BLOCK:** Must fix before merge (security issues, convention violations)
   - **WARN:** Should fix (code quality, minor issues)
   - **NOTE:** Optional improvements

### Rules
- Be specific: quote the line and explain why it's an issue
- Suggest the fix, don't just flag the problem
- If no issues found, say so clearly
