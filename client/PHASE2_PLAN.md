# Hermes Desktop Phase 2 Plan

## Goal
Phase 2 turns the desktop client from a Codex-inspired shell into a Hermes-native workspace.

The objective is to make the desktop app the best interface for Hermes-Agent's actual strengths:
- tool execution and approvals
- session continuity and search
- skills and automation workflows
- cross-platform gateway continuity
- flexible execution backends and safety controls
- workspace-aware coding sessions
- change review and result inspection

Phase 2 should move the client from "usable prototype" to "clear product direction with complete core workflows".

## Hermes-Native Differentiators
The roadmap should explicitly lean into the areas where Hermes is broader than a typical coding desktop client.

### 1. Closed Learning Loop
Hermes already has:
- persistent file-backed memory (`MEMORY.md`, `USER.md`)
- session recall via SQLite + FTS5
- autonomous skill creation and reuse
- skill self-improvement during use

Desktop implication:
- `Skills`, `Memory`, and `Search` should be primary surfaces, not buried settings.

### 2. Multi-Surface Continuity
Hermes is already built around CLI plus gateway surfaces like Telegram, Discord, Slack, WhatsApp, Signal, and Email.

Desktop implication:
- threads should eventually carry source/origin metadata
- the desktop app should become a control plane for sessions that may continue outside the desktop UI

### 3. Automation with Delivery
Hermes cron is not just local scheduling. Jobs can run with skills and auto-deliver to configured platforms.

Desktop implication:
- automations need status, destination, output preview, and attached-skill visibility

### 4. Execution Environments and Safety
Hermes supports multiple execution backends and a deeper safety model:
- local, Docker, SSH, Modal, Daytona, Singularity
- dangerous command approval
- smart approval mode
- isolated subagents and sandbox-backed processes

Desktop implication:
- runtime environment should eventually be visible per thread
- approval UI should expose risk reason and environment context

### 5. Parallelism and Delegation
Hermes supports isolated subagents, parallel tool execution, and mixture-of-agents style reasoning.

Desktop implication:
- the app should represent task structure and parallel progress, not only raw transcript text

### 6. Research / Training Orientation
Hermes is also research infrastructure:
- batch trajectory generation
- trajectory compression
- Atropos RL environments

Desktop implication:
- not a Phase 2 primary surface
- but architecture should leave room for future runs / evaluation views

## Product Direction
Phase 1 delivered:
- a desktop shell
- a Hermes sidecar runtime
- a three-column working layout
- transcript, session list, settings, and tool timeline basics

Phase 2 should deliver:
- a complete coding workflow
- a Hermes-specific feature surface
- inspector-driven task and change review
- better project/thread/workspace ergonomics

## Phase Structure
Phase 2 should be implemented in three milestones.

### Milestone 1
Close the core workflow around transcript, tool execution, approvals, and the inspector.

### Milestone 2
Expose Hermes-native capabilities: skills, search, memory visibility, automations, thread/source metadata.

### Milestone 3
Deepen the desktop experience: workspace maturity, environment awareness, persistent UI state, resizing, and richer top-bar state.

---

## Milestone 1: Inspector and Workflow Closure

### Objective
Turn the right panel into a real work surface and make each active turn reviewable and navigable.

### Scope

#### 1. Transcript Selection Model
Add selection state for transcript blocks:
- message block selection
- tool block selection
- future file/change block selection

Behavior:
- selecting a transcript block updates inspector mode
- selected state must be visually obvious
- selection should survive transcript re-render during streaming if the underlying item still exists

Renderer state additions:
- `selectedTranscriptItemId`
- `selectedTranscriptItemType`
- `inspectorMode`

#### 2. Inspector Modes
Implement explicit inspector modes:
- `empty`
- `tool_detail`
- `approval`
- `clarify`
- `changes_placeholder`
- `context`

Behavior:
- `approval` and `clarify` override passive modes while pending
- `tool_detail` shows currently selected or latest tool event
- `empty` is used when nothing is selected and no pending system interaction exists

#### 3. Tool Event Model Upgrade
Upgrade tool timeline from passive list to inspectable event stream.

Add event fields in UI state:
- `toolId`
- `toolName`
- `status`
- `preview`
- `argsSummary`
- `duration`
- `resultSummary`
- `errorSummary`
- `startedAt`

UI behaviors:
- clicking a tool event opens `tool_detail` mode
- latest active tool is highlighted when a run is in progress
- failed tools have a stronger error affordance

#### 4. Approval and Clarify Integration
Current modal flow remains, but Phase 2 should mirror it in the inspector.

