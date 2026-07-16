package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

type Store struct{ db *sql.DB }

func New(db *sql.DB) *Store { return &Store{db: db} }

type Task struct {
	ID              string          `json:"id"`
	Title           string          `json:"title"`
	Content         *string         `json:"content"`
	Priority        string          `json:"priority"`
	TypeID          *string         `json:"typeId"`
	DueAtUTC        *string         `json:"dueAtUtc"`
	Status          string          `json:"status"`
	LinkedPeriodIDs []string        `json:"linkedPeriodIds"`
	RecurrenceRule  *RecurrenceRule `json:"recurrenceRule"`
	CreatedAtUTC    string          `json:"createdAtUtc"`
	UpdatedAtUTC    string          `json:"updatedAtUtc"`
}

type TaskType struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color"`
	Icon  string `json:"icon"`
}

type TimePeriod struct {
	ID              string          `json:"id"`
	Title           string          `json:"title"`
	Description     *string         `json:"description"`
	StartAtUTC      string          `json:"startAtUtc"`
	EndAtUTC        string          `json:"endAtUtc"`
	SourceTimezone  string          `json:"sourceTimezone"`
	Category        string          `json:"category"`
	Color           string          `json:"color"`
	Status          string          `json:"status"`
	LinkedTaskCount int             `json:"linkedTaskCount"`
	Notes           *string         `json:"notes"`
	RecurrenceRule  *RecurrenceRule `json:"recurrenceRule"`
}

type RecurrenceRule struct {
	ID              string  `json:"id,omitempty"`
	OwnerType       string  `json:"ownerType,omitempty"`
	OwnerID         string  `json:"ownerId,omitempty"`
	Frequency       string  `json:"frequency"`
	IntervalCount   int     `json:"intervalCount"`
	Weekdays        []int   `json:"weekdays"`
	MonthRule       *string `json:"monthRule"`
	StartsOn        *string `json:"startsOn"`
	EndsOn          *string `json:"endsOn"`
	OccurrenceCount *int    `json:"occurrenceCount"`
}

type Settings struct {
	Theme                string `json:"theme"`
	DefaultTimezone      string `json:"defaultTimezone"`
	StartWithWindows     bool   `json:"startWithWindows"`
	MinimizeToTray       bool   `json:"minimizeToTray"`
	CloseToTray          bool   `json:"closeToTray"`
	SnapIntervalMinutes  int    `json:"snapIntervalMinutes"`
	TimeFormat           string `json:"timeFormat"`
	NotificationsEnabled bool   `json:"notificationsEnabled"`
	PeriodNotifications  bool   `json:"periodNotifications"`
	TaskNotifications    bool   `json:"taskNotifications"`
	QuietHoursEnabled    bool   `json:"quietHoursEnabled"`
	QuietHoursStart      string `json:"quietHoursStart"`
	QuietHoursEnd        string `json:"quietHoursEnd"`
	DefaultSnoozeMinutes int    `json:"defaultSnoozeMinutes"`
}

type NotificationHistory struct {
	ID        string `json:"id"`
	OwnerType string `json:"ownerType"`
	OwnerID   string `json:"ownerId"`
	Title     string `json:"title"`
	SentAtUTC string `json:"sentAtUtc"`
	EventType string `json:"eventType"`
}

type Snapshot struct {
	NowUTC              string                `json:"nowUtc"`
	Settings            Settings              `json:"settings"`
	TaskTypes           []TaskType            `json:"taskTypes"`
	Tasks               []Task                `json:"tasks"`
	Periods             []TimePeriod          `json:"periods"`
	NotificationHistory []NotificationHistory `json:"notificationHistory"`
}

type ReminderEvent struct {
	ID          string `json:"id"`
	OwnerType   string `json:"ownerType"`
	OwnerID     string `json:"ownerId"`
	Title       string `json:"title"`
	Body        string `json:"body"`
	EventType   string `json:"eventType"`
	RemindAtUTC string `json:"remindAtUtc"`
}

type DailyTemplate struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	PeriodCount  int    `json:"periodCount"`
	CreatedAtUTC string `json:"createdAtUtc"`
}

type CreateTaskInput struct {
	Title           string          `json:"title"`
	Content         *string         `json:"content"`
	Priority        string          `json:"priority"`
	TypeID          *string         `json:"typeId"`
	DueAtUTC        *string         `json:"dueAtUtc"`
	LinkedPeriodIDs []string        `json:"linkedPeriodIds"`
	RecurrenceRule  *RecurrenceRule `json:"recurrenceRule"`
}

type CreateTaskTypeInput struct {
	Name  string `json:"name"`
	Color string `json:"color"`
	Icon  string `json:"icon"`
}

type UpdateTaskTypeInput struct {
	ID    string  `json:"id"`
	Name  *string `json:"name"`
	Color *string `json:"color"`
	Icon  *string `json:"icon"`
}

type CreatePeriodInput struct {
	Title          string          `json:"title"`
	Description    *string         `json:"description"`
	StartAtUTC     string          `json:"startAtUtc"`
	EndAtUTC       string          `json:"endAtUtc"`
	SourceTimezone string          `json:"sourceTimezone"`
	Category       string          `json:"category"`
	Color          string          `json:"color"`
	Notes          *string         `json:"notes"`
	RecurrenceRule *RecurrenceRule `json:"recurrenceRule"`
}

