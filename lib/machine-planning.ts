import type { MockRecord } from "@/lib/types";

export const PLAN_DAY_START = "08:00";
export const PLAN_DAY_END = "18:00";
export const PLAN_WEEK_DAYS = 6;
export const DAY_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

export type MachineSlot = {
  id: string;
  reference: string;
  name: string;
  status: string;
  machine: string;
  machineId: string;
  order: string;
  orderId: string;
  day: string;
  startTime: string;
  endTime: string;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function isoDay(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseIsoDay(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year || 2026, (month || 1) - 1, day || 1, 12, 0, 0);
}

export function mondayOf(date: Date) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
  const weekday = next.getDay();
  next.setDate(next.getDate() + (weekday === 0 ? -6 : 1 - weekday));
  return next;
}

export function weekDays(monday: Date) {
  return Array.from({ length: PLAN_WEEK_DAYS }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return isoDay(day);
  });
}

export function formatWeekLabel(monday: Date) {
  const days = weekDays(monday);
  const first = parseIsoDay(days[0] || isoDay(monday));
  const last = parseIsoDay(days[days.length - 1] || isoDay(monday));
  const month = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
  const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric" });
  if (first.getMonth() === last.getMonth()) {
    return `${day.format(first)} – ${day.format(last)} ${month.format(first)}`;
  }
  return `${day.format(first)} ${new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(first)} – ${day.format(last)} ${month.format(last)}`;
}

export function formatDayHeading(iso: string) {
  const date = parseIsoDay(iso);
  return {
    name: DAY_NAMES[date.getDay() === 0 ? 6 : date.getDay() - 1] || "",
    date: new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(date),
  };
}

export function minutesFromTime(value: string) {
  const [hours, minutes] = String(value || "").split(":").map(Number);
  if (!Number.isFinite(hours)) return 0;
  return hours * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

export function formatHour(value: string) {
  const [hours, minutes] = String(value || "00:00").split(":");
  if (!minutes || minutes === "00") return `${hours}h`;
  return `${hours}h${minutes}`;
}

export function formatTimeRange(start: string, end: string) {
  return `${formatHour(start)} → ${formatHour(end)}`;
}

export function timeOptions(from = PLAN_DAY_START, to = PLAN_DAY_END) {
  const start = minutesFromTime(from);
  const end = minutesFromTime(to);
  const options: string[] = [];
  for (let minutes = start; minutes <= end; minutes += 30) {
    options.push(`${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`);
  }
  return options;
}

export function planningMachines(postes: MockRecord[]) {
  return postes.filter((item) => item.status !== "Hors service");
}

export function asSlot(record: MockRecord): MachineSlot {
  return {
    id: record.id,
    reference: record.reference,
    name: String(record.name || ""),
    status: String(record.status || "Planifié"),
    machine: String(record.machine || ""),
    machineId: String(record.machineId || ""),
    order: String(record.order || record.name || ""),
    orderId: String(record.orderId || ""),
    day: String(record.day || record.startDate || ""),
    startTime: String(record.startTime || PLAN_DAY_START),
    endTime: String(record.endTime || PLAN_DAY_END),
  };
}

export function slotsForMachineDay(slots: MachineSlot[], machine: MockRecord, day: string) {
  return slots
    .filter((item) => item.day === day && (item.machineId === machine.id || item.machine === machine.name))
    .sort((left, right) => minutesFromTime(left.startTime) - minutesFromTime(right.startTime));
}

export function slotLiveStatus(slot: MachineSlot, now = new Date()) {
  const today = isoDay(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (slot.day < today) return "Terminé";
  if (slot.day > today) return "Planifié";
  const start = minutesFromTime(slot.startTime);
  const end = minutesFromTime(slot.endTime);
  if (nowMinutes >= end) return "Terminé";
  if (nowMinutes >= start) return "En cours";
  return "Planifié";
}

export function currentSlot(slots: MachineSlot[], machine: MockRecord, now = new Date()) {
  const today = isoDay(now);
  return slotsForMachineDay(slots, machine, today).find((item) => slotLiveStatus(item, now) === "En cours");
}

export function nextSlot(slots: MachineSlot[], machine: MockRecord, now = new Date()) {
  const today = isoDay(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const upcoming = slots
    .filter((item) => item.machineId === machine.id || item.machine === machine.name)
    .filter((item) => {
      if (item.day > today) return true;
      if (item.day < today) return false;
      return minutesFromTime(item.startTime) > nowMinutes;
    })
    .sort((left, right) => left.day.localeCompare(right.day) || minutesFromTime(left.startTime) - minutesFromTime(right.startTime));
  return upcoming[0];
}

export function freeGaps(slots: MachineSlot[], day: string, machine: MockRecord) {
  const busy = slotsForMachineDay(slots, machine, day);
  const gaps: { startTime: string; endTime: string }[] = [];
  let cursor = minutesFromTime(PLAN_DAY_START);
  const close = minutesFromTime(PLAN_DAY_END);
  for (const slot of busy) {
    const start = minutesFromTime(slot.startTime);
    if (start - cursor >= 30) {
      gaps.push({
        startTime: `${pad(Math.floor(cursor / 60))}:${pad(cursor % 60)}`,
        endTime: slot.startTime,
      });
    }
    cursor = Math.max(cursor, minutesFromTime(slot.endTime));
  }
  if (close - cursor >= 30) {
    gaps.push({
      startTime: `${pad(Math.floor(cursor / 60))}:${pad(cursor % 60)}`,
      endTime: PLAN_DAY_END,
    });
  }
  return gaps;
}

export function overlapError(slots: MachineSlot[], machine: MockRecord, day: string, startTime: string, endTime: string, ignoreId = "") {
  const start = minutesFromTime(startTime);
  const end = minutesFromTime(endTime);
  if (end <= start) return "L’heure de fin doit être après l’heure de début.";
  if (start < minutesFromTime(PLAN_DAY_START) || end > minutesFromTime(PLAN_DAY_END)) {
    return `Les créneaux se placent entre ${formatHour(PLAN_DAY_START)} et ${formatHour(PLAN_DAY_END)}.`;
  }
  const clash = slotsForMachineDay(slots, machine, day).find((item) => {
    if (item.id === ignoreId) return false;
    return start < minutesFromTime(item.endTime) && end > minutesFromTime(item.startTime);
  });
  if (clash) return `Ce créneau chevauche ${clash.order} (${formatTimeRange(clash.startTime, clash.endTime)}).`;
  return "";
}

export function nextSlotReference(slots: MockRecord[], at = new Date()) {
  const stamp = `${pad(at.getMonth() + 1)}${pad(at.getDate())}`;
  const prefix = `PLN-${stamp}-`;
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const taken = new Set(slots.map((item) => item.reference));
  for (const letter of letters) {
    const reference = `${prefix}${letter}`;
    if (!taken.has(reference)) return reference;
  }
  return `PLN-${String(Date.now()).slice(-8)}`;
}

export function formatNextLabel(slot: MachineSlot | undefined) {
  if (!slot) return "Aucune commande ensuite";
  const heading = formatDayHeading(slot.day);
  return `Ensuite ${slot.order} · ${heading.name} ${formatHour(slot.startTime)}`;
}
