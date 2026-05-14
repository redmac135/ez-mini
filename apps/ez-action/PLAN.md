# ez-action

A minimal task tracker that just works.

## UI

ui in ez-mini apps are split into:

- navbar left
- navbar right
- main content
- left sidebar drawer

### Navbar left

A hamburger icon to open the left sidebar

### Navbar right

topright settings menu as per normal

- dark and light mode
- sync
- account login logout

### Main content

This is split into 3 sections top to bottom

1. title of the list
2. the list of tasks
3. there's a fixed text input at the bottom of the page for adding a new task

Each task has a checkbox on the left, and the task text. Swiping left opens an edit menu where you can edit or delete the task. Swiping right adds the task to "Today" list.

### Task creation input

The text input at the bottom contains three chips on the right side:

- **Repeat** (default: "None")
- **Due** (default: "None")
- **Planned** (default: "None")

As the user types, natural language parsing automatically updates the chip values. For example, typing "Buy milk due tomorrow every week" would update Due to "Tomorrow" and Repeat to "Weekly".

Tapping any chip opens a minimal floating popup menu:

**Repeat popup:**

- None
- Daily
- Weekly (on [day])
- Monthly
- Yearly
- Custom... (opens a secondary picker for advanced options like every N days, specific days of week, day of month, etc.)

**Due / Planned popup:**