Add:
- approval summary block in inspector
- full command text area
- risk/description area
- response controls: `once`, `session`, `always`, `deny`
- clarify prompt block with choice list or freeform reply area

Acceptance behavior:
- user can understand what Hermes is blocked on from the right panel alone
- modal and inspector states remain in sync

#### 5. Changes Placeholder
Before real diff integration, establish a proper changes-mode contract.

Add:
- top-level `changes` mode in inspector
- placeholder empty state for “No pending changes”
- placeholder populated state for future artifacts

This avoids redesigning the inspector again later.

### Runtime / Sidecar Changes
Milestone 1 does not require a full artifact system yet, but it should standardize tool payloads.

Add or formalize sidecar event payloads:
- `tool.started`
- `tool.completed`
- `tool.failed` or `tool.completed` with `is_error`
- `approval.requested`
- `clarify.requested`

Each tool event payload should include:
- `session_id`
- `tool_name`
- `preview`
- `args`
- `duration` when complete
- `is_error`

### UI Deliverables
- transcript items selectable
- inspector reflects selection
- tool timeline inspectable
- approval/clarify represented in inspector
- no hard dependency yet on actual file diff rendering

### Acceptance Criteria
- clicking a tool event changes the inspector content immediately
- pending approval clearly blocks the run visually
- clarify requests are reviewable and answerable from the right-side context
- no active turn leaves the right panel meaningless

### Test Cases
- select tool event -> inspector switches to tool detail
- approval request -> modal + inspector both update
- clarify request -> freeform / choice UI behaves correctly
- streaming transcript re-render does not lose current inspector mode unexpectedly

---

## Milestone 2: Hermes-Native Feature Surface

### Objective
Make the app clearly feel like Hermes rather than a generic coding shell.

### Scope

#### 1. Skills Area
Build a real `Skills` destination in the left rail.

Initial feature set:
- list installed skills
- show name, summary, source
- show whether a skill is already active in the current thread
- activate/inject a skill into the current thread

Deferred:
- install from hub
- enable/disable per platform
- skill editing

Runtime additions:
- `skills.list`
- `skills.activate`
- optionally `skills.current`

Renderer state additions:
- `skillList`
- `activeSkills`
- `selectedSkill`

#### 2. Search Area
Build a real `Search` destination backed by Hermes session recall.

Initial feature set:
- query input
- session/message results
- result type labels
- jump to thread
- highlight the selected result context

Runtime additions:
- `session.search`

Renderer state additions:
- `searchQuery`
- `searchResults`
- `searchLoading`

#### 3. Memory Visibility
Expose Hermes memory activity without turning the UI into a raw memory editor.

Initial feature set:
- show whether the current turn wrote memory
- distinguish built-in memory/profile from recalled session context
- optional compact “memory updated” activity chip in transcript or header

Runtime additions:
- `memory.status`
- `memory.events`

Renderer state additions:
- `memoryStatus`
- `memoryEvents`

#### 4. Automations Area
Build a real `Automations` destination.

Initial feature set:
- list jobs
- job state
- schedule summary
- delivery target summary
- attached skills summary
- last run status
- create / pause / resume / delete actions

Runtime additions:
- `automation.list`
- `automation.get`
- later: `automation.create`, `automation.update`, `automation.pause`, `automation.resume`, `automation.delete`

Renderer state additions:
- `automationList`
- `selectedAutomation`

#### 5. Thread Source Metadata
Hermes threads should begin reflecting their origin.

Initial feature set:
- source badge in thread list and thread header
- distinguish `desktop`, `cli`, `gateway`, `cron`
- future platform-specific rendering left for later

Runtime additions:
- `thread.meta`
- `thread.source`

Renderer state additions:
- `threadSource`

#### 6. Toolsets as Modes
Turn toolsets into a user-facing operating mode.

Initial feature set:
- thread-level toolset selection
- visible current mode
- simple preset labels

Suggested presets:
- Coding
- Research
- Browser
- Safe

### Acceptance Criteria
- a user can browse skills without dropping to CLI commands
- search is visible as a first-class product area
- automations feel like operational workflows, not hidden backend state
- thread origin and active toolset are visible in the UI

### Test Cases
- skills list renders and activation updates state
- search results open the expected thread
- automations list reflects pause/resume changes
- thread source badge renders correctly

---

## Milestone 3: Workspace Maturity and Desktop Depth

### Objective
Make the desktop shell feel stable, stateful, and native for long-lived Hermes use.

