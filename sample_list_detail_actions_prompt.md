# Kilo Task — Simplify Sample List UX (Keep User Quick Checkout/Return, Move Admin Actions to Detail View)

Return your final answer in ONE complete block. Do not split your answer into partial sections.

## Goal
Refine the Sample List UX so it is cleaner and more efficient:

- **Regular users** keep fast actions on the list page:
  - `Checkout`
  - `Return`
- **Admin actions** are removed from the list page:
  - `Edit`
  - `Delete`
- **Detail view** becomes the action hub for admin actions
- Optionally make the row itself open the detail view for a cleaner UI

This is a UX cleanup round only.
Do NOT widen scope into unrelated backend or user-management work.

---

## Why this change is needed
The current sample list is too crowded when many action buttons are shown.
The better UX model is:

- list page = browse + quick frequent user actions
- detail view = full admin actions / full item context

This keeps daily user actions fast while reducing clutter.

---

## Scope
Implement only these changes:
- simplify the sample list action area
- keep `Checkout` / `Return` on the list page for non-admin users
- remove admin list-page actions (`Edit`, `Delete`) from the sample list
- ensure admin actions remain available in the detail modal/page
- optionally allow row click to open detail view

Do NOT change:
- checkout backend logic
- return backend logic
- registration flow
- user-management page
- dashboard logic
- hamburger/menu behavior
- sample data schema

---

## Files to change
- `static/app.js`
- `static/index.html` only if needed
- `static/style.css` only if needed

Do NOT edit `main.py` unless you find a blocking issue directly caused by this UX change.

---

# Part 1 — Sample list behavior

## In `static/app.js`

### 1.1 Keep quick user actions on the list page
In `renderItems()`, preserve the existing quick-action logic for regular users:

```javascript
const showCheckout = isLoggedIn && !isAdmin && status === 'IN_STOCK';
const showReturn = isLoggedIn && !isAdmin && status === 'CHECKED_OUT';
```

These actions must remain available directly on the sample list page:
- `Checkout`
- `Return`

### 1.2 Remove admin actions from list page
In `renderItems()`, remove list-page admin action buttons such as:
- `Edit`
- `Delete`

Do NOT show these in the sample list anymore.

### 1.3 Decide whether to keep View button or row click
Use ONE of these two approaches:

#### Option A — Keep only `View` button
The Actions column should contain:
- `View`
- plus `Checkout` / `Return` for regular users when applicable

#### Option B — Better UX (recommended)
Make each sample row clickable to open detail view:

```javascript
viewItem(item.id)
```

If you choose row-click:
- remove the standalone `View` button
- keep only `Checkout` / `Return` buttons for regular users
- ensure clicking quick-action buttons does NOT accidentally trigger row click twice

Recommended implementation:
- make row clickable
- use `event.stopPropagation()` on quick-action buttons if needed

### 1.4 Final list-page action rules
Required final behavior:

#### For regular user
Show on list page:
- `Checkout` when item is `IN_STOCK`
- `Return` when item is `CHECKED_OUT`
- optionally `View`, unless row-click is used instead

#### For admin
Do NOT show:
- `Edit`
- `Delete`
- no cluttered admin action buttons on the list page

Admin can still open detail view and act there.

---

# Part 2 — Detail view becomes admin action hub

## In `static/app.js`

### 2.1 Keep admin actions inside `viewItem()`
Inside the detail modal/page rendering, ensure admin can still access:
- `Edit`
- `Delete`

These actions must remain available there.

### 2.2 Keep user actions there only if already present
If the detail view already also contains `Checkout` / `Return`, that is acceptable.
But the important requirement is:
- regular users must still have quick `Checkout` / `Return` from the list page

### 2.3 Do not remove detail functionality
Do not break the existing detail modal.
It must still show item information and history as before.

---

# Part 3 — Optional row-click UX (recommended)

## If implementing row-click
When rendering each sample row:
- clicking the row opens detail view
- quick action buttons (`Checkout`, `Return`) still work independently

### Required event behavior
If using row click, ensure button clicks do not bubble and open detail unexpectedly.
Examples:
- `onclick="event.stopPropagation(); openCheckoutModal(...)"`
- `onclick="event.stopPropagation(); openReturnModal(...)"`

### Cursor / hover behavior
If row-click is enabled, add light visual cue:
- `cursor: pointer;`
- optional row hover state already matches existing style

---

# Part 4 — Table layout expectations

## Target UI model
The sample list should become visually simpler.

### Good final result example
For regular users:
- list row shows sample information
- action area has only:
  - `Checkout` or `Return`
  - optional `View` (if row click not used)

For admin:
- no big stack of list buttons
- open detail to edit/delete

### Important
Do NOT show all of these together in list page anymore:
- View
- Checkout
- Return
- Edit
- Delete

That is exactly the clutter we are removing.

---

# Part 5 — Styling (only if needed)

## In `static/style.css`
Only if needed:
- add row-click pointer styling
- adjust action button spacing
- keep the list compact

Do NOT redesign the whole app.
Do NOT change unrelated modal/table styles unnecessarily.

---

# Part 6 — Verification checklist

Before saying done, verify all of these in the running UI:

## Sample list behavior
- [ ] Regular user still sees `Checkout` for `IN_STOCK` items
- [ ] Regular user still sees `Return` for `CHECKED_OUT` items
- [ ] Admin no longer sees list-page `Edit` button
- [ ] Admin no longer sees list-page `Delete` button
- [ ] List page is visually cleaner / less cluttered

## Detail view behavior
- [ ] Clicking row or View still opens detail view
- [ ] Admin can still `Edit` from detail view
- [ ] Admin can still `Delete` from detail view
- [ ] Detail view content still loads correctly

## If row-click is implemented
- [ ] Clicking row opens detail view
- [ ] Clicking Checkout does not accidentally also open detail view
- [ ] Clicking Return does not accidentally also open detail view

## Regression
- [ ] checkout still works
- [ ] return still works
- [ ] sample list still renders correctly
- [ ] detail modal still works
- [ ] login/logout unchanged
- [ ] dashboard unchanged
- [ ] hamburger/menu unchanged
- [ ] user-management page unchanged

---

# Part 7 — Output format
When done, report exactly:

1. Files changed
2. Exact list-page action changes made
3. Whether View button was kept or row-click was implemented
4. Exact detail-view action behavior after change
5. PASS/FAIL for every checklist item
6. Any remaining real risk

Do NOT say “done” unless the sample list is visibly simplified, users still have quick Checkout/Return on the front page, and admin actions are restored through the detail view instead of cluttering the list page.
