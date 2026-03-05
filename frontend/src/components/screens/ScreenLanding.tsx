"use client";
import { useAppDispatch } from "@/store/hooks";
import { setScreen } from "../../store/slices/agreementSlice";

// ─── SVG Icon primitives ───────────────────────────────────────────
const IconArrow = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);
const IconEdit = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);
const IconCpu = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="9" y="9" width="6" height="6" />
    <line x1="9" y1="1" x2="9" y2="4" />
    <line x1="15" y1="1" x2="15" y2="4" />
    <line x1="9" y1="20" x2="9" y2="23" />
    <line x1="15" y1="20" x2="15" y2="23" />
    <line x1="20" y1="9" x2="23" y2="9" />
    <line x1="20" y1="14" x2="23" y2="14" />
    <line x1="1" y1="9" x2="4" y2="9" />
    <line x1="1" y1="14" x2="4" y2="14" />
  </svg>
);
const IconLock = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const IconShield = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);
const IconCheck = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const IconTarget = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);
const IconHome = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);
const IconLayers = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);
const IconGlobe = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);
const IconUsers = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const IconClock = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);
const IconActivity = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);

// ─── Data ─────────────────────────────────────────────────────────
const STEPS = [
  {
    num: "01",
    Icon: IconTarget,
    title: "Select type",
    desc: "Choose from Freelance Work, Rental Deposit, or Simple Bet — three high-confidence templates.",
  },
  {
    num: "02",
    Icon: IconEdit,
    title: "Describe it",
    desc: "Write your agreement in plain English. No legal jargon, no templates to fill out.",
  },
  {
    num: "03",
    Icon: IconCpu,
    title: "AI parses terms",
    desc: "Claude compiles intent into structured contract terms, shown transparently before approval.",
  },
  {
    num: "04",
    Icon: IconLock,
    title: "Lock sBTC",
    desc: "Both parties review, approve, and lock sBTC into the deployed Clarity contract.",
  },
  {
    num: "05",
    Icon: IconShield,
    title: "Bitcoin enforces",
    desc: "Release on completion, refund on timeout, or dispute via pre-agreed on-chain arbitrator.",
  },
];

const USE_CASES = [
  {
    Icon: IconLayers,
    title: "Freelance Work",
    desc: "Client locks payment upfront. Freelancer delivers. Funds release automatically on completion.",
    tag: "Contract",
  },
  {
    Icon: IconHome,
    title: "Rental Deposit",
    desc: "Deposit locked in escrow. Refunded on safe return, or arbitrated if there's damage.",
    tag: "Escrow",
  },
  {
    Icon: IconCheck,
    title: "Agricultural Trade",
    desc: "Farmer delivers crops, buyer's payment auto-releases on confirmation. No delayed settlements.",
    tag: "P2P Trade",
  },
  {
    Icon: IconGlobe,
    title: "Cross-border Deals",
    desc: "No bank accounts. No wire fees. No jurisdiction problems. Bitcoin works everywhere.",
    tag: "Global",
  },
];

const TECH = [
  {
    layer: "Contracts",
    name: "Clarity · Stacks",
    purpose: "Core escrow + dispute state machine logic",
  },
  {
    layer: "Settlement",
    name: "sBTC",
    purpose: "Trustless BTC-backed collateral, 1:1 with Bitcoin",
  },
  {
    layer: "AI Parser",
    name: "Claude API",
    purpose: "NL → structured contract terms compilation",
  },
  {
    layer: "Frontend",
    name: "Next.js · Tailwind",
    purpose: "Select → describe → approve → deploy flow",
  },
  {
    layer: "Wallet",
    name: "Hiro · stacks.js",
    purpose: "User authentication + contract interaction + signing",
  },
  {
    layer: "Storage",
    name: "IPFS",
    purpose: "Condition hash + immutable agreement record",
  },
  {
    layer: "Backend",
    name: "Node.js · Express",
    purpose: "Parser middleware + contract deployment",
  },
];