### Scope

#### 1. Workspace and Thread Ergonomics
Add:
- stronger repo / cwd / branch treatment
- workspace switching
- better thread grouping under workspaces
- improved top-bar context density

#### 2. Environment Awareness
Surface execution backend as part of thread state.

Initial feature set:
- environment indicator in header/settings
- read-only status for `local`, `docker`, `ssh`, `modal`, `daytona`, `singularity`
- environment-aware approval messaging later

Runtime additions:
- `environment.status`

Renderer state additions:
- `environmentStatus`

#### 3. Persisted UI State
Persist:
- left sidebar collapsed state
- right sidebar collapsed state
- selected nav destination
- later: inspector mode / panel width

#### 4. Resizable Layout
Add:
- draggable divider between transcript and inspector
- optionally draggable left rail width later

#### 5. Gateway / Delivery Groundwork
Do not build full channel management yet, but prepare for it.

Add:
- placeholder navigation destination for `Channels` or `Delivery`
- thread metadata hooks for future delivery target visibility

### Acceptance Criteria
- the app remains usable at narrower widths
- UI state survives reload/restart
- environment/source/workspace information feels native to the shell

### Test Cases
- sidebar collapse state persists
- narrow window preserves usability
- resizable layout updates without breaking transcript/inspector scroll behavior

---

## UI Information Architecture

### Left Rail
Should evolve into:
- New Thread
- Search
- Skills
- Automations
- Channels / Delivery (later)
- Threads
- Workspace

### Center Workspace
Should remain:
- transcript
- composer
- tool/change summary blocks
- reasoning and status flow

### Right Inspector
Should support explicit modes:
- Changes
- Tool Detail
- Context
- Approval
- Clarify
- Memory / Recall detail (later)

Tabs are optional later, but not required for Milestone 1.

---

## Runtime and Interface Additions

### Sidecar / Runtime
Planned additions:
- `changes.list`
- `artifact.list`
- `artifact.open`
- `file.preview`
- `session.search`
- `memory.read`
- `memory.events`
- `memory.status`
- `skills.list`
- `skills.activate`
- `automation.list`
- `automation.get`
- `thread.meta`
- `thread.source`
- `environment.status`

### Renderer State
Add or formalize:
- `selectedTranscriptItemId`
- `selectedTranscriptItemType`
- `selectedTool`
- `selectedArtifact`
- `inspectorMode`
- `pendingChanges`
- `searchResults`
- `activeSkills`
- `automationList`
- `threadSource`
- `environmentStatus`
- `memoryEvents`
- `deliveryTargets`

---

## Execution Order
1. Implement inspector-driven workflow and tool-detail state
2. Integrate approval and clarify into the inspector
3. Add search, skills, memory visibility, and automations
4. Add thread source and environment awareness
5. Improve workspace ergonomics, persistence, and resizing

---

## Test Plan
Phase 2 should add tests for:
- transcript selection updates inspector state
- approval and clarify sync transcript + inspector + modal states
- tool selection survives transcript updates
- search results open the correct thread
- memory events and recall surfaces render correctly
- skills listing and activation update the UI
- automations load and mutate correctly
- thread source and environment metadata render correctly
- responsive behavior preserves usability when sidebars collapse
- persisted collapse state reloads correctly

---

## Success Criteria
Phase 2 is successful when:
- the right panel is meaningfully useful on every active turn
- Hermes-specific capabilities are visible in the app, not hidden behind text commands
- the product clearly communicates Hermes's learning loop, memory, and automation identity
- desktop threads feel connected to the broader Hermes runtime model, not isolated from it
- thread/workspace navigation feels natural
- the desktop client supports a full Hermes coding workflow, not just chat

## Source Basis
This Phase 2 direction is grounded in both public product messaging and the current repository.

Public Hermes positioning emphasizes:
- a built-in learning loop
- agent-curated memory
- autonomous skill creation and improvement
- session search
- gateway continuity
- scheduled automations
- delegation and parallelism
- research readiness

Confirmed in this repository:
- Skills Hub and skill management flows
- file-backed memory plus pluggable memory providers
- SQLite + FTS5 session recall
- multi-platform gateway architecture
- cron scheduler with delivery
- approval system with smart approval mode
- isolated subagent delegation and parallel tool execution
- multiple execution backends
- research / RL infrastructure

Public Codex positioning is strongest around:
- desktop coding workflow
- agent task execution
- parallel agents

OpenClaw is most relevant here as a migration source and historical comparison point, not as the primary product model for Hermes Desktop.
