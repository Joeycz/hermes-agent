# Hermes Desktop Design Guide

## Overview
This document captures the UI direction inferred from the provided Codex desktop screenshot and translates it into an actionable design baseline for the Hermes desktop client.

The goal is not to clone the screenshot mechanically. The goal is to reproduce its product qualities:
- calm desktop-native workspace feel
- strong information density without visual noise
- persistent navigation at left
- conversation as the main working surface
- a dedicated right-side output/work panel
- minimal chrome, restrained color, and clear hierarchy

This document should guide both UI implementation and feature planning for the next iterations of `client/`.

## Visual Thesis
Hermes Desktop should feel like a focused macOS-native coding workspace rather than a generic chat app.

The interface should communicate:
- a long-lived working session, not a disposable prompt
- code-adjacent productivity, not marketing polish
- confidence through spacing, typography, and restraint
- quiet depth rather than card-heavy dashboard styling

Mood keywords:
- calm
- light
- editorial
- desktop-native
- precise
- low-chrome

## Core Layout
The screenshot suggests a three-column working layout with a persistent top action bar.

### 1. Left Navigation Rail
Purpose:
- global navigation
- thread and workspace switching
- secondary product areas

Structure:
- top app navigation list
- mid thread/project list
- bottom settings / utility entry

Characteristics:
- narrow, persistent, softly tinted background
- icon + label rows
- low-contrast inactive items
- stronger active row treatment
- thread list reads like a filesystem or workspace sidebar

Hermes mapping:
- New Thread
- Search
- Skills
- Plugins
- Automations
- Threads section
- Workspace/session entries
- Settings

### 2. Center Conversation Workspace
Purpose:
- primary thinking and planning surface
- streaming conversation
- patch/change summary blocks
- input composer

Structure:
- top title bar with active thread title and workspace context
- scrolling transcript region
- structured change summary blocks embedded in transcript
- bottom sticky composer
- compact status/footer metadata under the composer

Characteristics:
- brightest reading surface
- generous line height
- text-first hierarchy
- very limited card usage
- content blocks should feel document-like, not bubble-chat-heavy

Hermes mapping:
- assistant/user messages
- reasoning/progress notes
- tool result summaries
- file change rollups
- composer with model/provider selectors and send button

### 3. Right Output / Inspector Panel
Purpose:
- focused secondary context for the active turn
- show code diff, output preview, or file/result state

Structure:
- top panel header with state label
- empty state when no selection exists
- later expandable to diff preview, file inspector, tool log detail

Characteristics:
- clean white or near-white work surface in the screenshot
- visually quieter than the center transcript
- behaves like a document preview, not a settings drawer

Hermes mapping:
- selected diff/file preview
- active tool result detail
- patch preview
- session artifacts

## Top Bar
The screenshot has a desktop-style toolbar with lightweight action controls rather than a loud app header.

Required behavior:
- show current thread/session title
- show current workspace/repo name
- expose primary actions at the top right

Recommended Hermes actions:
- stop/run state indicator
- apply changes / commit later
- branch/session selector
- overflow menu

Visual rules:
- very light chrome
- thin separators
- icon-first actions where possible
- no oversized branded header

## Typography
Typography should do most of the interface work.

Guidelines:
- use a system-native sans stack for the shell
- use a readable mono stack for code/file references
- prioritize text contrast and rhythm over decoration
- large title only where needed
- sidebar labels should be compact and quiet
- transcript text should be comfortable for long reading

Suggested hierarchy:
- app/thread title: 28-34px equivalent
- section labels: 11-12px uppercase or muted small caps feel
- body copy: 15-16px
- metadata: 12-13px
- code/file lines: 13-14px mono

## Color System
The screenshot is much lighter and more restrained than the current Hermes prototype.

Direction:
- default to a light application shell
- use pale grays and warm whites as main surfaces
- use one muted blue accent for interactive state
- use green/red only for diff/add/remove semantics
- avoid saturated gradients in routine product surfaces

Palette intent:
- shell background: soft warm gray
- left rail: slightly darker than center
- center surface: off-white
- right inspector: bright white
- dividers: subtle neutral grays
- text: near-black charcoal
- muted text: neutral gray
- accent: Codex-like blue

Avoid:
- dark neon dashboard look
- glossy cards
- strong shadows everywhere
- multiple competing accent colors

## Surface and Chrome Rules
- Default to sections and panels, not nested cards
- Keep borders thin and quiet
- Use subtle background shifts to separate regions
- Use rounded corners sparingly and mostly at the app-shell level
- Remove ornamental gradients from productivity surfaces
- Empty states should feel intentional, not placeholder-ish

## Conversation Presentation
The current Hermes prototype is too chat-bubble-oriented for the target direction.

