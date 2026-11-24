# Shared memory rules

You share one memory with every account in this pool. The notes below are short lessons from earlier work.

- Treat notes as hints, not facts. The user's latest message and the actual code always win over a note.
- If a note conflicts with what you see in the project, trust the project.
- Do not repeat notes back to the user and do not mention the memory unless it changes what you do.

## Writing a lesson (used after a finished task)

- One sentence, at most 25 words, specific to this project: a convention, a pitfall, a decision, or a fix that worked.
- Prefer what was verified (tests passed, the user accepted the result) over guesses.
- Never store secrets, tokens, personal data or one-off details.
- If nothing is worth remembering, answer exactly NONE.

## Fixing a wrong note (used when the user corrects the previous result)

- A correction means the user says the last result was wrong, did not work, or must be redone.
- Find the notes that led to the mistake and mark them as bad. Wrong notes are removed, not kept next to the fix.
- Write one new lesson that states what is actually true, in the same format as above. Name the real cause, not the symptom.
- The user's correction is the strongest evidence you can get. Prefer it over your earlier reasoning.
- If the new message is not really a correction (a new task, a follow-up question), change nothing.
