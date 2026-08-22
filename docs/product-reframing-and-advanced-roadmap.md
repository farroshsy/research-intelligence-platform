# Product Reframing: From Change Monitoring to Evidence-to-Decision Intelligence

## 1. The actual problem to solve

The current product is strong at the **detection layer**: it can monitor approved sources, retain evidence, classify deterministic changes, preserve review history, and alert an owner after confirmation. However, the user’s real-life problem is larger than noticing a changed page.

> The real job is to convert fragmented external signals into timely, trustworthy decisions with enough evidence to explain *why* a decision is justified.

The platform should therefore become an **evidence-to-decision intelligence system**. Monitoring is one input layer, not the product’s final outcome.

| Current question | Better decision-oriented question |
|---|---|
| “What changed?” | “What changed, why does it matter, who owns the next step, and when is a decision due?” |
| “Did the source fail?” | “Is the evidence reliable enough to act on, and what other sources support or contradict it?” |
| “Should I receive an alert?” | “Is this signal novel, urgent, relevant to my current objectives, and worthy of interruption?” |
| “Can I export the change?” | “Can I produce an auditable brief that a stakeholder can act on without redoing the research?” |

## 2. Target user workflow

The system should support a repeatable five-stage workflow.

| Stage | User need | Platform outcome |
|---|---|---|
| **Frame** | Define an objective, watchlist, decision horizon, and materiality policy. | A research mission with sources, entities, questions, owners, and deadlines. |
| **Observe** | Collect permitted public signals and preserve them. | Time-stamped observations, evidence artifacts, source health, and provenance. |
| **Interpret** | Understand whether several signals describe the same development. | Clustered events, entity links, novelty scoring, confidence, and contradiction flags. |
| **Decide** | Evaluate impact and determine a next step. | A decision card containing evidence, rationale, alternatives, owner, deadline, and review status. |
| **Learn** | Improve signal quality and prioritization over time. | Feedback on useful alerts, false positives, missed developments, response time, and source trust. |

## 3. Product thesis

The platform should optimize for four measurable outcomes:

1. **Time to awareness:** how quickly a meaningful external development reaches a human reviewer.
2. **Time to decision:** how quickly a reviewer can move from signal to evidence-backed next action.
3. **Signal precision:** the proportion of surfaced items that users deem relevant or actionable.
4. **Decision defensibility:** the proportion of decisions with an explicit evidence chain, ownership, and recorded rationale.

This creates a clearer product promise:

> **“Turn changing external information into evidence-backed decisions before the decision window closes.”**

## 4. Recommended advanced capability model

### A. Research missions and decision briefs — highest priority

Replace isolated sources with **research missions**. A mission represents a concrete outcome such as “track APJ early-career cloud roles,” “monitor Indonesian procurement opportunities,” or “watch policy changes affecting a client sector.”

Each mission should define a decision question, entities of interest, watchlist, keywords, owner, materiality logic, deadline, and stakeholder audience. Material events can then be compiled into a structured **decision brief** rather than a generic change report.

| Brief section | Purpose |
|---|---|
| Executive signal | What happened and why it is urgent or not urgent. |
| Evidence ledger | Exact supporting and contradicting sources, timestamps, hashes, and excerpts. |
| Impact assessment | Who or what is affected, with explicit assumptions. |
| Options | Human-authored or advisory options; no automated decision. |
| Recommendation status | Draft, under review, approved, deferred, or closed. |
| Owner and deadline | Named human accountability and decision horizon. |

### B. Entity and relationship intelligence — high priority

Introduce a user-governed **entity graph** linking organizations, people, programmes, topics, locations, regulations, skills, and opportunities. The graph should not infer high-stakes facts without a human-facing evidence trail.

This enables questions such as “show all changes related to AWS Indonesia, early-career hiring, cloud skills, and Jakarta” or “which policy changes affect companies in my watchlist?” The platform should display a relationship only with the source evidence that supports it and permit users to confirm, dismiss, or annotate the connection.

### C. Confidence and provenance engine — high priority

The current raw/normalized/diff evidence model is a strong foundation. The next level is an explicit **claim ledger**:

| Confidence input | Example |
|---|---|
| Source authority | Official regulator or company page vs. unauthenticated commentary. |
| Freshness | Whether evidence is current relative to the decision deadline. |
| Corroboration | Independent sources confirming the same claim. |
| Contradiction | Evidence that challenges or changes the claim. |
| Extraction quality | Parser success, stable selector, and directness of excerpt. |
| Human assessment | Reviewer marks evidence as trusted, uncertain, or rejected. |

