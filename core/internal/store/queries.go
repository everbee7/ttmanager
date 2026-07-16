package store

import (
	"database/sql"
	"fmt"
	"sort"
	"strings"
	"time"
)

func (s *Store) settings() Settings {
	rows, err := s.db.Query(`SELECT key,value FROM settings`)
	if err != nil {
		return defaultSettings()
	}
	defer rows.Close()
	values := map[string]string{}
	for rows.Next() {
		var k, v string
		_ = rows.Scan(&k, &v)
		values[k] = v
	}
	return Settings{
		Theme:                valueDefault(values["theme"], "system"),
		DefaultTimezone:      valueDefault(values["defaultTimezone"], "America/Denver"),
		StartWithWindows:     values["startWithWindows"] == "true",
		MinimizeToTray:       values["minimizeToTray"] != "false",
		CloseToTray:          values["closeToTray"] != "false",
		SnapIntervalMinutes:  atoiDefault(values["snapIntervalMinutes"], 15),
		TimeFormat:           valueDefault(values["timeFormat"], "12h"),
		NotificationsEnabled: values["notificationsEnabled"] != "false",
		PeriodNotifications:  values["periodNotifications"] != "false",
		TaskNotifications:    values["taskNotifications"] != "false",
		QuietHoursEnabled:    values["quietHoursEnabled"] == "true",
		QuietHoursStart:      valueDefault(values["quietHoursStart"], "22:00"),
		QuietHoursEnd:        valueDefault(values["quietHoursEnd"], "07:00"),
		DefaultSnoozeMinutes: atoiDefault(values["defaultSnoozeMinutes"], 15),
	}
}

func defaultSettings() Settings {
	return Settings{Theme: "system", DefaultTimezone: "America/Denver", MinimizeToTray: true, CloseToTray: true, SnapIntervalMinutes: 15, TimeFormat: "12h", NotificationsEnabled: true, PeriodNotifications: true, TaskNotifications: true, QuietHoursStart: "22:00", QuietHoursEnd: "07:00", DefaultSnoozeMinutes: 15}
}

