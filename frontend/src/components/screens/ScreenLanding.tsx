"use client";
import { useAppDispatch } from "@/store/hooks";
import { setScreen } from "../../store/slices/agreementSlice";

const IconArrow = () => (
  <svg
    width="12"
    height="12"
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

const STEPS = [
  {
    num: "01",
    title: "Select type",
    desc: "Freelance, rental, trade, or bet.",
  },
  { num: "02", title: "Describe it", desc: "Plain English. No legal jargon." },
  {
    num: "03",
    title: "AI parses terms",
    desc: "Claude compiles into structured terms.",
  },
  {
    num: "04",
    title: "Connect wallet",
    desc: "Leather wallet on Stacks network.",
  },
  { num: "05", title: "Lock sBTC", desc: "Funds locked in Clarity contract." },
];

const USE_CASES = [
  {
    tag: "Freelance",
    title: "Freelance Work",
    desc: "Client locks payment. Released when work is delivered and confirmed.",
  },
  {
    tag: "Rental",
    title: "Rental / Deposit",
    desc: "Deposit locked on-chain. Auto-refund on safe return.",
  },
  {
    tag: "Trade",
    title: "P2P Trade",
    desc: "Buyer locks funds. Seller delivers. No intermediaries.",
  },
  {
    tag: "Bet",
    title: "Simple Bet",
    desc: "Stakes locked on-chain. Winner takes all via arbitrator.",
  },
];

const TECH = [
  {
    layer: "Contracts",
    name: "Clarity · Stacks",
    purpose: "Core escrow + dispute state machine",
  },
  {
    layer: "Settlement",
    name: "sBTC",
    purpose: "Trustless BTC-backed collateral, 1:1",
  },
  {
    layer: "AI Parser",
    name: "Claude API",
    purpose: "NL → structured contract terms",
  },
  {
    layer: "Frontend",
    name: "Next.js",
    purpose: "Select → describe → approve → deploy",
  },
  {
    layer: "Wallet",
    name: "Hiro · stacks.js",
    purpose: "Auth + contract interaction + signing",
  },
  {
    layer: "Storage",
    name: "IPFS",
    purpose: "Condition hash + immutable record",
  },
];

const MARQUEE = [
  "Bitcoin-secured",
  "Clarity contracts",
  "sBTC collateral",
  "Stacks blockchain",
  "On-chain arbitration",
  "No intermediaries",
  "Auto-enforcement",
  "72h timeout",
  "IPFS hashing",
];

export default function ScreenLanding() {
  const dispatch = useAppDispatch();

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        overflowX: "hidden",
      }}
    >
      {/* ── TOPBAR ─────────────────────────────────── */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          height: 52,
          background: "rgba(10,10,10,0.80)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          padding: "0 32px",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--text-1)",
              letterSpacing: "-0.03em",
            }}
          >
            Clause
          </span>
          <span
            style={{
              fontSize: 14,
              fontWeight: 300,
              color: "var(--text-3)",
              letterSpacing: "-0.03em",
            }}
          >
            Ai
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="badge">
            <span className="dot dot-active" style={{ marginRight: 2 }} />
            Stacks Testnet
          </div>
          <button
            className="btn btn-primary"
            style={{ padding: "7px 16px", fontSize: 12 }}
            onClick={() => dispatch(setScreen("select-type"))}
          >
            Get started <IconArrow />
          </button>
        </div>
      </nav>

      {/* ── HERO ───────────────────────────────────── */}
      <section
        style={{
          paddingTop: 140,
          paddingBottom: 100,
          position: "relative",
          overflow: "hidden",
          textAlign: "center",
        }}
      >
        {/* Vertical grid lines */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 0,
            pointerEvents: "none",
            backgroundImage:
              "repeating-linear-gradient(90deg,transparent,transparent 79px,rgba(242,242,240,0.02) 79px,rgba(242,242,240,0.02) 80px)",
          }}
        />
        {/* Subtle center radial */}
        <div
          className="hero-glow"
          style={{
            width: 600,
            height: 300,
            top: "40%",
            left: "50%",
            transform: "translate(-50%,-50%)",
            background:
              "radial-gradient(ellipse, rgba(242,242,240,0.04) 0%, transparent 70%)",
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
          {/* Eyebrow badge */}
          <div
            className="fade-up"
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: 28,
            }}
          >
            <div className="badge">
              <span className="dot dot-active" />
              Bitcoin-Enforced Smart Contracts
            </div>
          </div>

          {/* Headline */}
          <h1
            className="fade-up d1"
            style={{
              fontSize: "clamp(44px, 7.5vw, 88px)",
              fontWeight: 800,
              letterSpacing: "-0.04em",
              lineHeight: 1.0,
              color: "var(--text-1)",
              maxWidth: 860,
              margin: "0 auto 28px",
            }}
          >
            Agreements enforced{" "}
            <span
              style={{
                color: "var(--text-3)",
                fontWeight: 300,
                fontStyle: "italic",
              }}
            >
              by Bitcoin itself.
            </span>
          </h1>

          {/* Subtext */}
          <p
            className="fade-up d2"
            style={{
              fontSize: 16,
              color: "var(--text-2)",
              maxWidth: 460,
              margin: "0 auto 44px",
              lineHeight: 1.7,
              fontWeight: 400,
            }}
          >
            Turn plain English into auditable Clarity contracts in under 60
            seconds. No lawyers. No banks. No trust required.
          </p>

          {/* Flow strip */}
          <div
            className="fade-up d2"
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: 44,
            }}
          >
            <div
              style={{
                display: "inline-flex",
                background: "var(--bg-2)",
                border: "1px solid var(--border)",
                borderRadius: 99,
                overflow: "hidden",
              }}
            >
              {["Describe", "AI parses", "Lock sBTC", "Bitcoin enforces"].map(
                (label, i) => (
                  <div
                    key={label}
                    style={{
                      padding: "9px 18px",
                      borderRight: i < 3 ? "1px solid var(--border)" : "none",
                      fontSize: 11,
                      fontFamily: "var(--mono)",
                      color: i === 0 ? "var(--text-1)" : "var(--text-3)",
                      letterSpacing: "0.04em",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {i > 0 && (
                      <span style={{ opacity: 0.3, fontSize: 10 }}>→</span>
                    )}
                    {label}
                  </div>
                ),
              )}
            </div>
          </div>

          {/* CTAs */}
          <div
            className="fade-up d3"
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "center",
              marginBottom: 88,
            }}
          >
            <button
              className="btn btn-primary btn-lg"
              onClick={() => dispatch(setScreen("select-type"))}
            >
              Create an Escrow <IconArrow />
            </button>
            <button className="btn btn-ghost btn-lg">How it works</button>
          </div>

          {/* Stats row */}
          <div
            className="fade-up d4"
            style={{
              display: "flex",
              justifyContent: "center",
              borderTop: "1px solid var(--border)",
              maxWidth: 520,
              margin: "0 auto",
            }}
          >
            {[
              { value: "1.4B", label: "Unbanked people" },
              { value: "60s", label: "To deploy" },
              { value: "0", label: "Lawyers needed" },
            ].map((s, i) => (
              <div
                key={s.label}
                style={{
                  flex: 1,
                  textAlign: "center",
                  paddingTop: 32,
                  borderRight: i < 2 ? "1px solid var(--border)" : "none",
                }}
              >
                <div
                  style={{
                    fontSize: 40,
                    fontWeight: 800,
                    letterSpacing: "-0.05em",
                    color: "var(--text-1)",
                    lineHeight: 1,
                    marginBottom: 8,
                  }}
                >
                  {s.value}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--mono)",
                    color: "var(--text-3)",
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

      {/* ── MARQUEE ────────────────────────────────── */}
      <div className="marquee-wrap">
        <div className="marquee-track">
          {[...MARQUEE, ...MARQUEE, ...MARQUEE].map((item, i) => (
            <span className="marquee-item" key={i}>
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* ── HOW IT WORKS ───────────────────────────── */}
      <section
        style={{ padding: "120px 0", borderTop: "1px solid var(--border)" }}
      >
        <div className="section">
          <div style={{ marginBottom: 52 }}>
            <div className="label" style={{ marginBottom: 14 }}>
              Process
            </div>
            <h2
              style={{
                fontSize: "clamp(28px, 4vw, 48px)",
                fontWeight: 700,
                letterSpacing: "-0.04em",
                lineHeight: 1.1,
                color: "var(--text-1)",
                marginBottom: 14,
              }}
            >
              Five steps from intent to enforcement
            </h2>
            <p
              style={{
                fontSize: 14,
                color: "var(--text-2)",
                lineHeight: 1.7,
                maxWidth: 420,
              }}
            >
              The entire pipeline runs in one flow — from natural language to a
              deployed Clarity contract on Stacks.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-lg)",
              overflow: "hidden",
            }}
          >
            {STEPS.map(({ num, title, desc }, i) => (
              <div
                key={num}
                style={{
                  padding: "28px 22px",
                  borderRight: i < 4 ? "1px solid var(--border)" : "none",
                  transition: "background var(--fast) var(--ease)",
                  cursor: "default",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--bg-2)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <div
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--mono)",
                    color: "var(--text-4)",
                    marginBottom: 20,
                    letterSpacing: "0.1em",
                  }}
                >
                  {num}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-1)",
                    marginBottom: 8,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {title}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-3)",
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

      {/* ── USE CASES ──────────────────────────────── */}
      <section
        style={{ padding: "120px 0", borderTop: "1px solid var(--border)" }}
      >
        <div className="section">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 2fr",
              gap: 80,
              alignItems: "start",
            }}
          >
            <div>
              <div className="label" style={{ marginBottom: 14 }}>
                Use cases
              </div>
              <h2
                style={{
                  fontSize: "clamp(26px, 3vw, 40px)",
                  fontWeight: 700,
                  letterSpacing: "-0.04em",
                  lineHeight: 1.1,
                  color: "var(--text-1)",
                  marginBottom: 16,
                }}
              >
                Built for the people institutions ignore
              </h2>
              <p
                style={{
                  fontSize: 14,
                  color: "var(--text-2)",
                  lineHeight: 1.7,
                }}
              >
                Anyone who needs enforcement without lawyers, banks, or trust in
                intermediaries.
              </p>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              {USE_CASES.map(({ tag, title, desc }) => (
                <div key={title} className="card" style={{ padding: "24px" }}>
                  <div className="tag" style={{ marginBottom: 16 }}>
                    {tag}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text-1)",
                      marginBottom: 8,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {title}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-3)",
                      lineHeight: 1.65,
                    }}
                  >
                    {desc}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── TECH STACK ─────────────────────────────── */}
      <section
        style={{ padding: "120px 0", borderTop: "1px solid var(--border)" }}
      >
        <div className="section">
          <div style={{ marginBottom: 48 }}>
            <div className="label" style={{ marginBottom: 14 }}>
              Architecture
            </div>
            <h2
              style={{
                fontSize: "clamp(26px, 3vw, 40px)",
                fontWeight: 700,
                letterSpacing: "-0.04em",
                color: "var(--text-1)",
              }}
            >
              Built on proven infrastructure
            </h2>
          </div>

          <div className="table">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "140px 200px 1fr",
                background: "var(--bg-2)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              {["Layer", "Technology", "Purpose"].map((h, i) => (
                <div
                  key={h}
                  style={{
                    padding: "12px 20px",
                    borderRight: i < 2 ? "1px solid var(--border)" : "none",
                  }}
                >
                  <span className="label">{h}</span>
                </div>
              ))}
            </div>
            {TECH.map(({ layer, name, purpose }, i) => (
              <div
                key={layer}
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px 200px 1fr",
                  borderBottom:
                    i < TECH.length - 1 ? "1px solid var(--border)" : "none",
                  transition: "background var(--fast) var(--ease)",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--bg-2)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <div
                  style={{
                    padding: "14px 20px",
                    borderRight: "1px solid var(--border)",
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--mono)",
                      color: "var(--text-3)",
                    }}
                  >
                    {layer}
                  </span>
                </div>
                <div
                  style={{
                    padding: "14px 20px",
                    borderRight: "1px solid var(--border)",
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--text-1)",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {name}
                  </span>
                </div>
                <div style={{ padding: "14px 20px" }}>
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--text-3)",
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

      {/* ── CTA ────────────────────────────────────── */}
      <section
        style={{
          padding: "140px 0",
          textAlign: "center",
          borderTop: "1px solid var(--border)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          className="hero-glow"
          style={{
            width: 500,
            height: 300,
            top: "50%",
            left: "50%",
            transform: "translate(-50%,-50%)",
            background:
              "radial-gradient(ellipse, rgba(242,242,240,0.04) 0%, transparent 70%)",
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
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: 24,
            }}
          >
            <div className="badge">
              <span className="dot dot-active" />
              Ready to deploy
            </div>
          </div>
          <h2
            style={{
              fontSize: "clamp(36px, 6vw, 68px)",
              fontWeight: 800,
              letterSpacing: "-0.05em",
              lineHeight: 1.0,
              color: "var(--text-1)",
              maxWidth: 620,
              margin: "0 auto 20px",
            }}
          >
            Your agreement.{" "}
            <span
              style={{
                color: "var(--text-3)",
                fontWeight: 300,
                fontStyle: "italic",
              }}
            >
              Enforced by Bitcoin.
            </span>
          </h2>
          <p
            style={{
              fontSize: 15,
              color: "var(--text-2)",
              maxWidth: 380,
              margin: "0 auto 48px",
              lineHeight: 1.7,
            }}
          >
            No lawyers. No courts. No trust in strangers. Just code that does
            exactly what you agreed.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => dispatch(setScreen("select-type"))}
            >
              Create an Escrow <IconArrow />
            </button>
            <button className="btn btn-ghost btn-lg">Read the docs</button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────── */}
      <footer
        style={{ borderTop: "1px solid var(--border)", padding: "32px 0" }}
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
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--text-1)",
                letterSpacing: "-0.03em",
              }}
            >
              Clause
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 300,
                color: "var(--text-3)",
                letterSpacing: "-0.03em",
              }}
            >
              Ai
            </span>
          </div>
          <span
            style={{
              fontSize: 10,
              fontFamily: "var(--mono)",
              color: "var(--text-4)",
            }}
          >
            © 2025 · Stacks Testnet
          </span>
          <div style={{ display: "flex", gap: 20 }}>
            {["GitHub", "Docs", "Privacy"].map((l) => (
              <span
                key={l}
                style={{
                  fontSize: 11,
                  fontFamily: "var(--mono)",
                  color: "var(--text-4)",
                  cursor: "pointer",
                  transition: "color var(--fast)",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = "var(--text-2)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = "var(--text-4)")
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
