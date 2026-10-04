# Project Anchor

An ambient care companion for people living with dementia, built on Sanity.

Anchor shows a patient a calm bedside kiosk with their daily routine, familiar faces and a gentle AI companion. When the companion senses distress or an emergency, it raises an alert. A **workflow stored next to the content** drafts a briefing, and a family caregiver reviews it, approves it or sends it back.

| | |
|---|---|
| **Live app** | https://project-anchor-one.vercel.app/kiosk |
| **Sanity Studio** | https://www.sanity.io/@oky0bdg3q/studio/osxe94h1xsq6ws70jhwlhigy/default |
| **Sanity project** | `t3retdwe` (dataset `production`) |
| **Repository** | https://github.com/pradeepdepuru/project-anchor |

> All patients, families and stories in this project are fictional demo data. Anchor is not a medical device and never diagnoses or gives medical advice.

## What it does

- **Patient kiosk** (`/kiosk/<patient>`): a greeting, today's chores shown as numbered steps with safety notes, the Anchor companion (text and optional voice), and *Memory spark*, a gentle face-and-name game that logs each session.
- **Care directory** (`/kiosk`): live counts and a card for every patient, family member and caregiver.
- **Caregiver profiles**: who they are, which patient they support, and the memory stories Anchor uses to ground and reassure.
- **Caregiver alerts** (`/caregiver/alerts`): signed-in caregivers see alerts Anchor raised, with Anchor's briefing and a suggested response. They take an alert, then approve it or send it back with a reason.
- **Studio-controlled UI**: the Kiosk Settings document switches the whole kiosk between dark, light and high-contrast themes, toggles the chat companion and sets a custom welcome line, with no code change.

## How it uses Sanity

1. **A structured content graph.** Patients, caregivers, chores, medication orders, visits, alerts and memory stories are separate documents linked by references (see the content model below). Anchor answers by traversing those links, not by searching text.
2. **Content that carries meaning, not just text.** A `visit` links a patient to a visitor and can be *cancelled*. A `medicationOrder` can *supersede* an older order, so the current order is the one no newer effective order replaces. Chores carry safety parameters (priority, assistance level, supervision, precautions). These are relationships and states an agent can reason over, and a keyword search cannot.
3. **An agent grounded through the Sanity Context MCP.** Anchor queries the dataset with `groq_query` through the Context MCP. A question like *"Who is visiting me today, and how do I know them?"* joins visits, people and memories. Each turn is logged to **Anchor Log** with the question, the answer, the GROQ queries run and the documents read.
4. **A process modeled as data.** The `alert-response` workflow (Sanity Workflows) moves each alert through `raised → review → resolved`, with a rejection loop back to Anchor. The agent and the caregiver trigger the same transitions, and the stage history is stored with the content.
5. **Live content.** Pages update when content is published, using `next-sanity` live (`<SanityLive />`).
6. **Studio as the control panel.** A settings document that drives the UI, a curated desk structure, a custom *Verify Completion* document action on chores (a caregiver confirms a completion the patient reported), read-only agent fields on alerts, and typed queries (`sanity typegen`).

## Content model

| Document | Purpose | Key fields |
|---|---|---|
| `person` | Patients, family and caregivers | `isPatient`, `relationship`, `patient` (reference), `phoneNumber`, `picture`, `coreMemories[]` (title, story, era), `slug` (patients) |
| `dailyChore` | A patient's task | `patient`, `scheduledTime`, `timeOfDay`, `instructions`, `safetyParameters` (supervision, assistance level, priority, notes), `completions[]` |
| `medicationOrder` | Prescription instructions with versioning | `patient`, `name`, `dosage`, `steps[]`, `effectiveFrom`, `supersedes` (reference to the older order), `changeNote` |
| `visit` | Who is coming and when | `patient`, `visitor`, `start`, `end`, `purpose`, `status` (scheduled or cancelled) |
| `careAlert` | An alert that needs a human | `patient`, `type`, `description`, `status`, `raisedAt`, `source`, `acknowledgedBy`, `workflowInstanceId`, `agentBriefing`, `suggestedResponse` |
| `anchorLog` | One record per companion turn | `patient`, `askedAt`, `question`, `answer`, `queries[]`, `sourceIds[]`, `safeMode`, `alertRaised` |
| `cognitiveLog` | Memory-game sessions | `patient`, `quizDate`, `gameType`, `score`, `accuracyRate`, `patientResponseState`, `caregiverNotes` |
| `kioskSettings` | Controls the kiosk | `showChatCompanion`, `kioskTheme`, `customWelcomeText` |