type UpdateTaskInput struct {
	ID                  string          `json:"id"`
	Title               *string         `json:"title"`
	Content             *string         `json:"content"`
	Priority            *string         `json:"priority"`
	TypeID              *string         `json:"typeId"`
	DueAtUTC            *string         `json:"dueAtUtc"`
	LinkedPeriodIDs     []string        `json:"linkedPeriodIds"`
	RecurrenceRule      *RecurrenceRule `json:"recurrenceRule"`
	RecurrenceEditScope string          `json:"recurrenceEditScope"`
}

type UpdatePeriodInput struct {
	ID                  string          `json:"id"`
	Title               *string         `json:"title"`
	Description         *string         `json:"description"`
	StartAtUTC          *string         `json:"startAtUtc"`
	EndAtUTC            *string         `json:"endAtUtc"`
	SourceTimezone      *string         `json:"sourceTimezone"`
	Category            *string         `json:"category"`
	Color               *string         `json:"color"`
	Notes               *string         `json:"notes"`
	RecurrenceRule      *RecurrenceRule `json:"recurrenceRule"`
	RecurrenceEditScope string          `json:"recurrenceEditScope"`
	RecurrenceRuleSet   bool            `json:"-"`
}

func (input *UpdatePeriodInput) UnmarshalJSON(data []byte) error {
	type alias UpdatePeriodInput
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	var decoded alias
	if err := json.Unmarshal(data, &decoded); err != nil {
		return err
	}
	*input = UpdatePeriodInput(decoded)
	_, input.RecurrenceRuleSet = raw["recurrenceRule"]
	return nil
}

