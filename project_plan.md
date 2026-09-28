# 📋 Project Plan: Project EchoAid (Sanity Challenge Submission)

### 🚀 Vision Statement
**Project EchoAid** transforms Sanity from a traditional headless CMS into a secure, real-time **Personal Identity & Care Repository** for dementia care management. By combining a highly structured content backend with local agent intelligence and an ambient, low-friction frontend kiosk, the system acts as a patient's personalized "External Brain."

---

## 🛠️ The Technical Stack & Challenge Alignment

| Component | Technical Layer | Challenge Path Alignment |
| :--- | :--- | :--- |
| **The External Brain** | Sanity Content Lake | Foundation for both paths. |
| **The Intelligent Care Companion** | Sanity Context MCP Endpoint | **Path 1**: Strict GROQ-driven contextual query answering without hallucination. |
| **Family Caregiver Portal** | Sanity App SDK Custom Workspace | **Path 2**: Custom schema setup, custom media manager components, and human-in-the-loop validation. |
| **The Patient Lifeline Workflows** | Sanity Document Workflows | **Path 2**: Modeling patient daily routine states (`[Medication Scheduled]` ➡️ `[Taken]` ➡️ `[Missed/Escalated]`) as live data fields. |
| **The Ambient Day Kiosk** | Next.js App Router App | Content-rich frontend utilizing the Vercel AI SDK and real-time content streaming. |

---

## 🏗️ Technical Architecture & Mileposts

### Phase 1: Local Monorepo Setup & Unified Bootstrapping
*   Initialize a combined Next.js and embedded Sanity workspace using the template installer:
    ```bash
    npm create sanity@latest -- --template nextjs --typescript
    ```
*   Configure environment files (`.env.local`) with read/write API tokens, project IDs, and model connection strings.

### Phase 2: Schema Architecture Definition (`/schemaTypes`)
*   `familyMember.ts`: Standardizes fields for relative names, exact relationships, bio snippets, chronological memories, and high-fidelity face portrait assets.
*   `dailyChore.ts`: Structured scheduling object mapping timestamped care events (Medication, Hydration, Doctor visits) alongside critical boolean safety gates.
*   `cognitiveLog.ts`: Logs interactive puzzle or micro-quiz outputs, tracking cognitive fluctuations for automated caregiver insight alerts.

### Phase 3: The Path 1 MCP Intelligent Companion Layer
*   Spin up the **Sanity Context MCP Server** mapped to the production care dataset.
*   Configure explicit, hard-predicate GROQ queries to answer recurring patient prompts safely:
    *   *Constraint verification:* Check the user's specific calendar slice using `dateTime(now())` to provide accurate routing answers instead of fuzzy, estimated vector searches.
*   Draft specialized system prompts that enforce absolute factual correctness and warm, empathetic, low-panic tones.

### Phase 4: The Path 2 Custom App SDK & Patient Interface
*   **The App Studio Builder:** Design a simplified media ingestion view for family members to tag memories, record audio voiceovers, and schedule care routines.
*   **The Ambient Patient Kiosk:** Create a distraction-free, large-font Next.js dashboard template that alternates between real-time calendar cards, chore checkmarks, and visual memory triggers.
*   **The "Cognitive Spark" Component:** Vibe-code the specialized interactive quiz engine that generates questions from structured `familyMember` data nodes.

---

## 📦 Project Directory Layout Blueprint

```text
project-echoaid/
├── app/
│   ├── (caregiver)/
│   │   └── portal/               # Dashboard for family uploads/management
│   ├── (patient)/
│   │   └── kiosk/                # Low-stimulation ambient screen layout
│   ├── api/
│   │   └── agent/
│   │       └── route.ts          # Vercel AI SDK + Sanity Context endpoint
│   └── studio/
│       └── [[...index]]/         # Embedded Sanity Studio App SDK canvas
├── schemaTypes/
│   ├── familyMember.ts           # Schema for relatives and tagged memories
│   ├── dailyChore.ts             # Schema for schedule logs and medical rules
│   └── cognitiveLog.ts           # Schema capturing performance analytics
├── sanity.config.ts              # Core initialization setup
└── package.json                  # Dependencies
```
---

<FollowUp>
Now that our tactical project blueprint is securely saved, let's write out the **TypeScript file configurations** to build the database foundation. 

Would you like to start by generating the complete contents for **`familyMember.ts` and `dailyChore.ts` schemas**, or should we construct the **Next.js file layout** first?
</FollowUp>
