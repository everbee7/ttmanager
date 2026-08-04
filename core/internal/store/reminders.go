package store

import (
	"strconv"
	"strings"
	"time"
)

func (s *Store) DueReminders(now time.Time, since *time.Time) ([]ReminderEvent, error) {
	if err := s.ReconcilePeriodReminders(now, since); err != nil {
		return nil, err
	}
	params := []any{now.UTC().Format(time.RFC3339)}
	sinceFilter := ""
	if since != nil {
		sinceFilter = " AND COALESCE(r.snoozed_until_utc, r.remind_at_utc) >= ?"
		params = append(params, since.UTC().Format(time.RFC3339))
	}
	rows, err := s.db.Query(`SELECT r.id,r.owner_type,r.owner_id,r.remind_at_utc,
		COALESCE(t.title,p.title,'Reminder') AS title,
		COALESCE(t.content,''), COALESCE(t.priority,''), COALESCE(t.due_at_utc,''),
		COALESCE(p.description,''), COALESCE(p.notes,''), COALESCE(p.category,''), COALESCE(p.start_at_utc,''), COALESCE(p.end_at_utc,''), COALESCE(p.linked_count,0)
		FROM reminders r
		LEFT JOIN tasks t ON r.owner_type='task' AND t.id=r.owner_id AND t.deleted_at_utc IS NULL
		LEFT JOIN (
			SELECT p.*, COUNT(l.task_id) AS linked_count
			FROM time_periods p
			LEFT JOIN task_period_links l ON l.period_id=p.id
			GROUP BY p.id
		) p ON r.owner_type='period' AND p.id=r.owner_id AND p.deleted_at_utc IS NULL
		WHERE r.status='pending' AND COALESCE(r.snoozed_until_utc, r.remind_at_utc) <= ?
		`+sinceFilter+`
		AND ((r.owner_type='task' AND t.id IS NOT NULL) OR (r.owner_type='period' AND p.id IS NOT NULL))
		ORDER BY r.remind_at_utc LIMIT 20`, params...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ReminderEvent{}
	for rows.Next() {
		var event ReminderEvent
		var taskContent, taskPriority, taskDue string
		var periodDescription, periodNotes, periodCategory, periodStart, periodEnd string
		var linkedCount int
		if err := rows.Scan(&event.ID, &event.OwnerType, &event.OwnerID, &event.RemindAtUTC, &event.Title, &taskContent, &taskPriority, &taskDue, &periodDescription, &periodNotes, &periodCategory, &periodStart, &periodEnd, &linkedCount); err != nil {
			return nil, err
		}
		if event.OwnerType == "period" {
			event.EventType = "period_start"
			event.Body = periodReminderBody(periodCategory, periodStart, periodEnd, periodDescription, periodNotes, linkedCount)
		} else {
			event.EventType = "task_due"
			event.Body = taskReminderBody(taskPriority, taskDue, taskContent)
		}
		out = append(out, event)
	}
	return out, nil
}

func periodReminderBody(category, startAt, endAt, description, notes string, linkedTaskCount int) string {
	lines := []string{"Time period started"}
	if startAt != "" && endAt != "" {
		lines = append(lines, "Time: "+formatReminderClock(startAt)+" - "+formatReminderClock(endAt))
	}
	if category != "" {
		lines = append(lines, "Category: "+category)
	}
	lines = append(lines, "Linked tasks: "+itoa(linkedTaskCount))
	if strings.TrimSpace(description) != "" {
		lines = append(lines, "", strings.TrimSpace(description))
	}
	if strings.TrimSpace(notes) != "" {
		lines = append(lines, "", "Notes: "+strings.TrimSpace(notes))
	}
	return strings.Join(lines, "\n")
}

func taskReminderBody(priority, dueAt, content string) string {
	lines := []string{"Task is due"}
	if priority != "" {
		lines = append(lines, "Priority: "+priority)
	}
	if dueAt != "" {
		lines = append(lines, "Due: "+formatReminderClock(dueAt))
	}
	if strings.TrimSpace(content) != "" {
		lines = append(lines, "", strings.TrimSpace(content))
	}
	return strings.Join(lines, "\n")
}

func formatReminderClock(value string) string {
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return value
	}
	return parsed.UTC().Format("Jan 2 15:04 UTC")
}

func itoa(value int) string {
	return strconv.Itoa(value)
}

func (s *Store) ReconcilePeriodReminders(now time.Time, since *time.Time) error {
	windowStart := now.UTC().Add(-12 * time.Hour)
	if since != nil && since.Before(now) {
		windowStart = since.UTC()
	}
	windowEnd := now.UTC().AddDate(0, 0, 14)
	periods := s.periods()
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, period := range periods {
		start, err := time.Parse(time.RFC3339, period.StartAtUTC)
		if err != nil {
			continue
		}
		if start.Before(windowStart) || start.After(windowEnd) {
			continue
		}
		ownerID := BasePeriodID(period.ID)
		reminderID := "reminder-period-" + period.ID
		if _, err := tx.Exec(`INSERT OR IGNORE INTO reminders(id,owner_type,owner_id,remind_at_utc,status) VALUES(?,?,?,?, 'pending')`, reminderID, "period", ownerID, start.UTC().Format(time.RFC3339)); err != nil {
			return err
		}
	}
	_, _ = tx.Exec(`DELETE FROM reminders
		WHERE owner_type='period'
		AND NOT EXISTS (SELECT 1 FROM time_periods p WHERE p.id=reminders.owner_id AND p.deleted_at_utc IS NULL)`)
	return tx.Commit()
}

func (s *Store) MarkReminderSent(id string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`UPDATE reminders SET status='sent' WHERE id=?`, id); err != nil {
		return err
	}
	if _, err := tx.Exec(`INSERT OR IGNORE INTO notification_history(id,owner_type,owner_id,sent_at_utc,event_type)
		SELECT 'notification-' || id, owner_type, owner_id, ?, 'reminder' FROM reminders WHERE id=?`, now, id); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) SnoozeReminder(id string, minutes int) error {
	if minutes <= 0 {
		minutes = 5
	}
	until := time.Now().UTC().Add(time.Duration(minutes) * time.Minute).Format(time.RFC3339)
	_, err := s.db.Exec(`UPDATE reminders SET snoozed_until_utc=?, status='pending' WHERE id=?`, until, id)
	return err
}