func (s *Store) Migrate() error {
	stmts := []string{
		`PRAGMA foreign_keys = ON`,
		`CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at_utc TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS task_types(id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, color TEXT NOT NULL, icon TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, title TEXT NOT NULL, priority TEXT NOT NULL, type_id TEXT REFERENCES task_types(id), due_at_utc TEXT, status TEXT NOT NULL, created_at_utc TEXT NOT NULL, updated_at_utc TEXT NOT NULL, deleted_at_utc TEXT)`,
		`ALTER TABLE tasks ADD COLUMN content TEXT`,
		`CREATE TABLE IF NOT EXISTS time_periods(id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, start_at_utc TEXT NOT NULL, end_at_utc TEXT NOT NULL, source_timezone TEXT NOT NULL, category TEXT NOT NULL, color TEXT NOT NULL, status TEXT NOT NULL, notes TEXT, created_at_utc TEXT NOT NULL, updated_at_utc TEXT NOT NULL, deleted_at_utc TEXT)`,
		`CREATE TABLE IF NOT EXISTS task_period_links(task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, period_id TEXT NOT NULL REFERENCES time_periods(id) ON DELETE CASCADE, completed_during_period INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(task_id, period_id))`,
		`CREATE TABLE IF NOT EXISTS recurrence_rules(id TEXT PRIMARY KEY, owner_type TEXT NOT NULL, owner_id TEXT NOT NULL, frequency TEXT NOT NULL, interval_count INTEGER NOT NULL DEFAULT 1, weekdays TEXT, month_rule TEXT, starts_on TEXT, ends_on TEXT, occurrence_count INTEGER)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_recurrence_owner ON recurrence_rules(owner_type, owner_id)`,
		`CREATE TABLE IF NOT EXISTS recurrence_exceptions(owner_type TEXT NOT NULL, owner_id TEXT NOT NULL, occurrence_start_utc TEXT NOT NULL, action TEXT NOT NULL, created_at_utc TEXT NOT NULL, PRIMARY KEY(owner_type, owner_id, occurrence_start_utc))`,
		`CREATE TABLE IF NOT EXISTS reminders(id TEXT PRIMARY KEY, owner_type TEXT NOT NULL, owner_id TEXT NOT NULL, remind_at_utc TEXT NOT NULL, status TEXT NOT NULL, snoozed_until_utc TEXT)`,
		`CREATE TABLE IF NOT EXISTS notification_history(id TEXT PRIMARY KEY, owner_type TEXT NOT NULL, owner_id TEXT NOT NULL, sent_at_utc TEXT NOT NULL, event_type TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS daily_templates(id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at_utc TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS daily_template_periods(template_id TEXT NOT NULL REFERENCES daily_templates(id) ON DELETE CASCADE, title TEXT NOT NULL, description TEXT, start_minute INTEGER NOT NULL, end_minute INTEGER NOT NULL, source_timezone TEXT NOT NULL, category TEXT NOT NULL, color TEXT NOT NULL, notes TEXT)`,
		`CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
		`CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_at_utc)`,
		`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`,
		`CREATE INDEX IF NOT EXISTS idx_periods_start ON time_periods(start_at_utc)`,
		`CREATE INDEX IF NOT EXISTS idx_periods_end ON time_periods(end_at_utc)`,
		`CREATE INDEX IF NOT EXISTS idx_reminders_lookup ON reminders(status, remind_at_utc)`,
	}
	for _, stmt := range stmts {
		if _, err := s.db.Exec(stmt); err != nil {
			if strings.Contains(stmt, `ALTER TABLE tasks ADD COLUMN content`) && strings.Contains(strings.ToLower(err.Error()), "duplicate column") {
				continue
			}
			return err
		}
	}
	_, err := s.db.Exec(`INSERT OR IGNORE INTO settings(key,value) VALUES
		('theme','dark'),('defaultTimezone','America/Denver'),('startWithWindows','false'),
		('minimizeToTray','true'),('closeToTray','true'),('snapIntervalMinutes','15'),('timeFormat','12h'),
		('notificationsEnabled','true'),('periodNotifications','true'),('taskNotifications','true'),
		('quietHoursEnabled','false'),('quietHoursStart','22:00'),('quietHoursEnd','07:00'),('defaultSnoozeMinutes','15')`)
	return err
}

func (s *Store) SeedDemo() error {
	if _, err := s.db.Exec(`INSERT OR IGNORE INTO task_types(id,name,color,icon) VALUES
		('type-work','Work','#2563eb','briefcase'),('type-upwork','Upwork','#16a34a','badge-dollar-sign'),
		('type-research','Research','#7c3aed','search'),('type-learning','Learning','#9333ea','book-open'),
		('type-english','English','#f59e0b','languages'),('type-planning','Planning','#ef4444','target'),
		('type-admin','Admin','#64748b','settings')`); err != nil {
		return err
	}
	if !s.seedMarker("seedTimelineV3") {
		if err := s.seedInitialTimeline(); err != nil {
			return err
		}
		_, _ = s.db.Exec(`INSERT INTO settings(key,value) VALUES('seedTimelineV3','true') ON CONFLICT(key) DO UPDATE SET value='true'`)
	}
	if !s.seedMarker("seedTasksV7") {
		if err := s.seedInitialTasks(); err != nil {
			return err
		}
		_, _ = s.db.Exec(`INSERT INTO settings(key,value) VALUES('seedTasksV7','true') ON CONFLICT(key) DO UPDATE SET value='true'`)
	}
	return nil
}

func (s *Store) seedMarker(key string) bool {
	var value string
	_ = s.db.QueryRow(`SELECT value FROM settings WHERE key=?`, key).Scan(&value)
	return value == "true"
}

func (s *Store) Snapshot() (Snapshot, error) {
	if !s.seedMarker("dataFormatted") {
		_ = s.SeedDemo()
	}
	taskTypes := s.taskTypes()
	if taskTypes == nil {
		taskTypes = []TaskType{}
	}
	tasks := s.tasks()
	if tasks == nil {
		tasks = []Task{}
	}
	periods := s.periods()
	if periods == nil {
		periods = []TimePeriod{}
	}
	notificationHistory := s.notificationHistory()
	if notificationHistory == nil {
		notificationHistory = []NotificationHistory{}
	}
	return Snapshot{
		NowUTC:              time.Now().UTC().Format(time.RFC3339),
		Settings:            s.settings(),
		TaskTypes:           taskTypes,
		Tasks:               tasks,
		Periods:             periods,
		NotificationHistory: notificationHistory,
	}, nil
}

func (s *Store) CreateTask(input CreateTaskInput) (Task, error) {
	if input.Title == "" {
		return Task{}, errors.New("task title is required")
	}
	if input.Priority == "" {
		input.Priority = "none"
	}
	now := time.Now().UTC().Format(time.RFC3339)
	id := newID("task")
	tx, err := s.db.Begin()
	if err != nil {
		return Task{}, err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`INSERT INTO tasks(id,title,content,priority,type_id,due_at_utc,status,created_at_utc,updated_at_utc) VALUES(?,?,?,?,?,?,'open',?,?)`, id, input.Title, input.Content, input.Priority, input.TypeID, input.DueAtUTC, now, now); err != nil {
		return Task{}, err
	}
	if input.DueAtUTC != nil {
		if _, err := tx.Exec(`INSERT OR REPLACE INTO reminders(id,owner_type,owner_id,remind_at_utc,status) VALUES(?,?,?,?, 'pending')`, "reminder-task-"+id, "task", id, *input.DueAtUTC); err != nil {
			return Task{}, err
		}
	}
	for _, pid := range input.LinkedPeriodIDs {
		if _, err := tx.Exec(`INSERT OR IGNORE INTO task_period_links(task_id,period_id) VALUES(?,?)`, id, pid); err != nil {
			return Task{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return Task{}, err
	}
	if input.RecurrenceRule != nil {
		_ = s.SaveRecurrenceRule("task", id, input.RecurrenceRule)
	}
	return s.taskByID(id)
}

func (s *Store) CreateTaskType(input CreateTaskTypeInput) (TaskType, error) {
	if input.Name == "" {
		return TaskType{}, errors.New("task type name is required")
	}
	if input.Color == "" {
		input.Color = "#2563eb"
	}
	if input.Icon == "" {
		input.Icon = "tag"
	}
	id := newID("type")
	if _, err := s.db.Exec(`INSERT INTO task_types(id,name,color,icon) VALUES(?,?,?,?)`, id, input.Name, input.Color, input.Icon); err != nil {
		return TaskType{}, err
	}
	return TaskType{ID: id, Name: input.Name, Color: input.Color, Icon: input.Icon}, nil
}

func (s *Store) UpdateTaskType(input UpdateTaskTypeInput) (TaskType, error) {
	if input.ID == "" {
		return TaskType{}, errors.New("task type id is required")
	}
	current := TaskType{}
	if err := s.db.QueryRow(`SELECT id,name,color,icon FROM task_types WHERE id=?`, input.ID).Scan(&current.ID, &current.Name, &current.Color, &current.Icon); err != nil {
		return TaskType{}, err
	}
	if input.Name != nil {
		if *input.Name == "" {
			return TaskType{}, errors.New("task type name is required")
		}
		current.Name = *input.Name
	}
	if input.Color != nil {
		current.Color = *input.Color
	}
	if input.Icon != nil {
		current.Icon = *input.Icon
	}
	if _, err := s.db.Exec(`UPDATE task_types SET name=?, color=?, icon=? WHERE id=?`, current.Name, current.Color, current.Icon, current.ID); err != nil {
		return TaskType{}, err
	}
	return current, nil
}

func (s *Store) DeleteTaskType(id string) error {
	if id == "" {
		return errors.New("task type id is required")
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`UPDATE tasks SET type_id=NULL WHERE type_id=?`, id); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM task_types WHERE id=?`, id); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) CompleteTask(id string, completed bool) (Task, error) {
	status := "open"
	if completed {
		status = "completed"
	}
	_, err := s.db.Exec(`UPDATE tasks SET status=?, updated_at_utc=? WHERE id=?`, status, time.Now().UTC().Format(time.RFC3339), id)
	if err != nil {
		return Task{}, err
	}
	for _, task := range s.tasks() {
		if task.ID == id {
			return task, nil
		}
	}
	return Task{}, errors.New("task not found")
}

