package store

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type ImportSnapshot struct {
	Settings  Settings     `json:"settings"`
	TaskTypes []TaskType   `json:"taskTypes"`
	Tasks     []Task       `json:"tasks"`
	Periods   []TimePeriod `json:"periods"`
}

func (s *Store) UpdateSettings(values map[string]any) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	allowed := map[string]bool{
		"theme": true, "defaultTimezone": true, "startWithWindows": true, "minimizeToTray": true, "closeToTray": true, "snapIntervalMinutes": true, "timeFormat": true,
		"notificationsEnabled": true, "periodNotifications": true, "taskNotifications": true, "quietHoursEnabled": true, "quietHoursStart": true, "quietHoursEnd": true, "defaultSnoozeMinutes": true,
	}
	for key, value := range values {
		if !allowed[key] {
			continue
		}
		bytes, _ := json.Marshal(value)
		var stored string
		_ = json.Unmarshal(bytes, &stored)
		if stored == "" {
			stored = string(bytes)
		}
		if _, err := tx.Exec(`INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, key, stored); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) ClearData() error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	statements := []string{
		`DELETE FROM task_period_links`,
		`DELETE FROM recurrence_exceptions`,
		`DELETE FROM recurrence_rules`,
		`DELETE FROM reminders`,
		`DELETE FROM notification_history`,
		`DELETE FROM daily_template_periods`,
		`DELETE FROM daily_templates`,
		`DELETE FROM tasks`,
		`DELETE FROM time_periods`,
		`DELETE FROM settings WHERE key LIKE 'seedTimeline%' OR key LIKE 'seedTasks%'`,
		`INSERT INTO settings(key,value) VALUES('dataFormatted','true') ON CONFLICT(key) DO UPDATE SET value='true'`,
	}
	optionalStatements := []string{
		`DELETE FROM reminder_history`,
		`DELETE FROM task_completion_history`,
		`DELETE FROM period_completion_history`,
		`DELETE FROM activity_sessions`,
	}
	for _, statement := range statements {
		if _, err := tx.Exec(statement); err != nil {
			return err
		}
	}
	for _, statement := range optionalStatements {
		if _, err := tx.Exec(statement); err != nil && !strings.Contains(err.Error(), "no such table") {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) ExportData(format, dir string) (string, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	stamp := time.Now().Format("20060102-150405")
	if format == "csv" {
		path := filepath.Join(dir, "ttmanager-"+stamp+".csv")
		file, err := os.Create(path)
		if err != nil {
			return "", err
		}
		defer file.Close()
		writer := csv.NewWriter(file)
		defer writer.Flush()
		_ = writer.Write([]string{"kind", "id", "title", "status", "start_or_due_utc", "end_utc"})
		for _, task := range s.tasks() {
			due := ""
			if task.DueAtUTC != nil {
				due = *task.DueAtUTC
			}
			_ = writer.Write([]string{"task", task.ID, task.Title, task.Status, due, ""})
		}
		for _, period := range s.periods() {
			_ = writer.Write([]string{"period", period.ID, period.Title, period.Status, period.StartAtUTC, period.EndAtUTC})
		}
		return path, nil
	}
	path := filepath.Join(dir, "ttmanager-"+stamp+".json")
	file, err := os.Create(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	snapshot, err := s.Snapshot()
	if err != nil {
		return "", err
	}
	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	return path, encoder.Encode(snapshot)
}

func (s *Store) BackupDatabase(dbPath, dir string) (string, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	stamp := time.Now().Format("20060102-150405")
	path := filepath.Join(dir, "ttmanager-backup-"+stamp+".db")
	src, err := os.Open(dbPath)
	if err != nil {
		return "", err
	}
	defer src.Close()
	dst, err := os.Create(path)
	if err != nil {
		return "", err
	}
	defer dst.Close()
	_, err = io.Copy(dst, src)
	return path, err
}

func ValidateRestorePath(path string) error {
	clean := filepath.Clean(path)
	if clean == "" || strings.Contains(clean, "\x00") {
		return errors.New("invalid restore path")
	}
	ext := strings.ToLower(filepath.Ext(clean))
	if ext != ".json" && ext != ".db" {
		return errors.New("restore file must be .json or .db")
	}
	info, err := os.Stat(clean)
	if err != nil {
		return err
	}
	if info.IsDir() {
		return errors.New("restore path is a directory")
	}
	return nil
}

func ImportJSONSnapshot(db *sql.DB, path string) error {
	if err := ValidateRestorePath(path); err != nil {
		return err
	}
	if strings.ToLower(filepath.Ext(path)) != ".json" {
		return errors.New("json import requires a .json file")
	}
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	var snapshot ImportSnapshot
	if err := json.NewDecoder(file).Decode(&snapshot); err != nil {
		return err
	}
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, stmt := range []string{
		`DELETE FROM task_period_links`,
		`DELETE FROM recurrence_rules`,
		`DELETE FROM reminders`,
		`DELETE FROM notification_history`,
		`DELETE FROM tasks`,
		`DELETE FROM time_periods`,
		`DELETE FROM task_types`,
		`DELETE FROM settings`,
	} {
		if _, err := tx.Exec(stmt); err != nil {
			return err
		}
	}
	for key, value := range map[string]string{
		"theme":                snapshot.Settings.Theme,
		"defaultTimezone":      snapshot.Settings.DefaultTimezone,
		"startWithWindows":     boolString(snapshot.Settings.StartWithWindows),
		"minimizeToTray":       boolString(snapshot.Settings.MinimizeToTray),
		"closeToTray":          boolString(snapshot.Settings.CloseToTray),
		"snapIntervalMinutes":  intString(snapshot.Settings.SnapIntervalMinutes),
		"timeFormat":           snapshot.Settings.TimeFormat,
		"notificationsEnabled": boolString(snapshot.Settings.NotificationsEnabled),
		"periodNotifications":  boolString(snapshot.Settings.PeriodNotifications),
		"taskNotifications":    boolString(snapshot.Settings.TaskNotifications),
		"quietHoursEnabled":    boolString(snapshot.Settings.QuietHoursEnabled),
		"quietHoursStart":      snapshot.Settings.QuietHoursStart,
		"quietHoursEnd":        snapshot.Settings.QuietHoursEnd,
		"defaultSnoozeMinutes": intString(snapshot.Settings.DefaultSnoozeMinutes),
	} {
		if value != "" {
			if _, err := tx.Exec(`INSERT INTO settings(key,value) VALUES(?,?)`, key, value); err != nil {
				return err
			}
		}
	}
	for _, taskType := range snapshot.TaskTypes {
		if _, err := tx.Exec(`INSERT INTO task_types(id,name,color,icon) VALUES(?,?,?,?)`, taskType.ID, taskType.Name, taskType.Color, taskType.Icon); err != nil {
			return err
		}
	}
	for _, period := range snapshot.Periods {
		if _, err := tx.Exec(`INSERT INTO time_periods(id,title,description,start_at_utc,end_at_utc,source_timezone,category,color,status,notes,created_at_utc,updated_at_utc) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
			period.ID, period.Title, period.Description, period.StartAtUTC, period.EndAtUTC, period.SourceTimezone, period.Category, period.Color, period.Status, period.Notes, time.Now().UTC().Format(time.RFC3339), time.Now().UTC().Format(time.RFC3339)); err != nil {
			return err
		}
	}
	for _, task := range snapshot.Tasks {
		if _, err := tx.Exec(`INSERT INTO tasks(id,title,content,priority,type_id,due_at_utc,status,created_at_utc,updated_at_utc) VALUES(?,?,?,?,?,?,?,?,?)`,
			task.ID, task.Title, task.Content, task.Priority, task.TypeID, task.DueAtUTC, task.Status, task.CreatedAtUTC, task.UpdatedAtUTC); err != nil {
			return err
		}
		for _, periodID := range task.LinkedPeriodIDs {
			if _, err := tx.Exec(`INSERT OR IGNORE INTO task_period_links(task_id,period_id) VALUES(?,?)`, task.ID, periodID); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

func boolString(value bool) string {
	if value {
		return "true"
	}
	return "false"
}

func intString(value int) string {
	if value == 0 {
		return ""
	}
	return strconv.Itoa(value)
}