The system should show confidence as an **explainable composition**, never as a hidden or unsupported score.

### D. Semantic event clustering and novelty control — high priority

Monitoring systems create duplication: one real development can affect an API, RSS feed, documentation page, press release, and social post. An advanced intelligence system needs a **cluster layer** that groups related events while retaining every original artifact.

The clustering model should use deterministic fields first—source, entity, changed fields, dates, tags—and optional advisory semantic similarity second. A reviewer should be able to split or merge clusters and record the reason. Novelty scoring should down-rank repeated known information and elevate new, corroborated, or deadline-sensitive developments.

### E. Retrieval-assisted investigation — medium priority

After the evidence model is mature, add a constrained research assistant that answers questions only from the user’s preserved evidence and clearly cited permitted sources. It should support retrieval-assisted tasks such as:

- “Summarize all material changes to this mission in the last 14 days.”
- “What evidence supports the claim that this opportunity has moved to a new stage?”
- “Which sources disagree about this policy change?”
- “Draft a stakeholder brief from confirmed evidence only.”

The assistant must distinguish direct evidence, reasonable inference, unknowns, and user-entered assumptions. It must not invent sources, write directly to action systems, or bypass review.

### F. Decision workflow and outcome learning — medium priority

Add **decision cards** attached to missions and clusters. A card captures the decision, alternatives, selected next step, accountable owner, deadline, expected outcome, and eventual result. Outcome feedback then improves source ranking and alert rules without turning the system into an opaque autonomous agent.

### G. Advanced operational features — later

These capabilities become valuable after the core mission-to-decision workflow is adopted:

| Capability | Why later |
|---|---|
| Source trust calibration | Requires enough review feedback to be meaningful. |
| Team roles and approvals | Useful once several users collaborate on the same missions. |
| External system integrations | Should follow a stable decision workflow, not precede it. |
| Graph visualizations | Valuable only after entity links are governed and useful. |
| Programmatic API/MCP access | Best added when the core data model has stabilized. |

## 5. What not to build yet

Avoid features that look sophisticated but weaken focus:

- Fully autonomous web research or automatic decisions.
- An uncontrolled general-purpose chatbot with no evidence boundaries.
- Dozens of integrations before a mission and decision workflow exists.
- Generic dashboards that are not tied to a research objective or decision deadline.
- Black-box confidence scores without source-level explanation.

## 6. Recommended build sequence

| Release | Core capability | Value created |
|---|---|---|
| **R1: Mission control** | Research missions, entity watchlists, decision questions, owners, deadlines, mission-level briefs. | Connects monitoring to a purpose. |
| **R2: Evidence intelligence** | Claim ledger, corroboration/contradiction, confidence explanations, event clusters. | Makes findings defensible and reduces noise. |
| **R3: Decision workflow** | Decision cards, assignments, review states, outcome feedback. | Converts insight into accountable action. |
| **R4: Retrieval assistance** | Evidence-bounded question answering and cited draft briefs. | Accelerates synthesis without bypassing judgment. |
| **R5: Team scale** | Roles, approval gates, programmatic access, calibrated source trust. | Supports repeatable team research operations. |

## 7. A concrete initial mission

The most useful initial mission should be selected from a genuine recurring workflow. Two strong candidates from the current project context are:

| Mission | Decision it supports | Initial evidence sources |
|---|---|---|
| **Cloud career opportunity intelligence** | Which role, company, skill gap, or application action deserves priority this week? | Official company careers pages, job descriptions, public engineering blogs, selected official programme pages. |
| **Indonesia procurement and policy intelligence** | Which public opportunity or policy development requires a research brief, qualification review, or response? | Official procurement portals, regulator notices, ministry releases, documented public feeds. |

Start with one mission. The platform can later support both without diluting the initial product learning.

## 8. Decision requested before further implementation

Confirm the primary mission the system should optimize for first, then choose the first advanced capability bundle:

| Choice | Recommended bundle |
|---|---|
| **A. Career intelligence** | Missions, role/company/skill entities, evidence briefs, deadline and application action cards. |
| **B. Procurement and policy intelligence** | Missions, organization/regulation/opportunity entities, corroboration, qualification gates, decision briefs. |
| **C. General research intelligence** | Generic missions and evidence briefs first; domain-specific models deferred. |

My recommendation is **C as the platform core**, with **A or B as the first real mission template**. This preserves reusability while keeping the first deployment grounded in an actual decision loop.
