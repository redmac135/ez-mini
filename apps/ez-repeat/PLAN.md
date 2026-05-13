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
| `completed_at` | date | day this was completed |

---

## Recurrence Schema

```jsonc
// days
{ "type": "days", "interval": 1 }

// weeks
{ "type": "weeks", "interval": 1 }

// specific days of the week (same as days with interval 1 but only applies to certain days, used for "every sunday" type habits or "every other sunday")
{ "type": "daysOfWeek", "days": [1,3,5], "interval": 1 }
```

- **`interval`** – multiplier (e.g. every 2 days, every 3 weeks).
- **`daysOfWeek`** – `0`=Sun … `6`=Sat. Always boundary-aligned to midnight of the given day.

---

## Syncing Logic

Following the `@ez/sync` package in this monorepo, `updated_at` and `created_at` timestamps are automatically managed by the server. They will be used by the package to deal with syncing resolution. The difference with this app, is that we don't have conflicts, if a completion if marked on two seperate devices at the same time, we can just keep both completions, as they will be counted as two separate completions for the habit. The only case where we might have a conflict is when a habit is deleted on one device and marked as completed on another device at the same time, in that case, we will keep the deletion and discard the completion, as the user has explicitly chosen to delete the habit.

The only special case is in the event the user archives and unarchives a habit on two separate devices at the same time, in that case, we will keep the most recent action, whether it's the archive or unarchive, as the user has explicitly chosen to archive or unarchive the habit. We use the `updated_at` timestamp to determine which action is more recent.

---

## Completion Calculation (Client‑Side)

The `completion` that is displayed for a given day is simply `completions in interval` / `target_count`, where the interval depends on the habit’s recurrence:

- If it is a `days` habit, then we search for completions which occured between the current date and `n` days ago, where `n` is the interval of the habit. Note that completions happen on a day-level, so the time of the completion is not relevant, only the date.
- If it is a `weeks` habit, then we search for completions which occured between the current date and `n` weeks ago, where `n` is the interval of the habit.
- If it is a `daysOfWeek` habit, then we simply search for completions in the given day.

Note that `daysOfWeek` habits are the only ones that aren't shown every day. Because of this, `daysOfWeek` habits can only have completions on the days they exist. For example, if `interval=2` and `days=[1]` (every other Monday), then the habit will only have completions on Mondays, and the completion for that habit will only be shown on Mondays.

Now a given day's `completion_score` also needs to be calculated on the client side. For a given day (As this calculate will repeat for each day), we take a weighted contribution of each habit completion.

- The goal for the `completion_score` is to be a days measure of how well the user has done in terms of their habits. Therefore, the requirement is that if the user did not meet all their habits, it should be impossible to get 100%, and if they meet all requirements they should get 100%.
- Thus, very simply, the completion score is the average of all the completion scores of each habit that is displayed that day. THAT MEANS, let's say a habit is due every 3 days, and I did nothing today, then my completion score will be 0%, but the next day, when I do one thing, the completion score will become 100% for both days!

---

## Input Parsing

Users create habits by typing a phrase like “morning stretch three times a week”.  
The parser extracts three parts: **title**, **target_count**, **recurrence**.

These parts are displayed in chips below the input field. There are 3 chips when you start

### Chips

#### Title

It starts as "untitled habit" and is updated as the user types. It is the remaining text after removing schedule and frequency tokens, with stopwords like `a`/`per` trimmed.

#### Frequency

It starts as "1x". The user can click this to open a floating menu to select a different frequency (1-9x in the list).

As the user types, the parser looks for explicit frequency tokens like `twice` or `3 times` and updates this chip accordingly. Bare numbers (e.g. "read 10 pages") are ignored and left in the title.

#### Recurrence

It starts as "daily", the user can click this to open a floating menu with 3 options ("days", "weeks", "days of week") and when they click on one, the floating menu changes to ask for ("daily", "2 days", "3 days", "other"), clicking other will allow for a single character number input.

For days of week, it switches to a multi select with the days of week and options for "every week" (interval 1) and "every other week" (interval 2). If the user selects all weekdays or weekends, the chip changes to display that to be less verbose.

As the user types, the parser looks for schedule phrases and updates this chip accordingly. If the user types "every mon, wed, fri", it will be parsed as daysOfWeek with days [1,3,5]. If the user types "every other week", it will be parsed as weeks with interval 2.

### Defaults

- Recurrence: `{"type": "days", "interval": 1}`
- target_count: `1`

### Extraction Order

1. **Schedule phrase** – searched globally (matched from end-first for natural feel).  
   Supported patterns: `daily`, `every day`, `each day`, `every morning/afternoon/evening`, `weekly`, `every week`, `every N weeks`, `every other week`, `on Monday, Wednesday`, `every Sunday`, etc.

2. **Frequency** – only explicit count phrases, never bare numbers:  
   `\b(once|twice|[1-9]\d{0,2})\s*(times?|×|x)\b` plus standalone `once` / `twice`.  
   Example: `"twice"` → target 2; `"8 hours"` → no match (stays in title).

3. **Title** – all remaining text after removing the above, with stopwords like `a`/`per` trimmed.

### Examples

| Input                                 | Title           | target | recurrence                        |
| ------------------------------------- | --------------- | ------ | --------------------------------- |
| `morning stretch`                     | morning stretch | 1      | daily                             |
| `floss twice a day`                   | floss           | 2      | daily                             |
| `call mom every mon, tue, fri`        | call mom        | 1      | daysOfWeek [1,2,5]                |
| `read 10 pages daily`                 | read 10 pages   | 1      | daily (10 not “X times”)          |
| `sleep 8 hours daily`                 | sleep 8 hours   | 1      | daily                             |
| `text family once every week`         | text family     | 1      | weekly, interval:1                |
| `stretch`                             | stretch         | 1      | daily                             |

---

## UI Behaviour

### Habit Creation

- Modal with a single text input and 3 chips below it.
- Real‑time parsing underlines recognised tokens and displays editable chips (title, frequency, recurrence).
- Tapping a chip lets the user override the parsed value manually.
- Defaults (“once a day”) apply when nothing is detected.
- The raw string is **not** saved – only the structured result.

### Tracking & Completions

#### Desktop

- Clicking a habit marks one completion. A habit is a horizontal rectangle with the title on the left and the completion status on the right (e.g. "2/3" or a progress bar). Clicking anywhere on the habit marks a completion for that day.
- Once 3/3 or 100% completion, the fraction gets replaced with a checkmark to indicate the habit is complete for that day.
- Habits cannot be completion for higher than 100%.
- Right-clicking a habit undos a completion.

#### Mobile

- Clicking a habit or swiping right (like you're trying to fill the bar yourself) marks a completion.
- Swiping left undos one completion.

### Editing

- On the top right, there's a settings icon. To its immediate left is the plus button which opens the modal to make a new habit. To that buttons left is an edit icon.
- When in edit mode, the habits get less wide to make room for 2 buttons to the right of each habit. One archive and one delete.
- On archive, a confirmation modal pops up, explaining that the habit will be archived and cannot be recovered. It will delete this habit but past completions will remain.
- On delete, a confirmation modal pops up, explaining that the habit will be deleted and all past completions will be deleted as well. It will delete this habit and all its completions.

---

## Design

The design is meant to match ez-blank's design very closely. That is, there's a top nav bar, the top right settings button and floating menu is the same. For now, there is no left sliding plane. The same fixed context max width.
