package store

import (
	"database/sql"
	"errors"
	"time"
)

type templatePeriodDraft struct {
	title       string
	description *string
	startMinute int
	endMinute   int
	timezone    string
	category    string
	color       string
	notes       *string
}

func (s *Store) ListTemplates() ([]DailyTemplate, error) {
	rows, err := s.db.Query(`SELECT t.id,t.name,t.created_at_utc,COUNT(p.title) FROM daily_templates t LEFT JOIN daily_template_periods p ON p.template_id=t.id GROUP BY t.id ORDER BY t.created_at_utc DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DailyTemplate
	for rows.Next() {
		var item DailyTemplate
		if err := rows.Scan(&item.ID, &item.Name, &item.CreatedAtUTC, &item.PeriodCount); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, nil
}

func (s *Store) SaveTemplate(name, date string) error {
	if name == "" {
		return errors.New("template name is required")
	}
	day, err := time.Parse("2006-01-02", date)
	if err != nil {
		return err
	}
	start := day.Format(time.RFC3339)
	end := day.AddDate(0, 0, 1).Format(time.RFC3339)
	rows, err := s.db.Query(`SELECT title,description,start_at_utc,end_at_utc,source_timezone,category,color,notes FROM time_periods WHERE deleted_at_utc IS NULL AND start_at_utc >= ? AND start_at_utc < ? ORDER BY start_at_utc`, start, end)
	if err != nil {
		return err
	}
	var drafts []templatePeriodDraft
	for rows.Next() {
		var title, startAt, endAt, timezone, category, color string
		var desc, notes sql.NullString
		if err := rows.Scan(&title, &desc, &startAt, &endAt, &timezone, &category, &color, &notes); err != nil {
			_ = rows.Close()
			return err
		}
		st, _ := time.Parse(time.RFC3339, startAt)
		en, _ := time.Parse(time.RFC3339, endAt)
		startMinute := st.Hour()*60 + st.Minute()
		endMinute := en.Hour()*60 + en.Minute()
		if en.Day() != st.Day() {
			endMinute += 24 * 60
		}
		drafts = append(drafts, templatePeriodDraft{title: title, description: nullStringPtr(desc), startMinute: startMinute, endMinute: endMinute, timezone: timezone, category: category, color: color, notes: nullStringPtr(notes)})
	}
	if err := rows.Close(); err != nil {
		return err
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	id := newID("template")
	now := time.Now().UTC().Format(time.RFC3339)
	if _, err := tx.Exec(`INSERT INTO daily_templates(id,name,created_at_utc) VALUES(?,?,?)`, id, name, now); err != nil {
		return err
	}
	for _, draft := range drafts {
		if _, err := tx.Exec(`INSERT INTO daily_template_periods(template_id,title,description,start_minute,end_minute,source_timezone,category,color,notes) VALUES(?,?,?,?,?,?,?,?,?)`,
			id, draft.title, draft.description, draft.startMinute, draft.endMinute, draft.timezone, draft.category, draft.color, draft.notes); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) ApplyTemplate(templateID, date string) error {
	if templateID == "" {
		return errors.New("template id is required")
	}
	day, err := time.Parse("2006-01-02", date)
	if err != nil {
		return err
	}
	rows, err := s.db.Query(`SELECT title,description,start_minute,end_minute,source_timezone,category,color,notes FROM daily_template_periods WHERE template_id=? ORDER BY start_minute`, templateID)
	if err != nil {
		return err
	}
	var drafts []templatePeriodDraft
	for rows.Next() {
		var title, timezone, category, color string
		var startMinute, endMinute int
		var desc, notes sql.NullString
		if err := rows.Scan(&title, &desc, &startMinute, &endMinute, &timezone, &category, &color, &notes); err != nil {
			_ = rows.Close()
			return err
		}
		drafts = append(drafts, templatePeriodDraft{title: title, description: nullStringPtr(desc), startMinute: startMinute, endMinute: endMinute, timezone: timezone, category: category, color: color, notes: nullStringPtr(notes)})
	}
	if err := rows.Close(); err != nil {
		return err
	}
	for _, draft := range drafts {
		start := day.Add(time.Duration(draft.startMinute) * time.Minute)
		end := day.Add(time.Duration(draft.endMinute) * time.Minute)
		_, err := s.CreatePeriod(CreatePeriodInput{Title: draft.title, Description: draft.description, StartAtUTC: start.Format(time.RFC3339), EndAtUTC: end.Format(time.RFC3339), SourceTimezone: draft.timezone, Category: draft.category, Color: draft.color, Notes: draft.notes})
		if err != nil {
			return err
		}
	}
	return nil
}

func nullStringPtr(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	return &value.String
}
