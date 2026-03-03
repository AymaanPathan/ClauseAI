"use client";
import { useAppDispatch } from "@/store/hooks";
import { setScreen } from "../../../useAppSelector/slices/agreementSlice";

export default function ScreenLanding() {
  const dispatch = useAppDispatch();

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Grid background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          backgroundImage: `
          linear-gradient(rgba(245,196,0,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(245,196,0,0.04) 1px, transparent 1px)
        `,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Glow */}
      <div
        style={{
          position: "absolute",
          top: "20%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(245,196,0,0.07) 0%, transparent 70%)",
          zIndex: 0,
        }}
      />

      {/* Nav */}
      <nav
        style={{
          position: "relative",
          zIndex: 10,
          padding: "20px 48px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <span
            style={{ fontSize: 22, fontWeight: 800, color: "var(--yellow)" }}
          >
            Clause
          </span>
          <span
            style={{ fontSize: 22, fontWeight: 800, color: "var(--white)" }}
          >
            Ai
          </span>
        </div>
        <div
          style={{
            display: "flex",
            gap: 32,
            fontSize: 13,
            color: "var(--grey-1)",
          }}
        >
          <span>How it works</span>
          <span>Docs</span>
          <span style={{ color: "var(--yellow)", fontWeight: 600 }}>
            Testnet
          </span>
        </div>
      </nav>

      {/* Hero */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "60px 24px",
          textAlign: "center",
          position: "relative",
          zIndex: 10,
        }}
      >
        <div
          className="animate-fade-up"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "var(--black-3)",
            border: "1px solid var(--black-4)",
            borderRadius: 99,
            padding: "6px 16px",
            marginBottom: 32,
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            color: "var(--grey-1)",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#22c55e",
              display: "inline-block",
              animation: "pulse-yellow 2s infinite",
            }}
          />
          Live on Stacks Testnet
        </div>

        <h1
          className="animate-fade-up delay-1"
          style={{
            fontSize: "clamp(40px, 7vw, 80px)",
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: "-2px",
            maxWidth: 800,
            marginBottom: 24,
          }}
        >
          Agreements enforced{" "}
          <span
            style={{
              color: "var(--yellow)",
              WebkitTextStroke: "0px",
              textShadow: "0 0 40px rgba(245,196,0,0.3)",
            }}
          >
            by Bitcoin
          </span>
          .
          <br />
          Not by trust.
        </h1>

        <p
          className="animate-fade-up delay-2"
          style={{
            fontSize: 18,
            color: "var(--grey-1)",
            maxWidth: 520,
            lineHeight: 1.7,
            marginBottom: 48,
          }}
        >
          Turn plain English agreements into Bitcoin-enforced smart contracts in
          under 60 seconds. No lawyers. No banks. No trust required.
        </p>

        <div
          className="animate-fade-up delay-3"
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <button
            onClick={() => dispatch(setScreen("select-type"))}
            style={{
              background: "var(--yellow)",
              color: "var(--black)",
              border: "none",
              borderRadius: 99,
              padding: "16px 40px",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: "-0.2px",
              transition: "all var(--transition)",
              boxShadow: "0 0 0 0 rgba(245,196,0,0.4)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background =
                "var(--yellow-hover)";
              (e.currentTarget as HTMLElement).style.transform =
                "translateY(-2px)";
              (e.currentTarget as HTMLElement).style.boxShadow =
                "0 8px 32px rgba(245,196,0,0.3)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background =
                "var(--yellow)";
              (e.currentTarget as HTMLElement).style.transform =
                "translateY(0)";
              (e.currentTarget as HTMLElement).style.boxShadow =
                "0 0 0 0 rgba(245,196,0,0.4)";
            }}
          >
            Create an Agreement →
          </button>

          <button
            style={{
              background: "transparent",
              color: "var(--white)",
              border: "1px solid var(--black-4)",
              borderRadius: 99,
              padding: "16px 32px",
              fontSize: 15,
              fontWeight: 500,
              cursor: "pointer",
              transition: "all var(--transition)",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.borderColor =
                "var(--grey-2)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.borderColor =
                "var(--black-4)")
            }
          >
            Watch Demo
          </button>
        </div>

        {/* Stats */}
        <div
          className="animate-fade-up delay-4"
          style={{
            display: "flex",
            gap: 48,
            marginTop: 80,
            borderTop: "1px solid var(--black-4)",
            paddingTop: 40,
          }}
        >
          {[
            { value: "1.4B", label: "Unbanked people" },
            { value: "60s", label: "To deploy a contract" },
            { value: "100%", label: "On-chain enforcement" },
          ].map((stat) => (
            <div key={stat.label} style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 800,
                  color: "var(--yellow)",
                  letterSpacing: "-1px",
                }}
              >
                {stat.value}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--grey-1)",
                  marginTop: 4,
                  fontFamily: "var(--font-mono)",
                }}
              >
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