New direction:
- transcript should read like a structured working document
- user/assistant distinction should rely more on spacing, labels, and subtle container shifts
- avoid oversized pill-like bubbles for every message
- tool/change summaries can appear as structured blocks within the flow
- large uninterrupted assistant responses should feel article-like

Message rules:
- assistant messages: plain text-first blocks
- user messages: compact, slightly tinted prompt blocks
- tool summaries: bordered utility rows or grouped list blocks
- code/file references: inline mono with muted badges

## Composer Design
The screenshot suggests a quiet, integrated input bar anchored at the bottom.

Structure:
- large rounded input surface
- compact left utility cluster
- compact model/provider selectors
- right-aligned send action

Composer rules:
- always visible
- visually lighter than current prototype
- no thick borders or large CTA buttons
- metadata controls should sit inside or directly below the composer

Hermes controls to preserve:
- message input
- model selector
- provider/config indicator
- send button
- optional toolset/workspace context row

## Sidebar Information Architecture
The sidebar should be split into two conceptual zones:

### Product Navigation
- New Thread
- Search
- Skills
- Plugins
- Automations

### Threads / Workspaces
- current repo sessions
- recent threads
- maybe grouped by workspace later

Behavior:
- active row gets a subtle filled background
- rows should be compact and easy to scan
- thread names may truncate cleanly

## Right Panel Functional Planning
The screenshot’s right side is currently an empty “no unsaved changes” area, which is important: it shows the product reserves a dedicated working panel even when idle.

Hermes should adopt this pattern.

Planned modes:
- Empty state
- Diff preview
- File preview
- Tool detail
- Approval context

Default empty state:
- calm icon-free or minimal-icon message
- “No pending changes” / “No selection”
- concise subtext explaining what appears here

## Motion and Interaction
Motion should be subtle and desktop-native.

Use:
- soft hover highlights in sidebar rows
- light fade/slide for panel updates
- gentle transcript append animation
- panel state transitions without bounce or exaggerated scale

Avoid:
- mobile-style springiness
- heavy transform animations
- decorative motion unrelated to user flow

## Implementation Priorities

### Phase 1: Structural Alignment
- rebuild the app shell into a left rail + center transcript + right inspector
- replace bubble-heavy message styling with document-style transcript layout
- redesign composer to sit as an integrated bottom work surface
- add a real top toolbar

### Phase 2: Interaction Alignment
- make sidebar items and thread list feel like a desktop navigator
- connect right panel to selected tool/file/diff state
- improve empty states
- make tool timeline less dashboard-like and more inline/inspectable

### Phase 3: Workflow Alignment
- map tool results to the right inspector
- add diff preview selection model
- add “changes pending” and “no changes” states
- support file-oriented workflows instead of only chat-oriented workflows

## Component Guidelines

### Sidebar Row
- 36-42px tall
- icon + label
- subtle hover fill
- active state with restrained blue-gray background

### Thread Item
- denser than current prototype
- title first, optional muted metadata second
- should visually align with a file explorer pattern

### Transcript Block
- max readable width
- consistent vertical rhythm
- no oversized borders
- code/diff snippets can break width rules when needed

### Utility Block
- used for file changes, tests, tool summaries
- compact bordered list block
- should read as system output, not conversation prose

### Inspector Panel
- title bar
- content region
- empty state region
- optional segmented tabs later

## Content Tone
The UI copy should be utilitarian and product-like.

Good examples:
- No pending changes
- Changes will appear here
- Running Hermes
- Review files
- Active thread
- Workspace

Avoid:
- hype copy
- assistant-persona language in shell chrome
- decorative marketing phrasing

## Non-Goals
This design direction should avoid:
- generic SaaS dashboard cards
- dark terminal cosplay
- gradient-heavy AI app aesthetics
- mobile-chat visual language
- oversized CTA-driven layouts

## Immediate UI Refactor Checklist
- Introduce a light shell with three fixed regions
- Convert sidebar into product nav + thread list
- Add top toolbar and workspace title treatment
- Redesign transcript as document-like conversation flow
- Redesign composer to match Codex-like integrated bottom input
- Add right inspector empty state for diffs/changes
- Downshift current color saturation and chrome intensity

## Feature Planning Notes
The screenshot also implies a workflow model that should shape the product roadmap.

Planned features to align with this direction:
- thread-first workflow
- search as a first-class global mode
- changes preview as a first-class right-panel mode
- plugin/skills areas as persistent app destinations, not only inline controls
- workspace-aware sessions
- future commit/apply actions in top toolbar

## Source Reference
This document is based on the Codex desktop screenshot provided in this conversation and is intended to guide:
- `client/index.html`
- `client/styles.css`
- `client/renderer.js`
- future interaction and layout planning for the Hermes desktop client
