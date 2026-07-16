package store

import (
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

func testStore(t *testing.T) *Store {
	t.Helper()
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	s := New(db)
	if err := s.Migrate(); err != nil {
		t.Fatal(err)
	}
	return s
}

func TestTaskCRUDAndCompletion(t *testing.T) {
	s := testStore(t)
	task, err := s.CreateTask(CreateTaskInput{Title: "Prepare report", Priority: "urgent"})
	if err != nil {
		t.Fatal(err)
	}
	if task.Status != "open" {
		t.Fatalf("status=%s", task.Status)
	}
	task, err = s.CompleteTask(task.ID, true)
	if err != nil {
		t.Fatal(err)
	}
	if task.Status != "completed" {
		t.Fatalf("status=%s", task.Status)
	}
}

func TestTaskTypeCRUD(t *testing.T) {
	s := testStore(t)
	created, err := s.CreateTaskType(CreateTaskTypeInput{Name: "Deep Work", Color: "#0ea5e9", Icon: "timer"})
	if err != nil {
		t.Fatal(err)
	}
	nextName := "Client Work"
	nextColor := "#f97316"
	updated, err := s.UpdateTaskType(UpdateTaskTypeInput{ID: created.ID, Name: &nextName, Color: &nextColor})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Name != nextName || updated.Color != nextColor || updated.Icon != "timer" {
		t.Fatalf("updated=%+v", updated)
	}
	if err := s.DeleteTaskType(created.ID); err != nil {
		t.Fatal(err)
	}
	for _, taskType := range s.taskTypes() {
		if taskType.ID == created.ID {
			t.Fatalf("type was not deleted")
		}
	}
}

func TestSeedDemoCreatesWeekTimelineAndTwentyTasks(t *testing.T) {
	s := testStore(t)
	if err := s.SeedDemo(); err != nil {
		t.Fatal(err)
	}
	periods := s.periods()
	tasks := s.tasks()
	if len(periods) < 63 {
		t.Fatalf("seeded periods=%d want at least 63", len(periods))
	}
	if len(tasks) < 20 {
		t.Fatalf("seeded tasks=%d want at least 20", len(tasks))
	}
	linked := 0
	for _, task := range tasks {
		if len(task.LinkedPeriodIDs) > 0 {
			linked++
		}
	}
	if linked < 20 {
		t.Fatalf("linked seeded tasks=%d want at least 20", linked)
	}
}

func TestNotificationSettingsPersist(t *testing.T) {
	s := testStore(t)
	settings := s.settings()
	if !settings.NotificationsEnabled || !settings.PeriodNotifications || !settings.TaskNotifications {
		t.Fatalf("notification defaults disabled: %+v", settings)
	}
	if settings.QuietHoursStart != "22:00" || settings.QuietHoursEnd != "07:00" || settings.DefaultSnoozeMinutes != 15 {
		t.Fatalf("unexpected notification defaults: %+v", settings)
	}
	if err := s.UpdateSettings(map[string]any{"notificationsEnabled": false, "quietHoursEnabled": true, "quietHoursStart": "21:30", "quietHoursEnd": "06:15", "defaultSnoozeMinutes": float64(30)}); err != nil {
		t.Fatal(err)
	}
	settings = s.settings()
	if settings.NotificationsEnabled || !settings.QuietHoursEnabled || settings.QuietHoursStart != "21:30" || settings.QuietHoursEnd != "06:15" || settings.DefaultSnoozeMinutes != 30 {
		t.Fatalf("settings did not persist: %+v", settings)
	}
}

func TestPeriodCrossingMidnight(t *testing.T) {
	s := testStore(t)
	start := time.Date(2026, 7, 13, 23, 30, 0, 0, time.UTC).Format(time.RFC3339)
	end := time.Date(2026, 7, 14, 5, 0, 0, 0, time.UTC).Format(time.RFC3339)
	period, err := s.CreatePeriod(CreatePeriodInput{Title: "Project work", StartAtUTC: start, EndAtUTC: end, SourceTimezone: "America/Denver", Category: "Work", Color: "#2563eb"})
	if err != nil {
		t.Fatal(err)
	}
	if period.EndAtUTC != end {
		t.Fatalf("end=%s", period.EndAtUTC)
	}
}

func TestRejectsInvalidPeriod(t *testing.T) {
	s := testStore(t)
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.CreatePeriod(CreatePeriodInput{Title: "Bad", StartAtUTC: now, EndAtUTC: now, SourceTimezone: "America/Denver"})
	if err == nil {
		t.Fatal("expected invalid period error")
	}
}

func TestOverlapDetection(t *testing.T) {
	s := testStore(t)
	start := time.Date(2026, 7, 13, 16, 30, 0, 0, time.UTC).Format(time.RFC3339)
	end := time.Date(2026, 7, 13, 19, 0, 0, 0, time.UTC).Format(time.RFC3339)
	_, err := s.CreatePeriod(CreatePeriodInput{Title: "Research", StartAtUTC: start, EndAtUTC: end, SourceTimezone: "America/Denver", Category: "Work", Color: "#2563eb"})
	if err != nil {
		t.Fatal(err)
	}
	overlap, err := s.HasOverlap("", time.Date(2026, 7, 13, 18, 0, 0, 0, time.UTC).Format(time.RFC3339), time.Date(2026, 7, 13, 20, 0, 0, 0, time.UTC).Format(time.RFC3339))
	if err != nil {
		t.Fatal(err)
	}
	if !overlap {
		t.Fatal("expected overlap")
	}
}

func TestWeeklyRepeatOccurrences(t *testing.T) {
	start := time.Date(2026, 7, 13, 9, 0, 0, 0, time.UTC)
	end := start.Add(time.Hour)
	rule := RecurrenceRule{Frequency: "weekly", IntervalCount: 1, Weekdays: []int{int(time.Monday), int(time.Wednesday)}}
	occurrences, err := GenerateOccurrences(rule, start, &end, start, start.AddDate(0, 0, 8))
	if err != nil {
		t.Fatal(err)
	}
	if len(occurrences) != 3 {
		t.Fatalf("occurrences=%d", len(occurrences))
	}
}

func TestWeekdayRepeatSkipsWeekend(t *testing.T) {
	start := time.Date(2026, 7, 13, 9, 0, 0, 0, time.UTC)
	rule := RecurrenceRule{Frequency: "weekdays", IntervalCount: 1}
	occurrences, err := GenerateOccurrences(rule, start, nil, start, start.AddDate(0, 0, 7))
	if err != nil {
		t.Fatal(err)
	}
	if len(occurrences) != 5 {
		t.Fatalf("occurrences=%d", len(occurrences))
	}
}

func TestMonthlyNthWeekdayRepeat(t *testing.T) {
	start := time.Date(2026, 1, 5, 9, 0, 0, 0, time.UTC)
	firstMonday := "nth:1:1"
	rule := RecurrenceRule{Frequency: "monthly", IntervalCount: 1, MonthRule: &firstMonday}
	occurrences, err := GenerateOccurrences(rule, start, nil, start, start.AddDate(0, 3, 0))
	if err != nil {
		t.Fatal(err)
	}
	if len(occurrences) != 3 {
		t.Fatalf("occurrences=%d", len(occurrences))
	}
	expected := []string{"2026-01-05", "2026-02-02", "2026-03-02"}
	for i, occurrence := range occurrences {
		if got := occurrence.Start.Format("2006-01-02"); got != expected[i] {
			t.Fatalf("occurrence %d=%s want %s", i, got, expected[i])
		}
	}
}

func TestMonthlyLastWeekdayRepeatWithInterval(t *testing.T) {
	start := time.Date(2026, 1, 30, 9, 0, 0, 0, time.UTC)
	lastFriday := "nth:-1:5"
	rule := RecurrenceRule{Frequency: "monthly", IntervalCount: 2, MonthRule: &lastFriday}
	occurrences, err := GenerateOccurrences(rule, start, nil, start, start.AddDate(0, 7, 0))
	if err != nil {
		t.Fatal(err)
	}
	expected := []string{"2026-01-30", "2026-03-27", "2026-05-29", "2026-07-31"}
	if len(occurrences) != len(expected) {
		t.Fatalf("occurrences=%d", len(occurrences))
	}
	for i, occurrence := range occurrences {
		if got := occurrence.Start.Format("2006-01-02"); got != expected[i] {
			t.Fatalf("occurrence %d=%s want %s", i, got, expected[i])
		}
	}
}

func TestReminderSentPreventsDuplicateNotification(t *testing.T) {
	s := testStore(t)
	due := time.Now().UTC().Add(-time.Minute).Format(time.RFC3339)
	task, err := s.CreateTask(CreateTaskInput{Title: "Due task", Priority: "high", DueAtUTC: &due})
	if err != nil {
		t.Fatal(err)
	}
	events, err := s.DueReminders(time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 1 || events[0].OwnerID != task.ID {
		t.Fatalf("events=%v", events)
	}
	if err := s.MarkReminderSent(events[0].ID); err != nil {
		t.Fatal(err)
	}
	events, err = s.DueReminders(time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 0 {
		t.Fatalf("duplicate events=%v", events)
	}
	snapshot, err := s.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.NotificationHistory) != 1 || snapshot.NotificationHistory[0].OwnerID != task.ID || snapshot.NotificationHistory[0].Title != "Due task" {
		t.Fatalf("notification history not captured: %+v", snapshot.NotificationHistory)
	}
}

func TestSnoozedReminderIsHiddenUntilLater(t *testing.T) {
	s := testStore(t)
	due := time.Now().UTC().Add(-time.Minute).Format(time.RFC3339)
	task, err := s.CreateTask(CreateTaskInput{Title: "Snooze me", Priority: "medium", DueAtUTC: &due})
	if err != nil {
		t.Fatal(err)
	}
	events, err := s.DueReminders(time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 1 || events[0].OwnerID != task.ID {
		t.Fatalf("events=%v", events)
	}
	if err := s.SnoozeReminder(events[0].ID, 10); err != nil {
		t.Fatal(err)
	}
	events, err = s.DueReminders(time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 0 {
		t.Fatalf("snoozed events=%v", events)
	}
}

func TestRecurrenceRuleUpdatesPerOwner(t *testing.T) {
	s := testStore(t)
	task, err := s.CreateTask(CreateTaskInput{Title: "Repeat", Priority: "none", RecurrenceRule: &RecurrenceRule{Frequency: "daily", IntervalCount: 1}})
	if err != nil {
		t.Fatal(err)
	}
	updatedTitle := "Repeat updated"
	_, err = s.UpdateTask(UpdateTaskInput{ID: task.ID, Title: &updatedTitle, RecurrenceRule: &RecurrenceRule{Frequency: "weekly", IntervalCount: 2, Weekdays: []int{1}}})
	if err != nil {
		t.Fatal(err)
	}
	var count int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM recurrence_rules WHERE owner_id=?`, task.ID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("rule rows=%d", count)
	}
	var ownerType, ownerID, frequency string
	if err := s.db.QueryRow(`SELECT owner_type, owner_id, frequency FROM recurrence_rules WHERE owner_id=?`, task.ID).Scan(&ownerType, &ownerID, &frequency); err != nil {
		t.Fatal(err)
	}
	t.Logf("row ownerType=%s ownerID=%s frequency=%s", ownerType, ownerID, frequency)
	if _, err := s.recurrenceRuleWithError("task", task.ID); err != nil {
		t.Fatal(err)
	}
	loaded, err := s.taskByID(task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.RecurrenceRule == nil || loaded.RecurrenceRule.Frequency != "weekly" || loaded.RecurrenceRule.IntervalCount != 2 {
		t.Fatalf("rule=%+v", loaded.RecurrenceRule)
	}
}

func TestUpdateRepeatingTaskThisOccurrenceCreatesOneOff(t *testing.T) {
	s := testStore(t)
	due := time.Date(2026, 7, 14, 15, 0, 0, 0, time.UTC).Format(time.RFC3339)
	task, err := s.CreateTask(CreateTaskInput{Title: "Daily plan", Priority: "medium", DueAtUTC: &due, RecurrenceRule: &RecurrenceRule{Frequency: "daily", IntervalCount: 1}})
	if err != nil {
		t.Fatal(err)
	}
	title := "One-off plan"
	nextDue := time.Date(2026, 7, 15, 15, 0, 0, 0, time.UTC).Format(time.RFC3339)
	created, err := s.UpdateTask(UpdateTaskInput{ID: task.ID, Title: &title, DueAtUTC: &nextDue, RecurrenceEditScope: "this"})
	if err != nil {
		t.Fatal(err)
	}
	if created.ID == task.ID || created.RecurrenceRule != nil {
		t.Fatalf("expected new one-off task, got id=%s rule=%+v", created.ID, created.RecurrenceRule)
	}
	original, err := s.taskByID(task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if original.Title != "Daily plan" || original.RecurrenceRule == nil {
		t.Fatalf("original was changed unexpectedly: %+v", original)
	}
}

func TestUpdateRepeatingPeriodFollowingSplitsSeries(t *testing.T) {
	s := testStore(t)
	start := time.Date(2026, 7, 14, 16, 0, 0, 0, time.UTC)
	end := start.Add(2 * time.Hour)
	period, err := s.CreatePeriod(CreatePeriodInput{Title: "Core work", StartAtUTC: start.Format(time.RFC3339), EndAtUTC: end.Format(time.RFC3339), SourceTimezone: "America/Denver", Category: "Work", Color: "#2563eb", RecurrenceRule: &RecurrenceRule{Frequency: "daily", IntervalCount: 1}})
	if err != nil {
		t.Fatal(err)
	}
	title := "Client work"
	nextStart := start.AddDate(0, 0, 3).Format(time.RFC3339)
	nextEnd := end.AddDate(0, 0, 3).Format(time.RFC3339)
	created, err := s.UpdatePeriod(UpdatePeriodInput{ID: period.ID, Title: &title, StartAtUTC: &nextStart, EndAtUTC: &nextEnd, RecurrenceRule: &RecurrenceRule{Frequency: "daily", IntervalCount: 1}, RecurrenceEditScope: "following"})
	if err != nil {
		t.Fatal(err)
	}
	if created.ID == period.ID || created.RecurrenceRule == nil {
		t.Fatalf("expected new following series, got %+v", created)
	}
	if created.RecurrenceRule.StartsOn == nil || *created.RecurrenceRule.StartsOn != "2026-07-17" {
		t.Fatalf("new rule startsOn=%+v", created.RecurrenceRule.StartsOn)
	}
	original, err := s.periodByID(period.ID)
	if err != nil {
		t.Fatal(err)
	}
	if original.RecurrenceRule == nil || original.RecurrenceRule.EndsOn == nil || *original.RecurrenceRule.EndsOn != "2026-07-16" {
		t.Fatalf("original rule not closed: %+v", original.RecurrenceRule)
	}
}

func TestSnapshotExpandsDailyRepeatingPeriodCrossingMidnight(t *testing.T) {
	s := testStore(t)
	start := time.Now().UTC().Truncate(24 * time.Hour).Add(22 * time.Hour)
	end := start.Add(2 * time.Hour)
	period, err := s.CreatePeriod(CreatePeriodInput{
		Title:          "Night work",
		StartAtUTC:     start.Format(time.RFC3339),
		EndAtUTC:       end.Format(time.RFC3339),
		SourceTimezone: "America/Denver",
		Category:       "Work",
		Color:          "#2563eb",
		RecurrenceRule: &RecurrenceRule{Frequency: "daily", IntervalCount: 1},
	})
	if err != nil {
		t.Fatal(err)
	}
	snapshot, err := s.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, item := range snapshot.Periods {
		if item.ID == period.ID || strings.HasPrefix(item.ID, period.ID+"#occ#") {
			count++
			parsedStart, err := time.Parse(time.RFC3339, item.StartAtUTC)
			if err != nil {
				t.Fatal(err)
			}
			parsedEnd, err := time.Parse(time.RFC3339, item.EndAtUTC)
			if err != nil {
				t.Fatal(err)
			}
			if parsedStart.Hour() != 22 || parsedEnd.Sub(parsedStart) != 2*time.Hour {
				t.Fatalf("bad occurrence start=%s end=%s", item.StartAtUTC, item.EndAtUTC)
			}
			if item.RecurrenceRule == nil || item.RecurrenceRule.Frequency != "daily" {
				t.Fatalf("occurrence missing recurrence rule: %#v", item.RecurrenceRule)
			}
		}
	}
	if count < 7 {
		t.Fatalf("expanded occurrences=%d want at least 7", count)
	}
}

func TestUpdateRepeatingPeriodCanRemoveRecurrence(t *testing.T) {
	s := testStore(t)
	start := time.Now().UTC().Truncate(24 * time.Hour).Add(10 * time.Hour)
	end := start.Add(2 * time.Hour)
	period, err := s.CreatePeriod(CreatePeriodInput{
		Title:          "Daily work",
		StartAtUTC:     start.Format(time.RFC3339),
		EndAtUTC:       end.Format(time.RFC3339),
		SourceTimezone: "America/Denver",
		Category:       "Work",
		Color:          "#2563eb",
		RecurrenceRule: &RecurrenceRule{Frequency: "daily", IntervalCount: 1},
	})
	if err != nil {
		t.Fatal(err)
	}
	title := period.Title
	updated, err := s.UpdatePeriod(UpdatePeriodInput{ID: period.ID, Title: &title, RecurrenceRule: nil, RecurrenceRuleSet: true})
	if err != nil {
		t.Fatal(err)
	}
	if updated.RecurrenceRule != nil {
		t.Fatalf("recurrence was not removed: %#v", updated.RecurrenceRule)
	}
}

func TestDeleteSingleRepeatingPeriodOccurrenceKeepsSeries(t *testing.T) {
	s := testStore(t)
	start := time.Now().UTC().Truncate(24 * time.Hour).Add(10 * time.Hour)
	end := start.Add(2 * time.Hour)
	period, err := s.CreatePeriod(CreatePeriodInput{
		Title:          "Daily work",
		StartAtUTC:     start.Format(time.RFC3339),
		EndAtUTC:       end.Format(time.RFC3339),
		SourceTimezone: "America/Denver",
		Category:       "Work",
		Color:          "#2563eb",
		RecurrenceRule: &RecurrenceRule{Frequency: "daily", IntervalCount: 1},
	})
	if err != nil {
		t.Fatal(err)
	}
	secondID := occurrencePeriodID(period.ID, start.AddDate(0, 0, 1))
	if err := s.DeletePeriodWithScope(secondID, "this"); err != nil {
		t.Fatal(err)
	}
	snapshot, err := s.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	foundFirst := false
	foundSecond := false
	foundThird := false
	for _, item := range snapshot.Periods {
		switch item.ID {
		case period.ID:
			foundFirst = true
		case secondID:
			foundSecond = true
		case occurrencePeriodID(period.ID, start.AddDate(0, 0, 2)):
			foundThird = true
		}
	}
	if !foundFirst || foundSecond || !foundThird {
		t.Fatalf("first=%v second=%v third=%v", foundFirst, foundSecond, foundThird)
	}
}

func TestDeleteFirstRepeatingPeriodOccurrenceKeepsFutureSeries(t *testing.T) {
	s := testStore(t)
	start := time.Now().UTC().Truncate(24 * time.Hour).Add(10 * time.Hour)
	end := start.Add(2 * time.Hour)
	period, err := s.CreatePeriod(CreatePeriodInput{
		Title:          "Daily work",
		StartAtUTC:     start.Format(time.RFC3339),
		EndAtUTC:       end.Format(time.RFC3339),
		SourceTimezone: "America/Denver",
		Category:       "Work",
		Color:          "#2563eb",
		RecurrenceRule: &RecurrenceRule{Frequency: "daily", IntervalCount: 1},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.DeletePeriodWithScope(period.ID, "this"); err != nil {
		t.Fatal(err)
	}
	snapshot, err := s.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	foundFirst := false
	foundSecond := false
	for _, item := range snapshot.Periods {
		if item.ID == period.ID {
			foundFirst = true
		}
		if item.ID == occurrencePeriodID(period.ID, start.AddDate(0, 0, 1)) {
			foundSecond = true
		}
	}
	if foundFirst || !foundSecond {
		t.Fatalf("first=%v second=%v", foundFirst, foundSecond)
	}
}

func TestDeleteRepeatingPeriodOccurrenceAndFollowingEndsSeries(t *testing.T) {
	s := testStore(t)
	start := time.Now().UTC().Truncate(24 * time.Hour).Add(10 * time.Hour)
	end := start.Add(2 * time.Hour)
	period, err := s.CreatePeriod(CreatePeriodInput{
		Title:          "Daily work",
		StartAtUTC:     start.Format(time.RFC3339),
		EndAtUTC:       end.Format(time.RFC3339),
		SourceTimezone: "America/Denver",
		Category:       "Work",
		Color:          "#2563eb",
		RecurrenceRule: &RecurrenceRule{Frequency: "daily", IntervalCount: 1},
	})
	if err != nil {
		t.Fatal(err)
	}
	secondID := occurrencePeriodID(period.ID, start.AddDate(0, 0, 1))
	if err := s.DeletePeriodWithScope(secondID, "following"); err != nil {
		t.Fatal(err)
	}
	snapshot, err := s.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	foundFirst := false
	foundSecondOrLater := false
	for _, item := range snapshot.Periods {
		if item.ID == period.ID {
			foundFirst = true
		}
		if strings.HasPrefix(item.ID, period.ID+"#occ#") {
			foundSecondOrLater = true
		}
	}
	if !foundFirst || foundSecondOrLater {
		t.Fatalf("first=%v secondOrLater=%v", foundFirst, foundSecondOrLater)
	}
}


func TestGeneratedOccurrenceSetNoRepeatCreatesSingleException(t *testing.T) {
	s := testStore(t)
	start := time.Now().UTC().Truncate(24 * time.Hour).Add(10 * time.Hour)
	end := start.Add(2 * time.Hour)
	period, err := s.CreatePeriod(CreatePeriodInput{
		Title:          "Daily work",
		StartAtUTC:     start.Format(time.RFC3339),
		EndAtUTC:       end.Format(time.RFC3339),
		SourceTimezone: "America/Denver",
		Category:       "Work",
		Color:          "#2563eb",
		RecurrenceRule: &RecurrenceRule{Frequency: "daily", IntervalCount: 1},
	})
	if err != nil {
		t.Fatal(err)
	}
	selectedStart := start.AddDate(0, 0, 1).Format(time.RFC3339)
	selectedEnd := end.AddDate(0, 0, 1).Format(time.RFC3339)
	title := "Daily work"
	created, err := s.UpdatePeriod(UpdatePeriodInput{
		ID:                  occurrencePeriodID(period.ID, start.AddDate(0, 0, 1)),
		Title:               &title,
		StartAtUTC:          &selectedStart,
		EndAtUTC:            &selectedEnd,
		RecurrenceRule:      nil,
		RecurrenceRuleSet:   true,
		RecurrenceEditScope: "this",
	})
	if err != nil {
		t.Fatal(err)
	}
	if created.RecurrenceRule != nil {
		t.Fatal("selected date should be a non-repeating one-off period")
	}
	snapshot, err := s.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	foundFirst := false
	foundSingleException := false
	foundThird := false
	for _, item := range snapshot.Periods {
		if item.ID == period.ID {
			foundFirst = true
		}
		if item.ID == created.ID && item.StartAtUTC == selectedStart && item.RecurrenceRule == nil {
			foundSingleException = true
		}
		if item.ID == occurrencePeriodID(period.ID, start.AddDate(0, 0, 2)) {
			foundThird = true
		}
	}
	if !foundFirst || !foundSingleException || !foundThird {
		t.Fatalf("first=%v singleException=%v third=%v", foundFirst, foundSingleException, foundThird)
	}
}

func TestClearDataIgnoresMissingOptionalHistoryTables(t *testing.T) {
	s := testStore(t)
	if _, err := s.CreateTask(CreateTaskInput{Title: "Clear me", Priority: "urgent"}); err != nil {
		t.Fatal(err)
	}
	if err := s.ClearData(); err != nil {
		t.Fatal(err)
	}
	snapshot, err := s.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Tasks) != 0 || len(snapshot.Periods) != 0 {
		t.Fatalf("tasks=%d periods=%d want empty data", len(snapshot.Tasks), len(snapshot.Periods))
	}
}

func TestExportAndBackupValidation(t *testing.T) {
	s := testStore(t)
	dir := t.TempDir()
	path, err := s.ExportData("json", dir)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatal(err)
	}
	valid := filepath.Join(dir, "restore.db")
	if err := os.WriteFile(valid, []byte("placeholder"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := ValidateRestorePath(valid); err != nil {
		t.Fatal(err)
	}
	if err := ValidateRestorePath(filepath.Join(dir, "bad.exe")); err == nil {
		t.Fatal("expected invalid extension")
	}
}

func TestDailyTemplateSaveAndApply(t *testing.T) {
	s := testStore(t)
	start := time.Date(2026, 7, 14, 9, 0, 0, 0, time.UTC)
	end := start.Add(time.Hour)
	_, err := s.CreatePeriod(CreatePeriodInput{Title: "Core work", StartAtUTC: start.Format(time.RFC3339), EndAtUTC: end.Format(time.RFC3339), SourceTimezone: "America/Denver", Category: "Work", Color: "#2563eb"})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.SaveTemplate("Work day", "2026-07-14"); err != nil {
		t.Fatal(err)
	}
	templates, err := s.ListTemplates()
	if err != nil {
		t.Fatal(err)
	}
	if len(templates) != 1 || templates[0].PeriodCount != 1 {
		t.Fatalf("templates=%+v", templates)
	}
	if err := s.ApplyTemplate(templates[0].ID, "2026-07-15"); err != nil {
		t.Fatal(err)
	}
	if len(s.periods()) != 2 {
		t.Fatalf("period count=%d", len(s.periods()))
	}
}
