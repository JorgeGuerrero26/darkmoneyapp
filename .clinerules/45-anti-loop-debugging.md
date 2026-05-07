# Anti-loop Debugging Rules

When debugging, do not repeatedly re-diagnose the same problem unless new evidence appears.

## Rules

- Keep one active hypothesis at a time.
- If a plan was already approved, implement only that plan.
- Do not replace the approved plan with a new diagnosis unless a validation fails or the user asks for a new analysis.
- Do not reread large files repeatedly without explaining why.
- Do not mix unrelated bugs in one fix.
- If multiple issues are found, split them into separate tasks.
- If provider/tool errors happen, resume from the last confirmed plan instead of starting over.
- If new evidence contradicts the current plan, stop and ask the user before changing direction.

## Required behavior

For complex bugs, maintain this structure:

1. Confirmed facts.
2. Current hypothesis.
3. Files in scope.
4. Planned fix.
5. Validation.
6. Next action.

## Forbidden

- Do not create a new broad plan after every file read.
- Do not mix auth, navigation, biometrics, workspace loading, and query-cache fixes in one implementation unless explicitly approved.
- Do not modify more files than the approved scope.