package store

import (
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"
)

type Occurrence struct {
	Start time.Time
	End   *time.Time
}

func (s *Store) SaveRecurrenceRule(ownerType, ownerID string, rule *RecurrenceRule) error {
	if rule == nil || rule.Frequency == "" || rule.Frequency == "none" {
		_, err := s.db.Exec(`DELETE FROM recurrence_rules WHERE owner_type=? AND owner_id=?`, ownerType, ownerID)
		return err
	}
	if rule.IntervalCount <= 0 {
		rule.IntervalCount = 1
	}
	weekdays, _ := json.Marshal(rule.Weekdays)
	id := rule.ID
	if id == "" {
		id = newID("rrule")
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM recurrence_rules WHERE owner_type=? AND owner_id=?`, ownerType, ownerID); err != nil {
		return err
	}
	if _, err := tx.Exec(`INSERT INTO recurrence_rules(id,owner_type,owner_id,frequency,interval_count,weekdays,month_rule,starts_on,ends_on,occurrence_count)
		VALUES(?,?,?,?,?,?,?,?,?,?)`,
		id, ownerType, ownerID, rule.Frequency, rule.IntervalCount, string(weekdays), rule.MonthRule, rule.StartsOn, rule.EndsOn, rule.OccurrenceCount); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) recurrenceRule(ownerType, ownerID string) *RecurrenceRule {
	rule, _ := s.recurrenceRuleWithError(ownerType, ownerID)
	return rule
}

func (s *Store) recurrenceRuleWithError(ownerType, ownerID string) (*RecurrenceRule, error) {
	row := s.db.QueryRow(`SELECT id,frequency,interval_count,COALESCE(weekdays,'[]'),COALESCE(month_rule,''),COALESCE(starts_on,''),COALESCE(ends_on,''),COALESCE(occurrence_count,'') FROM recurrence_rules WHERE owner_type=? AND owner_id=? LIMIT 1`, ownerType, ownerID)
	var rule RecurrenceRule
	var weekdays string
	var monthRule, startsOn, endsOn, occurrenceCount string
	if err := row.Scan(&rule.ID, &rule.Frequency, &rule.IntervalCount, &weekdays, &monthRule, &startsOn, &endsOn, &occurrenceCount); err != nil {
		return nil, err
	}
	rule.OwnerType = ownerType
	rule.OwnerID = ownerID
	_ = json.Unmarshal([]byte(weekdays), &rule.Weekdays)
	if monthRule != "" {
		rule.MonthRule = &monthRule
	}
	if startsOn != "" {
		rule.StartsOn = &startsOn
	}
	if endsOn != "" {
		rule.EndsOn = &endsOn
	}
	if occurrenceCount != "" {
		if parsed, err := strconv.Atoi(occurrenceCount); err == nil {
			rule.OccurrenceCount = &parsed
		}
	}
	return &rule, nil
}

func GenerateOccurrences(rule RecurrenceRule, baseStart time.Time, baseEnd *time.Time, rangeStart, rangeEnd time.Time) ([]Occurrence, error) {
	if rule.Frequency == "" || rule.Frequency == "none" {
		if baseStart.Before(rangeEnd) && (baseEnd == nil || baseEnd.After(rangeStart)) {
			return []Occurrence{{Start: baseStart, End: baseEnd}}, nil
		}
		return nil, nil
	}
	if rule.IntervalCount <= 0 {
		rule.IntervalCount = 1
	}
	if !rangeEnd.After(rangeStart) {
		return nil, errors.New("invalid occurrence range")
	}
	if rule.StartsOn != nil && *rule.StartsOn != "" {
		startsOn, err := time.Parse("2006-01-02", *rule.StartsOn)
		if err != nil {
			return nil, errors.New("invalid recurrence start date")
		}
		rangeStart = maxTime(rangeStart, time.Date(startsOn.Year(), startsOn.Month(), startsOn.Day(), 0, 0, 0, 0, baseStart.Location()))
	}
	if rule.EndsOn != nil && *rule.EndsOn != "" {
		endsOn, err := time.Parse("2006-01-02", *rule.EndsOn)
		if err != nil {
			return nil, errors.New("invalid recurrence end date")
		}
		rangeEnd = minTime(rangeEnd, time.Date(endsOn.Year(), endsOn.Month(), endsOn.Day()+1, 0, 0, 0, 0, baseStart.Location()))
	}
	if !rangeEnd.After(rangeStart) {
		return nil, nil
	}
	duration := time.Duration(0)
	if baseEnd != nil {
		duration = baseEnd.Sub(baseStart)
	}
	var out []Occurrence
	current := baseStart
	count := 0
	for current.Before(rangeEnd) {
		if rule.OccurrenceCount != nil && count >= *rule.OccurrenceCount {
			break
		}
		if includeOccurrence(rule, baseStart, current, count) {
			end := current.Add(duration)
			inRange := current.Before(rangeEnd)
			if baseEnd != nil {
				inRange = inRange && end.After(rangeStart)
			} else {
				inRange = inRange && !current.Before(rangeStart)
			}
			if inRange {
				occ := Occurrence{Start: current}
				if baseEnd != nil {
					occ.End = &end
				}
				out = append(out, occ)
			}
			count++
		}
		current = current.AddDate(0, 0, 1)
	}
	return out, nil
}

func minTime(a, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
}

func maxTime(a, b time.Time) time.Time {
	if a.After(b) {
		return a
	}
	return b
}

func includeOccurrence(rule RecurrenceRule, base, current time.Time, sequence int) bool {
	days := int(current.Sub(base).Hours() / 24)
	switch rule.Frequency {
	case "daily":
		return days >= 0 && days%rule.IntervalCount == 0
	case "weekdays":
		day := current.Weekday()
		return day >= time.Monday && day <= time.Friday
	case "weekly":
		weeks := days / 7
		if weeks < 0 || weeks%rule.IntervalCount != 0 {
			return false
		}
		if len(rule.Weekdays) == 0 {
			return current.Weekday() == base.Weekday()
		}
		for _, weekday := range rule.Weekdays {
			if int(current.Weekday()) == weekday {
				return true
			}
		}
		return false
	case "monthly":
		months := (current.Year()-base.Year())*12 + int(current.Month()-base.Month())
		if months < 0 || months%rule.IntervalCount != 0 {
			return false
		}
		if rule.MonthRule != nil && strings.HasPrefix(*rule.MonthRule, "nth:") {
			return matchesNthWeekday(*rule.MonthRule, current)
		}
		return current.Day() == base.Day()
	default:
		return sequence == 0
	}
}

func matchesNthWeekday(rule string, current time.Time) bool {
	parts := strings.Split(rule, ":")
	if len(parts) != 3 || parts[0] != "nth" {
		return false
	}
	nth, err := strconv.Atoi(parts[1])
	if err != nil {
		return false
	}
	weekday, err := strconv.Atoi(parts[2])
	if err != nil || weekday < 0 || weekday > 6 || int(current.Weekday()) != weekday {
		return false
	}
	if nth == -1 {
		return current.AddDate(0, 0, 7).Month() != current.Month()
	}
	if nth < 1 || nth > 4 {
		return false
	}
	return ((current.Day()-1)/7)+1 == nth
}