- Today
- Tomorrow
- Next week (shows the upcoming Sunday's date)
- Pick a date... (opens a mini calendar)

These popups mirror the Microsoft To Do quick date picker pattern — minimal, fast, no full screen modals.

### Left sidebar drawer

Just like ez-blank, it's a list of lists. There are two sections split by a line. There are two "Derived" lists, one normal list, and any number of additional lists.

On the top are the two derived lists and one normal list

- Today (derived): tasks marked today by the user, or due today or in the past, or planned today or in the past.
- Planned (derived): tasks that are planned, sorted by due date.
- Tasks: the default place where new tasks land when not given a list.

Note that, for a task to be in today or planned, it has to be in another real list.

Below the line are any number of user-created lists. Each list has a name, and can be archived or deleted.

- **Archiving** a list sets `archived_at` on both the list and all its child tasks. The list is hidden from the sidebar but can be unarchived, which restores the list and all its tasks (sets `archived_at` back to NULL on everything).
- **Deleting** a list soft-deletes the list and all its tasks permanently (sets `deleted_at`). This action cannot be undone.

On the bottom right of the sidebar is a button to create a new list. Clicking it opens a prompt to enter the list name, and creates a new list.

## Data model

```sql
-- Helper function for automatic updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE lists (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL CHECK (name <> ''),
    archived_at TIMESTAMPTZ NULL,
    deleted_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER lists_updated_at BEFORE UPDATE ON lists
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE lists ENABLE ROW LEVEL SECURITY;

CREATE TABLE tasks (
    id UUID PRIMARY KEY,
    list_id UUID NULL REFERENCES lists(id), -- if null, the task is in the default "Tasks" list
    title TEXT NOT NULL CHECK (title <> ''),
    planned_at TIMESTAMPTZ NULL, -- when the task is planned to be worked on
    due_at TIMESTAMPTZ NULL, -- when the task is due, used for sorting in the "Planned" list
    today BOOLEAN NOT NULL DEFAULT false, -- whether the task is explicitly marked for today
    repeat_rule JSONB NULL CHECK (
        repeat_rule IS NULL OR (
            repeat_rule ? 'frequency'
            AND repeat_rule->>'frequency' IN ('daily', 'weekly', 'monthly', 'yearly')
            AND CASE
                WHEN repeat_rule->>'frequency' = 'daily' THEN
                    repeat_rule ? 'interval' AND jsonb_typeof(repeat_rule->'interval') = 'number' AND (repeat_rule->>'interval')::int > 0
                WHEN repeat_rule->>'frequency' = 'weekly' THEN
                    repeat_rule ? 'interval' AND jsonb_typeof(repeat_rule->'interval') = 'number' AND (repeat_rule->>'interval')::int > 0
                    AND repeat_rule ? 'daysOfWeek' AND jsonb_typeof(repeat_rule->'daysOfWeek') = 'array'
                WHEN repeat_rule->>'frequency' = 'monthly' THEN (
                    repeat_rule ? 'dayOfMonth' AND jsonb_typeof(repeat_rule->'dayOfMonth') = 'number'
                    AND (repeat_rule->>'dayOfMonth')::int BETWEEN 1 AND 31
                ) OR (
                    repeat_rule ? 'weekOfMonth' AND jsonb_typeof(repeat_rule->'weekOfMonth') = 'number'
                    AND repeat_rule ? 'dayOfWeek' AND jsonb_typeof(repeat_rule->'dayOfWeek') = 'number'
                    AND (repeat_rule->>'dayOfWeek')::int BETWEEN 0 AND 6
                )
                WHEN repeat_rule->>'frequency' = 'yearly' THEN (
                    repeat_rule ? 'month' AND jsonb_typeof(repeat_rule->'month') = 'number'
                    AND (repeat_rule->>'month')::int BETWEEN 1 AND 12
                    AND (
                        (
                            repeat_rule ? 'dayOfMonth' AND jsonb_typeof(repeat_rule->'dayOfMonth') = 'number'
                            AND (repeat_rule->>'dayOfMonth')::int BETWEEN 1 AND 31
                        ) OR (
                            repeat_rule ? 'weekOfMonth' AND jsonb_typeof(repeat_rule->'weekOfMonth') = 'number'
                            AND repeat_rule ? 'dayOfWeek' AND jsonb_typeof(repeat_rule->'dayOfWeek') = 'number'
                            AND (repeat_rule->>'dayOfWeek')::int BETWEEN 0 AND 6
                        )
                    )
                )
            END
        )
    ),
    -- repeat_rule examples:
    -- { "frequency": "daily", "interval": 1 }                              — every day
    -- { "frequency": "daily", "interval": 3 }                              — every 3 days
    -- { "frequency": "weekly", "interval": 1, "daysOfWeek": [1, 3, 5] }   — every Mon, Wed, Fri
    -- { "frequency": "weekly", "interval": 2, "daysOfWeek": [0] }          — every other Sunday
    -- { "frequency": "monthly", "dayOfMonth": 15 }                         — every 15th of the month
    -- { "frequency": "monthly", "weekOfMonth": 1, "dayOfWeek": 1 }         — first Monday of every month
    -- { "frequency": "monthly", "weekOfMonth": -1, "dayOfWeek": 5 }        — last Saturday of every month
    -- { "frequency": "yearly", "month": 1, "dayOfMonth": 15 }              — every January 15th
    -- { "frequency": "yearly", "month": 3, "weekOfMonth": 2, "dayOfWeek": 1 } — second Monday of March every year
    completed_at TIMESTAMPTZ NULL,
    archived_at TIMESTAMPTZ NULL,
    deleted_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_lists_deleted ON lists(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_lists_archived ON lists(archived_at) WHERE archived_at IS NULL AND deleted_at IS NULL;

CREATE INDEX idx_tasks_list_id ON tasks(list_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_planned ON tasks(planned_at) WHERE planned_at IS NOT NULL AND deleted_at IS NULL AND archived_at IS NULL;
CREATE INDEX idx_tasks_due ON tasks(due_at) WHERE due_at IS NOT NULL AND deleted_at IS NULL AND archived_at IS NULL;
CREATE INDEX idx_tasks_today ON tasks(today) WHERE today = true AND deleted_at IS NULL AND archived_at IS NULL;
CREATE INDEX idx_tasks_completed ON tasks(completed_at) WHERE completed_at IS NULL AND deleted_at IS NULL AND archived_at IS NULL;
CREATE INDEX idx_tasks_archived ON tasks(archived_at) WHERE archived_at IS NULL AND deleted_at IS NULL;
```

## Derived list queries

### Today list

Tasks that need attention today: explicitly marked for today, or planned for today or earlier, or due today or earlier. Excludes completed, archived, and deleted tasks.

```sql
SELECT * FROM tasks
WHERE deleted_at IS NULL
  AND archived_at IS NULL
  AND completed_at IS NULL
  AND list_id IS NOT NULL
  AND (
    today = true
    OR planned_at <= CURRENT_DATE
    OR due_at <= CURRENT_DATE
  )
ORDER BY
  due_at ASC NULLS LAST,
  planned_at ASC NULLS LAST,
  created_at ASC;
```

### Planned list

Tasks with a `due_at` date, sorted by due date. Excludes completed, archived, and deleted tasks.

```sql
SELECT * FROM tasks
WHERE deleted_at IS NULL
  AND archived_at IS NULL
  AND completed_at IS NULL
  AND due_at IS NOT NULL
  AND list_id IS NOT NULL
ORDER BY due_at ASC;
```

## List archiving

Archiving a list sets `archived_at` on both the list and all its child tasks. Unarchiving restores everything.

```sql
-- Archive a list and all its tasks
BEGIN;
UPDATE tasks SET archived_at = now(), updated_at = now()
WHERE list_id = $1 AND deleted_at IS NULL AND archived_at IS NULL;
UPDATE lists SET archived_at = now(), updated_at = now()
WHERE id = $1 AND deleted_at IS NULL;
COMMIT;

-- Unarchive a list and all its tasks
BEGIN;
UPDATE tasks SET archived_at = NULL, updated_at = now()
WHERE list_id = $1 AND archived_at IS NOT NULL AND deleted_at IS NULL;
UPDATE lists SET archived_at = NULL, updated_at = now()
WHERE id = $1 AND archived_at IS NOT NULL;
COMMIT;
```

## List deletion (permanent, cannot be undone)

```sql
BEGIN;
UPDATE tasks SET deleted_at = now(), updated_at = now()
WHERE list_id = $1 AND deleted_at IS NULL;
UPDATE lists SET deleted_at = now(), updated_at = now()
WHERE id = $1 AND deleted_at IS NULL;
COMMIT;
```

## Creating a Task

Similar to ez-repeat, we support quick task creation with natural language parsing. The user can type something like "Buy milk tomorrow" or "Call mom every Monday" and the chips in the input update automatically as the user types.

The parsing rules are as follows:

- If the text contains "due" followed by a date or relative date, we set the `due_at` field. For example, "due tomorrow" sets `due_at` to tomorrow's date.
- If the text contains "do" followed by a date or relative date, we set the `planned_at` field. For example, "do next Monday" sets `planned_at` to next Monday's date.
- If the text contains "every" followed by a frequency, we set the `repeat_rule` field. For example, "every day" sets `repeat_rule` to `{ "frequency": "daily", "interval": 1 }`. "every week on Monday and Wednesday" sets `repeat_rule` to `{ "frequency": "weekly", "interval": 1, "daysOfWeek": [1, 3] }`. "every other week" sets `repeat_rule` to `{ "frequency": "weekly", "interval": 2 }`.

Users can also tap the chips directly to set or change these values via the popup menus, independent of the text input.

## Repeat rules and completion semantics

When a task with a `repeat_rule` is completed (its `completed_at` is set to `now()`), a new task is spawned. The original task remains completed and does not mutate.

The new task inherits the same `title`, `list_id`, and `repeat_rule`. Its `planned_at` and `due_at` are calculated by advancing the original task's `planned_at` and `due_at` by the repeat interval. The new task starts with `today = false`, `completed_at = NULL`, `archived_at = NULL`, and `deleted_at = NULL`. Its `created_at` is set to `now()`.

### Advancing dates by repeat interval

- **Daily** (`interval: N`): advance by N days.
- **Weekly** (`interval: N`, `daysOfWeek: [...]`): advance to the next matching day of the week. For example, if `daysOfWeek` is `[0, 3]` (Sunday and Wednesday) and the task is completed on a Monday, the new task's date advances to the next Wednesday. If completed on a Sunday, it advances to the next Wednesday. The maximum jump is one full cycle through the specified days.
- **Monthly** (`dayOfMonth: D`): advance to the same day of the month in the next cycle. If the day doesn't exist in the target month (e.g., 31st in April), use the last day of that month.
- **Monthly** (`weekOfMonth: W`, `dayOfWeek: D`): advance to the next occurrence of that weekday ordinal (e.g., second Monday) in a future month.
- **Yearly** (`month: M`, `dayOfMonth: D`): advance to the same month and day in the next year.
- **Yearly** (`month: M`, `weekOfMonth: W`, `dayOfWeek: D`): advance to the same ordinal weekday in that month in the next year.

### Handling dates in the past

After advancing, if the new task's `planned_at` or `due_at` would still be in the past, we continue advancing by the repeat interval until the date is today or in the future. Before doing this automatically, we show a minimal modal asking the user: "This task's dates are in the past. Move to the next upcoming occurrence?" If confirmed, we advance until the date reaches the present or future. If declined, the task spawns with the calculated past date as-is.
