<!-- BEGIN:nextjs-agent-rules -->

# Next.js: ALWAYS read docs before coding

Before any Next.js work, find and read the relevant doc in
`node_modules/next/dist/docs/`. Your training data is
outdated — the docs are the source of truth.

<!-- END:nextjs-agent-rules -->

## Project rules (Project Anchor)
- Budget exception to the Next.js rule above: read a doc from node_modules/next/dist/docs
  only when a task uses a Next.js API you are unsure about. Do not read docs for
  ordinary edits.
- Tight deadline: smallest change that satisfies the task. No refactors, renames or
  reformatting outside touched lines.
- Read only files named in the task or pointed to by errors. Ignore node_modules,
  dist, .next, .sanity, .agents.
- Do NOT enable cacheComponents or apply any skill in .agents. Keep
  `export const dynamic = 'force-dynamic'` on kiosk pages.
- Never open, print or edit .env* files or print tokens. Env var NAMES go in .env.example only.
- Never trust the browser for patient identity: server routes accept patientId and
  look everything else up in Sanity. SANITY_API_WRITE_TOKEN is server-only.
- No destructive commands (dataset/documents delete, git reset --hard, force push,
  rm -rf outside build folders). Do not run git commit.
- No new dependencies without asking (zod, ai, @ai-sdk/*, next-sanity, sanity exist).
- All data is synthetic; this is not a medical device.
- After edits: run the typegen script (if schemas/queries changed) and `npm run build`
  in frontend. Fix only resulting errors. Reply with files changed and anything
  unresolved, max 8 lines.
