package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"ttmanager/core/internal/store"
)

type rpcRequest struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type appService struct {
	store   **store.Store
	db      **sql.DB
	dataDir string
	dbPath  string
	mongo   *store.MongoMirror
}

func main() {
	port := flag.String("port", "39111", "local API port")
	token := flag.String("token", "", "session token")
	flag.Parse()
	if *token == "" {
		slog.Error("missing session token")
		os.Exit(2)
	}

	dataDir := os.Getenv("TTMANAGER_DATA_DIR")
	if dataDir == "" {
		dataDir = filepath.Join(os.Getenv("APPDATA"), "ttmanager")
		if os.Getenv("APPDATA") == "" {
			dataDir = filepath.Join(os.Getenv("LOCALAPPDATA"), "TTManager")
		}
	}
	_ = os.MkdirAll(dataDir, 0o755)
	dbPath := filepath.Join(dataDir, "ttmanager.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		slog.Error("open db", "error", err)
		os.Exit(1)
	}
	defer db.Close()
	dbRef := &db
	s := store.New(*dbRef)
	storeRef := &s
	if err := (*storeRef).Migrate(); err != nil {
		slog.Error("migrate", "error", err)
		os.Exit(1)
	}
	if os.Getenv("TTMANAGER_DEMO_DATA") == "1" {
		_ = (*storeRef).SeedDemo()
	}
	mongoMirror := startMongoMirror(*storeRef)
	if mongoMirror != nil {
		defer mongoMirror.Close(context.Background())
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/rpc", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.Header.Get("x-session-token") != *token {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		var req rpcRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeErr(w, "BAD_REQUEST", err.Error())
			return
		}
		handleRPC(w, appService{store: storeRef, db: dbRef, dataDir: dataDir, dbPath: dbPath, mongo: mongoMirror}, req)
	})

	server := &http.Server{Addr: "127.0.0.1:" + *port, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	ln, err := net.Listen("tcp", server.Addr)
	if err != nil {
		slog.Error("listen", "error", err)
		os.Exit(1)
	}
	slog.Info("service started", "addr", server.Addr)
	if err := server.Serve(ln); err != nil && err != http.ErrServerClosed {
		slog.Error("server", "error", err)
	}
}

