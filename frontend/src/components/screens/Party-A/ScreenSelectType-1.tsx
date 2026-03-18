"use client";

import { setScreen, setAgreementType } from "@/store/slices/partyASlice";
import { AgreementType } from "@/api/parseApi";
import { AppDispatch, RootState } from "@/store";
import { useDispatch, useSelector } from "react-redux";

const TYPES: {
  type: AgreementType;
  title: string;
  icon: string;
  desc: string;
  examples: string[];
  payerLabel: string;
  receiverLabel: string;
  accentColor: string;
}[] = [
  {
    type: "freelance",
    title: "Freelance Work",
    icon: "✦",
    desc: "Client locks funds in escrow. Released to freelancer when work is delivered and confirmed.",
    examples: ["Logo design", "Web dev", "Writing", "Video editing"],
    payerLabel: "Client",
    receiverLabel: "Freelancer",
    accentColor: "var(--accent)",
  },
  {
    type: "rental",
    title: "Rental / Equipment",
    icon: "◈",
    desc: "Renter locks a deposit on-chain. Auto-release on return, or arbitrate damage claims.",
    examples: ["Camera gear", "Apartment", "Vehicle", "Office space"],
    payerLabel: "Renter",
    receiverLabel: "Owner",
    accentColor: "var(--blue)",
  },
  {
    type: "trade",
    title: "Trade & Commerce",
    icon: "⟐",
    desc: "Buyer locks payment. Released to seller on delivery confirmation. No trust required.",
    examples: ["Agriculture", "Equipment", "P2P market", "Exports"],
    payerLabel: "Buyer",
    receiverLabel: "Seller",
    accentColor: "var(--green)",
  },
  {
    type: "bet",
    title: "Simple Bet",
    icon: "⬡",
    desc: "Lock stakes on-chain. Winner takes all when the condition resolves via arbitrator.",
    examples: ["Sports outcome", "Price target", "Election", "Any event"],
    payerLabel: "Bettor A",
    receiverLabel: "Bettor B",
    accentColor: "var(--amber)",
  },
];

const FLOW_STEPS = [
  { label: "Select type", active: true },
  { label: "Describe deal" },
  { label: "Review terms" },
  { label: "Set arbitrator" },
  { label: "Share with counterparty" },
  { label: "Lock escrow funds" },
];

