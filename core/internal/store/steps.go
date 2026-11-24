package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
)

// BoardStep is one column of the task board. "smart" steps sort tasks
// automatically by due date/status; "custom" steps hold tasks that were
// explicitly placed there (tasks.step_id).
type BoardStep struct {
	ID     string `json:"id"`
	Label  string `json:"label"`
	Hint   string `json:"hint"`
	Color  string `json:"color"`
	Kind   string `json:"kind"`
	Hidden bool   `json:"hidden"`
}

var smartStepIDs = map[string]bool{"overdue": true, "today": true, "planned": true, "inbox": true, "done": true}

var hexColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
var stepIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

func defaultBoardSteps() []BoardStep {
	return []BoardStep{
		{ID: "overdue", Label: "Overdue", Hint: "Due date has passed", Color: "#dd2c22", Kind: "smart"},
		{ID: "today", Label: "Today", Hint: "Due today or urgent", Color: "#ffc61a", Kind: "smart"},
		{ID: "planned", Label: "Planned", Hint: "Scheduled or linked work", Color: "#ff8c00", Kind: "smart"},
		{ID: "inbox", Label: "Inbox", Hint: "No schedule yet", Color: "#9aa1b9", Kind: "smart"},
		{ID: "done", Label: "Done", Hint: "Completed work", Color: "#22c55e", Kind: "smart"},
	}
}

func parseBoardSteps(raw string) []BoardStep {
	if strings.TrimSpace(raw) == "" {
		return defaultBoardSteps()
	}
	var steps []BoardStep
	if err := json.Unmarshal([]byte(raw), &steps); err != nil {
		return defaultBoardSteps()
	}
	normalized, err := normalizeBoardSteps(steps)
	if err != nil {
		return defaultBoardSteps()
	}
	return normalized
}

// normalizeBoardSteps validates a column list. Any column, built-in or custom,
// may be removed; at least one visible column must remain so tasks always have
// somewhere to show.
func normalizeBoardSteps(steps []BoardStep) ([]BoardStep, error) {
	if len(steps) == 0 {
		return nil, errors.New("the board needs at least one column")
	}
	if len(steps) > 40 {
		return nil, errors.New("too many board columns")
	}
	defaults := map[string]BoardStep{}
	for _, step := range defaultBoardSteps() {
		defaults[step.ID] = step
	}
	seen := map[string]bool{}
	out := make([]BoardStep, 0, len(steps)+len(defaults))
	for _, step := range steps {
		step.ID = strings.TrimSpace(step.ID)
		step.Label = strings.TrimSpace(step.Label)
		step.Hint = strings.TrimSpace(step.Hint)
		if !stepIDPattern.MatchString(step.ID) {
			return nil, errors.New("invalid board step id")
		}
		if seen[step.ID] {
			return nil, errors.New("duplicate board step id")
		}
		seen[step.ID] = true
		if smartStepIDs[step.ID] {
			step.Kind = "smart"
		} else {
			step.Kind = "custom"
		}
		if step.Label == "" {
			if def, ok := defaults[step.ID]; ok {
				step.Label = def.Label
			} else {
				return nil, errors.New("board step name is required")
			}
		}
		if len(step.Label) > 60 {
			step.Label = step.Label[:60]
		}
		if len(step.Hint) > 120 {
			step.Hint = step.Hint[:120]
		}
		if !hexColor.MatchString(step.Color) {
			if def, ok := defaults[step.ID]; ok {
				step.Color = def.Color
			} else {
				step.Color = "#64748b"
			}
		}
		out = append(out, step)
	}
	anyVisible := false
	for _, step := range out {
		if !step.Hidden {
			anyVisible = true
			break
		}
	}
	if !anyVisible {
		out[0].Hidden = false
	}
	return out, nil
}

// clearOrphanedTaskSteps detaches tasks from custom steps that were deleted, so
// they fall back to the smart steps. Hidden steps keep their tasks.
func clearOrphanedTaskSteps(tx *sql.Tx, steps []BoardStep) error {
	active := []any{}
	placeholders := []string{}
	for _, step := range steps {
		if step.Kind == "custom" {
			active = append(active, step.ID)
			placeholders = append(placeholders, "?")
		}
	}
	query := `UPDATE tasks SET step_id=NULL WHERE step_id IS NOT NULL`
	if len(placeholders) > 0 {
		query += ` AND step_id NOT IN (` + strings.Join(placeholders, ",") + `)`
	}
	_, err := tx.Exec(query, active...)
	return err
}
