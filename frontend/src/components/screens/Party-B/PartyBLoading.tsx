"use client";
// components/screens/party-b/PartyBLoading.tsx
// Shown while Party B's agreement data is being fetched from the server.

export default function PartyBLoading({
  agreementId,
}: {
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
      <div style={{ textAlign: "center", maxWidth: 360, width: "100%" }}>
        {/* Spinner */}
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 24px",
          }}
        >
          <span className="spinner" style={{ width: 22, height: 22 }} />
        </div>

        <h3
          style={{
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            marginBottom: 8,
          }}
        >
          Loading agreement
        </h3>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-3)",
            lineHeight: 1.7,
            marginBottom: 20,
          }}
        >
          Fetching terms from server...
        </p>
        <div
          style={{
            fontSize: 10,
            fontFamily: "var(--mono)",
            color: "var(--text-4)",
            letterSpacing: "0.08em",
          }}
        >
          #{agreementId}
        </div>
      </div>
    </div>
  );
}
