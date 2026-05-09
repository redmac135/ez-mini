# ez-repeat — PLAN.md

A minimal habit tracker that just works.

---

## Data Model

### habits

| Column         | Type        | Description                                                         |
| -------------- | ----------- | ------------------------------------------------------------------- |
| `id`           | uuid (PK)   |                                                                     |
| `user_id`      | uuid (FK)   |                                                                     |
| `title`        | text        |                                                                     |
| `target_count` | int (>0)    | completions required per recurrence                                 |
| `recurrence`   | jsonb       | schedule definition (see below)                                     |
| `archived_at`  | timestamptz | nullable. Marks habit as archived (keeps history).                  |
| `deleted_at`   | timestamptz | nullable. Marks habit as deleted (removes habit + all completions). |

**Archiving vs Deleting**

- **Archive** (`archived_at`): Hides the habit from active views but preserves all past completions. Reversible (unarchiving resets `archived_at` to NULL).
- **Delete** (`deleted_at`): Destructive. The habit is hidden and all associated completions may be permanently removed. This is for cases where the user wants to wipe all traces.

### completions

| Column         | Type        | Description                |
| -------------- | ----------- | -------------------------- |
| `id`           | uuid (PK)   |                            |
| `user_id`      | uuid (FK)   |                            |
| `habit_id`     | uuid (FK)   |                            |
| `completed_at` | timestamptz | exact moment of completion |

---

## Recurrence Schema

```jsonc
// daily
{ "type": "daily", "interval": 1, "sliding": false }

// weekly
{ "type": "weekly", "interval": 1, "sliding": false }

// specific days of the week (fixed boundaries, no sliding)
{ "type": "daysOfWeek", "days": [1,3,5], "everyNWeeks": 1 }
```

- **`interval`** – multiplier (e.g. every 2 days, every 3 weeks).
- **`sliding`** – only for `daily`/`weekly`. `true` = look back exactly interval × unit; `false` = reset at the next calendar boundary.
- **`daysOfWeek`** – `0`=Sun … `6`=Sat. Always boundary-aligned to midnight of the given day.

---

## Completion Calculation (Client‑Side)

1. Determine the target window for a habit at `now` (device local time):
   - **Fixed**: the period from the most recent boundary to `now`.  
     Boundaries: midnight for daily, Sunday midnight for weekly, midnight of each specified day for daysOfWeek.
   - **Sliding**: `now - (interval × unit)` to `now`.
2. Count completions inside the window.
3. Bar fullness = `min(count, target_count) / target_count` (can exceed 100%).

**Day-level completion** = average fullness of all active habits over the calendar day (midnight to midnight).  
Weekly habits done on Monday show 100% for Monday and 0% for the rest of the week – that’s intentional.

---

## Input Parsing

Users create habits by typing a phrase like “morning stretch three times a week”.  
The parser extracts three parts: **title**, **target_count**, **recurrence**.

### Defaults

- Recurrence: `{"type": "daily", "interval": 1, "sliding": false}`
- target_count: `1`

### Extraction Order

1. **Schedule phrase** – searched globally (matched from end-first for natural feel).  
   Supported patterns: `daily`, `every day`, `each day`, `every morning/afternoon/evening`, `weekly`, `every week`, `every N weeks`, `every other week`, `on Monday, Wednesday`, `every Sunday`, etc.

2. **Sliding flag** – the word `sliding` anywhere in the input sets `sliding: true` for daily/weekly schedules.  
   _Crucially, “sliding” is always removed from the title, even if it appears before a known schedule phrase._  
   Example: `"call mom sliding every week"` → sliding weekly; title is `"call mom"`.

3. **Frequency** – only explicit count phrases, never bare numbers:  
   `\b(once|twice|[1-9]\d{0,2})\s*(times?|×|x)\b` plus standalone `once` / `twice`.  
   Example: `"twice"` → target 2; `"8 hours"` → no match (stays in title).

4. **Title** – all remaining text after removing the above, with stopwords like `a`/`per` trimmed.

### Examples

| Input                                 | Title           | target | recurrence                        |
| ------------------------------------- | --------------- | ------ | --------------------------------- |
| `morning stretch`                     | morning stretch | 1      | daily, sliding: false             |
| `floss twice a day`                   | floss           | 2      | daily                             |
| `call mom every mon, tue, fri`        | call mom        | 1      | daysOfWeek [1,2,5]                |
| `read 10 pages daily`                 | read 10 pages   | 1      | daily (10 not “X times”)          |
| `sleep 8 hours daily`                 | sleep 8 hours   | 1      | daily                             |
| `text family once every week sliding` | text family     | 1      | weekly, interval:1, sliding: true |
| `stretch sliding`                     | stretch         | 1      | daily, sliding: true              |

---

## UI Behaviour

### Habit Creation

- Modal with a single text input.
- Real‑time parsing underlines recognised tokens and displays editable chips (title, frequency, recurrence).
- Tapping a chip lets the user override the parsed value manually.
- Defaults (“once a day”) apply when nothing is detected.
- The raw string is **not** saved – only the structured result.

### Tracking & Completions

- Main view shows each habit as a progress bar that fills with colour.
- **Swipe right** = log a completion (`completed_at = now()`).
- **Swipe left** = reveals two options:
  - **Archive** – sets `archived_at`. Habit hidden from active list. All past completions preserved. Reversible.
  - **Delete** – sets `deleted_at`. Habit hidden. All completions for this habit are soft‑removed (not hard‑deleted). Requires confirmation.
- **Swipe opposite on an already‑completed habit** = undo last completion (removes the most recent record for today).

---

## Design

_(To be populated – colours, typography, spacing, component references.)_