func (s *Store) taskTypes() []TaskType {
	rows, err := s.db.Query(`SELECT id,name,color,icon FROM task_types ORDER BY name`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []TaskType
	for rows.Next() {
		var item TaskType
		if rows.Scan(&item.ID, &item.Name, &item.Color, &item.Icon) == nil {
			out = append(out, item)
		}
	}
	return out
}

func (s *Store) tasks() []Task {
	rows, err := s.db.Query(`SELECT id,title,content,priority,type_id,due_at_utc,status,created_at_utc,updated_at_utc FROM tasks WHERE deleted_at_utc IS NULL ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, due_at_utc`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []Task
	for rows.Next() {
		var item Task
		var content, typeID, due sql.NullString
		if rows.Scan(&item.ID, &item.Title, &content, &item.Priority, &typeID, &due, &item.Status, &item.CreatedAtUTC, &item.UpdatedAtUTC) == nil {
			if content.Valid {
				item.Content = &content.String
			}
			if typeID.Valid {
				item.TypeID = &typeID.String
			}
			if due.Valid {
				item.DueAtUTC = &due.String
			}
			out = append(out, item)
		}
	}
	rows.Close()
	for i := range out {
		out[i].LinkedPeriodIDs = s.linkedPeriods(out[i].ID)
		out[i].RecurrenceRule = s.recurrenceRule("task", out[i].ID)
	}
	return out
}

func (s *Store) taskByID(id string) (Task, error) {
	rows, err := s.db.Query(`SELECT id,title,content,priority,type_id,due_at_utc,status,created_at_utc,updated_at_utc FROM tasks WHERE id=? AND deleted_at_utc IS NULL`, id)
	if err != nil {
		return Task{}, err
	}
	defer rows.Close()
	if rows.Next() {
		var item Task
		var content, typeID, due sql.NullString
		if err := rows.Scan(&item.ID, &item.Title, &content, &item.Priority, &typeID, &due, &item.Status, &item.CreatedAtUTC, &item.UpdatedAtUTC); err != nil {
			return Task{}, err
		}
		if content.Valid {
			item.Content = &content.String
		}
		if typeID.Valid {
			item.TypeID = &typeID.String
		}
		if due.Valid {
			item.DueAtUTC = &due.String
		}
		item.LinkedPeriodIDs = s.linkedPeriods(item.ID)
		rows.Close()
		item.RecurrenceRule = s.recurrenceRule("task", item.ID)
		return item, nil
	}
	return Task{}, sql.ErrNoRows
}

func (s *Store) periods() []TimePeriod {
	rows, err := s.db.Query(`SELECT p.id,p.title,p.description,p.start_at_utc,p.end_at_utc,p.source_timezone,p.category,p.color,p.status,p.notes,COUNT(l.task_id)
		FROM time_periods p LEFT JOIN task_period_links l ON l.period_id=p.id
		WHERE p.deleted_at_utc IS NULL
		GROUP BY p.id
		ORDER BY p.start_at_utc`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []TimePeriod
	for rows.Next() {
		var item TimePeriod
		var desc, notes sql.NullString
		if rows.Scan(&item.ID, &item.Title, &desc, &item.StartAtUTC, &item.EndAtUTC, &item.SourceTimezone, &item.Category, &item.Color, &item.Status, &notes, &item.LinkedTaskCount) == nil {
			if desc.Valid {
				item.Description = &desc.String
			}
			if notes.Valid {
				item.Notes = &notes.String
			}
			out = append(out, item)
		}
	}
	rows.Close()
	for i := range out {
		out[i].RecurrenceRule = s.recurrenceRule("period", out[i].ID)
	}
	return s.expandRecurringPeriods(out)
}

func (s *Store) periodByID(id string) (TimePeriod, error) {
	id = BasePeriodID(id)
	rows, err := s.db.Query(`SELECT p.id,p.title,p.description,p.start_at_utc,p.end_at_utc,p.source_timezone,p.category,p.color,p.status,p.notes,COUNT(l.task_id)
		FROM time_periods p LEFT JOIN task_period_links l ON l.period_id=p.id
		WHERE p.id=? AND p.deleted_at_utc IS NULL
		GROUP BY p.id`, id)
	if err != nil {
		return TimePeriod{}, err
	}
	defer rows.Close()
	if rows.Next() {
		var item TimePeriod
		var desc, notes sql.NullString
		if err := rows.Scan(&item.ID, &item.Title, &desc, &item.StartAtUTC, &item.EndAtUTC, &item.SourceTimezone, &item.Category, &item.Color, &item.Status, &notes, &item.LinkedTaskCount); err != nil {
			return TimePeriod{}, err
		}
		if desc.Valid {
			item.Description = &desc.String
		}
		if notes.Valid {
			item.Notes = &notes.String
		}
		rows.Close()
		item.RecurrenceRule = s.recurrenceRule("period", item.ID)
		return item, nil
	}
	return TimePeriod{}, sql.ErrNoRows
}

func (s *Store) notificationHistory() []NotificationHistory {
	rows, err := s.db.Query(`SELECT n.id,n.owner_type,n.owner_id,COALESCE(t.title,p.title,'Reminder') AS title,n.sent_at_utc,n.event_type
		FROM notification_history n
		LEFT JOIN tasks t ON n.owner_type='task' AND t.id=n.owner_id
		LEFT JOIN time_periods p ON n.owner_type='period' AND p.id=n.owner_id
		ORDER BY n.sent_at_utc DESC
		LIMIT 200`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []NotificationHistory
	for rows.Next() {
		var item NotificationHistory
		if rows.Scan(&item.ID, &item.OwnerType, &item.OwnerID, &item.Title, &item.SentAtUTC, &item.EventType) == nil {
			out = append(out, item)
		}
	}
	return out
}

func (s *Store) linkedPeriods(taskID string) []string {
	rows, err := s.db.Query(`SELECT period_id FROM task_period_links WHERE task_id=?`, taskID)
	if err != nil {
		return []string{}
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			out = append(out, id)
		}
	}
	return out
}

func atoiDefault(value string, fallback int) int {
	if value == "5" {
		return 5
	}
	if value == "10" {
		return 10
	}
	if value == "30" {
		return 30
	}
	if value == "60" {
		return 60
	}
	if value == "15" {
		return 15
	}
	return fallback
}

func valueDefault(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

func (s *Store) expandRecurringPeriods(periods []TimePeriod) []TimePeriod {
	now := time.Now().UTC()
	rangeStart := now.AddDate(-1, 0, 0)
	rangeEnd := now.AddDate(2, 0, 0)
	out := make([]TimePeriod, 0, len(periods))
	for _, period := range periods {
		if period.RecurrenceRule == nil || period.RecurrenceRule.Frequency == "" || period.RecurrenceRule.Frequency == "none" {
			out = append(out, period)
			continue
		}
		start, err := time.Parse(time.RFC3339, period.StartAtUTC)
		if err != nil {
			out = append(out, period)
			continue
		}
		end, err := time.Parse(time.RFC3339, period.EndAtUTC)
		if err != nil {
			out = append(out, period)
			continue
		}
		occurrences, err := GenerateOccurrences(*period.RecurrenceRule, start, &end, rangeStart, rangeEnd)
		if err != nil {
			out = append(out, period)
			continue
		}
		cancelled := s.cancelledPeriodOccurrences(period.ID)
		for _, occurrence := range occurrences {
			if occurrence.End == nil {
				continue
			}
			if cancelled[occurrence.Start.UTC().Format(time.RFC3339)] {
				continue
			}
			item := period
			if !occurrence.Start.Equal(start) {
				item.ID = occurrencePeriodID(period.ID, occurrence.Start)
			}
			item.StartAtUTC = occurrence.Start.UTC().Format(time.RFC3339)
			item.EndAtUTC = occurrence.End.UTC().Format(time.RFC3339)
			out = append(out, item)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		return out[i].StartAtUTC < out[j].StartAtUTC
	})
	return out
}

func (s *Store) cancelledPeriodOccurrences(periodID string) map[string]bool {
	rows, err := s.db.Query(`SELECT occurrence_start_utc FROM recurrence_exceptions WHERE owner_type='period' AND owner_id=? AND action='cancelled'`, periodID)
	if err != nil {
		return map[string]bool{}
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var value string
		if rows.Scan(&value) == nil {
			out[value] = true
		}
	}
	return out
}

func occurrencePeriodID(baseID string, start time.Time) string {
	return fmt.Sprintf("%s#occ#%s", baseID, start.UTC().Format("20060102T150405Z"))
}

func BasePeriodID(id string) string {
	if before, _, ok := strings.Cut(id, "#occ#"); ok {
		return before
	}
	return id
}

func OccurrenceStartFromID(id string) (string, bool) {
	_, suffix, ok := strings.Cut(id, "#occ#")
	if !ok {
		return "", false
	}
	parsed, err := time.Parse("20060102T150405Z", suffix)
	if err != nil {
		return "", false
	}
	return parsed.UTC().Format(time.RFC3339), true
}
