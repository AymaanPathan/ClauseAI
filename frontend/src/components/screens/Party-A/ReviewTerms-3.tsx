"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  setScreen,
  updateEditedTerms,
  applyApprovalUpdate,
} from "@/store/slices/partyASlice";
import { isV2, ParsedAgreementV2 } from "@/api/parseApi";
import type { Milestone } from "@/api/parseApi";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "@/store";

/* ─── utils ───────────────────────────────────────── */
function confColor(c?: string) {
  if (c === "high")
    return {
      color: "var(--green)",
      bg: "var(--green-dim)",
      border: "rgba(74,222,128,0.25)",
    };
  if (c === "medium")
    return {
      color: "var(--amber)",
      bg: "var(--amber-dim)",
      border: "rgba(251,191,36,0.25)",
    };
  return {
    color: "var(--red)",
    bg: "var(--red-dim)",
    border: "rgba(248,113,113,0.25)",
  };
}
function parseISO(iso: string) {
  if (!iso) return { year: 0, month: 0, day: 0, hour: 0, minute: 0 };
  const d = new Date(iso);
  return {
    year: d.getFullYear(),
    month: d.getMonth(),
    day: d.getDate(),
    hour: d.getHours(),
    minute: d.getMinutes(),
  };
}
function toISO(y: number, mo: number, d: number, h: number, m: number) {
  return `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}
function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}
function firstDow(y: number, m: number) {
  return new Date(y, m, 1).getDay();
}

const FLOW_STEPS = [
  "Select type",
  "Describe deal",
  "Review terms",
  "Set arbitrator",
  "Share link",
  "Lock funds",
];
const FULL_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MS_COLORS = [
  "#c4ff46",
  "#60a5fa",
  "#4ade80",
  "#fbbf24",
  "#f472b6",
  "#a78bfa",
];

/* ─── ScrollDrum ──────────────────────────────────── */
function ScrollDrum({
  value,
  options,
  onChange,
  width = 48,
}: {
  value: number;
  options: number[];
  onChange: (v: number) => void;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const H = 32;
  useEffect(() => {
    if (!ref.current) return;
    ref.current.scrollTop = options.indexOf(value) * H;
  }, [value]);
  const onScroll = useCallback(() => {
    if (!ref.current) return;
    const i = Math.round(ref.current.scrollTop / H);
    const c = Math.max(0, Math.min(i, options.length - 1));
    if (options[c] !== value) onChange(options[c]);
  }, [options, value, onChange]);
  return (
    <div style={{ position: "relative", width, flexShrink: 0 }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 24,
          background: "linear-gradient(to bottom,var(--bg-glass),transparent)",
          pointerEvents: "none",
          zIndex: 2,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: 0,
          right: 0,
          height: H,
          transform: "translateY(-50%)",
          background: "rgba(196,255,70,0.06)",
          border: "1px solid rgba(196,255,70,0.15)",
          borderRadius: 6,
          pointerEvents: "none",
          zIndex: 1,
        }}
      />
      <div
        ref={ref}
        onScroll={onScroll}
        style={{
          height: H * 5,
          overflowY: "scroll",
          scrollSnapType: "y mandatory",
          scrollbarWidth: "none",
          padding: `${H * 2}px 0`,
        }}
      >
        {options.map((o) => (
          <div
            key={o}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onChange(o);
            }}
            style={{
              height: H,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              scrollSnapAlign: "center",
              fontFamily: "var(--mono)",
              fontSize: 12,
              fontWeight: o === value ? 700 : 400,
              color: o === value ? "var(--accent)" : "rgba(255,255,255,0.25)",
              cursor: "pointer",
              userSelect: "none",
              letterSpacing: o === value ? "0.06em" : "0",
              transition: "color 0.12s",
            }}
          >
            {String(o).padStart(2, "0")}
          </div>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 24,
          background: "linear-gradient(to top,var(--bg-glass),transparent)",
          pointerEvents: "none",
          zIndex: 2,
        }}
      />
    </div>
  );
}

/* ─── InlineDatePicker ────────────────────────────── */
// Expands BELOW the trigger row — no floating, no z-index chaos
function InlineDatePicker({
  value,
  onChange,
  hasError,
  color,
}: {
  value: string;
  onChange: (iso: string) => void;
  hasError: boolean;
  color: string;
}) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const p = value
    ? parseISO(value)
    : {
        year: today.getFullYear(),
        month: today.getMonth(),
        day: 0,
        hour: (today.getHours() + 1) % 24,
        minute: 0,
      };

  const [calY, setCalY] = useState(p.year || today.getFullYear());
  const [calM, setCalM] = useState(p.month ?? today.getMonth());
  const [tab, setTab] = useState<"cal" | "time">("cal");

  const selDate = value ? value.slice(0, 10) : "";
  const selH = p.hour,
    selMin = p.minute;
  const selY = p.year,
    selMo = p.month,
    selD = p.day;

  const fd = firstDow(calY, calM);
  const td = daysInMonth(calY, calM);

  function pickDay(day: number) {
    const iso = toISO(calY, calM, day, selH, selMin);
    onChange(iso);
    setTab("time"); // auto-advance to time
  }
  function setTime(h: number, m: number) {
    if (!value) return;
    onChange(toISO(selY, selMo, selD, h, m));
  }

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  const accentHex = hasError ? "#f87171" : color;

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        marginTop: 8,
        borderRadius: 12,
        overflow: "hidden",
        background: "var(--bg-glass)",
        border: `1px solid rgba(255,255,255,0.07)`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {(["cal", "time"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setTab(t);
            }}
            style={{
              flex: 1,
              height: 34,
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--mono)",
              fontSize: 9,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              fontWeight: tab === t ? 700 : 400,
              background:
                tab === t ? `rgba(${hexToRgb(accentHex)},0.08)` : "transparent",
              color: tab === t ? accentHex : "rgba(255,255,255,0.3)",
              borderBottom:
                tab === t
                  ? `1.5px solid ${accentHex}`
                  : "1.5px solid transparent",
              transition: "all 0.15s",
            }}
          >
            {t === "cal" ? "📅 Date" : "⏱ Time"}
          </button>
        ))}
      </div>

      {/* Calendar tab */}
      {tab === "cal" && (
        <div style={{ padding: "14px 16px 16px" }}>
          {/* Month nav */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <button
              type="button"
              className="dp-nav"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                calM === 0
                  ? (setCalM(11), setCalY((y) => y - 1))
                  : setCalM((m) => m - 1);
              }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 13,
                fontWeight: 700,
                color: "var(--text-1)",
                letterSpacing: "-0.02em",
              }}
            >
              {FULL_MONTHS[calM]} {calY}
            </span>
            <button
              type="button"
              className="dp-nav"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                calM === 11
                  ? (setCalM(0), setCalY((y) => y + 1))
                  : setCalM((m) => m + 1);
              }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
          {/* DOW headers */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7,1fr)",
              marginBottom: 4,
            }}
          >
            {DOW.map((d) => (
              <div
                key={d}
                style={{
                  textAlign: "center",
                  fontFamily: "var(--mono)",
                  fontSize: 9,
                  color: "rgba(255,255,255,0.2)",
                  letterSpacing: "0.06em",
                  padding: "2px 0",
                }}
              >
                {d}
              </div>
            ))}
          </div>
          {/* Days */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7,1fr)",
              gap: 2,
            }}
          >
            {Array.from({ length: fd }).map((_, i) => (
              <div key={`e${i}`} />
            ))}
            {Array.from({ length: td }, (_, i) => i + 1).map((day) => {
              const ds = `${calY}-${String(calM + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isSel = selDate === ds;
              const isToday = ds === todayStr;
              const isPast = ds < todayStr;
              return (
                <button
                  key={day}
                  type="button"
                  disabled={isPast}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    pickDay(day);
                  }}
                  style={{
                    aspectRatio: "1",
                    border: "none",
                    borderRadius: 7,
                    cursor: isPast ? "default" : "pointer",
                    background: isSel
                      ? accentHex
                      : isToday
                        ? `rgba(${hexToRgb(accentHex)},0.12)`
                        : "transparent",
                    color: isSel
                      ? "#0b0c0d"
                      : isPast
                        ? "rgba(255,255,255,0.15)"
                        : isToday
                          ? accentHex
                          : "rgba(255,255,255,0.7)",
                    fontFamily: "var(--mono)",
                    fontSize: 11,
                    fontWeight: isSel ? 800 : 400,
                    transition: "all 0.1s",
                    outline: "none",
                    boxShadow:
                      isToday && !isSel ? `0 0 0 1px ${accentHex}40` : "none",
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Time tab */}
      {tab === "time" && (
        <div style={{ padding: "14px 16px 16px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 0,
              background: "rgba(0,0,0,0.2)",
              borderRadius: 10,
              padding: "6px 16px",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <ScrollDrum
              value={selH}
              options={hours}
              onChange={(h) => setTime(h, selMin)}
              width={52}
            />
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 20,
                fontWeight: 800,
                color: "rgba(255,255,255,0.2)",
                padding: "0 6px",
                userSelect: "none",
              }}
            >
              :
            </div>
            <ScrollDrum
              value={selMin}
              options={minutes}
              onChange={(m) => setTime(selH, m)}
              width={52}
            />
            <div
              style={{
                marginLeft: "auto",
                paddingLeft: 16,
                fontFamily: "var(--mono)",
                fontSize: 18,
                fontWeight: 800,
                color: value ? accentHex : "rgba(255,255,255,0.15)",
                letterSpacing: "0.04em",
              }}
            >
              {value
                ? `${String(selH).padStart(2, "0")}:${String(selMin).padStart(2, "0")}`
                : "--:--"}
            </div>
          </div>
          {value && (
            <div
              style={{
                marginTop: 10,
                textAlign: "center",
                fontFamily: "var(--mono)",
                fontSize: 10,
                color: "rgba(255,255,255,0.35)",
                letterSpacing: "0.04em",
              }}
            >
              {new Date(value).toLocaleString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function hexToRgb(hex: string) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r
    ? `${parseInt(r[1], 16)},${parseInt(r[2], 16)},${parseInt(r[3], 16)}`
    : "196,255,70";
}

/* ─── MilestoneRow ────────────────────────────────── */
function MilestoneRow({
  ms,
  idx,
  amount,
  color,
  onEditTitle,
  onChangeDeadline,
  isEditingTitle,
}: {
  ms: Milestone;
  idx: number;
  amount: string;
  color: string;
  onEditTitle: (title: string) => void;
  onChangeDeadline: (iso: string) => void;
  isEditingTitle: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const msAmt = ((parseFloat(amount || "0") * ms.percentage) / 100).toFixed(0);
  const hasDate = !!ms.deadline_dt;

  // Format the set date nicely
  const dateLabel = hasDate
    ? new Date(ms.deadline_dt!).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;
  const timeLabel = hasDate
    ? new Date(ms.deadline_dt!).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div
      style={{
        borderRadius: 12,
        overflow: "visible",
        marginBottom: 6,
        background: pickerOpen ? "rgba(255,255,255,0.03)" : "transparent",
        border: `1px solid ${pickerOpen ? `rgba(${hexToRgb(color)},0.2)` : "rgba(255,255,255,0.06)"}`,
        transition: "all 0.2s",
      }}
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest("[data-picker]"))
          e.stopPropagation();
      }}
    >
      {/* Row header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px",
        }}
      >
        {/* Index badge */}
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `rgba(${hexToRgb(color)},0.1)`,
            border: `1px solid rgba(${hexToRgb(color)},0.2)`,
            fontFamily: "var(--mono)",
            fontSize: 10,
            fontWeight: 800,
            color,
          }}
        >
          {idx + 1}
        </div>

        {/* Title */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {isEditingTitle ? (
            <input
              className="ms-title-input"
              autoFocus
              value={ms.title}
              onChange={(e) => onEditTitle(e.target.value)}
              onBlur={() => {
                /* parent manages */
              }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(196,255,70,0.3)",
                borderRadius: 6,
                padding: "4px 8px",
                outline: "none",
                fontFamily: "var(--font)",
                fontSize: 12,
                color: "var(--text-1)",
                boxShadow: "0 0 0 2px rgba(196,255,70,0.1)",
              }}
            />
          ) : (
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-1)",
                letterSpacing: "-0.01em",
                display: "block",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {ms.title}
            </span>
          )}
        </div>

        {/* Amounts */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              color: "rgba(255,255,255,0.4)",
            }}
          >
            ${msAmt}
          </span>
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 9,
              fontWeight: 700,
              color,
              background: `rgba(${hexToRgb(color)},0.1)`,
              border: `1px solid rgba(${hexToRgb(color)},0.2)`,
              borderRadius: 4,
              padding: "2px 7px",
            }}
          >
            {ms.percentage}%
          </span>
        </div>
      </div>

      {/* Deadline row */}
      <div
        data-picker="true"
        style={{ padding: "0 14px 12px", paddingLeft: 48 }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Deadline trigger button */}
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setPickerOpen((o) => !o);
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "5px 10px",
            borderRadius: 7,
            border: "none",
            cursor: "pointer",
            background: hasDate
              ? `rgba(${hexToRgb(color)},0.08)`
              : "rgba(248,113,113,0.08)",
            transition: "all 0.15s",
            outline: "none",
          }}
        >
          {hasDate ? (
            <>
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke={color}
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
              </svg>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  color,
                  fontWeight: 600,
                }}
              >
                {dateLabel}
              </span>
              <span
                style={{
                  width: 1,
                  height: 10,
                  background: `rgba(${hexToRgb(color)},0.3)`,
                  display: "inline-block",
                }}
              />
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  color: `rgba(${hexToRgb(color)},0.7)`,
                }}
              >
                {timeLabel}
              </span>
              <svg
                width="8"
                height="8"
                viewBox="0 0 24 24"
                fill="none"
                stroke={color}
                strokeWidth="2.5"
                strokeLinecap="round"
                style={{
                  transform: pickerOpen ? "rotate(180deg)" : "none",
                  transition: "transform 0.2s",
                  opacity: 0.6,
                }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </>
          ) : (
            <>
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#f87171"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  color: "#f87171",
                }}
              >
                Set deadline
              </span>
              <svg
                width="8"
                height="8"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#f87171"
                strokeWidth="2.5"
                strokeLinecap="round"
                style={{
                  transform: pickerOpen ? "rotate(180deg)" : "none",
                  transition: "transform 0.2s",
                  opacity: 0.5,
                }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </>
          )}
        </button>

        {/* INLINE PICKER — expands below, no z-index issues */}
        {pickerOpen && (
          <div
            data-picker="true"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <InlineDatePicker
              value={ms.deadline_dt ?? ""}
              onChange={(iso) => {
                onChangeDeadline(iso);
              }}
              hasError={!ms.deadline_dt}
              color={color}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main component ──────────────────────────────── */
export default function ReviewTerms() {
  const dispatch = useDispatch<AppDispatch>();
  const { editedTerms, parseError } = useSelector((s: RootState) => s.partyA);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingMsIdx, setEditingMsIdx] = useState<number | null>(null);

  if (parseError) {
    return (
      <div
        className="rv-root"
        style={{
          alignItems: "center",
          justifyContent: "center",
          display: "flex",
        }}
      >
        <style>{css}</style>
        <div style={{ textAlign: "center", maxWidth: 380 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: "var(--red-dim)",
              border: "1px solid rgba(248,113,113,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--red)"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h3
            style={{
              fontSize: 22,
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              marginBottom: 10,
            }}
          >
            Parse Failed
          </h3>
          <p
            style={{
              color: "var(--text-3)",
              marginBottom: 28,
              fontSize: 13,
              lineHeight: 1.65,
            }}
          >
            {parseError}
          </p>
          <button
            className="btn btn-primary"
            onClick={() => dispatch(setScreen("describe"))}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }
  if (!editedTerms) return null;

  const terms = editedTerms as any;
  const hasV2 = isV2(editedTerms);
  const v2 = hasV2 ? (editedTerms as unknown as ParsedAgreementV2) : null;

  const payer = hasV2
    ? v2!.payer || "Payer"
    : (terms["partyA"] as string) || "Payer";
  const receiver = hasV2
    ? v2!.receiver || "Receiver"
    : (terms["partyB"] as string) || "Receiver";
  const amount = hasV2 ? v2!.total_usd : (terms["amount_usd"] as string) || "—";
  const confidence = (terms["confidence"] as string) ?? "medium";
  const conf = confColor(confidence);
  const milestones = hasV2 ? v2!.milestones : [];
  const totalPct = v2?.milestones.reduce((s, m) => s + m.percentage, 0) ?? 0;
  const pctOk = totalPct === 100;
  const allDeadlinesSet = milestones.every((m) => !!m.deadline_dt);

  function editField(key: string, val: string) {
    dispatch(updateEditedTerms({ [key]: val } as never));
  }
  function editMilestone(idx: number, patch: Partial<Milestone>) {
    if (!v2) return;
    const updated = v2.milestones.map((m, i) =>
      i === idx ? { ...m, ...patch } : m,
    );
    dispatch(updateEditedTerms({ milestones: updated } as never));
  }

  const CORE_FIELDS = [
    {
      key: hasV2 ? "payer" : "partyA",
      label: "Payer",
      hint: "Locks funds",
      dot: "var(--amber)",
    },
    {
      key: hasV2 ? "receiver" : "partyB",
      label: "Receiver",
      hint: "Gets paid",
      dot: "var(--green)",
    },
    {
      key: hasV2 ? "total_usd" : "amount_usd",
      label: "Amount (USD)",
      hint: "Total escrow",
      dot: "var(--accent)",
    },
  ];

  return (
    <div className="rv-root">
      <style>{css}</style>

      {/* ── TOPBAR ── */}
      <header className="rv-topbar">
        <div className="rv-brand">
          <div className="rv-brand-mark">◈</div>
          <span className="rv-brand-name">ClauseAI</span>
        </div>
        <div className="rv-steps">
          {FLOW_STEPS.map((s, i) => {
            const done = i < 2,
              active = i === 2;
            return (
              <div
                key={i}
                className={`rv-step${done ? " rv-step--done" : active ? " rv-step--active" : ""}`}
              >
                <div className="rv-step-dot">
                  {done ? (
                    <svg
                      width="7"
                      height="7"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <span className="rv-step-label">{s}</span>
                {i < FLOW_STEPS.length - 1 && <div className="rv-step-line" />}
              </div>
            );
          })}
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
            fontSize: 10,
            fontFamily: "var(--mono)",
            letterSpacing: "0.06em",
            color: conf.color,
            background: conf.bg,
            border: `1px solid ${conf.border}`,
            borderRadius: 20,
            padding: "3px 11px",
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: conf.color,
              display: "inline-block",
            }}
          />
          {confidence} confidence
        </div>
      </header>

      {/* ── MAIN ── */}
      <main className="rv-main">
        {/* LEFT */}
        <section className="rv-left">
          <button
            className="rv-back"
            onClick={() => dispatch(setScreen("describe"))}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Back
          </button>
          <div className="fade-up">
            <div className="rv-eyebrow">Step 3 of 6</div>
            <h1 className="rv-title">
              Review your
              <br />
              <em>terms</em>
            </h1>
            <p className="rv-subtitle">
              AI parsed your agreement. Click any field to edit before
              approving.
            </p>
          </div>

          {/* Flow viz */}
          <div className="rv-flow fade-up" style={{ animationDelay: "0.06s" }}>
            <div className="rv-flow-node">
              <div
                className="rv-flow-avatar"
                style={{
                  background: "rgba(251,191,36,0.12)",
                  border: "1px solid rgba(251,191,36,0.28)",
                  color: "var(--amber)",
                }}
              >
                {payer.slice(0, 2).toUpperCase()}
              </div>
              <div className="rv-flow-node-label">{payer}</div>
              <div className="rv-flow-node-sub">Payer</div>
            </div>
            <div className="rv-flow-conn">
              <div className="rv-flow-conn-line rv-flow-conn-line--amber" />
              <div className="rv-flow-conn-tag">LOCKS</div>
            </div>
            <div className="rv-flow-node rv-flow-node--center">
              <div className="rv-flow-avatar rv-flow-avatar--accent">◈</div>
              <div className="rv-flow-node-label rv-flow-node-label--accent">
                ${amount}
              </div>
              <div className="rv-flow-node-sub">
                {milestones.length > 1
                  ? `${milestones.length} milestones`
                  : "Escrow"}
              </div>
            </div>
            <div className="rv-flow-conn">
              <div className="rv-flow-conn-line rv-flow-conn-line--green" />
              <div className="rv-flow-conn-tag">RELEASES</div>
            </div>
            <div className="rv-flow-node">
              <div
                className="rv-flow-avatar"
                style={{
                  background: "rgba(74,222,128,0.12)",
                  border: "1px solid rgba(74,222,128,0.28)",
                  color: "var(--green)",
                }}
              >
                {receiver.slice(0, 2).toUpperCase()}
              </div>
              <div className="rv-flow-node-label">{receiver}</div>
              <div className="rv-flow-node-sub">Receiver</div>
            </div>
          </div>

          {/* Core fields */}
          <div className="rv-fields fade-up" style={{ animationDelay: "0.1s" }}>
            {CORE_FIELDS.map(({ key, label, hint, dot }) => {
              const val = String(terms[key] ?? "—");
              const isEditing = editingField === key;
              return (
                <div
                  key={key}
                  className={`rv-field${isEditing ? " rv-field--editing" : ""}`}
                  onClick={() => !isEditing && setEditingField(key)}
                >
                  <div className="rv-field-left">
                    <div className="rv-field-dot" style={{ background: dot }} />
                    <div>
                      <div className="rv-field-label">{label}</div>
                      <div className="rv-field-hint">{hint}</div>
                    </div>
                  </div>
                  <div className="rv-field-right">
                    {isEditing ? (
                      <input
                        autoFocus
                        className="rv-inline-input"
                        value={val === "—" ? "" : val}
                        onChange={(e) => editField(key, e.target.value)}
                        onBlur={() => setEditingField(null)}
                        onClick={(e) => e.stopPropagation()}
                        placeholder={`Edit ${label.toLowerCase()}…`}
                      />
                    ) : (
                      <>
                        <span
                          className={`rv-field-val${val === "—" ? " rv-field-val--empty" : ""}`}
                        >
                          {val}
                        </span>
                        <div className="rv-edit-icon">
                          <svg
                            width="9"
                            height="9"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          >
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                          </svg>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* RIGHT */}
        <section className="rv-right">
          {milestones.length > 0 && (
            <div
              className="rv-ms-section fade-up"
              style={{ animationDelay: "0.08s" }}
            >
              {/* Section header */}
              <div className="rv-section-head">
                <div className="rv-section-title">
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--text-4)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 8 12 12 14 14" />
                  </svg>
                  Payment milestones
                </div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 9,
                    fontFamily: "var(--mono)",
                    color: pctOk ? "var(--green)" : "var(--amber)",
                    background: pctOk ? "var(--green-dim)" : "var(--amber-dim)",
                    border: `1px solid ${pctOk ? "rgba(74,222,128,0.25)" : "rgba(251,191,36,0.25)"}`,
                    borderRadius: 20,
                    padding: "2px 8px",
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: pctOk ? "var(--green)" : "var(--amber)",
                      display: "inline-block",
                    }}
                  />
                  {totalPct}% {!pctOk && "— needs 100%"}
                </div>
              </div>

              {/* Progress bar */}
              <div
                style={{
                  height: 4,
                  borderRadius: 4,
                  overflow: "hidden",
                  background: "rgba(255,255,255,0.06)",
                  marginBottom: 4,
                  display: "flex",
                }}
              >
                {milestones.map((ms, i) => (
                  <div
                    key={i}
                    style={{
                      width: `${ms.percentage}%`,
                      background: MS_COLORS[i % MS_COLORS.length],
                      transition: "width 0.4s ease",
                    }}
                    title={`${ms.title}: ${ms.percentage}%`}
                  />
                ))}
              </div>
              <div style={{ display: "flex", marginBottom: 14 }}>
                {milestones.map((ms, i) => (
                  <div
                    key={i}
                    style={{
                      width: `${ms.percentage}%`,
                      minWidth: 0,
                      display: "flex",
                      justifyContent: "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        fontFamily: "var(--mono)",
                        color: MS_COLORS[i % MS_COLORS.length],
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: "90%",
                      }}
                    >
                      {ms.percentage}%
                    </span>
                  </div>
                ))}
              </div>

              {/* Milestone rows — scrollable, inline picker expands each one */}
              <div className="rv-ms-list">
                {milestones.map((ms, i) => (
                  <div
                    key={i}
                    onClick={() => {
                      if (editingMsIdx !== i) setEditingMsIdx(i);
                    }}
                  >
                    <MilestoneRow
                      ms={ms}
                      idx={i}
                      amount={String(amount)}
                      color={MS_COLORS[i % MS_COLORS.length]}
                      isEditingTitle={editingMsIdx === i}
                      onEditTitle={(t) => editMilestone(i, { title: t })}
                      onChangeDeadline={(iso) =>
                        editMilestone(i, { deadline_dt: iso })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {terms["condition"] && (
            <div
              className="rv-condition fade-up"
              style={{ animationDelay: "0.12s" }}
            >
              <div className="rv-section-head" style={{ marginBottom: 10 }}>
                <div className="rv-section-title">
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--text-4)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    <polyline points="22 11.08 22 12 12 22 2 12 2.5 6.5" />
                    <polyline points="16 6 12 2 8 6" />
                    <line x1="12" y1="2" x2="12" y2="15" />
                  </svg>
                  Release condition
                </div>
              </div>
              <p className="rv-condition-text">{String(terms["condition"])}</p>
            </div>
          )}

          <div style={{ flex: 1 }} />

          <div
            className="rv-arb-notice fade-up"
            style={{ animationDelay: "0.14s" }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                flexShrink: 0,
                background: "var(--bg-3)",
                border: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--text-3)"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <p
              style={{
                fontSize: 11,
                fontFamily: "var(--mono)",
                color: "var(--text-3)",
                margin: 0,
                lineHeight: 1.55,
              }}
            >
              You'll choose an{" "}
              <strong style={{ color: "var(--text-2)", fontWeight: 600 }}>
                arbitrator
              </strong>{" "}
              on the next step. Both parties must approve before funds are
              locked.
            </p>
          </div>

          <div className="rv-cta fade-up" style={{ animationDelay: "0.18s" }}>
            {hasV2 && !pctOk && (
              <div
                style={{
                  padding: "9px 14px",
                  borderRadius: 8,
                  marginBottom: 10,
                  background: "var(--amber-dim)",
                  border: "1px solid rgba(251,191,36,0.25)",
                  fontSize: 11,
                  fontFamily: "var(--mono)",
                  color: "var(--amber)",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                }}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Milestone percentages must total 100% — currently {totalPct}%
              </div>
            )}
            {hasV2 && !allDeadlinesSet && (
              <div
                style={{
                  padding: "9px 14px",
                  borderRadius: 8,
                  marginBottom: 6,
                  background: "var(--red-dim)",
                  border: "1px solid rgba(248,113,113,0.25)",
                  fontSize: 11,
                  fontFamily: "var(--mono)",
                  color: "var(--red)",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                }}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {milestones.filter((m) => !m.deadline_dt).length} milestone(s)
                missing a deadline
              </div>
            )}
            <button
              className={`rv-approve-btn${!(hasV2 && !pctOk) ? " rv-approve-btn--active" : ""}`}
              onClick={() => {
                dispatch(
                  applyApprovalUpdate({
                    partyAApproved: true,
                    partyBApproved: false,
                  }),
                );
                dispatch(setScreen("set-arbitrator"));
              }}
              disabled={hasV2 && !pctOk}
            >
              <span className="rv-btn-shimmer" />
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Approve Terms & Continue
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
            <button
              className="rv-ghost-btn"
              onClick={() => dispatch(setScreen("describe"))}
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              Edit description
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

/* ═══ CSS ═══════════════════════════════════════════ */
const css = `
:root {
  --bg-glass: rgba(14,15,17,0.95);
}
.rv-root { display:flex;flex-direction:column;height:100vh;overflow:hidden;background:var(--bg);color:var(--text-1); }

/* Topbar */
.rv-topbar { height:52px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;padding:0 28px;gap:24px;background:rgba(11,12,13,0.96);backdrop-filter:blur(24px);border-bottom:1px solid var(--border);z-index:100; }
.rv-brand { display:flex;align-items:center;gap:9px;flex-shrink:0; }
.rv-brand-mark { width:28px;height:28px;border-radius:7px;background:var(--accent);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:14px;font-weight:800;color:#0b0c0d; }
.rv-brand-name { font-family:var(--font-display);font-size:15px;font-weight:800;color:var(--text-1);letter-spacing:-0.03em; }
.rv-steps { display:flex;align-items:center;flex:1;justify-content:center; }
.rv-step { display:flex;align-items:center;gap:6px;opacity:0.25; }
.rv-step--done { opacity:0.5; } .rv-step--active { opacity:1; }
.rv-step-dot { width:18px;height:18px;border-radius:50%;border:1px solid var(--border);background:transparent;display:flex;align-items:center;justify-content:center;font-size:8px;font-family:var(--mono);font-weight:700;color:var(--text-4);flex-shrink:0; }
.rv-step--done .rv-step-dot,.rv-step--active .rv-step-dot { background:var(--accent);border-color:var(--accent);color:#0b0c0d; }
.rv-step--active .rv-step-dot { box-shadow:0 0 10px rgba(196,255,70,0.4); }
.rv-step-label { font-size:10px;font-family:var(--mono);color:var(--text-4);white-space:nowrap; }
.rv-step--active .rv-step-label { color:var(--text-1);font-weight:600; } .rv-step--done .rv-step-label { color:var(--text-3); }
.rv-step-line { width:20px;height:1px;background:var(--border);margin:0 2px;flex-shrink:0; }

/* Layout */
.rv-main { flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr; }
.rv-left { padding:30px 44px 30px 48px;display:flex;flex-direction:column;gap:20px;border-right:1px solid var(--border);overflow:hidden; }
.rv-right { padding:24px 32px;display:flex;flex-direction:column;gap:14px;overflow-y:auto;overflow-x:hidden; }

/* Left panel */
.rv-back { display:inline-flex;align-items:center;gap:6px;background:none;border:none;padding:0;cursor:pointer;font-size:11px;font-family:var(--mono);color:var(--text-4);letter-spacing:0.04em;transition:color 0.15s;align-self:flex-start; }
.rv-back:hover { color:var(--text-2); }
.rv-eyebrow { font-size:9px;font-family:var(--mono);color:var(--accent);text-transform:uppercase;letter-spacing:0.14em;margin-bottom:8px; }
.rv-title { font-family:var(--font-display);font-size:clamp(26px,2.8vw,40px);font-weight:800;letter-spacing:-0.05em;line-height:1.0;color:var(--text-1);margin-bottom:8px; }
.rv-title em { font-style:normal;color:var(--accent); }
.rv-subtitle { font-size:13px;color:var(--text-3);line-height:1.65;max-width:320px; }
.rv-flow { display:flex;align-items:center;padding:16px 20px;background:var(--bg-1);border:1px solid var(--border);border-radius:14px;gap:0; }
.rv-flow-node { display:flex;flex-direction:column;align-items:center;gap:5px;flex-shrink:0; }
.rv-flow-node--center { flex:1; }
.rv-flow-avatar { width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:12px;font-family:var(--mono);font-weight:800;letter-spacing:0.02em; }
.rv-flow-avatar--accent { background:var(--accent-dim);border:1px solid rgba(196,255,70,0.3);color:var(--accent);font-size:18px;font-family:var(--font-display); }
.rv-flow-node-label { font-size:12px;font-weight:700;color:var(--text-1);letter-spacing:-0.02em;text-align:center; }
.rv-flow-node-label--accent { color:var(--accent);font-size:14px; }
.rv-flow-node-sub { font-size:9px;font-family:var(--mono);color:var(--text-4);text-align:center; }
.rv-flow-conn { flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:0 8px; }
.rv-flow-conn-line { height:1px;width:100%;position:relative; }
.rv-flow-conn-line::after { content:'▶';position:absolute;right:-4px;top:-5px;font-size:8px;color:var(--border-hi); }
.rv-flow-conn-line--amber::after { color:rgba(251,191,36,0.5); } .rv-flow-conn-line--green::after { color:rgba(74,222,128,0.5); }
.rv-flow-conn-tag { font-size:8px;font-family:var(--mono);color:var(--text-4);letter-spacing:0.1em; }
.rv-fields { display:flex;flex-direction:column;gap:1px;background:var(--border);border:1px solid var(--border);border-radius:12px;overflow:hidden;flex:1;min-height:0;overflow-y:auto; }
.rv-field { display:flex;align-items:center;justify-content:space-between;padding:13px 18px;background:var(--bg-1);cursor:pointer;transition:background 0.15s;gap:12px; }
.rv-field:hover { background:var(--bg-2); } .rv-field--editing { background:var(--bg-3); }
.rv-field-left { display:flex;align-items:center;gap:10px; }
.rv-field-dot { width:7px;height:7px;border-radius:50%;flex-shrink:0; }
.rv-field-label { font-size:13px;font-weight:600;color:var(--text-1);letter-spacing:-0.01em; }
.rv-field-hint { font-size:10px;font-family:var(--mono);color:var(--text-4);margin-top:1px; }
.rv-field-right { display:flex;align-items:center;gap:8px;flex-shrink:0; }
.rv-field-val { font-size:13px;font-weight:500;color:var(--text-1);font-family:var(--mono);letter-spacing:-0.01em; }
.rv-field-val--empty { color:var(--text-4); }
.rv-inline-input { background:var(--bg-4);border:1px solid var(--border-focus);border-radius:6px;padding:5px 10px;outline:none;font-family:var(--mono);font-size:12px;color:var(--text-1);width:160px;box-shadow:0 0 0 2px var(--accent-dim); }
.rv-edit-icon { width:22px;height:22px;border-radius:5px;background:var(--bg-3);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--text-4);flex-shrink:0;transition:all 0.15s; }
.rv-field:hover .rv-edit-icon { background:var(--bg-4);border-color:var(--border-hi);color:var(--text-2); }

/* Right panel */
.rv-section-head { display:flex;align-items:center;justify-content:space-between;margin-bottom:12px; }
.rv-section-title { display:flex;align-items:center;gap:6px;font-size:10px;font-family:var(--mono);color:var(--text-4);text-transform:uppercase;letter-spacing:0.1em; }
.rv-ms-section { display:flex;flex-direction:column; }
/* Milestone list — scrolls independently within right panel */
.rv-ms-list { display:flex;flex-direction:column;gap:0; }
.rv-condition { padding:13px 16px;background:var(--bg-1);border:1px solid var(--border);border-radius:10px; }
.rv-condition-text { font-size:12px;color:var(--text-2);line-height:1.7;margin:0; }
.rv-arb-notice { display:flex;gap:12px;align-items:flex-start;padding:12px 15px;background:var(--bg-2);border:1px solid var(--border);border-radius:10px; }
.rv-cta { display:flex;flex-direction:column;gap:8px;flex-shrink:0;padding-bottom:4px; }
.rv-approve-btn { position:relative;overflow:hidden;width:100%;height:50px;background:var(--bg-3);border:1px solid var(--border);border-radius:12px;cursor:not-allowed;display:flex;align-items:center;justify-content:center;gap:9px;font-family:var(--font-display);font-size:15px;font-weight:800;color:var(--text-4);letter-spacing:-0.02em;transition:all 0.2s cubic-bezier(0.16,1,0.3,1); }
.rv-approve-btn--active { background:var(--accent);border-color:var(--accent);color:#0b0c0d;cursor:pointer;box-shadow:0 4px 24px rgba(196,255,70,0.22); }
.rv-approve-btn--active:hover { background:#d4ff60;border-color:#d4ff60;box-shadow:0 8px 40px rgba(196,255,70,0.35);transform:translateY(-1px); }
.rv-approve-btn--active:active { transform:translateY(0); }
.rv-btn-shimmer { position:absolute;top:0;left:-100%;width:55%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent);transition:left 0.55s ease;pointer-events:none; }
.rv-approve-btn--active:hover .rv-btn-shimmer { left:160%; }
.rv-ghost-btn { width:100%;height:40px;background:transparent;border:1px solid var(--border);border-radius:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;font-family:var(--font);font-size:13px;font-weight:500;color:var(--text-3);letter-spacing:-0.01em;transition:all 0.15s; }
.rv-ghost-btn:hover { background:var(--bg-2);border-color:var(--border-hi);color:var(--text-1); }

/* DatePicker nav button */
.dp-nav { width:26px;height:26px;border-radius:6px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.4);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.12s; }
.dp-nav:hover { background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.14);color:rgba(255,255,255,0.8); }

@keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
.fade-up { animation:fadeUp 0.4s ease both; }

@media (max-width:820px) {
  .rv-root{height:auto;overflow:auto;} .rv-main{grid-template-columns:1fr;}
  .rv-left{border-right:none;border-bottom:1px solid var(--border);padding:28px 24px;gap:16px;}
  .rv-right{padding:24px;} .rv-steps{display:none;}
}
`;
