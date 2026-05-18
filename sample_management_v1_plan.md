# Sample Management Web App — Detailed Plan from Current Stage to V1

**Prepared for:** Kaye + Kilo agent  
**Date:** 2026-05-18  
**Purpose:** Big-picture execution reference to guide all work from the current app state to a stable, usable **V1** release.

---

# 1) Executive Summary

The web app is already past the risky early stage because the core product loop exists and has been validated:

- inventory records exist
- users can view items
- CRUD exists
- checkout / return exists
- deployment exists
- database migration has been completed
- admin-related functions already exist in some form

This means the project is **not in idea stage** and **not in prototype-only stage**. It is in a **working MVP refinement stage moving toward V1**.

The most important reality now is:

> The biggest gap is no longer backend capability. The main gap is product usability, visual clarity, mobile responsiveness, workflow smoothness, and production readiness.

So the correct strategy from today onward is:

1. **Freeze unnecessary feature expansion**
2. **Improve the user experience of the working flows**
3. **Stabilize behavior and edge cases**
4. **Harden basic security / deployment settings**
5. **Polish only what directly improves actual daily usage**

---

# 2) Current Stage Assessment

## 2.1 What is already working

Based on the latest confirmed status, the project currently has:

### Core functional foundations
- FastAPI backend running
- Static frontend (HTML / JS / CSS)
- Railway deployment working
- PostgreSQL as primary production database
- Legacy data migrated from SQLite to Railway PostgreSQL
- Inventory CRUD capability
- User registration / login structure exists
- Checkout and return workflow exists
- Admin role / admin dashboard direction exists
- Audit / ownership visibility exists in some form

### Product decisions already agreed
- Mobile-first redesign is needed
- Desktop still matters, but secondary to mobile
- UI should be simplified rather than made more complex
- Status wording should be short and clear
- Preferred status display direction:
  - `In`
  - `Out (username)`
- No extra borrower column if status already contains borrower
- Anonymous users are viewers
- Staff self-register using `@philips.com` email
- Bootstrap admin account retained for now
- No approval workflow yet
- No Phase 4 master-data expansion yet

### Recently fixed / likely improved
- Return issue fixed
- Checkout button / stuck logic improved
- Delete failing 400 issue likely fixed
- Localhost rendering working again

---

## 2.2 What stage the product is really in

The app is best described as:

### **Working internal MVP, entering V1 hardening and usability phase**

This is important because the next steps should not behave like a fresh greenfield build. The app should now be treated like an **existing internal product** that needs:

- usability improvement
- consistency improvement
- trust improvement
- operational readiness improvement

The project should therefore shift from **feature-building mindset** to **productization mindset**.

---

# 3) Definition of V1

## 3.1 What V1 means for this app

V1 does **not** mean perfect.
V1 does **not** mean all future ideas are included.
V1 does **not** mean AI, analytics, dashboards, OCR, smart recommendations, or advanced workflow engines.

For this app, **V1 means**:

> A stable, clear, mobile-usable internal sample management web app that supports day-to-day operations reliably and with low confusion.

---

## 3.2 V1 success criteria

The app can be called **V1-ready** only when all of the following are true:

### Usability
- A user can understand the UI quickly without explanation
- Mobile view is easy to read and use
- Desktop view is still clean and efficient
- Status is obvious at a glance
- Main actions are easy to find and hard to misuse

### Function reliability
- Create / edit / delete work consistently
- Checkout works consistently
- Return works consistently
- Button states correctly reflect item state
- No confusing mismatch between actual state and displayed UI

### Data integrity
- Item status and borrower data remain consistent
- Invalid actions are blocked cleanly
- Delete rules are sensible and safe
- User identity used during checkout is correct

### Security / basic production readiness
- Swagger docs are not casually exposed in production
- Session handling is reasonable
- Basic environment separation exists
- Obvious accidental misuse is reduced

### Operations readiness
- App is stable enough for real internal daily use
- Admin can manage expected exceptions without DB surgery
- Common workflows do not require developer intervention

---

# 4) Guiding Principles for All Work Toward V1

These principles should govern every coding decision from now until V1.

## 4.1 Simplicity over cleverness
Choose the clearest and shortest workflow.
Avoid adding controls, labels, columns, and visual noise unless they solve a real problem.

## 4.2 Mobile-first, desktop-safe
The primary design target is phone usage.
Desktop should still look good, but mobile usability has higher priority.

## 4.3 Improve what users touch most
Prioritize:
- list view
- status visibility
- checkout / return
- search / findability
- form clarity

Do not spend disproportionate time on low-use admin edge screens before the main operational flow feels good.

