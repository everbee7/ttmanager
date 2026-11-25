package store

import "testing"

func TestDefaultBoardSteps(t *testing.T) {
	s := testStore(t)
	steps := s.settings().BoardSteps
	if len(steps) != 5 || steps[0].ID != "overdue" || steps[4].ID != "done" {
		t.Fatalf("unexpected default steps: %+v", steps)
	}
}

func TestCustomBoardStepsAndTaskPlacement(t *testing.T) {
	s := testStore(t)
	steps := []any{
		map[string]any{"id": "inbox", "label": "Backlog", "color": "#123456"},
		map[string]any{"id": "step-review", "label": "Review", "hint": "Waiting on feedback", "color": "#7c3aed"},
		map[string]any{"id": "done", "label": "Done", "hidden": true},
	}
	if err := s.UpdateSettings(map[string]any{"boardSteps": steps}); err != nil {
		t.Fatal(err)
	}
	got := s.settings().BoardSteps
	if len(got) != 3 {
		t.Fatalf("deleted built-in columns must stay deleted, got %+v", got)
	}
	if got[0].Label != "Backlog" || got[1].Kind != "custom" || !got[2].Hidden {
		t.Fatalf("unexpected normalized steps: %+v", got)
	}

	review := "step-review"
	task, err := s.CreateTask(CreateTaskInput{Title: "Ship draft", StepID: &review})
	if err != nil {
		t.Fatal(err)
	}
	if task.StepID == nil || *task.StepID != review {
		t.Fatalf("stepId=%v", task.StepID)
	}
	title := "Ship final draft"
	task, err = s.UpdateTask(UpdateTaskInput{ID: task.ID, Title: &title})
	if err != nil {
		t.Fatal(err)
	}
	if task.StepID == nil || *task.StepID != review {
		t.Fatalf("step should survive unrelated update, got %v", task.StepID)
	}

	// Deleting the custom step detaches its tasks.
	if err := s.UpdateSettings(map[string]any{"boardSteps": steps[:1]}); err != nil {
		t.Fatal(err)
	}
	task, err = s.taskByID(task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if task.StepID != nil {
		t.Fatalf("expected step to be cleared, got %v", *task.StepID)
	}

	empty := ""
	other := "step-other"
	if _, err := s.UpdateTask(UpdateTaskInput{ID: task.ID, StepID: &other}); err != nil {
		t.Fatal(err)
	}
	task, _ = s.UpdateTask(UpdateTaskInput{ID: task.ID, StepID: &empty})
	if task.StepID != nil {
		t.Fatalf("empty stepId should clear, got %v", *task.StepID)
	}
}

func TestInvalidBoardStepsRejected(t *testing.T) {
	s := testStore(t)
	bad := []any{map[string]any{"id": "a b", "label": "Bad"}}
	if err := s.UpdateSettings(map[string]any{"boardSteps": bad}); err == nil {
		t.Fatal("expected invalid id to be rejected")
	}
	dup := []any{map[string]any{"id": "x", "label": "X"}, map[string]any{"id": "x", "label": "Y"}}
	if err := s.UpdateSettings(map[string]any{"boardSteps": dup}); err == nil {
		t.Fatal("expected duplicate id to be rejected")
	}
	if err := s.UpdateSettings(map[string]any{"boardSteps": []any{}}); err == nil {
		t.Fatal("expected an empty board to be rejected")
	}
	allHidden := []any{map[string]any{"id": "a", "label": "A", "hidden": true}, map[string]any{"id": "b", "label": "B", "hidden": true}}
	if err := s.UpdateSettings(map[string]any{"boardSteps": allHidden}); err != nil {
		t.Fatal(err)
	}
	if s.settings().BoardSteps[0].Hidden {
		t.Fatal("expected at least one column to stay visible")
	}
}
