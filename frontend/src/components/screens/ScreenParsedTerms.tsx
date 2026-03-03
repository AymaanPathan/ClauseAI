"use client";
import { useState } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  setScreen,
  updateEditedTerms,
  approveTerms,
} from "../../store/slices/agreementSlice";

const FIELD_META: {
  key: string;
  label: string;
  icon: string;
  editable: boolean;
}[] = [
  { key: "partyA", label: "Party A", icon: "👤", editable: true },
  { key: "partyB", label: "Party B", icon: "👥", editable: true },
  { key: "amount_usd", label: "Amount (USD)", icon: "💵", editable: true },
  { key: "deadline", label: "Deadline", icon: "📅", editable: true },
  { key: "condition", label: "Release Condition", icon: "⚡", editable: true },
  { key: "arbitrator", label: "Arbitrator", icon: "⚖️", editable: true },
];

export default function ScreenParsedTerms() {
  const dispatch = useAppDispatch();
  const { editedTerms, parseMeta, parseError } = useAppSelector(
    (s) => s.agreement,
  );
  const [editing, setEditing] = useState<string | null>(null);

  if (parseError) {
    return (
      <div
        style={{
          minHeight: "calc(100vh - 56px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
          <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
            Parse Failed
          </h3>
          <p style={{ color: "var(--grey-1)", marginBottom: 24 }}>
            {parseError}
          </p>
          <button
            onClick={() => dispatch(setScreen("describe"))}
            style={{
              background: "var(--yellow)",
              color: "var(--black)",
              border: "none",
              borderRadius: 99,
              padding: "12px 28px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!editedTerms) return null;

  const confidence = editedTerms.confidence;
  const confColor =
    confidence === "high"
      ? "#22c55e"
      : confidence === "medium"
        ? "var(--yellow)"
        : "#ef4444";

  function handleEdit(key: string, value: string) {
    dispatch(updateEditedTerms({ [key]: value }));
  }

  return (
    <div
      style={{
        minHeight: "calc(100vh - 56px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "60px 24px",
      }}
    >
      <div style={{ maxWidth: 580, width: "100%" }}>
        {/* Header */}
        <div className="animate-fade-up" style={{ marginBottom: 32 }}>
          <button
            onClick={() => dispatch(setScreen("describe"))}
            style={{
              background: "none",
              border: "none",
              color: "var(--grey-1)",
              fontSize: 13,
              cursor: "pointer",
              marginBottom: 20,
            }}
          >
            ← Back
          </button>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                color: "var(--yellow)",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
              }}
            >
              Step 3 of 6
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: confColor,
                  display: "inline-block",
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: confColor,
                  textTransform: "uppercase",
                }}
              >
                {confidence} confidence
              </span>
            </div>
          </div>
          <h2
            style={{
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: "-1px",
              marginBottom: 8,
            }}
          >
            Review your terms
          </h2>
          <p style={{ color: "var(--grey-1)", fontSize: 14 }}>
            AI parsed your agreement. Click any field to edit before approving.
          </p>
        </div>

        {/* Fields */}
        <div
          className="animate-fade-up delay-1"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            marginBottom: 20,
          }}
        >
          {FIELD_META.map((field) => {
            const value =
              (editedTerms as unknown as Record<string, string>)[field.key] ??
              "";
            const isEmpty = !value || value === "TBD";
            const isEditing = editing === field.key;

            return (
              <div
                key={field.key}
                onClick={() => setEditing(field.key)}
                style={{
                  background: "var(--black-2)",
                  border: `1px solid ${isEditing ? "var(--yellow)" : isEmpty ? "#7f1d1d50" : "var(--black-4)"}`,
                  borderRadius: "var(--radius-sm)",
                  padding: "14px 16px",
                  cursor: "pointer",
                  transition: "all var(--transition)",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                }}
                onMouseEnter={(e) =>
                  !isEditing &&
                  ((e.currentTarget as HTMLElement).style.borderColor =
                    "var(--grey-3)")
                }
                onMouseLeave={(e) =>
                  !isEditing &&
                  ((e.currentTarget as HTMLElement).style.borderColor = isEmpty
                    ? "#7f1d1d50"
                    : "var(--black-4)")
                }
              >
                <span style={{ fontSize: 16, marginTop: 1 }}>{field.icon}</span>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      color: "var(--grey-1)",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      marginBottom: 4,
                    }}
                  >
                    {field.label}
                    {isEmpty && (
                      <span style={{ color: "#f87171", marginLeft: 8 }}>
                        ⚠ required
                      </span>
                    )}
                  </div>
                  {isEditing ? (
                    <input
                      autoFocus
                      value={value}
                      onChange={(e) => handleEdit(field.key, e.target.value)}
                      onBlur={() => setEditing(null)}
                      onKeyDown={(e) => e.key === "Enter" && setEditing(null)}
                      style={{
                        background: "transparent",
                        border: "none",
                        outline: "none",
                        color: "var(--white)",
                        fontSize: 14,
                        fontWeight: 600,
                        width: "100%",
                        fontFamily: "var(--font-display)",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: isEmpty ? "var(--grey-2)" : "var(--white)",
                      }}
                    >
                      {isEmpty ? "Click to add..." : value}
                    </div>
                  )}
                </div>
                {!isEditing && (
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--grey-2)",
                      marginTop: 2,
                    }}
                  >
                    ✏️
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Notes */}
        {editedTerms.notes && (
          <div
            className="animate-fade-up delay-2"
            style={{
              background: "var(--black-3)",
              border: "1px solid var(--black-4)",
              borderRadius: "var(--radius-sm)",
              padding: "12px 16px",
              marginBottom: 20,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                color: "var(--grey-1)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: 4,
              }}
            >
              🤖 AI Notes
            </div>
            <p
              style={{ fontSize: 13, color: "var(--grey-1)", lineHeight: 1.6 }}
            >
              {editedTerms.notes}
            </p>
          </div>
        )}

        {/* Meta */}
        {parseMeta && (
          <div
            className="animate-fade-up delay-2"
            style={{
              display: "flex",
              gap: 16,
              marginBottom: 28,
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "var(--grey-2)",
            }}
          >
            <span>⚡ {parseMeta.latency_ms}ms</span>
            <span>
              {parseMeta.provider} / {parseMeta.model}
            </span>
          </div>
        )}

        {/* Actions */}
        <div
          className="animate-fade-up delay-3"
          style={{ display: "flex", gap: 12 }}
        >
          <button
            onClick={() => dispatch(setScreen("describe"))}
            style={{
              flex: 1,
              padding: "14px",
              background: "transparent",
              color: "var(--white)",
              border: "1px solid var(--black-4)",
              borderRadius: "var(--radius)",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all var(--transition)",
            }}
          >
            Edit Input
          </button>
          <button
            onClick={() => {
              dispatch(approveTerms());
              dispatch(setScreen("connect-wallet"));
            }}
            style={{
              flex: 2,
              padding: "14px",
              background: "var(--yellow)",
              color: "var(--black)",
              border: "none",
              borderRadius: "var(--radius)",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
              transition: "all var(--transition)",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                "var(--yellow-hover)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                "var(--yellow)")
            }
          >
            Looks Good → Continue
          </button>
        </div>
      </div>
    </div>
  );
}