## 4.4 Protect working logic
Avoid large refactors that risk breaking already-fixed behavior.
Whenever possible:
- keep backend contracts stable
- improve UI layer first
- do targeted backend changes only when necessary

## 4.5 One phase at a time
Because Kilo performs better with tightly scoped tasks:
- freeze phase scope
- finish phase
- test phase
- only then move on

## 4.6 Visible progress over invisible perfection
Prefer changes users can immediately benefit from.
Do not sink time into deep architecture clean-up unless it directly supports V1 stability.

---

# 5) Main Gaps Between Current State and V1

This section identifies the real gaps that still exist.

## 5.1 UX and visual clarity gap
Current likely problems:
- layout is visually crowded
- mobile is awkward
- table-heavy design is poor on narrow screens
- status/action relationship may not be instantly obvious
- too much information may compete for attention

## 5.2 Interaction logic gap
Potential issues:
- wrong action visible for wrong state
- button labels unclear
- duplicate clicks possible
- success/failure feedback not strong enough
- confusing state updates after actions

## 5.3 Production safety gap
Potential issues:
- `/docs` and `/redoc` exposure in production
- environment separation may be incomplete
- session timeout or session invalidation may need review
- some dev defaults may still be active

## 5.4 Admin-control gap
Potential issues:
- user management may still be basic
- deletion rules may be too permissive or unclear
- audit visibility may not be sufficiently usable
- error states may not guide admins well

## 5.5 Product polish gap
Potential issues:
- search/filter may be weak or absent
- sorting may be absent
- empty states may be poor
- forms may not feel efficient
- naming consistency may be mixed

---

# 6) Roadmap Structure to Reach V1

The best roadmap is a sequence of tightly scoped phases.

---

# Phase 0 — Baseline Freeze and Verification

## Objective
Create a stable starting point before changing the product further.

## Why this phase matters
If the current state is not frozen and documented, new UI work may accidentally hide logic regressions.

## Deliverables
- current branch committed cleanly
- working baseline deployed or locally runnable
- known working flows listed
- known bugs listed
- screen captures of current major screens saved for comparison

## Tasks
1. Confirm baseline branch state
2. Confirm latest local files are the source of truth
3. Record working flows:
   - login
   - register
   - view inventory
   - create item
   - edit item
   - checkout
   - return
   - delete
   - admin user management (if applicable)
4. Record known non-blocking issues
5. Save before-change screenshots
6. Ensure rollback point exists with git commit

## Exit criteria
- baseline is stable
- team knows what is currently working
- safe restore point exists

---

# Phase 1 — Information Architecture and UX Simplification

## Objective
Simplify what users see and how they understand status and actions.

## Why this phase is highest priority
If the app is visually confusing, even correct logic feels broken.
This phase creates the structural rules the rest of the redesign follows.

## Target outcomes
- clear hierarchy of information
- status readable in seconds
- unnecessary columns/fields reduced
- operational workflow visually simplified

## Design decisions already agreed
Use status in simplified form:
- `In`
- `Out (username)`

Avoid separate borrower column if redundant.

## Scope
### Inventory list / main screen
Redefine what information is primary vs secondary.

### Primary information on each item
Must be instantly visible:
- item identity / sample name / sample code (whatever is primary identifier)
- current status
- key location or rack info if operationally important
- immediate action button(s)

### Secondary information
Can be smaller / lower emphasis / hidden under details if needed:
- remarks
- timestamps
- long metadata
- admin-only controls

## Tasks
1. Review each visible field on main list
2. Classify each as:
   - required primary
   - useful secondary
   - removable from default list
3. Rewrite list hierarchy for mobile
4. Decide which actions sit on each row/card
5. Standardize language labels across UI
6. Reduce redundant words

## Example desired mental model
User opens app and instantly sees:
- what the item is
- whether it is available
- who currently has it if out
- what action is possible right now

## Risks to avoid
- adding more labels to explain bad layout
- keeping old table structure and only shrinking it
- showing too many columns on mobile

## Exit criteria
- there is a clear agreed structure for mobile cards and desktop table
- field priority is explicitly defined
- status and actions are simplified at design level

---

# Phase 2 — Mobile-First UI Implementation

## Objective
Implement the new responsive UI structure.

## Why this phase matters
This is the most visible transformation and likely the biggest perceived value gain for users.

## Target outcomes
- mobile card layout for small screens
- readable spacing and typography
- strong visual status indicators
- easy tap targets
- desktop still usable and structured

## Scope
### Mobile
Use card-based layout.
Each card should include:
- item name / primary identifier
- compact metadata
- status chip/text
- action area

