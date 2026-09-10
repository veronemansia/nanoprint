"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import {
  asSlot,
  currentSlot,
  formatDayHeading,
  formatHour,
  formatNextLabel,
  formatTimeRange,
  formatWeekLabel,
  freeGaps,
  isoDay,
  mondayOf,
  nextSlot,
  nextSlotReference,
  overlapError,
  parseIsoDay,
  planningMachines,
  slotLiveStatus,
  slotsForMachineDay,
  timeOptions,
  weekDays,
  type MachineSlot,
} from "@/lib/machine-planning";
import { isOpenOrder } from "@/lib/order-avenant";
import type { MockRecord } from "@/lib/types";

function statusTone(status: string) {
  if (/terminé|libre/i.test(status)) return "green";
  if (/planifié/i.test(status)) return "yellow";
  if (/cours/i.test(status)) return "cyan";
  if (/maintenance/i.test(status)) return "yellow";
  return "cyan";
}

type Draft = {
  id?: string;
  machineId: string;
  day: string;
  orderId: string;
  startTime: string;
  endTime: string;
};

export function MachinePlanning() {
  const { records, createRecord, updateRecord, deleteRecord, te } = useApp();
  const postes = records.postes ?? [];
  const orders = records["statuts-commandes"] ?? [];
  const rawSlots = records["planning-machines"] ?? [];
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const now = new Date();
  const today = isoDay(now);
  const days = weekDays(monday);
  const machines = planningMachines(postes);
  const slots = useMemo(() => rawSlots.map(asSlot), [rawSlots]);

  const alignedWeek = useRef(false);
  const hours = timeOptions();
  const openOrders = orders.filter(isOpenOrder);

  useEffect(() => {
    if (alignedWeek.current || !rawSlots.length) return;
    alignedWeek.current = true;
    const currentDays = new Set(weekDays(mondayOf(new Date())));
    if (rawSlots.some((item) => currentDays.has(String(item.day || "")))) return;
    const dated = rawSlots.map((item) => String(item.day || "")).filter(Boolean).sort();
    const pick = dated.find((day) => day >= isoDay(new Date())) || dated[0];
    if (pick) setMonday(mondayOf(parseIsoDay(pick)));
  }, [rawSlots]);
  const selected = slots.find((item) => item.id === selectedId);
  const selectedMachine = selected
    ? machines.find((item) => item.id === selected.machineId) ?? {
      id: selected.machineId,
      name: selected.machine,
      reference: "",
      status: "",
      updatedAt: "",
    }
    : undefined;

  function shiftWeek(delta: number) {
    const next = new Date(monday);
    next.setDate(monday.getDate() + delta * 7);
    setMonday(next);
    setSelectedId("");
  }

  function openDraft(machine: MockRecord, day: string, slot?: MachineSlot, gapStart?: string) {
    if (machine.status === "Maintenance") return;
    const gaps = freeGaps(slots, day, machine);
    const start = slot?.startTime || gapStart || gaps[0]?.startTime || "08:00";
    const later = hours[Math.min(hours.length - 1, hours.indexOf(start) + 6)] || gaps[0]?.endTime || "11:00";
    setDraft({
      id: slot?.id,
      machineId: machine.id,
      day,
      orderId: slot?.orderId || openOrders[0]?.id || "",
      startTime: start,
      endTime: slot?.endTime || later,
    });
    setError("");
    if (slot) setSelectedId(slot.id);
  }

  async function saveDraft() {
    if (!draft) return;
    const machine = machines.find((item) => item.id === draft.machineId);
    const order = orders.find((item) => item.id === draft.orderId);
    if (!machine || !order) {
      setError(te("Choisissez une machine et une commande."));
      return;
    }
    const clash = overlapError(slots, machine, draft.day, draft.startTime, draft.endTime, draft.id);
    if (clash) {
      setError(clash);
      return;
    }
    setPending(true);
    setError("");
    try {
      const values = {
        name: `${order.reference} — ${machine.name}`,
        status: "Planifié",
        machine: machine.name,
        machineId: machine.id,
        order: order.reference,
        orderId: order.id,
        day: draft.day,
        startTime: draft.startTime,
        endTime: draft.endTime,
        startDate: draft.day,
        endDate: draft.day,
      };
      if (draft.id) {
        await updateRecord("planning-machines", draft.id, values);
        setSelectedId(draft.id);
      } else {
        const created = await createRecord("planning-machines", {
          ...values,
          reference: nextSlotReference(rawSlots),
        });
        setSelectedId(created.id);
      }
      setDraft(null);
    } finally {
      setPending(false);
    }
  }

  async function removeSlot(id: string) {
    setPending(true);
    try {
      await deleteRecord("planning-machines", id);
      if (selectedId === id) setSelectedId("");
      setDraft(null);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="plan-page">
      <p className="settings-hint">
        Semaine machines : chaque case montre la commande et l’horaire. Une case vide est un créneau libre. Cliquez pour placer ou déplacer un travail.
      </p>
      <div className="plan-toolbar">
        <div className="heading-actions">
          <button type="button" className="button button-secondary" onClick={() => shiftWeek(-1)} aria-label="Semaine précédente">
            <ChevronLeft size={16} />
          </button>
          <strong>{formatWeekLabel(monday)}</strong>
          <button type="button" className="button button-secondary" onClick={() => shiftWeek(1)} aria-label="Semaine suivante">
            <ChevronRight size={16} />
          </button>
          <button type="button" className="button button-secondary" onClick={() => setMonday(mondayOf(new Date()))}>{te("Cette semaine")}</button>
        </div>
      </div>

      <section className="plan-summary" aria-label="État atelier">
        {machines.map((machine) => {
          const live = currentSlot(slots, machine, now);
          const upcoming = nextSlot(slots, machine, now);
          return (
            <article key={machine.id}>
              <span className="panel-kicker">{machine.workshop || "Machine"}</span>
              <strong>{machine.name}</strong>
              <p>
                {live
                  ? <><b>Occupée</b> · {live.order} · jusqu’à {formatHour(live.endTime)}</>
                  : <><b>Libre</b> maintenant</>}
              </p>
              <small>{formatNextLabel(upcoming)}</small>
            </article>
          );
        })}
      </section>

      {error && !draft && <p className="form-error" role="alert">{error}</p>}

      <div className="plan-board-wrap">
        <table className="plan-board">
          <thead>
            <tr>
              <th>Machine</th>
              {days.map((day) => {
                const heading = formatDayHeading(day);
                return (
                  <th key={day} className={day === today ? "is-today" : ""}>
                    <span>{heading.name}</span>
                    <small>{heading.date}</small>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {machines.map((machine) => {
              const live = currentSlot(slots, machine, now);
              const upcoming = nextSlot(slots, machine, now);
              const blocked = machine.status === "Maintenance";
              return (
                <tr key={machine.id}>
                  <th>
                    <strong>{machine.name}</strong>
                    <em className={`status-badge status-${statusTone(live ? "En cours" : blocked ? "Maintenance" : "Libre")}`}>
                      <i />
                      {blocked ? "Maintenance" : live ? "Occupée" : "Libre"}
                    </em>
                    <small>{formatNextLabel(upcoming)}</small>
                  </th>
                  {days.map((day) => {
                    const placed = slotsForMachineDay(slots, machine, day);
                    const gaps = freeGaps(slots, day, machine);
                    return (
                      <td key={day} className={day === today ? "is-today" : ""}>
                        {placed.map((slot) => {
                          const status = slotLiveStatus(slot, now);
                          return (
                            <button
                              key={slot.id}
                              type="button"
                              className={`plan-slot is-${statusTone(status)}${slot.id === selectedId ? " is-active" : ""}`}
                              onClick={() => { setSelectedId(slot.id); setDraft(null); setError(""); }}
                            >
                              <strong>{slot.order}</strong>
                              <span>{formatTimeRange(slot.startTime, slot.endTime)}</span>
                            </button>
                          );
                        })}
                        {!placed.length && (
                          blocked ? (
                            <span className="plan-free is-blocked">Indisponible</span>
                          ) : (
                            <button type="button" className="plan-free" onClick={() => openDraft(machine, day)}>
                              Libre
                            </button>
                          )
                        )}
                        {placed.length > 0 && !blocked && gaps.map((gap) => (
                          <button
                            key={`${gap.startTime}-${gap.endTime}`}
                            type="button"
                            className="plan-gap"
                            onClick={() => openDraft(machine, day, undefined, gap.startTime)}
                          >
                            Libre {formatTimeRange(gap.startTime, gap.endTime)}
                          </button>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && !draft && (
        <aside className="plan-detail data-section">
          <div className="section-title">
            <div>
              <span className="panel-kicker">{selected.machine}</span>
              <h2>{selected.order}</h2>
            </div>
            <span className={`status-badge status-${statusTone(slotLiveStatus(selected, now))}`}>
              <i />{slotLiveStatus(selected, now)}
            </span>
          </div>
          <p>{orders.find((item) => item.id === selected.orderId)?.name || selected.name}</p>
          <dl className="ave-delta">
            <div><dt>Jour</dt><dd>{formatDayHeading(selected.day).name} {formatDayHeading(selected.day).date}</dd></div>
            <div><dt>Horaire</dt><dd>{formatTimeRange(selected.startTime, selected.endTime)}</dd></div>
            <div><dt>Ensuite</dt><dd>{selectedMachine ? (nextSlot(slots, selectedMachine, now)?.order || "—") : "—"}</dd></div>
          </dl>
          <div className="heading-actions conv-actions">
            <button type="button" className="button button-secondary" onClick={() => setSelectedId("")}>{te("Fermer")}</button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                if (selectedMachine && selectedMachine.status !== "Maintenance") openDraft(selectedMachine, selected.day, selected);
              }}
            >
              Déplacer
            </button>
            <button type="button" className="button button-secondary" disabled={pending} onClick={() => void removeSlot(selected.id)}>
              <Trash2 size={16} /> Retirer
            </button>
          </div>
        </aside>
      )}

      {draft && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDraft(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="plan-slot-title">
            <div className="modal-head">
              <div>
                <span className="panel-kicker">{te("Créneau")}</span>
                <h2 id="plan-slot-title">{draft.id ? te("Déplacer la commande") : te("Placer une commande")}</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setDraft(null)} aria-label={te("Fermer")}><X size={18} /></button>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="form-grid">
              <label className="field field-wide">
                <span>{te("Commande")}</span>
                <select value={draft.orderId} onChange={(event) => setDraft({ ...draft, orderId: event.target.value })}>
                  {openOrders.map((item) => (
                    <option key={item.id} value={item.id}>{item.reference} — {item.name}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{te("Début")}</span>
                <select value={draft.startTime} onChange={(event) => setDraft({ ...draft, startTime: event.target.value })}>
                  {hours.slice(0, -1).map((item) => <option key={item} value={item}>{formatHour(item)}</option>)}
                </select>
              </label>
              <label className="field">
                <span>{te("Fin")}</span>
                <select value={draft.endTime} onChange={(event) => setDraft({ ...draft, endTime: event.target.value })}>
                  {hours.slice(1).map((item) => <option key={item} value={item}>{formatHour(item)}</option>)}
                </select>
              </label>
            </div>
            <p className="settings-hint">
              {machines.find((item) => item.id === draft.machineId)?.name} · {formatDayHeading(draft.day).name} {formatDayHeading(draft.day).date}
            </p>
            <div className="heading-actions conv-actions">
              <button type="button" className="button button-secondary" onClick={() => setDraft(null)}>{te("Annuler")}</button>
              <button type="button" className="button button-primary" disabled={pending} onClick={() => void saveDraft()}>
                {pending ? <><LoaderCircle className="spin" size={16} /> {te("Enregistrement…")}</> : <><Plus size={16} /> {te("Enregistrer")}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