## How Anchor works

The agent endpoint is `frontend/app/api/agent/route.ts`.

- The browser sends only `{ patientId, messages, timeZone }`. The server resolves the patient's name, caregiver, clock and records from Sanity, so the client cannot inject facts or system messages.
- It connects to the Sanity Context MCP and gives the model the `groq_query` tool plus an `alert_caregiver` tool. If the MCP is unreachable, Anchor falls into **safe mode**: it may comfort the patient but must not state facts about them.
- `alert_caregiver` creates a `careAlert` (`medical_emergency`, `safety_hazard` or `distress`). The patient comes from the server, so the model cannot raise an alert for someone else. Duplicate alerts of the same type within 10 minutes are ignored.
- After the reply, a new alert starts an `alert-response` workflow instance. Anchor drafts a briefing and a suggested response from the conversation and the patient's memory anchors, then submits it, which moves the instance to caregiver review.
- Sending an alert back fires `reject` with the caregiver's reason, and Anchor redrafts the briefing with a 15 second limit, falling back to the previous draft plus the feedback.

## The alert-response workflow

Defined in `studio/workflows/alert-response.ts` and deployed with `studio/sanity.workflow.ts`.

```
raised --(Anchor submits briefing)--> review --(caregiver approves)--> resolved
  ^                                      |
  +--------(caregiver sends back)--------+
```

Caregivers act from `/caregiver/alerts`. The caregiver's name travels as an action parameter, and the full history of an instance can be inspected with `sanity-workflows show <instance-id>`.

## Repository layout

```
frontend/   Next.js app (App Router, Tailwind CSS)
  app/(patient)/kiosk/       directory, patient kiosk, caregiver profile, Memory spark
  app/caregiver/alerts/      caregiver sign-in and pending alerts
  app/api/agent/             Anchor agent endpoint
  app/api/alerts/[id]/       claim / approve / send back
  app/api/chores/complete/   chore completion
  sanity/lib/                clients, queries, workflow engine helper, agent prompt
studio/     Sanity Studio
  src/schemaTypes/           document, object and singleton schemas
  src/structure/             desk structure
  src/presentation/          Presentation tool resolvers
  workflows/                 alert-response workflow definition
  sanity.workflow.ts         workflow deployment config
sanity.schema.json           extracted schema, read by `sanity typegen`
```

The `page` and `post` documents and the `/[slug]` and `/posts/[slug]` routes come from the Sanity Next.js starter template and are not part of the care experience.

## Local setup

**Prerequisites:** Node.js 20.12 or newer (22 LTS recommended), npm, a Sanity account, an OpenRouter API key.

```bash
git clone https://github.com/pradeepdepuru/project-anchor.git
cd project-anchor
npm install        # installs both workspaces; .npmrc sets legacy-peer-deps (see Known limitations)
```

### 1. Frontend environment