### Desktop
Desktop can keep a table or hybrid layout, but it should align with the same information priority model.
A future sorting feature may be added, but the first version should focus on readability.

## UI requirements
### Visual status
- Green styling for `In`
- Red styling for `Out (username)`
- Good contrast
- Do not rely on color alone; keep explicit text

### Buttons
- clear primary/secondary distinction
- full-width or comfortably tappable on mobile
- avoid tiny controls packed together

### Typography and spacing
- bigger text for primary identity
- smaller text for secondary metadata
- enough spacing between blocks
- cards should not feel cramped

### Responsive behavior
- mobile first CSS rules
- clean stacking on narrow screens
- no sideways scrolling for ordinary use

## Tasks
1. Implement mobile card list
2. Keep or adapt desktop table view
3. Add status badges/colors
4. Refactor action placement
5. Improve spacing and alignment
6. Validate on narrow viewport sizes
7. Verify no key function becomes hidden or difficult

## Exit criteria
- mobile main list is clearly better than current version
- users can scan availability quickly
- tap actions are comfortable
- desktop remains acceptable

---

# Phase 3 — Interaction Logic Cleanup

## Objective
Make every visible action match the real item state clearly and consistently.

## Why this phase matters
Even a good UI will fail if the interaction model is inconsistent.

## Target outcomes
- correct action shown for each state
- reduced user confusion
- less accidental misuse
- strong immediate feedback after actions

## Rules
### Action visibility
- If item is `In` → show `Checkout`
- If item is `Out` → show `Return`
- Do not show both if one is invalid

### Pending state handling
When an action is in progress:
- disable repeated clicks
- show temporary progress state if possible

### After action success
- update UI immediately
- display success message
- keep the list consistent without requiring a manual refresh if possible

### After action failure
- show clear error message
- do not leave UI stuck in wrong state

## Tasks
1. Review frontend state transitions
2. Review API response handling
3. Ensure action buttons map strictly to item status
4. Prevent multi-submit/double-click issues
5. Add clear success/failure feedback
6. Validate state after checkout and return
7. Validate borrower identity shown matches logged-in user behavior

## Exit criteria
- no confusing action mismatch remains
- no stuck buttons
- status updates are consistent and reliable

---

# Phase 4 — Forms and CRUD Reliability Review

## Objective
Make create, edit, and delete feel safe, clear, and predictable.

## Why this phase matters
CRUD errors destroy user trust quickly, even if the list page looks good.

## Target outcomes
- forms are easy to complete
- required fields are obvious
- delete behavior is safe
- errors are understandable

## Scope
### Create/Edit forms
Review:
- labels
- field order
- validation clarity
- defaults
- spacing
- save/cancel behavior

### Delete behavior
Establish clear rule set, for example:
- prevent deleting checked-out items, or
- require return before delete

If delete remains allowed in some cases, ensure error messaging is explicit.

## Tasks
1. Review all create/edit forms for field clarity
2. Standardize required-field behavior
3. Improve validation messages
4. Review delete endpoint and UI handling
5. Decide and enforce deletion policy
6. Verify edit flow preserves data accurately

## Exit criteria
- CRUD flows feel predictable
- no ambiguous delete behavior
- validation is understandable

---

# Phase 5 — Search, Filter, and Sort (V1-Optional but Valuable)

## Objective
Improve findability without bloating the UI.

## Why this phase matters
As inventory grows, the app becomes less useful if users cannot quickly locate items.

## Recommended priority
This is useful but should come only after the main mobile UX and state logic are solid.

## Candidate features
- simple keyword search
- optional filter by status (`In`, `Out`)
- desktop sorting arrows for major columns

## Notes
Keep first version simple:
- avoid advanced multi-filter panel unless clearly needed
- start with the 20% feature that gives 80% value

## Tasks
1. Define minimum useful search behavior
2. Add status filter if lightweight
3. Add desktop sorting on selected columns if time permits
4. Test search result behavior on mobile and desktop

## Exit criteria
- users can quickly find an item in normal inventory size
- controls do not clutter the main experience

---

# Phase 6 — Security and Production Hardening

## Objective
Remove easy production risks and align the app with basic internal deployment safety.

## Why this phase matters
The app does not need enterprise-perfect security at V1, but it should avoid obvious exposure and weak defaults.

## Target outcomes
- production-only protections enabled
- dev-only routes not casually exposed
- session behavior reviewed
- configuration boundaries clearer

## Scope
### API docs exposure
Disable or guard:
- `/docs`
- `/redoc`
- openapi exposure as appropriate in production

### Environment separation
Ensure behavior differs correctly between:
- local development
- production deployment