const DISPUTE_POINTS = [
  {
    Icon: IconUsers,
    title: "Pre-agreed arbitrator",
    desc: "Both parties select an arbitrator before funds are locked. Stored as an on-chain principal.",
  },
  {
    Icon: IconShield,
    title: "Locked dispute state",
    desc: "Either party calls dispute(), entering a locked state where only the arbitrator can resolve.",
  },
  {
    Icon: IconClock,
    title: "48-hour fallback",
    desc: "If the arbitrator is inactive for 48 hours, a fallback auto-resolution triggers. No deadlocks.",
  },
  {
    Icon: IconActivity,
    title: "Fully transparent",
    desc: "Every state transition is on-chain and publicly auditable. No hidden logic, no black boxes.",
  },
];

const MARQUEE_ITEMS = [
  "Bitcoin-secured",
  "Clarity contracts",
  "sBTC collateral",
  "Stacks blockchain",
  "On-chain arbitration",
  "No intermediaries",
  "Auto-enforcement",
  "IPFS condition hash",
  "72h timeout",
];

// ─── Shared sub-components ─────────────────────────────────────────
function StepIcon({ Icon }: { Icon: React.FC<{ size?: number }> }) {
  return (
    <div
      style={{
        width: 36,
        height: 36,
        border: "1px solid var(--border)",
        borderRadius: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--s3)",
        color: "var(--w45)",
        marginBottom: 16,
      }}
    >
      <Icon size={15} />
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────
export default function ScreenLanding() {
  const dispatch = useAppDispatch();

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--black)",
        overflowX: "hidden",
      }}
    >
      {/* ══════════════════ HERO ══════════════════ */}
      <section
        style={{
          paddingTop: 160,
          paddingBottom: 120,
          position: "relative",
          overflow: "hidden",
          textAlign: "center",
        }}
      >
        {/* Stripe texture */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 0,
            pointerEvents: "none",
            backgroundImage:
              "repeating-linear-gradient(90deg,transparent,transparent 79px,rgba(242,242,240,0.025) 79px,rgba(242,242,240,0.025) 80px)",
          }}
        />
        {/* Bottom glow */}
        <div
          style={{
            position: "absolute",
            bottom: -80,
            left: "50%",
            transform: "translateX(-50%)",
            width: 800,
            height: 400,
            borderRadius: "50%",
            pointerEvents: "none",
            zIndex: 0,
            background:
              "radial-gradient(ellipse, rgba(242,242,240,0.055) 0%, transparent 70%)",
          }}
        />
        {/* Top edge line */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: 560,
            height: 1,
            background:
              "linear-gradient(90deg,transparent,rgba(242,242,240,0.18),transparent)",
          }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 2,
            maxWidth: 1100,
            margin: "0 auto",
            padding: "0 32px",
          }}
        >
          {/* Headline */}
          <h1
            className="display animate-fade-up delay-1"
            style={{
              fontSize: "clamp(48px, 8vw, 96px)",
              maxWidth: 880,
              margin: "0 auto 28px",
              color: "var(--w100)",
            }}
          >
            Agreements enforced{" "}
            <em style={{ fontStyle: "italic", color: "var(--w45)" }}>
              by Bitcoin itself.
            </em>
          </h1>

          {/* Sub */}
          <p
            className="animate-fade-up delay-2"
            style={{
              fontSize: 17,
              color: "var(--w45)",
              maxWidth: 500,
              margin: "0 auto 20px",
              lineHeight: 1.72,
              fontWeight: 400,
            }}
          >
            Turn plain English into auditable Clarity contracts in under 60
            seconds. No lawyers. No banks. No trust required.
          </p>

          {/* Flow strip */}
          <div
            className="animate-fade-up delay-2"
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: 48,
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                background: "var(--s2)",
                border: "1px solid var(--border)",
                borderRadius: 99,
                overflow: "hidden",
              }}
            >
              {[
                { Icon: IconEdit, label: "Describe" },
                { Icon: IconCpu, label: "AI parses" },
                { Icon: IconLock, label: "Lock sBTC" },
                { Icon: IconShield, label: "Bitcoin enforces" },
              ].map(({ Icon, label }, i) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "10px 18px",
                    borderRight: i < 3 ? "1px solid var(--border)" : "none",
                    fontSize: 12,
                    fontFamily: "var(--font-mono)",
                    color: i === 0 ? "var(--w70)" : "var(--w45)",
                  }}
                >
                  <span style={{ opacity: i === 0 ? 0.9 : 0.5 }}>
                    <Icon size={11} />
                  </span>
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* CTAs */}
          <div
            className="animate-fade-up delay-3"
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "center",
              flexWrap: "wrap",
              marginBottom: 88,
            }}
          >
            <button
              className="btn-primary"
              onClick={() => dispatch(setScreen("select-type"))}
            >
              Create an Escrow <IconArrow />
            </button>
            <button className="btn-secondary">See how it works</button>
          </div>

          {/* Stats */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              borderTop: "1px solid var(--border)",
              maxWidth: 580,
              margin: "0 auto",
            }}
            className="animate-fade-up delay-4"
          >
            {[
              { value: "1.4B", label: "Unbanked people" },
              { value: "60s", label: "To deploy escrow" },
              { value: "0", label: "Lawyers needed" },
            ].map((s, i) => (
              <div
                key={s.label}
                style={{
                  flex: 1,
                  textAlign: "center",
                  paddingTop: 36,
                  borderRight: i < 2 ? "1px solid var(--border)" : "none",
                }}
              >
                <div
                  className="display"
                  style={{
                    fontSize: 44,
                    color: "var(--w100)",
                    marginBottom: 8,
                    letterSpacing: -1.5,
                  }}
                >
                  {s.value}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    color: "var(--w25)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════ MARQUEE ══════════════════ */}
      <div className="marquee-outer">
        <div className="marquee-track">
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
            <span className="marquee-item" key={i}>
              <span className="marquee-sep" />
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* ══════════════════ HOW IT WORKS ══════════════════ */}
      <section
        className="section section-border"
        style={{ padding: "120px 0" }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 32px" }}>
          <div style={{ marginBottom: 56 }}>
            <div className="section-label">Process</div>
            <h2
              className="display"
              style={{
                fontSize: "clamp(32px, 4vw, 52px)",
                color: "var(--w100)",
                marginBottom: 14,
              }}
            >
              Five steps from intent to enforcement
            </h2>
            <p
              style={{
                fontSize: 15,
                color: "var(--w45)",
                lineHeight: 1.7,
                maxWidth: 480,
              }}
            >
              The entire pipeline runs in one flow — from natural language to a
              deployed Clarity contract on Stacks.
            </p>
          </div>

          {/* Steps grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              border: "1px solid var(--border)",
              borderRadius: 20,
              overflow: "hidden",
            }}
          >
            {STEPS.map(({ num, Icon, title, desc }, i) => (
              <div
                key={num}
                style={{
                  padding: "32px 24px",
                  borderRight: i < 4 ? "1px solid var(--border)" : "none",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--w02)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    color: "var(--w25)",
                    marginBottom: 20,
                    letterSpacing: "0.08em",
                  }}
                >
                  {num}
                </div>
                <StepIcon Icon={Icon} />
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--w100)",
                    marginBottom: 10,
                    lineHeight: 1.3,
                  }}
                >
                  {title}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--w45)",
                    lineHeight: 1.65,
                  }}
                >
                  {desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════ USE CASES ══════════════════ */}
      <section
        className="section section-border"
        style={{ padding: "120px 0" }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 32px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 2fr",
              gap: 80,
              alignItems: "start",
            }}
          >
            {/* Left */}
            <div>
              <div className="section-label">Use cases</div>
              <h2
                className="display"
                style={{
                  fontSize: "clamp(28px, 3.5vw, 44px)",
                  color: "var(--w100)",
                  marginBottom: 16,
                  lineHeight: 1.1,
                }}
              >
                Built for the people institutions ignore
              </h2>
              <p style={{ fontSize: 15, color: "var(--w45)", lineHeight: 1.7 }}>
                Anyone who needs enforcement without lawyers, banks, or trust in
                intermediaries.
              </p>
            </div>
            {/* Right: 2x2 grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              {USE_CASES.map(({ Icon, title, desc, tag }) => (
                <div
                  key={title}
                  className="card card-hover"
                  style={{ padding: "28px" }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "var(--s3)",
                      color: "var(--w45)",
                      marginBottom: 18,
                    }}
                  >
                    <Icon size={15} />
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--w100)",
                      marginBottom: 8,
                    }}
                  >
                    {title}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--w45)",
                      lineHeight: 1.65,
                      marginBottom: 16,
                    }}
                  >
                    {desc}
                  </div>
                  <div
                    style={{
                      display: "inline-block",
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      color: "var(--w25)",
                      background: "var(--s4)",
                      border: "1px solid var(--border)",
                      borderRadius: 4,
                      padding: "3px 8px",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {tag}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════ DISPUTE ══════════════════ */}
      <section
        className="section section-border"
        style={{ padding: "120px 0" }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 32px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 80,
              alignItems: "center",
            }}
          >
            {/* State machine diagram */}
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 20,
                overflow: "hidden",
                background: "var(--s2)",
              }}
            >
              {/* Diagram header */}
              <div
                style={{
                  padding: "16px 22px",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {["var(--w12)", "var(--w12)", "var(--w12)"].map((c, i) => (
                  <span
                    key={i}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: c,
                      display: "inline-block",
                    }}
                  />
                ))}
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    color: "var(--w25)",
                    marginLeft: 8,
                  }}
                >
                  dispute-state-machine.clar
                </span>
              </div>
              {/* Diagram body */}
              <div style={{ padding: 28 }}>
                {/* Active state */}
                <StateBox label="ACTIVE" sublabel="funds locked" highlighted />
                <div
                  style={{
                    textAlign: "center",
                    padding: "10px 0",
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    color: "var(--w25)",
                  }}
                >
                  ↓ dispute()
                </div>
                {/* Disputed */}
                <StateBox label="DISPUTED" sublabel="arbitrator notified" />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                    marginTop: 10,
                  }}
                >
                  <div>
                    <div
                      style={{
                        textAlign: "center",
                        fontSize: 10,
                        fontFamily: "var(--font-mono)",
                        color: "var(--w25)",
                        padding: "6px 0",
                      }}
                    >
                      resolve-to-a()
                    </div>
                    <StateBox label="RESOLVED A" sublabel="party A receives" />
                  </div>
                  <div>
                    <div
                      style={{
                        textAlign: "center",
                        fontSize: 10,
                        fontFamily: "var(--font-mono)",
                        color: "var(--w25)",
                        padding: "6px 0",
                      }}
                    >
                      resolve-to-b()
                    </div>
                    <StateBox label="RESOLVED B" sublabel="party B receives" />
                  </div>
                </div>
                {/* Fallback */}
                <div
                  style={{
                    marginTop: 16,
                    padding: "12px 16px",
                    borderRadius: 8,
                    background: "var(--s3)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      color: "var(--w25)",
                      marginBottom: 4,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}
                  >
                    48h Fallback
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      color: "var(--w45)",
                    }}
                  >
                    auto-resolution triggers if arbitrator inactive
                  </div>
                </div>
              </div>
            </div>

            {/* Text */}
            <div>
              <div className="section-label">Dispute resolution</div>
              <h2
                className="display"
                style={{
                  fontSize: "clamp(28px, 3.5vw, 44px)",
                  color: "var(--w100)",
                  marginBottom: 28,
                  lineHeight: 1.08,
                }}
              >
                On-chain arbitration.{" "}
                <em style={{ fontStyle: "italic", color: "var(--w45)" }}>
                  No court required.
                </em>
              </h2>
              <div>
                {DISPUTE_POINTS.map(({ Icon, title, desc }) => (
                  <div
                    key={title}
                    style={{
                      display: "flex",
                      gap: 14,
                      padding: "18px 0",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        flexShrink: 0,
                        marginTop: 2,
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "var(--s3)",
                        color: "var(--w45)",
                      }}
                    >
                      <Icon size={13} />
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--w100)",
                          marginBottom: 5,
                        }}
                      >
                        {title}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--w45)",
                          lineHeight: 1.65,
                        }}
                      >
                        {desc}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════ TECH STACK ══════════════════ */}
      <section
        className="section section-border"
        style={{ padding: "120px 0" }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 32px" }}>
          <div style={{ marginBottom: 48 }}>
            <div className="section-label">Architecture</div>
            <h2
              className="display"
              style={{
                fontSize: "clamp(28px, 3.5vw, 44px)",
                color: "var(--w100)",
                marginBottom: 14,
              }}
            >
              Built on proven infrastructure
            </h2>
            <p
              style={{
                fontSize: 15,
                color: "var(--w45)",
                lineHeight: 1.7,
                maxWidth: 400,
              }}
            >
              Every layer chosen for one purpose: trustless, verifiable
              enforcement.
            </p>
          </div>

          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "140px 200px 1fr",
                background: "var(--s2)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              {["Layer", "Technology", "Purpose"].map((h) => (
                <div
                  key={h}
                  style={{
                    padding: "14px 24px",
                    borderRight:
                      h !== "Purpose" ? "1px solid var(--border)" : "none",
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      color: "var(--w25)",
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                    }}
                  >
                    {h}
                  </span>
                </div>
              ))}
            </div>
            {/* Rows */}
            {TECH.map(({ layer, name, purpose }, i) => (
              <div
                key={layer}
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px 200px 1fr",
                  borderBottom:
                    i < TECH.length - 1 ? "1px solid var(--border)" : "none",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--w02)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <div
                  style={{
                    padding: "16px 24px",
                    borderRight: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      color: "var(--w25)",
                    }}
                  >
                    {layer}
                  </span>
                </div>
                <div
                  style={{
                    padding: "16px 24px",
                    borderRight: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--w100)",
                    }}
                  >
                    {name}
                  </span>
                </div>
                <div
                  style={{
                    padding: "16px 24px",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--w45)",
                      lineHeight: 1.5,
                    }}
                  >
                    {purpose}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════ CTA ══════════════════ */}
      <section
        className="section section-border"
        style={{
          padding: "140px 0",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%,-50%)",
            width: 700,
            height: 400,
            pointerEvents: "none",
            background:
              "radial-gradient(ellipse, rgba(242,242,240,0.05) 0%, transparent 65%)",
          }}
        />
        <div
          style={{
            position: "relative",
            zIndex: 2,
            maxWidth: 1100,
            margin: "0 auto",
            padding: "0 32px",
          }}
        >
          <div style={{ marginBottom: 24 }}>
            <div className="badge">
              <span className="dot-live" /> Ready to deploy
            </div>
          </div>
          <h2
            className="display"
            style={{
              fontSize: "clamp(40px, 6vw, 72px)",
              maxWidth: 680,
              margin: "0 auto 20px",
              color: "var(--w100)",
            }}
          >
            Your agreement.{" "}
            <em style={{ fontStyle: "italic", color: "var(--w45)" }}>
              Enforced by Bitcoin.
            </em>
          </h2>
          <p
            style={{
              fontSize: 16,
              color: "var(--w45)",
              maxWidth: 400,
              margin: "0 auto 48px",
              lineHeight: 1.72,
            }}
          >
            No lawyers. No courts. No trust in strangers. Just code that does
            exactly what you agreed.
          </p>
          <div
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              className="btn-primary"
              onClick={() => dispatch(setScreen("select-type"))}
            >
              Create an Escrow <IconArrow />
            </button>
            <button className="btn-secondary">Read the docs</button>
          </div>
        </div>
      </section>

      {/* ══════════════════ FOOTER ══════════════════ */}
      <footer
        style={{ borderTop: "1px solid var(--border)", padding: "40px 0" }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "0 32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "var(--w100)",
                fontFamily: "var(--font-sans)",
                letterSpacing: "-0.3px",
              }}
            >
              Clause
            </span>
            <span
              style={{
                fontSize: 15,
                fontWeight: 300,
                color: "var(--w45)",
                fontFamily: "var(--font-sans)",
              }}
            >
              Ai
            </span>
          </div>
          <span
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "var(--w25)",
            }}
          >
            © 2025 · Stacks Testnet
          </span>
          <div style={{ display: "flex", gap: 24 }}>
            {["GitHub", "Docs", "Privacy"].map((l) => (
              <span
                key={l}
                style={{
                  fontSize: 12,
                  color: "var(--w25)",
                  fontFamily: "var(--font-mono)",
                  cursor: "pointer",
                  transition: "color 0.15s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = "var(--w45)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = "var(--w25)")
                }
              >
                {l}
              </span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Helper: State box in dispute diagram ──────────────────────────
function StateBox({
  label,
  sublabel,
  highlighted = false,
}: {
  label: string;
  sublabel: string;
  highlighted?: boolean;
}) {
  return (
    <div
      style={{
        padding: "12px 16px",
        borderRadius: 10,
        textAlign: "center",
        border: `1px solid ${highlighted ? "var(--border-hi)" : "var(--border)"}`,
        background: highlighted ? "var(--s4)" : "var(--s3)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          color: highlighted ? "var(--w70)" : "var(--w45)",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          color: "var(--w25)",
          marginTop: 3,
        }}
      >
        {sublabel}
      </div>
    </div>
  );
}
