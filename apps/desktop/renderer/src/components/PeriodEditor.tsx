import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { addHours } from "date-fns";
import { X } from "lucide-react";
import type { RecurrenceRule, TimePeriod } from "@shared/contracts";
import { timezones } from "@/lib/timezones";
import { dateInputValue, timeInputValue, zonedWallTimeToUtc } from "@/lib/datetime";
type RepeatFrequency = RecurrenceRule["frequency"];

type PeriodDraft = {
  title: string;
  description: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  sourceTimezone: string;
  category: string;
  color: string;
  notes: string;
  repeat: RepeatFrequency;
  repeatInterval: number;
  repeatWeekdays: number[];
  repeatMonthRule: string;
  repeatStartsOn: string;
  repeatEndsOn: string;
  repeatCount: number | "";
  recurrenceEditScope: "this" | "following" | "series";
};

type Props = {
  open: boolean;
  period: TimePeriod | null;
  defaultTimezone: string;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: { id?: string; title: string; description: string | null; startAtUtc: string; endAtUtc: string; sourceTimezone: string; category: string; color: string; notes: string | null; recurrenceRule: RecurrenceRule | null; recurrenceEditScope?: "this" | "following" | "series" }) => void;
  onDelete?: (id: string, scope?: "this" | "following" | "series") => void;
};

