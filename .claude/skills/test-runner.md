---
name: test-runner
description: Run pytest with coverage and report results clearly. Use when the user says /test, "run tests", or after writing code.
---

## Test Runner

Run the project test suite and report results.

### Steps

1. Run pytest with coverage:
   ```bash
   python -m pytest tests/ -v --tb=short --cov=src --cov-report=term-missing
   ```

2. If tests **pass**: Report summary (X passed, coverage %).

3. If tests **fail**:
   - List each failing test with the assertion error
   - Show the relevant source code around the failure
   - Suggest a fix for each failure
   - Do NOT proceed with other work until failures are addressed

4. If **no tests exist** yet: Report "No tests found" and suggest creating a test file.

### Rules
- Never skip or ignore failing tests
- Never mark tests as `@pytest.mark.skip` to make the suite pass
- If coverage drops below 80%, warn the user