export default function ScreenSelectType() {
  const dispatch = useDispatch<AppDispatch>();
  const selected = useSelector((s: RootState) => s.partyA.agreementType);

  return (
    <div className="st-root">
      <style>{css}</style>

      {/* ── Topbar ── */}
      <nav className="st-nav">
        <div className="st-nav-left">
          <a href="/" className="st-brand">
            <div className="st-brand-mark">◈</div>
            <span className="st-brand-name">ClauseAI</span>
          </a>
          <div className="st-nav-sep" />
          <nav className="st-breadcrumb">
            <span className="st-bc-dim">New Agreement</span>
            <span className="st-bc-slash">/</span>
            <span className="st-bc-cur">Select Type</span>
          </nav>
        </div>
        <span className="st-step-badge">STEP 1 / 6</span>
      </nav>

      {/* ── Body ── */}
      <div className="st-body">
        {/* ── Sidebar ── */}
        <aside className="st-sidebar">
          <div className="st-sidebar-label">Your journey</div>

          {FLOW_STEPS.map((step, i) => (
            <div key={i} className="st-spine-row">
              <div className="st-spine-track">
                <div
                  className={`st-spine-dot${step.active ? " st-spine-dot--active" : ""}`}
                >
                  {i + 1}
                </div>
                {i < FLOW_STEPS.length - 1 && (
                  <div
                    className={`st-spine-line${step.active ? " st-spine-line--active" : ""}`}
                  />
                )}
              </div>
              <div
                className={`st-spine-label${step.active ? " st-spine-label--active" : ""}`}
                style={{ paddingBottom: i < FLOW_STEPS.length - 1 ? 24 : 0 }}
              >
                {step.label}
              </div>
            </div>
          ))}

          {/* Info box */}
          <div className="st-info-box">
            <div className="st-info-box-head">
              <div className="st-info-icon">
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <span className="st-info-title">How it works</span>
            </div>
            <p className="st-info-body">
              Payer locks sBTC. Receiver gets paid when conditions are
              confirmed. Arbitrator resolves disputes.
            </p>
          </div>
        </aside>

        {/* ── Main ── */}
        <div className="st-main">
          {/* Header */}
          <div className="fade-up st-header">
            <div className="st-eyebrow">Step 1 of 6</div>
            <h1 className="st-headline">
              What type of
              <br />
              <span className="st-headline-accent">agreement?</span>
            </h1>
            <p className="st-subhead">
              One party locks funds — the other receives them when conditions
              are met. Choose a template to begin.
            </p>
          </div>

          {/* Cards grid */}
          <div className="fade-up d2 st-grid">
            {TYPES.map((t) => {
              const isSelected = selected === t.type;
              return (
                <button
                  key={t.type}
                  className={`st-card${isSelected ? " st-card--selected" : ""}`}
                  style={
                    { "--card-accent": t.accentColor } as React.CSSProperties
                  }
                  onClick={() => {
                    dispatch(setAgreementType(t.type));
                    setTimeout(() => dispatch(setScreen("describe")), 160);
                  }}
                >
                  {/* Top row: icon + check */}
                  <div className="st-card-top">
                    <div
                      className="st-card-icon"
                      style={{
                        background: isSelected
                          ? t.accentColor + "18"
                          : "var(--bg-3)",
                        borderColor: isSelected
                          ? t.accentColor + "40"
                          : "var(--border)",
                        color: isSelected ? t.accentColor : "var(--text-3)",
                        boxShadow: isSelected
                          ? `0 0 16px ${t.accentColor}20`
                          : "none",
                      }}
                    >
                      {t.icon}
                    </div>

                    {isSelected ? (
                      <div className="st-check-filled">
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#0b0c0d"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    ) : (
                      <div className="st-check-empty" />
                    )}
                  </div>

                  {/* Title */}
                  <div className="st-card-title">{t.title}</div>

                  {/* Desc */}
                  <p className="st-card-desc">{t.desc}</p>

                  {/* Example tags */}
                  <div className="st-tags">
                    {t.examples.map((ex) => (
                      <span key={ex} className="st-tag">
                        {ex}
                      </span>
                    ))}
                  </div>

                  {/* Role chips */}
                  <div className="st-roles">
                    <span
                      className="st-role-payer"
                      style={{
                        color: isSelected ? t.accentColor : "var(--text-2)",
                        background: isSelected
                          ? t.accentColor + "12"
                          : "var(--bg-3)",
                        borderColor: isSelected
                          ? t.accentColor + "30"
                          : "var(--border-hi)",
                      }}
                    >
                      {t.payerLabel}
                    </span>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--text-4)"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                    <span className="st-role-receiver">{t.receiverLabel}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Info strip */}
          <div className="fade-up d3 st-strip">
            <div className="st-strip-icon">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--text-3)"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
            <div className="st-strip-body">
              <div className="st-strip-title">How conditional escrow works</div>
              <p className="st-strip-text">
                The <strong className="st-strong">payer</strong> locks funds
                into a Bitcoin-secured smart contract. The{" "}
                <strong className="st-strong">receiver</strong> gets paid when
                conditions are confirmed — or funds auto-refund after the
                deadline. The <strong className="st-strong">arbitrator</strong>{" "}
                resolves disputes if they arise.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const css = `
/* ── Root ───────────────────────────────────────────────────── */
.st-root {
  min-height: 100vh;
  background: var(--bg);
}

/* ── Topbar ─────────────────────────────────────────────────── */
.st-nav {
  position: sticky;
  top: 0;
  z-index: 100;
  height: 56px;
  background: rgba(11,12,13,0.94);
  backdrop-filter: blur(24px);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32px;
  gap: 12px;
}
.st-nav-left {
  display: flex;
  align-items: center;
  min-width: 0;
  overflow: hidden;
}
.st-brand {
  display: flex;
  align-items: center;
  gap: 9px;
  text-decoration: none;
  flex-shrink: 0;
}
.st-brand-mark {
  width: 30px; height: 30px;
  border-radius: 8px;
  background: var(--accent);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-display);
  font-weight: 800; font-size: 15px;
  color: #0b0c0d;
  flex-shrink: 0;
}
.st-brand-name {
  font-family: var(--font-display);
  font-size: 16px; font-weight: 800;
  color: var(--text-1);
  letter-spacing: -0.03em;
}
.st-nav-sep {
  width: 1px; height: 18px;
  background: var(--border);
  margin: 0 16px;
  flex-shrink: 0;
}
.st-breadcrumb {
  display: flex;
  align-items: center;
  font-size: 12px;
  font-family: var(--mono);
  gap: 0;
  overflow: hidden;
  white-space: nowrap;
}
.st-bc-dim { color: var(--text-4); overflow: hidden; text-overflow: ellipsis; }
.st-bc-slash { margin: 0 7px; color: var(--text-4); }
.st-bc-cur { color: var(--accent); font-weight: 500; flex-shrink: 0; }
.st-step-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  background: var(--bg-3);
  border: 1px solid var(--border);
  border-radius: 20px;
  font-size: 10px;
  font-family: var(--mono);
  color: var(--text-4);
  letter-spacing: 0.08em;
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── Body layout ────────────────────────────────────────────── */
.st-body {
  display: flex;
  max-width: 1040px;
  margin: 0 auto;
  gap: 52px;
  padding: 52px 24px 80px;
}

/* ── Sidebar ────────────────────────────────────────────────── */
.st-sidebar {
  width: 210px;
  flex-shrink: 0;
  padding-top: 4px;
}
.st-sidebar-label {
  font-size: 9px;
  font-family: var(--mono);
  color: var(--text-4);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-bottom: 22px;
}
.st-spine-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.st-spine-track {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}
.st-spine-dot {
  width: 22px; height: 22px;
  border-radius: 50%;
  flex-shrink: 0;
  background: transparent;
  border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  font-size: 9px;
  font-family: var(--mono);
  font-weight: 700;
  color: var(--text-4);
  transition: all 0.2s;
}
.st-spine-dot--active {
  background: var(--accent);
  border-color: var(--accent);
  color: #0b0c0d;
  box-shadow: 0 0 12px rgba(196,255,70,0.35);
}
.st-spine-line {
  width: 1px;
  height: 28px;
  background: var(--border);
  margin-top: 3px;
}
.st-spine-line--active { background: rgba(196,255,70,0.2); }
.st-spine-label {
  padding-top: 3px;
  font-size: 12px;
  font-weight: 400;
  color: var(--text-4);
  opacity: 0.5;
}
.st-spine-label--active {
  font-weight: 600;
  color: var(--text-1);
  opacity: 1;
}
.st-info-box {
  margin-top: 36px;
  padding: 14px 16px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 10px;
}
.st-info-box-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.st-info-icon {
  width: 22px; height: 22px;
  border-radius: 6px;
  background: var(--accent-dim);
  border: 1px solid rgba(196,255,70,0.2);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.st-info-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-1);
}
.st-info-body {
  font-size: 11px;
  color: var(--text-4);
  line-height: 1.65;
  margin: 0;
}

/* ── Main ───────────────────────────────────────────────────── */
.st-main { flex: 1; min-width: 0; }
.st-header { margin-bottom: 40px; }
.st-eyebrow {
  font-size: 10px;
  font-family: var(--mono);
  color: var(--accent);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-bottom: 14px;
}
.st-headline {
  font-family: var(--font-display);
  font-size: clamp(28px, 4vw, 46px);
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1.05;
  color: var(--text-1);
  margin-bottom: 12px;
}
.st-headline-accent { color: var(--accent); }
.st-subhead {
  font-size: 14px;
  color: var(--text-3);
  line-height: 1.7;
  max-width: 460px;
}

/* ── Cards grid ─────────────────────────────────────────────── */
.st-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 0;
}

/* ── Card ───────────────────────────────────────────────────── */
.st-card {
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 20px 18px;
  text-align: left;
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.16,1,0.3,1);
  position: relative;
  overflow: hidden;
  width: 100%;
}
.st-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at top left, var(--card-accent, var(--accent)) 0%, transparent 60%);
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}
.st-card:hover {
  background: var(--bg-2);
  border-color: var(--border-hi);
  transform: translateY(-1px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.25);
}
.st-card:hover::before { opacity: 0.04; }
.st-card--selected {
  background: var(--bg-2);
  border-color: var(--border-hi);
  box-shadow: 0 0 0 1px var(--border-hi);
}
.st-card--selected::before { opacity: 0.06; }

.st-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 16px;
}
.st-card-icon {
  width: 38px; height: 38px;
  border-radius: 10px;
  border: 1px solid;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px;
  transition: all 0.2s;
}
.st-check-filled {
  width: 20px; height: 20px;
  border-radius: 50%;
  background: var(--accent);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 0 10px rgba(196,255,70,0.4);
  flex-shrink: 0;
}
.st-check-empty {
  width: 20px; height: 20px;
  border-radius: 50%;
  border: 1px solid var(--border);
  flex-shrink: 0;
}
.st-card-title {
  font-size: 14px;
  font-weight: 700;
  font-family: var(--font-display);
  color: var(--text-1);
  margin-bottom: 7px;
  letter-spacing: -0.02em;
}
.st-card-desc {
  font-size: 11px;
  color: var(--text-3);
  line-height: 1.65;
  margin-bottom: 16px;
}
.st-tags {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.st-tag {
  font-size: 9px;
  font-family: var(--mono);
  color: var(--text-4);
  background: var(--bg-3);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px 7px;
  letter-spacing: 0.04em;
}
.st-roles {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  flex-wrap: wrap;
}
.st-role-payer {
  font-size: 10px;
  font-family: var(--mono);
  border: 1px solid;
  border-radius: 5px;
  padding: 2px 9px;
  letter-spacing: 0.04em;
  transition: all 0.2s;
}
.st-role-receiver {
  font-size: 10px;
  font-family: var(--mono);
  color: var(--text-4);
  background: var(--bg-3);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 2px 9px;
  letter-spacing: 0.04em;
}

/* ── Info strip ─────────────────────────────────────────────── */
.st-strip {
  margin-top: 24px;
  padding: 16px 18px;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: 10px;
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.st-strip-icon {
  width: 30px; height: 30px;
  flex-shrink: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-3);
}
.st-strip-body { flex: 1; min-width: 0; }
.st-strip-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-1);
  margin-bottom: 5px;
}
.st-strip-text {
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.65;
  margin: 0;
}
.st-strong {
  color: var(--text-2);
  font-weight: 500;
}

/* ═══════════════════════════════════════════════════════════════
   RESPONSIVE
   ═══════════════════════════════════════════════════════════════ */

/* ── 1024px ─────────────────────────────────────────────────── */
@media (max-width: 1024px) {
  .st-nav { padding: 0 24px; }
  .st-body { gap: 36px; padding: 40px 20px 72px; }
  .st-sidebar { width: 190px; }
}

/* ── 860px — hide sidebar, use full width ───────────────────── */
@media (max-width: 860px) {
  .st-sidebar { display: none; }
  .st-body { gap: 0; padding: 36px 20px 72px; }
  .st-headline { font-size: clamp(26px, 5vw, 40px); }
  .st-subhead { max-width: 100%; }
}

/* ── 768px — tablet ─────────────────────────────────────────── */
@media (max-width: 768px) {
  .st-nav { padding: 0 16px; }
  /* Hide the nav separator + breadcrumb, keep brand + step badge */
  .st-nav-sep { display: none; }
  .st-breadcrumb { display: none; }
  .st-body { padding: 28px 16px 64px; }
  .st-header { margin-bottom: 28px; }

  /* Cards: 2-col still fine on tablet but tighter */
  .st-grid { gap: 8px; }
  .st-card { padding: 16px 14px; }
  .st-card-icon { width: 34px; height: 34px; font-size: 16px; border-radius: 8px; }
  .st-card-title { font-size: 13px; }
  .st-card-desc { font-size: 10px; }
}

/* ── 580px — large phone ────────────────────────────────────── */
@media (max-width: 580px) {
  .st-nav { height: 50px; padding: 0 14px; }
  .st-brand-name { font-size: 14px; }
  .st-brand-mark { width: 26px; height: 26px; font-size: 13px; border-radius: 7px; }
  .st-step-badge { font-size: 9px; padding: 2px 8px; }

  .st-body { padding: 24px 14px 60px; }
  .st-headline { font-size: clamp(24px, 7vw, 34px); margin-bottom: 10px; }
  .st-eyebrow { font-size: 9px; margin-bottom: 10px; }
  .st-subhead { font-size: 13px; }
  .st-header { margin-bottom: 24px; }

  /* 1-col card grid on phones */
  .st-grid { grid-template-columns: 1fr; gap: 8px; }

  /* Cards horizontal layout on small phones for compactness */
  .st-card { padding: 14px 14px; border-radius: 12px; }
  .st-card-top { margin-bottom: 12px; }
  .st-card-icon { width: 32px; height: 32px; font-size: 15px; border-radius: 8px; }
  .st-check-filled, .st-check-empty { width: 18px; height: 18px; }
  .st-check-filled svg { width: 9px; height: 9px; }
  .st-card-title { font-size: 13px; margin-bottom: 6px; }
  .st-card-desc { font-size: 11px; margin-bottom: 12px; }
  .st-tags { gap: 4px; margin-bottom: 12px; }
  .st-tag { font-size: 8px; padding: 2px 6px; }
  .st-roles { gap: 5px; padding-top: 10px; }
  .st-role-payer, .st-role-receiver { font-size: 9px; padding: 2px 7px; }

  /* Info strip: stack icon above text */
  .st-strip { flex-direction: column; gap: 10px; padding: 14px; }
  .st-strip-icon { display: none; }
  .st-strip-title { font-size: 11px; }
  .st-strip-text { font-size: 11px; }
}

/* ── 400px — small phone ────────────────────────────────────── */
@media (max-width: 400px) {
  .st-nav { padding: 0 12px; }
  .st-brand-name { display: none; }
  .st-body { padding: 20px 12px 56px; }
  .st-headline { font-size: 26px; }

  /* Card: compress further */
  .st-card { padding: 12px 12px; }
  .st-card-icon { width: 30px; height: 30px; font-size: 14px; }
  .st-card-desc { display: none; } /* hide desc, keep title + tags + roles */
  .st-tags { display: none; } /* hide example tags too to save space */
  .st-roles { padding-top: 8px; }
}

/* ── Touch targets ──────────────────────────────────────────── */
@media (max-width: 768px) {
  .st-card { min-height: 44px; }
}

/* ── Safe area ──────────────────────────────────────────────── */
@supports (padding-bottom: env(safe-area-inset-bottom)) {
  .st-body {
    padding-bottom: max(80px, calc(env(safe-area-inset-bottom) + 24px));
  }
  .st-nav {
    padding-left: max(14px, env(safe-area-inset-left));
    padding-right: max(14px, env(safe-area-inset-right));
  }
}

/* ── Overflow guard ─────────────────────────────────────────── */
.st-main, .st-card, .st-headline, .st-strip {
  min-width: 0;
  max-width: 100%;
}
`;
