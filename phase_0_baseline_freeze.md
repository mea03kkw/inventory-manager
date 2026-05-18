# Phase 0 — Baseline Freeze and Verification

**Objective:**  
Create a stable, fully verified baseline of the current working app before making any UI or logic changes.

This phase is **critical** to prevent losing working functionality during the upcoming UI redesign.

---

# Scope Control (STRICT)

## ✅ Do
- Observe current system behavior
- Document what is working
- Ensure reproducible environment
- Create a safe rollback point
- Verify key flows

## ❌ Do Not
- Change UI
- Refactor code
- Modify backend logic
- Improve styling
- Add features
- Rename variables or files
- Touch database schema

This phase is **read-only + documentation + verification + commit only**.

---

# Deliverables (Must Complete All)

1. Clean git commit representing the baseline
2. List of confirmed working features
3. List of known issues (if any)
4. Screenshots of current UI
5. Verified local run instructions
6. Regression checklist validated

---

# Task 1 — Confirm Local Environment

## Steps
1. Run backend server (FastAPI)
2. Open frontend in browser
3. Confirm no startup errors

## Verify
- App loads without crash
- Database connection works
- API endpoints respond normally

## Required Output
- Confirm whether the app runs successfully
- Note any startup warnings or errors

---

# Task 2 — Verify Core Functional Flows

Test each of the following manually.

## 1. Authentication
- login works
- logout works
- session persists correctly

## 2. Inventory List
- items load correctly
- no console errors

## 3. Create Item
- can create a new item
- item appears in list

## 4. Edit Item
- can update item fields
- changes persist

## 5. Checkout
- item changes to `Out`
- borrower is correct (current logged-in user)

## 6. Return
- item changes to `In`

## 7. Delete
- delete works, **or**
- returns correct error if blocked by current business rule

## 8. Admin (if available)
- user list loads
- admin functions are accessible

## Required Output Format
Use this exact structure for each tested feature:

```text
Feature: <name>
Status: PASS / FAIL
Notes: <details if needed>
```

---

# Task 3 — Capture Current UI State

Take screenshots of the following:
- main inventory page
- create form
- edit form
- checkout state
- return state
- admin page (if it exists)

## Save Location
Store screenshots locally in:

```text
/baseline_screenshots/
```

If the folder does not exist, create it.

---

# Task 4 — Identify Known Issues

Document any issue found during verification.

Use this exact format:

```text
Issue:
Steps to reproduce:
Expected behavior:
Actual behavior:
Severity: Low / Medium / High
```

⚠️ Do **not** fix anything in this phase. Only document.

---

# Task 5 — Regression Checklist

Validate all items below:
- login works
- logout works
- inventory loads
- create works
- edit works
- checkout works
- return works
- delete behavior is consistent
- status display matches actual state
- borrower matches logged-in user

## Required Output
Return one of the following:

```text
Regression checklist PASSED
```

or

```text
Regression checklist FAILED
<list failed items>
```

---

# Task 6 — Git Baseline Commit

Create a clean baseline commit.

## Commit Message
```bash
git add -A
git commit -m "baseline: stable pre-V1 UI/UX refactor checkpoint"
```

## Requirements
- include all current working files
- no broken state
- no incomplete edits

If there is nothing new to commit, explicitly state that the working tree was already clean.

---

# Task 7 — Final Summary Report

Provide a final summary in this exact structure:

```text
Baseline Status: STABLE / UNSTABLE

Working Features:
- ...
- ...

Known Issues:
- ...
- ...

Ready for Phase 1: YES / NO
```

---

# Exit Criteria

Phase 0 is complete **only if all items below are true**:
- app runs locally without issue
- core flows are verified
- regression checklist passes, or failures are clearly documented
- screenshots are saved
- baseline commit is created (or clean tree is explicitly reported)
- final summary report is provided

---

# Hard Stop Rule

After finishing all tasks:

- stop immediately
- do not start Phase 1
- wait for next instruction

---

# Reminder

This phase protects the project from accidental loss during redesign.

If done properly:
- you can always revert
- you know exactly what worked before changes
- later debugging becomes much easier