func startMongoMirror(s *store.Store) *store.MongoMirror {
	uri := os.Getenv("MONGODB_URI")
	if uri == "" {
		uri = "mongodb://localhost:27017"
	}
	dbName := os.Getenv("MONGODB_DB_NAME")
	if dbName == "" {
		dbName = "ttmanager"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
	defer cancel()
	mirror, err := store.NewMongoMirror(ctx, uri, dbName)
	if err != nil {
		slog.Warn("mongodb mirror unavailable", "error", err)
		return nil
	}
	if snapshot, err := s.Snapshot(); err == nil {
		_ = mirror.SaveSnapshot(ctx, snapshot)
	}
	slog.Info("mongodb mirror connected", "db", dbName)
	return mirror
}

func handleRPC(w http.ResponseWriter, svc appService, req rpcRequest) {
	s := *svc.store
	defer mirrorAfterRPC(svc, req.Type)
	switch req.Type {
	case "snapshot":
		data, err := s.Snapshot()
		writeOK(w, data, err)
	case "task.create":
		var input store.CreateTaskInput
		if decode(w, req.Payload, &input) {
			data, err := s.CreateTask(input)
			writeOK(w, data, err)
		}
	case "task.update":
		var input store.UpdateTaskInput
		if decode(w, req.Payload, &input) {
			data, err := s.UpdateTask(input)
			writeOK(w, data, err)
		}
	case "task.complete":
		var input struct {
			ID        string `json:"id"`
			Completed bool   `json:"completed"`
		}
		if decode(w, req.Payload, &input) {
			data, err := s.CompleteTask(input.ID, input.Completed)
			writeOK(w, data, err)
		}
	case "task.delete":
		var input struct {
			ID string `json:"id"`
		}
		if decode(w, req.Payload, &input) {
			writeOK(w, map[string]bool{"deleted": true}, s.DeleteTask(input.ID))
		}
	case "taskType.create":
		var input store.CreateTaskTypeInput
		if decode(w, req.Payload, &input) {
			data, err := s.CreateTaskType(input)
			writeOK(w, data, err)
		}
	case "taskType.update":
		var input store.UpdateTaskTypeInput
		if decode(w, req.Payload, &input) {
			data, err := s.UpdateTaskType(input)
			writeOK(w, data, err)
		}
	case "taskType.delete":
		var input struct {
			ID string `json:"id"`
		}
		if decode(w, req.Payload, &input) {
			writeOK(w, map[string]bool{"deleted": true}, s.DeleteTaskType(input.ID))
		}
	case "period.create":
		var input store.CreatePeriodInput
		if decode(w, req.Payload, &input) {
			data, err := s.CreatePeriod(input)
			writeOK(w, data, err)
		}
	case "period.update":
		var input store.UpdatePeriodInput
		if decode(w, req.Payload, &input) {
			data, err := s.UpdatePeriod(input)
			writeOK(w, data, err)
		}
	case "period.complete":
		var input struct {
			ID string `json:"id"`
		}
		if decode(w, req.Payload, &input) {
			data, err := s.CompletePeriod(input.ID)
			writeOK(w, data, err)
		}
	case "period.skip":
		var input struct {
			ID string `json:"id"`
		}
		if decode(w, req.Payload, &input) {
			data, err := s.SkipPeriod(input.ID)
			writeOK(w, data, err)
		}
	case "period.delete":
		var input struct {
			ID    string `json:"id"`
			Scope string `json:"scope"`
		}
		if decode(w, req.Payload, &input) {
			writeOK(w, map[string]bool{"deleted": true}, s.DeletePeriodWithScope(input.ID, input.Scope))
		}
	case "link.create":
		var input struct {
			TaskID   string `json:"taskId"`
			PeriodID string `json:"periodId"`
		}
		if decode(w, req.Payload, &input) {
			writeOK(w, map[string]bool{"linked": true}, s.LinkTaskPeriod(input.TaskID, input.PeriodID))
		}
	case "link.delete":
		var input struct {
			TaskID   string `json:"taskId"`
			PeriodID string `json:"periodId"`
		}
		if decode(w, req.Payload, &input) {
			writeOK(w, map[string]bool{"linked": false}, s.UnlinkTaskPeriod(input.TaskID, input.PeriodID))
		}
	case "reminders.due":
		data, err := s.DueReminders(time.Now())
		writeOK(w, data, err)
	case "reminders.sent":
		var input struct {
			ID string `json:"id"`
		}
		if decode(w, req.Payload, &input) {
			writeOK(w, map[string]bool{"sent": true}, s.MarkReminderSent(input.ID))
		}
	case "reminders.snooze":
		var input struct {
			ID      string `json:"id"`
			Minutes int    `json:"minutes"`
		}
		if decode(w, req.Payload, &input) {
			writeOK(w, map[string]bool{"snoozed": true}, s.SnoozeReminder(input.ID, input.Minutes))
		}
	case "settings.update":
		var input map[string]any
		if decode(w, req.Payload, &input) {
			writeOK(w, map[string]bool{"updated": true}, s.UpdateSettings(input))
		}
	case "data.export":
		var input struct {
			Format string `json:"format"`
		}
		if decode(w, req.Payload, &input) {
			path, err := s.ExportData(input.Format, filepath.Join(svc.dataDir, "exports"))
			writeOK(w, map[string]string{"path": path}, err)
		}
	case "data.backup":
		path, err := s.BackupDatabase(svc.dbPath, filepath.Join(svc.dataDir, "backups"))
		writeOK(w, map[string]string{"path": path}, err)
	case "data.restore":
		var input struct {
			Path string `json:"path"`
		}
		if decode(w, req.Payload, &input) {
			writeOK(w, map[string]bool{"restored": true}, restoreData(svc, input.Path))
		}
	case "data.clear":
		writeOK(w, map[string]bool{"cleared": true}, s.ClearData())
	case "templates.list":
		data, err := s.ListTemplates()
		writeOK(w, data, err)
	case "templates.save":
		var input struct{ Name, Date string }
		if decode(w, req.Payload, &input) {
			writeOK(w, map[string]bool{"saved": true}, s.SaveTemplate(input.Name, input.Date))
		}
	case "templates.apply":
		var input struct{ TemplateID, Date string }
		if decode(w, req.Payload, &input) {
			writeOK(w, map[string]bool{"applied": true}, s.ApplyTemplate(input.TemplateID, input.Date))
		}
	default:
		writeErr(w, "UNKNOWN_REQUEST", "unsupported request")
	}
}

func mirrorAfterRPC(svc appService, requestType string) {
	if svc.mongo == nil {
		return
	}
	switch requestType {
	case "snapshot", "templates.list", "reminders.due":
		return
	}
	snapshot, err := (*svc.store).Snapshot()
	if err != nil {
		slog.Warn("mongodb snapshot failed", "error", err)
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := svc.mongo.SaveSnapshot(ctx, snapshot); err != nil {
		slog.Warn("mongodb mirror save failed", "error", err)
	}
}

func restoreData(svc appService, inputPath string) error {
	if err := store.ValidateRestorePath(inputPath); err != nil {
		return err
	}
	if _, err := (*svc.store).BackupDatabase(svc.dbPath, filepath.Join(svc.dataDir, "backups")); err != nil {
		return err
	}
	ext := filepath.Ext(inputPath)
	if ext == ".json" {
		return store.ImportJSONSnapshot(*svc.db, inputPath)
	}
	if err := (*svc.db).Close(); err != nil {
		return err
	}
	src, err := os.Open(inputPath)
	if err != nil {
		return err
	}
	defer src.Close()
	dst, err := os.Create(svc.dbPath)
	if err != nil {
		return err
	}
	if _, err := io.Copy(dst, src); err != nil {
		_ = dst.Close()
		return err
	}
	if err := dst.Close(); err != nil {
		return err
	}
	db, err := sql.Open("sqlite", svc.dbPath)
	if err != nil {
		return err
	}
	*svc.db = db
	nextStore := store.New(db)
	*svc.store = nextStore
	return nextStore.Migrate()
}

func decode(w http.ResponseWriter, raw json.RawMessage, v any) bool {
	if err := json.Unmarshal(raw, v); err != nil {
		writeErr(w, "BAD_PAYLOAD", err.Error())
		return false
	}
	return true
}

func writeOK(w http.ResponseWriter, data any, err error) {
	if err != nil {
		writeErr(w, "STORE_ERROR", err.Error())
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "data": data})
}

func writeErr(w http.ResponseWriter, code, message string) {
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "error": map[string]string{"code": code, "message": message}})
}