### Session/auth review
Verify:
- session timeout behavior
- logout behavior
- cookie/security flags as appropriate for deployment setup

### Defensive checks
Review obvious endpoints for:
- authorization assumptions
- admin-only operations
- invalid-action blocking

## Tasks
1. Gate docs to dev only
2. Review production environment flags
3. Review session configuration
4. Review admin endpoint protection
5. Review public exposure of unnecessary routes/assets
6. Re-test login/logout/session expiry

## Exit criteria
- obvious dev exposure is closed in production
- auth/session behavior is acceptable for internal V1 use

---

# Phase 7 — Admin and Operational Control Improvements

## Objective
Ensure the app can be operated day-to-day without hidden manual fixes.

## Why this phase matters
Internal tools fail when admins cannot resolve routine issues themselves.

## Target outcomes
- admins can manage users reliably
- common exception cases are manageable
- operational data is understandable

## Areas to review
### User management
- list users clearly
- distinguish role/state if needed
- make self-registration flow understandable

### Inventory state exceptions
- if item state becomes inconsistent, admin should have a clear recovery path

### Audit visibility
- make recent activity understandable enough for operational tracing

## Tasks
1. Review admin dashboard clarity
2. Review user list actions and safety
3. Review exceptional inventory states
4. Confirm admin can recover from common operational mistakes

## Exit criteria
- admin operations do not require technical intervention for common tasks

---

# Phase 8 — Final V1 Polish and Release Readiness

## Objective
Prepare the app for confident internal use under the V1 label.

## Why this phase matters
Small finishing improvements can dramatically improve perceived quality.

## Candidate polish items
- empty states
- no-results state for search
- loading states
- confirmation wording
- button consistency
- icon consistency (if used)
- minor text cleanup
- consistent capitalization
- consistent date/time formatting

## Release readiness tasks
1. Walk through top 10 user scenarios
2. Walk through top 5 admin scenarios
3. Test on phone viewport and desktop viewport
4. Confirm production settings
5. Write a brief admin/user usage note if needed
6. Create release tag / V1 commit point

## Exit criteria
- app feels coherent and intentional
- no known severe blockers remain
- V1 is safe to communicate internally as usable

---

# 7) Prioritization Matrix

## Must-do before V1
These are mandatory:
- Phase 0 baseline freeze
- Phase 1 information architecture simplification
- Phase 2 mobile-first UI implementation
- Phase 3 interaction logic cleanup
- Phase 4 CRUD reliability review
- Phase 6 security and production hardening
- Final release readiness checks from Phase 8

## Strongly recommended before V1
- core parts of Phase 7 admin operational control

## Nice-to-have if time permits
- Phase 5 search/filter/sort
- additional polish items from Phase 8

## Explicitly out of scope for V1
To avoid distraction, the following should be deferred unless they directly unblock V1:
- AI enhancements
- machine vision integration
- forecasting or analytics features
- advanced approval workflow
- complex role hierarchy redesign
- large database schema redesign
- full master data management expansion
- enterprise-grade observability stack
- major frontend framework migration

---

# 8) Suggested Sequence of Work

This is the recommended execution order.

## Week-style sequence
### Step 1
Phase 0 — Baseline Freeze and Verification

### Step 2
Phase 1 — Information Architecture and UX Simplification

### Step 3
Phase 2 — Mobile-First UI Implementation

### Step 4
Phase 3 — Interaction Logic Cleanup

### Step 5
Phase 4 — Forms and CRUD Reliability Review

### Step 6
Phase 6 — Security and Production Hardening

### Step 7
Phase 7 — Admin and Operational Control Improvements

### Step 8
Phase 5 — Search / Filter / Sort if time remains

### Step 9
Phase 8 — Final V1 Polish and Release Readiness

---

# 9) Testing Strategy by Phase

A phase is not finished just because code compiles. Each phase needs explicit testing.

## 9.1 Testing rules
- test locally first
- test the exact changed flow
- test one adjacent flow likely to break
- compare behavior on mobile-width and desktop-width
- commit only after sanity check

## 9.2 Minimum regression checklist
Run repeatedly during the roadmap:
- login works
- logout works
- inventory list loads
- item create works
- item edit works
- checkout works
- return works
- delete behaves per policy
- status displays correctly
- borrower display matches actual checkout identity
- admin-only actions remain protected

## 9.3 Mobile-specific checks
- no horizontal scrolling in normal use
- buttons are tappable
- text is readable without zooming
- card spacing is clean
- forms are usable on narrow screen

## 9.4 Desktop-specific checks
- layout does not look stretched or broken
- scanning many items remains efficient
- controls stay aligned

---