export function PeriodEditor({ open, period, defaultTimezone, onOpenChange, onSave, onDelete }: Props) {
  const initial = useMemo(() => makeDraft(period, defaultTimezone), [period, defaultTimezone]);
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");
  const [deleteChoiceOpen, setDeleteChoiceOpen] = useState(false);
  const [saveChoiceOpen, setSaveChoiceOpen] = useState(false);
  useEffect(() => {
    if (open) {
      setDraft(initial);
      setError("");
      setDeleteChoiceOpen(false);
      setSaveChoiceOpen(false);
    }
  }, [open, initial]);

  function submit() {
    if (period?.recurrenceRule) {
      setSaveChoiceOpen(true);
      setDeleteChoiceOpen(false);
      return;
    }
    saveWithScope("series");
  }

  function saveWithScope(scope: "this" | "following" | "series") {
    const startAtUtc = zonedWallTimeToUtc(draft.startDate, draft.startTime, draft.sourceTimezone.trim() || defaultTimezone);
    const endAtUtc = zonedWallTimeToUtc(draft.endDate, draft.endTime, draft.sourceTimezone.trim() || defaultTimezone);
    const start = new Date(startAtUtc);
    const end = new Date(endAtUtc);
    if (!draft.title.trim()) {
      setError("Title is required.");
      return;
    }
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setError("End must be after start. Midnight-crossing periods are allowed by using the next end date.");
      return;
    }
    onSave({
      id: period?.id,
      title: draft.title.trim(),
      description: nullable(draft.description),
      startAtUtc,
      endAtUtc,
      sourceTimezone: draft.sourceTimezone.trim() || defaultTimezone,
      category: draft.category.trim() || "Work",
      color: draft.color,
      notes: nullable(draft.notes),
      recurrenceRule: draft.repeat === "none" ? null : {
        frequency: draft.repeat,
        intervalCount: Number(draft.repeatInterval) || 1,
        weekdays: draft.repeat === "weekly" ? draft.repeatWeekdays : [],
        monthRule: draft.repeat === "monthly" ? draft.repeatMonthRule || null : null,
        startsOn: draft.repeatStartsOn || draft.startDate,
        endsOn: draft.repeatEndsOn || null,
        occurrenceCount: draft.repeatCount ? Number(draft.repeatCount) : null
      },
      recurrenceEditScope: scope
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content className="fixed right-5 top-5 z-50 flex max-h-[calc(100vh-40px)] w-[440px] flex-col overflow-hidden rounded-[14px] border border-line bg-panel shadow-panel">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <Dialog.Title className="text-[17px] font-semibold">{period ? "Edit period" : "Add period"}</Dialog.Title>
            <Dialog.Close className="focus-ring rounded-[10px] p-2 hover:bg-surface"><X size={16} /></Dialog.Close>
          </div>
          <div className="space-y-4 overflow-auto p-5">
            <Field label="Title"><input className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} autoFocus /></Field>
            <Field label="Description"><textarea className="input min-h-20 resize-none" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start date"><input className="input" type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} /></Field>
              <Field label="Start time"><input className="input" type="time" value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} /></Field>
              <Field label="End date"><input className="input" type="date" value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} /></Field>
              <Field label="End time"><input className="input" type="time" value={draft.endTime} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-[1fr_96px] gap-3">
              <Field label="Category"><input className="input" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} /></Field>
              <Field label="Color"><input className="h-10 w-full rounded-[10px] border border-line bg-surface p-1" type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} /></Field>
            </div>
            <Field label="Timezone">
              <select className="input" value={draft.sourceTimezone} onChange={(e) => setDraft({ ...draft, sourceTimezone: e.target.value })}>
                {timezones.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}
              </select>
            </Field>
            <Field label="Notes"><textarea className="input min-h-20 resize-none" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Repeat">
                <select className="input" value={draft.repeat} onChange={(e) => setDraft({ ...draft, repeat: e.target.value as RepeatFrequency })}>
                  {["none", "daily", "weekdays", "weekly", "monthly"].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </Field>
              <Field label="Every">
                <input className="input" type="number" min={1} value={draft.repeatInterval} onChange={(e) => setDraft({ ...draft, repeatInterval: Number(e.target.value) })} />
              </Field>
            </div>
            {draft.repeat === "weekly" && <WeekdayPicker value={draft.repeatWeekdays} onChange={(repeatWeekdays) => setDraft({ ...draft, repeatWeekdays })} />}
            {draft.repeat === "monthly" && <MonthRulePicker value={draft.repeatMonthRule} onChange={(repeatMonthRule) => setDraft({ ...draft, repeatMonthRule })} />}
            {draft.repeat !== "none" && (
              <div className="grid grid-cols-3 gap-3">
                <Field label="Repeat starts"><input className="input" type="date" value={draft.repeatStartsOn} onChange={(e) => setDraft({ ...draft, repeatStartsOn: e.target.value })} /></Field>
                <Field label="Repeat ends"><input className="input" type="date" value={draft.repeatEndsOn} onChange={(e) => setDraft({ ...draft, repeatEndsOn: e.target.value })} /></Field>
                <Field label="Occurrences"><input className="input" type="number" min={1} value={draft.repeatCount} onChange={(e) => setDraft({ ...draft, repeatCount: e.target.value ? Number(e.target.value) : "" })} /></Field>
              </div>
            )}
            {period?.recurrenceRule && <div className="rounded-[10px] border border-line bg-surface px-3 py-2 text-[12px] leading-5 text-muted">This is a repeating timeline. When you save, choose whether the change applies to this timeline, this and following timelines, or all timelines.</div>}
            {error && <div className="rounded-[10px] border border-urgent/30 bg-urgent/10 px-3 py-2 text-[13px] text-urgent">{error}</div>}
          </div>
          <div className="flex items-center justify-between border-t border-line px-5 py-4">
            {period && onDelete ? <button className="rounded-[10px] px-3 py-2 text-[13px] text-urgent hover:bg-urgent/10" onClick={() => {
              if (period.recurrenceRule) setDeleteChoiceOpen(true);
              else onDelete(period.id, "series");
            }}>Delete</button> : <span />}
            <div className="flex gap-2">
              <Dialog.Close className="rounded-[10px] border border-line px-3 py-2 hover:bg-surface">Cancel</Dialog.Close>
              <button className="rounded-[10px] bg-ink px-3 py-2 text-white" onClick={submit}>Save</button>
            </div>
          </div>
          {deleteChoiceOpen && period && onDelete && (
            <div className="border-t border-line bg-surface px-5 py-4">
              <div className="text-[13px] font-semibold">Delete repeating period</div>
              <p className="mt-1 text-[12px] leading-5 text-muted">Choose whether to remove only this selected date, this and future dates, or the entire repeated series.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="rounded-[10px] border border-line px-3 py-2 text-[13px] hover:bg-panel" onClick={() => onDelete(period.id, "this")}>This timeline</button>
                <button className="rounded-[10px] border border-line px-3 py-2 text-[13px] hover:bg-panel" onClick={() => onDelete(period.id, "following")}>This and following</button>
                <button className="rounded-[10px] bg-urgent px-3 py-2 text-[13px] text-white hover:bg-urgent/90" onClick={() => onDelete(period.id, "series")}>All timelines</button>
                <button className="rounded-[10px] px-3 py-2 text-[13px] text-muted hover:bg-panel" onClick={() => setDeleteChoiceOpen(false)}>Cancel</button>
              </div>
            </div>
          )}
          {saveChoiceOpen && period?.recurrenceRule && (
            <div className="border-t border-line bg-surface px-5 py-4">
              <div className="text-[13px] font-semibold">Save repeating period</div>
              <p className="mt-1 text-[12px] leading-5 text-muted">Choose how this change should apply to the recurring series.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="rounded-[10px] border border-line px-3 py-2 text-[13px] hover:bg-panel" onClick={() => saveWithScope("this")}>This timeline</button>
                <button className="rounded-[10px] border border-line px-3 py-2 text-[13px] hover:bg-panel" onClick={() => saveWithScope("following")}>This and following</button>
                <button className="rounded-[10px] bg-accent px-3 py-2 text-[13px] font-semibold text-surface hover:bg-accent/90" onClick={() => saveWithScope("series")}>All timelines</button>
                <button className="rounded-[10px] px-3 py-2 text-[13px] text-muted hover:bg-panel" onClick={() => setSaveChoiceOpen(false)}>Cancel</button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-[13px] font-medium text-muted"><span className="mb-1 block">{label}</span>{children}</label>;
}

function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (value: number[]) => void }) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <Field label="Repeat on">
      <div className="flex gap-1">
        {days.map((day, index) => {
          const active = value.includes(index);
          return <button key={day} type="button" className={`rounded-[10px] border px-2 py-1.5 text-[12px] ${active ? "border-accent bg-accent text-white" : "border-line hover:bg-surface"}`} onClick={() => onChange(active ? value.filter((item) => item !== index) : [...value, index].sort())}>{day}</button>;
        })}
      </div>
    </Field>
  );
}

function MonthRulePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const parsed = parseMonthRule(value);
  return (
    <Field label="Monthly rule">
      <div className="grid grid-cols-[1fr_96px_1fr] gap-2">
        <select className="input" value={parsed.mode} onChange={(event) => onChange(event.target.value === "same-day" ? "" : makeMonthRule(parsed.nth, parsed.weekday))}>
          <option value="same-day">Same day of month</option>
          <option value="nth">Specific weekday</option>
        </select>
        <select className="input" value={parsed.nth} disabled={parsed.mode === "same-day"} onChange={(event) => onChange(makeMonthRule(Number(event.target.value), parsed.weekday))}>
          <option value={1}>First</option><option value={2}>Second</option><option value={3}>Third</option><option value={4}>Fourth</option><option value={-1}>Last</option>
        </select>
        <select className="input" value={parsed.weekday} disabled={parsed.mode === "same-day"} onChange={(event) => onChange(makeMonthRule(parsed.nth, Number(event.target.value)))}>
          {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => <option key={day} value={index}>{day}</option>)}
        </select>
      </div>
    </Field>
  );
}

function parseMonthRule(value: string) {
  const match = /^nth:(-1|[1-4]):([0-6])$/.exec(value);
  return match ? { mode: "nth", nth: Number(match[1]), weekday: Number(match[2]) } : { mode: "same-day", nth: 1, weekday: 1 };
}

function makeMonthRule(nth: number, weekday: number) {
  return `nth:${nth}:${weekday}`;
}

function makeDraft(period: TimePeriod | null, timezone: string): PeriodDraft {
  const start = period ? new Date(period.startAtUtc) : new Date();
  const end = period ? new Date(period.endAtUtc) : addHours(start, 1);
  const displayTimezone = period?.sourceTimezone ?? timezone;
  return {
    title: period?.title ?? "",
    description: period?.description ?? "",
    startDate: dateInputValue(start, displayTimezone),
    startTime: timeInputValue(start, displayTimezone),
    endDate: dateInputValue(end, displayTimezone),
    endTime: timeInputValue(end, displayTimezone),
    sourceTimezone: displayTimezone,
    category: period?.category ?? "Work",
    color: period?.color ?? "#2563eb",
    notes: period?.notes ?? "",
    repeat: (period?.recurrenceRule?.frequency ?? "none") as RepeatFrequency,
    repeatInterval: period?.recurrenceRule?.intervalCount ?? 1,
    repeatWeekdays: period?.recurrenceRule?.weekdays ?? [],
    repeatMonthRule: period?.recurrenceRule?.monthRule ?? "",
    repeatStartsOn: period?.recurrenceRule?.startsOn ?? "",
    repeatEndsOn: period?.recurrenceRule?.endsOn ?? "",
    repeatCount: period?.recurrenceRule?.occurrenceCount ?? "",
    recurrenceEditScope: period?.id.includes("#occ#") ? "this" : "series"
  };
}

function nullable(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
