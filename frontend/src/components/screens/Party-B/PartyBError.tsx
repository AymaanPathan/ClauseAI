"use client";
// components/screens/party-b/PartyBError.tsx
// Shown when the agreement link is invalid or the server can't be reached.

export default function PartyBError({
  message,
  agreementId,
}: {
  message: string;
  agreementId: string;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--black)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 400, width: "100%" }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: "var(--red-dim)",
            border: "1px solid rgba(239,68,68,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 24px",
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
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>

        <h3
          style={{
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            marginBottom: 8,
          }}
        >
          Agreement not found
        </h3>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-2)",
            lineHeight: 1.7,
            marginBottom: 8,
          }}
        >
          {message}
        </p>
        <p
          style={{
            fontSize: 11,
            fontFamily: "var(--mono)",
            color: "var(--text-4)",
            marginBottom: 28,
          }}
        >
          ID: #{agreementId}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            className="btn btn-ghost"
            onClick={() => window.location.reload()}
            style={{ width: "100%" }}
          >
            Try again
          </button>
          <div
            style={{
              fontSize: 11,
              fontFamily: "var(--mono)",
              color: "var(--text-4)",
              textAlign: "center",
            }}
          >
            Ask the payer to resend their link
          </div>
        </div>
      </div>
    </div>
  );
}