# 10) Quality Bar for Kilo Agent Work

This section is important because it defines how Kilo should execute.

## 10.1 Kilo working rules
Kilo should always:
- work in one phase only
- avoid touching unrelated files if unnecessary
- preserve already-working backend behavior
- make the smallest change that fully solves the scoped problem
- report exactly what changed
- stop after phase completion instead of drifting into next-phase work

## 10.2 Kilo should not
- refactor broadly without need
- introduce new frameworks
- rename many things unnecessarily
- make speculative changes outside scope
- change database schema unless specifically instructed
- add advanced features not requested in the phase

## 10.3 Required output style from Kilo
For each phase, Kilo should provide:
1. What was changed
2. Which files changed
3. Why the solution follows the requested phase scope
4. What was intentionally not changed
5. What to test locally
6. Any known limitation remaining

---

# 11) Risks and Mitigation

## Risk 1 — Scope creep
### Problem
Trying to improve too many things at once will break momentum.
### Mitigation
Strictly execute one phase at a time.

## Risk 2 — UI change accidentally breaks logic
### Problem
Frontend redesign can hide or disrupt working checkout/return behavior.
### Mitigation
Baseline freeze first, then regression test after each phase.

## Risk 3 — Kilo edits too broadly
### Problem
Low-level agents often change more than requested.
### Mitigation
Give exact scope + do-not-touch instructions + file boundaries where possible.

## Risk 4 — Production hardening delayed too long
### Problem
A working internal app may remain exposed with dev-friendly defaults.
### Mitigation
Treat Phase 6 as mandatory before calling the product V1.

## Risk 5 — Polishing before usability is solved
### Problem
Time gets wasted on cosmetic improvements before the core experience is clean.
### Mitigation
Prioritize clarity, responsiveness, and state logic before extra polish.

---

# 12) Practical Definition of Done by Phase

## Phase 0 Done
- baseline committed
- working features documented
- rollback point exists

## Phase 1 Done
- field priority decided
- simplified information hierarchy agreed
- status model finalized

## Phase 2 Done
- mobile card layout implemented
- responsive behavior acceptable
- desktop acceptable

## Phase 3 Done
- action/state mapping correct
- no stuck action behavior
- good user feedback exists

## Phase 4 Done
- CRUD behaviors predictable
- delete policy enforced clearly
- validation understandable

## Phase 5 Done
- users can find items efficiently
- controls remain simple

## Phase 6 Done
- docs hidden/guarded in production
- session/auth review completed
- obvious security gaps reduced

## Phase 7 Done
- admin can manage common exceptions without technical workaround

## Phase 8 Done
- release checks passed
- app can reasonably be called V1 internally

---

# 13) Recommended Immediate Next Actions (Starting Today)

This is the best practical sequence to begin Monday work.

## Action 1 — Create baseline snapshot
Before changing code today:
- make a clean git commit
- save current screenshots
- note what is already fixed

## Action 2 — Write Phase 1 implementation brief
Translate the big-picture plan into a **single exact Phase 1 Kilo prompt** focused only on:
- information hierarchy
- mobile card structure
- simplified status display
- action placement

## Action 3 — Implement only Phase 1 / 2 boundary carefully
Depending on how you want to split work, either:
- keep Phase 1 as design/structure planning only, then Phase 2 as coding, or
- combine them as one UI implementation sprint

For Kilo, splitting is usually safer.

## Action 4 — Test on localhost immediately after UI work
Do not stack multiple UI and logic changes before testing.

---

# 14) Final Recommendation

The correct strategy from the current stage to V1 is:

> Treat the app as a working internal tool that now needs disciplined productization, not more uncontrolled feature building.

If execution stays focused, V1 is very achievable because:
- the app already works functionally
- the data layer is in place
- deployment is in place
- the main remaining work is highly targetable

The key to success is not technical complexity.
The key is disciplined sequencing:

1. freeze baseline
2. simplify UX
3. implement mobile-first layout
4. clean interaction logic
5. verify CRUD reliability
6. harden production basics
7. polish only what matters

If this sequence is followed, the app should move from **“working but rough”** to **“usable V1 internal product”** with much lower risk than trying to redesign everything at once.

---

# 15) Short Version for Daily Reference

## Main objective
Deliver a stable, clear, mobile-usable V1 sample management app for internal operational use.

## Top priorities
1. mobile-friendly UI
2. simple status display
3. reliable checkout/return interaction
4. CRUD trustworthiness
5. production safety basics

## Do not get distracted by
- AI features
- big refactors
- advanced workflows
- non-essential polish too early

## Winning strategy
One phase at a time. Test after every phase. Protect what already works.