Create `frontend/.env.local`. Never commit this file.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SANITY_PROJECT_ID` | Sanity project ID (`t3retdwe`) |
| `NEXT_PUBLIC_SANITY_DATASET` | Dataset (`production`) |
| `NEXT_PUBLIC_SANITY_API_VERSION` | Sanity API version |
| `NEXT_PUBLIC_SANITY_STUDIO_URL` | Studio URL used by "Open Studio" links |
| `SANITY_API_READ_TOKEN` | Viewer token for reads |
| `SANITY_API_WRITE_TOKEN` | Editor token for alerts, logs and workflow instances |
| `SANITY_CONTEXT_MCP_URL` | Your project's Sanity Context MCP endpoint |
| `OPENROUTER_API_KEY` | Model access for Anchor |
| `OPENROUTER_MODEL` | Model ID to use on OpenRouter |
| `CAREGIVER_PASSCODE` | Shared passcode for the caregiver alerts page |
| `ANCHOR_TIMEZONE` | Optional fallback time zone for Anchor |

### 2. Studio environment (optional)

The Studio works without any environment file, using these defaults. Override them in `studio/.env` if needed.

| Variable | Default |
|---|---|
| `SANITY_STUDIO_PROJECT_ID` | `t3retdwe` |
| `SANITY_STUDIO_DATASET` | `production` |
| `SANITY_STUDIO_PREVIEW_URL` | `http://localhost:3000/kiosk` |
| `SANITY_STUDIO_TITLE` | `Project Anchor Studio` |

### 3. Run

```bash
npm run dev        # from the repo root: starts the frontend (3000) and Studio (3333) with Turborepo
```

Or run them separately: `npm run dev:next` and `npm run dev:studio`. Before each start, both regenerate the schema and Sanity types. `npm run build` in `frontend/` also runs `sanity typegen generate` first.

To publish Studio changes to the hosted Studio: `cd studio && npm run deploy`.

### 4. Workflow

```bash
cd studio
npx sanity-workflows deploy --check    # validate only, no dataset access
npx sanity-workflows deploy            # publish the definition
```

### 5. Content

In Studio, create patients and caregivers (link each caregiver to a patient), add chores, memory stories, visits and medication orders, and set Kiosk Settings. Publish documents so the frontend can read them.

## Try it

1. Open `/kiosk` and choose a patient. Ask Anchor *"Who is visiting me today?"*
2. Say *"I feel dizzy and my chest hurts."* Anchor replies calmly and raises a medical-emergency alert.
3. Open `/caregiver/alerts`, sign in with the demo passcode, and take the alert. Read Anchor's briefing, then send it back with a reason or approve it.
4. In Studio, open **Kiosk Settings**, change the theme to Light, click **Publish**, and refresh the kiosk.
5. In Studio, set a visit to **Cancelled** and publish. Ask Anchor *"Who is visiting me today?"* again. The cancelled visitor should no longer be mentioned.
6. Create a medication order that **supersedes** the current one, with different steps, and publish. Ask Anchor how to take the medication. It should read the new steps.

Demo sign-in (for alerts): `Emily Miller` with passcode `Test1234`.

## Deploying

The frontend is deployed on Vercel from this repository; pushes to `main` deploy automatically. Set the same environment variables in Vercel, and add the deployment domain to the project's CORS origins in Sanity (API settings) so live updates work. When deploying the Studio, set `SANITY_STUDIO_PREVIEW_URL` to the live app (for example `https://<YOUR-VERCEL-URL>/kiosk`) so the Presentation tool does not point at localhost.

## Known limitations

- **Workflows is a prerelease.** Expect API changes. The definition is at version 2.
- **Caregiver sign-in is demo-grade:** a shared family passcode plus a chosen name, not production authentication.
- **Review UI is custom.** The Sanity Workflows Studio plugin needs a newer Studio than this project uses, so approvals happen on `/caregiver/alerts`.
- **Peer dependencies.** The workflow packages declare an optional TypeScript peer that conflicts with this project's version, so installs use `legacy-peer-deps`. The workflow CLI's inspection commands (`show`, `fire-action`) also need a newer `@sanity/cli-core` than Studio, so install the CLI in a separate folder if you want them.
- **The alerts page** uses its own fixed dark palette and does not follow the Kiosk Settings theme.
- **Not built yet:** an App SDK dashboard, a "release this alert" transition, and a resolved-alerts history view.

## Tech stack

Next.js 16 (App Router), React 19, Tailwind CSS 4, Sanity Studio 5 and Content Lake, Sanity Context MCP, Sanity Workflows, `next-sanity` live content, Vercel AI SDK with OpenRouter, Turborepo, deployed on Vercel.