func (s *Store) UpdateTask(input UpdateTaskInput) (Task, error) {
	if input.ID == "" {
		return Task{}, errors.New("task id is required")
	}
	current, err := s.taskByID(input.ID)
	if err != nil {
		return Task{}, err
	}
	title := current.Title
	content := current.Content
	priority := current.Priority
	typeID := current.TypeID
	dueAt := current.DueAtUTC
	if input.Title != nil {
		if *input.Title == "" {
			return Task{}, errors.New("task title is required")
		}
		title = *input.Title
	}
	if input.Content != nil {
		content = input.Content
	}
	if input.Priority != nil {
		priority = *input.Priority
	}
	if input.TypeID != nil {
		typeID = input.TypeID
	}
	if input.DueAtUTC != nil {
		if *input.DueAtUTC == "" {
			dueAt = nil
		} else {
			dueAt = input.DueAtUTC
		}
	}
	scope := recurrenceScope(input.RecurrenceEditScope)
	if current.RecurrenceRule != nil && scope == "this" {
		return s.CreateTask(CreateTaskInput{Title: title, Content: content, Priority: priority, TypeID: typeID, DueAtUTC: dueAt, LinkedPeriodIDs: input.LinkedPeriodIDs, RecurrenceRule: nil})
	}
	if current.RecurrenceRule != nil && scope == "following" {
		if dueAt == nil {
			return Task{}, errors.New("a due date is required to split a repeating task")
		}
		cutoff, err := recurrenceCutoffDate(*dueAt)
		if err != nil {
			return Task{}, err
		}
		oldRule := *current.RecurrenceRule
		oldRule.EndsOn = &cutoff
		if err := s.SaveRecurrenceRule("task", input.ID, &oldRule); err != nil {
			return Task{}, err
		}
		newRule := cloneRecurrenceRule(input.RecurrenceRule, current.RecurrenceRule)
		startsOn := recurrenceStartDate(*dueAt)
		if newRule != nil {
			newRule.StartsOn = &startsOn
		}
		return s.CreateTask(CreateTaskInput{Title: title, Content: content, Priority: priority, TypeID: typeID, DueAtUTC: dueAt, LinkedPeriodIDs: input.LinkedPeriodIDs, RecurrenceRule: newRule})
	}
	tx, err := s.db.Begin()
	if err != nil {
		return Task{}, err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`UPDATE tasks SET title=?, content=?, priority=?, type_id=?, due_at_utc=?, updated_at_utc=? WHERE id=? AND deleted_at_utc IS NULL`, title, content, priority, typeID, dueAt, time.Now().UTC().Format(time.RFC3339), input.ID); err != nil {
		return Task{}, err
	}
	if dueAt != nil {
		if _, err := tx.Exec(`INSERT OR REPLACE INTO reminders(id,owner_type,owner_id,remind_at_utc,status) VALUES(?,?,?,?, 'pending')`, "reminder-task-"+input.ID, "task", input.ID, *dueAt); err != nil {
			return Task{}, err
		}
	} else if _, err := tx.Exec(`DELETE FROM reminders WHERE owner_type='task' AND owner_id=?`, input.ID); err != nil {
		return Task{}, err
	}
	if input.LinkedPeriodIDs != nil {
		if _, err := tx.Exec(`DELETE FROM task_period_links WHERE task_id=?`, input.ID); err != nil {
			return Task{}, err
		}
		for _, pid := range input.LinkedPeriodIDs {
			if _, err := tx.Exec(`INSERT OR IGNORE INTO task_period_links(task_id,period_id) VALUES(?,?)`, input.ID, pid); err != nil {
				return Task{}, err
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return Task{}, err
	}
	if input.RecurrenceRule != nil {
		if err := s.SaveRecurrenceRule("task", input.ID, input.RecurrenceRule); err != nil {
			return Task{}, err
		}
	}
	return s.taskByID(input.ID)
}

func (s *Store) DeleteTask(id string) error {
	if id == "" {
		return errors.New("task id is required")
	}
	_, err := s.db.Exec(`UPDATE tasks SET deleted_at_utc=?, updated_at_utc=? WHERE id=?`, time.Now().UTC().Format(time.RFC3339), time.Now().UTC().Format(time.RFC3339), id)
	return err
}

func (s *Store) CreatePeriod(input CreatePeriodInput) (TimePeriod, error) {
	start, err := time.Parse(time.RFC3339, input.StartAtUTC)
	if err != nil {
		return TimePeriod{}, errors.New("invalid start time")
	}
	end, err := time.Parse(time.RFC3339, input.EndAtUTC)
	if err != nil {
		return TimePeriod{}, errors.New("invalid end time")
	}
	if !end.After(start) {
		return TimePeriod{}, errors.New("end must be after start")
	}
	if input.Title == "" {
		return TimePeriod{}, errors.New("period title is required")
	}
	now := time.Now().UTC().Format(time.RFC3339)
	id := newID("period")
	_, err = s.db.Exec(`INSERT INTO time_periods(id,title,description,start_at_utc,end_at_utc,source_timezone,category,color,status,notes,created_at_utc,updated_at_utc) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
		id, input.Title, input.Description, input.StartAtUTC, input.EndAtUTC, input.SourceTimezone, input.Category, input.Color, "planned", input.Notes, now, now)
	if err != nil {
		return TimePeriod{}, err
	}
	_, _ = s.db.Exec(`INSERT OR REPLACE INTO reminders(id,owner_type,owner_id,remind_at_utc,status) VALUES(?,?,?,?, 'pending')`, "reminder-period-"+id, "period", id, input.StartAtUTC)
	if input.RecurrenceRule != nil {
		_ = s.SaveRecurrenceRule("period", id, input.RecurrenceRule)
	}
	return s.periodByID(id)
}

func (s *Store) HasOverlap(periodID, startAtUTC, endAtUTC string) (bool, error) {
	rows, err := s.db.Query(`SELECT id FROM time_periods WHERE deleted_at_utc IS NULL AND id != ? AND start_at_utc < ? AND end_at_utc > ? LIMIT 1`, periodID, endAtUTC, startAtUTC)
	if err != nil {
		return false, err
	}
	defer rows.Close()
	return rows.Next(), nil
}

func (s *Store) CompletePeriod(id string) (TimePeriod, error) {
	id = BasePeriodID(id)
	_, err := s.db.Exec(`UPDATE time_periods SET status='completed', updated_at_utc=? WHERE id=?`, time.Now().UTC().Format(time.RFC3339), id)
	if err != nil {
		return TimePeriod{}, err
	}
	for _, period := range s.periods() {
		if period.ID == id {
			return period, nil
		}
	}
	return TimePeriod{}, errors.New("period not found")
}

func (s *Store) SkipPeriod(id string) (TimePeriod, error) {
	id = BasePeriodID(id)
	_, err := s.db.Exec(`UPDATE time_periods SET status='skipped', updated_at_utc=? WHERE id=?`, time.Now().UTC().Format(time.RFC3339), id)
	if err != nil {
		return TimePeriod{}, err
	}
	for _, period := range s.periods() {
		if period.ID == id {
			return period, nil
		}
	}
	return TimePeriod{}, errors.New("period not found")
}

func (s *Store) UpdatePeriod(input UpdatePeriodInput) (TimePeriod, error) {
	if input.ID == "" {
		return TimePeriod{}, errors.New("period id is required")
	}
	originalID := input.ID
	occurrenceStart, hasOccurrence := OccurrenceStartFromID(originalID)
	input.ID = BasePeriodID(input.ID)
	current, err := s.periodByID(input.ID)
	if err != nil {
		return TimePeriod{}, err
	}
	title := current.Title
	description := current.Description
	startAt := current.StartAtUTC
	endAt := current.EndAtUTC
	timezone := current.SourceTimezone
	category := current.Category
	color := current.Color
	notes := current.Notes
	if input.Title != nil {
		if *input.Title == "" {
			return TimePeriod{}, errors.New("period title is required")
		}
		title = *input.Title
	}
	if input.Description != nil {
		description = input.Description
	}
	if input.StartAtUTC != nil {
		startAt = *input.StartAtUTC
	}
	if input.EndAtUTC != nil {
		endAt = *input.EndAtUTC
	}
	if input.SourceTimezone != nil {
		timezone = *input.SourceTimezone
	}
	if input.Category != nil {
		category = *input.Category
	}
	if input.Color != nil {
		color = *input.Color
	}
	if input.Notes != nil {
		notes = input.Notes
	}
	start, err := time.Parse(time.RFC3339, startAt)
	if err != nil {
		return TimePeriod{}, errors.New("invalid start time")
	}
	end, err := time.Parse(time.RFC3339, endAt)
	if err != nil {
		return TimePeriod{}, errors.New("invalid end time")
	}
	if !end.After(start) {
		return TimePeriod{}, errors.New("end must be after start")
	}
	scope := recurrenceScope(input.RecurrenceEditScope)
	if hasOccurrence && current.RecurrenceRule != nil && scope == "this" {
		if err := s.CancelPeriodOccurrence(input.ID, occurrenceStart); err != nil {
			return TimePeriod{}, err
		}
		return s.CreatePeriod(CreatePeriodInput{Title: title, Description: description, StartAtUTC: startAt, EndAtUTC: endAt, SourceTimezone: timezone, Category: category, Color: color, Notes: notes, RecurrenceRule: nil})
	}
	if current.RecurrenceRule != nil && scope == "this" {
		if err := s.CancelPeriodOccurrence(input.ID, current.StartAtUTC); err != nil {
			return TimePeriod{}, err
		}
		return s.CreatePeriod(CreatePeriodInput{Title: title, Description: description, StartAtUTC: startAt, EndAtUTC: endAt, SourceTimezone: timezone, Category: category, Color: color, Notes: notes, RecurrenceRule: nil})
	}
	if current.RecurrenceRule != nil && scope == "following" {
		cutoff, err := recurrenceCutoffDate(startAt)
		if err != nil {
			return TimePeriod{}, err
		}
		oldRule := *current.RecurrenceRule
		oldRule.EndsOn = &cutoff
		if err := s.SaveRecurrenceRule("period", input.ID, &oldRule); err != nil {
			return TimePeriod{}, err
		}
		newRule := cloneRecurrenceRule(input.RecurrenceRule, current.RecurrenceRule)
		if input.RecurrenceRuleSet && input.RecurrenceRule == nil {
			newRule = nil
		}
		startsOn := recurrenceStartDate(startAt)
		if newRule != nil {
			newRule.StartsOn = &startsOn
		}
		return s.CreatePeriod(CreatePeriodInput{Title: title, Description: description, StartAtUTC: startAt, EndAtUTC: endAt, SourceTimezone: timezone, Category: category, Color: color, Notes: notes, RecurrenceRule: newRule})
	}
	_, err = s.db.Exec(`UPDATE time_periods SET title=?, description=?, start_at_utc=?, end_at_utc=?, source_timezone=?, category=?, color=?, notes=?, updated_at_utc=? WHERE id=? AND deleted_at_utc IS NULL`,
		title, description, startAt, endAt, timezone, category, color, notes, time.Now().UTC().Format(time.RFC3339), input.ID)
	if err != nil {
		return TimePeriod{}, err
	}
	_, _ = s.db.Exec(`INSERT OR REPLACE INTO reminders(id,owner_type,owner_id,remind_at_utc,status) VALUES(?,?,?,?, 'pending')`, "reminder-period-"+input.ID, "period", input.ID, startAt)
	if input.RecurrenceRuleSet {
		if err := s.SaveRecurrenceRule("period", input.ID, input.RecurrenceRule); err != nil {
			return TimePeriod{}, err
		}
	}
	return s.periodByID(input.ID)
}

func (s *Store) DeletePeriod(id string) error {
	return s.DeletePeriodWithScope(id, "series")
}

func (s *Store) DeletePeriodWithScope(id string, scope string) error {
	if id == "" {
		return errors.New("period id is required")
	}
	if occurrenceStart, ok := OccurrenceStartFromID(id); ok && scope == "this" {
		return s.CancelPeriodOccurrence(BasePeriodID(id), occurrenceStart)
	}
	if occurrenceStart, ok := OccurrenceStartFromID(id); ok && scope == "following" {
		return s.EndPeriodSeriesBefore(BasePeriodID(id), occurrenceStart)
	}
	id = BasePeriodID(id)
	if scope == "this" {
		current, err := s.periodByID(id)
		if err != nil {
			return err
		}
		if current.RecurrenceRule != nil {
			return s.CancelPeriodOccurrence(id, current.StartAtUTC)
		}
	}
	_, err := s.db.Exec(`UPDATE time_periods SET deleted_at_utc=?, updated_at_utc=? WHERE id=?`, time.Now().UTC().Format(time.RFC3339), time.Now().UTC().Format(time.RFC3339), id)
	return err
}

func (s *Store) EndPeriodSeriesBefore(periodID string, occurrenceStartUTC string) error {
	if periodID == "" || occurrenceStartUTC == "" {
		return errors.New("period and occurrence are required")
	}
	cutoff, err := recurrenceCutoffDate(occurrenceStartUTC)
	if err != nil {
		return err
	}
	rule, err := s.recurrenceRuleWithError("period", periodID)
	if err != nil {
		return err
	}
	rule.EndsOn = &cutoff
	return s.SaveRecurrenceRule("period", periodID, rule)
}

func (s *Store) CancelPeriodOccurrence(periodID string, occurrenceStartUTC string) error {
	if periodID == "" || occurrenceStartUTC == "" {
		return errors.New("period and occurrence are required")
	}
	_, err := s.db.Exec(`INSERT INTO recurrence_exceptions(owner_type,owner_id,occurrence_start_utc,action,created_at_utc)
		VALUES('period',?,?, 'cancelled', ?)
		ON CONFLICT(owner_type, owner_id, occurrence_start_utc) DO UPDATE SET action='cancelled', created_at_utc=excluded.created_at_utc`,
		periodID, occurrenceStartUTC, time.Now().UTC().Format(time.RFC3339))
	return err
}

func (s *Store) LinkTaskPeriod(taskID, periodID string) error {
	if taskID == "" || periodID == "" {
		return errors.New("task and period are required")
	}
	periodID = BasePeriodID(periodID)
	_, err := s.db.Exec(`INSERT OR IGNORE INTO task_period_links(task_id,period_id) VALUES(?,?)`, taskID, periodID)
	return err
}

func (s *Store) UnlinkTaskPeriod(taskID, periodID string) error {
	if taskID == "" || periodID == "" {
		return errors.New("task and period are required")
	}
	periodID = BasePeriodID(periodID)
	_, err := s.db.Exec(`DELETE FROM task_period_links WHERE task_id=? AND period_id=?`, taskID, periodID)
	return err
}

func newID(prefix string) string {
	return prefix + "-" + time.Now().UTC().Format("20060102150405.000000000")
}

func recurrenceScope(value string) string {
	switch value {
	case "this", "following", "series":
		return value
	default:
		return "series"
	}
}

func cloneRecurrenceRule(candidate, fallback *RecurrenceRule) *RecurrenceRule {
	if candidate != nil && candidate.Frequency != "" && candidate.Frequency != "none" {
		clone := *candidate
		clone.ID = ""
		clone.OwnerID = ""
		clone.OwnerType = ""
		return &clone
	}
	if fallback == nil {
		return nil
	}
	clone := *fallback
	clone.ID = ""
	clone.OwnerID = ""
	clone.OwnerType = ""
	clone.EndsOn = nil
	return &clone
}

func recurrenceStartDate(value string) string {
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return value
	}
	return parsed.Format("2006-01-02")
}

func recurrenceCutoffDate(value string) (string, error) {
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return "", errors.New("invalid recurrence split date")
	}
	return parsed.AddDate(0, 0, -1).Format("2006-01-02"), nil
}

func (s *Store) seedInitialTimeline() error {
	now := time.Now()
	location, err := time.LoadLocation(s.settings().DefaultTimezone)
	if err != nil {
		location = time.Local
	}
	local := now.In(location)
	base := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, location)
	periods := []struct {
		title    string
		startMin int
		endMin   int
		category string
		color    string
	}{
		{"Researching new idea, stack, and prepare for something", 16*60 + 30, 19 * 60, "Research", "#22c55e"},
		{"Working entire stuff", 21 * 60, 23*60 + 30, "Work", "#f59e0b"},
		{"Upwork, New Proxy Man Hurting", 23*60 + 30, 29 * 60, "Upwork", "#ef4444"},
		{"Upwork", 29 * 60, 31 * 60, "Upwork", "#fb7185"},
		{"Upwork, New Contact", 31 * 60, 33*60 + 30, "Upwork", "#f97316"},
		{"English Expression, prepare script", 33*60 + 30, 34 * 60, "English", "#eab308"},
		{"Yard, English practice", 34 * 60, 35 * 60, "Personal", "#06b6d4"},
		{"Finalize day's work - Report, Daily, Plan, Target", 35 * 60, 36 * 60, "Planning", "#a855f7"},
		{"Additional work, delayed something", 36 * 60, 38 * 60, "Work", "#f59e0b"},
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	nowUTC := now.UTC().Format(time.RFC3339)
	for periodIndex, period := range periods {
		for day := 0; day < 7; day++ {
			dayBase := base.AddDate(0, 0, day)
			start := dayBase.Add(time.Duration(period.startMin) * time.Minute).UTC().Format(time.RFC3339)
			end := dayBase.Add(time.Duration(period.endMin) * time.Minute).UTC().Format(time.RFC3339)
			if _, err := tx.Exec(`INSERT OR IGNORE INTO time_periods(id,title,description,start_at_utc,end_at_utc,source_timezone,category,color,status,notes,created_at_utc,updated_at_utc) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
				"period-seed-v3-"+base.Format("20060102")+"-"+strconv.Itoa(day)+"-"+strconv.Itoa(periodIndex), period.title, nil, start, end, location.String(), period.category, period.color, "planned", nil, nowUTC, nowUTC); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

func (s *Store) seedInitialTasks() error {
	periods := s.periods()
	periodByCategory := map[string]string{}
	for _, period := range periods {
		if _, exists := periodByCategory[period.Category]; !exists {
			periodByCategory[period.Category] = period.ID
		}
		if strings.HasPrefix(period.ID, "period-seed-v3-") && strings.Contains(period.ID, "-0-") {
			periodByCategory[period.Category] = period.ID
		}
	}
	typeByName := map[string]string{}
	for _, taskType := range s.taskTypes() {
		typeByName[taskType.Name] = taskType.ID
	}
	tasks := []struct {
		title     string
		priority  string
		typeName  string
		category  string
		status    string
		dueOffset int
	}{
		{"Review technology stack options", "urgent", "Research", "Research", "open", 0},
		{"Compare Electron IPC security checklist", "high", "Research", "Research", "open", 1},
		{"Collect three new product ideas", "medium", "Research", "Research", "open", 2},
		{"Summarize AI workflow improvements", "medium", "Research", "Research", "completed", -1},
		{"Read notes about local-first desktop UX", "low", "Research", "Research", "open", 3},
		{"Map missing timeline interactions", "high", "Research", "Research", "open", -1},
		{"Complete primary project deliverable", "urgent", "Work", "Work", "open", 0},
		{"Refine task manager timeline behavior", "high", "Work", "Work", "open", 1},
		{"Fix high-priority implementation issues", "urgent", "Work", "Work", "open", -2},
		{"Review code quality and tests", "high", "Work", "Work", "open", 2},
		{"Package and smoke-test desktop build", "medium", "Work", "Work", "completed", -1},
		{"Polish task board card spacing", "medium", "Work", "Work", "open", 0},
		{"Add keyboard navigation notes", "low", "Work", "Work", "open", 4},
		{"Create backup restore validation checklist", "medium", "Work", "Work", "open", 5},
		{"Respond to Upwork client messages", "high", "Upwork", "Upwork", "open", 0},
		{"Prepare Upwork proposal draft", "high", "Upwork", "Upwork", "open", 1},
		{"Update project milestone notes", "medium", "Upwork", "Upwork", "open", 2},
		{"Send client progress summary", "high", "Upwork", "Upwork", "completed", -1},
		{"Review open contract requirements", "medium", "Upwork", "Upwork", "open", -1},
		{"Prepare proxy project questions", "urgent", "Upwork", "Upwork", "open", 0},
		{"Check pending Upwork notifications", "low", "Upwork", "Upwork", "open", 3},
		{"Draft English expressions and scripts", "medium", "English", "English", "open", 0},
		{"Practice five client communication phrases", "medium", "English", "English", "open", 1},
		{"Record short English script rehearsal", "low", "English", "English", "completed", -1},
		{"Prepare project explanation script", "high", "English", "English", "open", 2},
		{"Review pronunciation notes", "low", "English", "English", "open", 4},
		{"Clean yard work area", "low", "Admin", "Personal", "open", 0},
		{"Prepare outdoor task checklist", "low", "Admin", "Personal", "open", 2},
		{"Buy replacement yard supplies", "medium", "Admin", "Personal", "open", -2},
		{"Reset workspace before focus block", "none", "Admin", "Personal", "open", 9999},
		{"Write daily report and tomorrow targets", "high", "Planning", "Planning", "open", 0},
		{"Review unfinished work list", "high", "Planning", "Planning", "open", 0},
		{"Set next-day priority order", "medium", "Planning", "Planning", "open", 1},
		{"Update weekly progress notes", "medium", "Planning", "Planning", "completed", -1},
		{"Handle delayed work buffer", "medium", "Work", "Work", "open", 0},
		{"Clear inbox and admin reminders", "low", "Admin", "Planning", "open", 9999},
		{"File local backup after testing", "medium", "Admin", "Planning", "open", 2},
		{"Audit notification history entries", "low", "Admin", "Planning", "open", 3},
		{"Plan tomorrow's first deep-work block", "high", "Planning", "Planning", "open", 1},
		{"Triage unscheduled personal errands", "none", "Admin", "", "open", 9999},
		{"Capture raw idea from call notes", "none", "Research", "", "open", 9999},
		{"Sort screenshots into project folders", "low", "Admin", "", "open", 9999},
		{"Draft loose questions for client review", "medium", "Upwork", "", "open", 9999},
		{"Check reading list for useful references", "low", "Learning", "", "open", 9999},
		{"Write possible product names", "none", "Planning", "", "open", 9999},
		{"Clean up temporary desktop files", "low", "Admin", "", "open", 9999},
		{"Review saved English phrases later", "none", "English", "", "open", 9999},
		{"Add notes for completed research period", "low", "Research", "Research", "completed", -1},
		{"Close stale implementation reminders", "low", "Admin", "Planning", "completed", -1},
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	nowUTC := time.Now().UTC().Format(time.RFC3339)
	baseDue := time.Now().In(time.Local)
	baseDue = time.Date(baseDue.Year(), baseDue.Month(), baseDue.Day(), 18, 0, 0, 0, baseDue.Location())
	for taskIndex, task := range tasks {
		var typeID *string
		if id, ok := typeByName[task.typeName]; ok {
			typeID = &id
		}
		linked := []string{}
		if periodID, ok := periodByCategory[task.category]; ok {
			linked = append(linked, periodID)
		}
		var dueAt *string
		if task.dueOffset != 9999 {
			due := baseDue.AddDate(0, 0, task.dueOffset).Add(time.Duration(taskIndex%5) * time.Hour).UTC().Format(time.RFC3339)
			dueAt = &due
		}
		taskID := "task-seed-v7-" + strconv.Itoa(taskIndex)
		content := seedTaskContent(task.title, task.typeName, task.category, task.status)
		if _, err := tx.Exec(`INSERT OR IGNORE INTO tasks(id,title,content,priority,type_id,due_at_utc,status,created_at_utc,updated_at_utc) VALUES(?,?,?,?,?,?,?,?,?)`, taskID, task.title, content, task.priority, typeID, dueAt, task.status, nowUTC, nowUTC); err != nil {
			return err
		}
		for _, periodID := range linked {
			if _, err := tx.Exec(`INSERT OR IGNORE INTO task_period_links(task_id,period_id) VALUES(?,?)`, taskID, periodID); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

func seedTaskContent(title, typeName, category, status string) string {
	state := "Prepare the next concrete action, capture blockers, and keep notes short enough to review during the active period."
	if status == "completed" {
		state = "Completed sample item. Keep this visible so the Done column has realistic history and scroll behavior."
	}
	if category == "" {
		state = "Inbox sample without a schedule block. Triage it later by assigning a period, due date, priority, or type."
	}
	return title + "\n" + typeName + " / " + valueDefault(category, "Inbox") + ": " + state
}
