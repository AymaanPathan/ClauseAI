<div align="center">

```
 ██████╗██╗      █████╗ ██╗   ██╗███████╗███████╗ █████╗ ██╗
██╔════╝██║     ██╔══██╗██║   ██║██╔════╝██╔════╝██╔══██╗██║
██║     ██║     ███████║██║   ██║███████╗█████╗  ███████║██║
██║     ██║     ██╔══██║██║   ██║╚════██║██╔══╝  ██╔══██║██║
╚██████╗███████╗██║  ██║╚██████╔╝███████║███████╗██║  ██║██║
 ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝╚═╝
```

**The Legal Layer for Bitcoin**

*Natural Language → Bitcoin-Enforced Smart Contracts*

[![Live Demo](https://img.shields.io/badge/Live_Demo-clause--ai.vercel.app-orange?style=for-the-badge&logo=vercel)](https://clause-ai-bfno.vercel.app/)
[![GitHub](https://img.shields.io/badge/GitHub-AymaanPathan%2FClauseAI-181717?style=for-the-badge&logo=github)](https://github.com/AymaanPathan/ClauseAI.git)
[![Built on Stacks](https://img.shields.io/badge/Built_on-Stacks-5546FF?style=for-the-badge)](https://stacks.co)
[![Bitcoin](https://img.shields.io/badge/Secured_by-Bitcoin-F7931A?style=for-the-badge&logo=bitcoin)](https://bitcoin.org)

> *"Write your deal in plain English. AI makes it airtight. Bitcoin holds the money. Nobody can cheat."*

</div>

---

<img width="1087" height="588" alt="open-dispute" src="https://github.com/user-attachments/assets/3af039b1-745b-4874-ac27-c2fba481b0da" />
<img width="1092" height="590" alt="landing" src="https://github.com/user-attachments/assets/948c64c2-2185-4c0f-b54a-88a0f97a4a41" />
<img width="1083" height="586" alt="describe" src="https://github.com/user-attachments/assets/6bd59993-3a38-4664-ad78-bd90744fe085" />
<img width="1085" height="585" alt="agreement-dashboard" src="https://github.com/user-attachments/assets/5bf5f830-d4af-4ae4-9f2d-75ef1f6e99c0" />

## 🔴 The Problem

Every day, millions of people make deals that get broken.

- **Clients refuse to pay** after work is delivered
- **Freelancers disappear** after receiving upfront payment  
- **Multi-phase projects** have no trustless payment enforcement
- **Disputes** have no neutral, fast resolution system
- **Legal contracts** are complex, costly, and inaccessible globally

Traditional escrow services solve some of these problems — but introduce **centralized control, high fees (10–20% cuts), single points of failure, and days-long processing times.**

Courts are slow. Lawyers are expensive. Trust fails.

---

## ✅ The Solution

ClauseAI turns plain English agreements into **Bitcoin-secured smart contracts** on the Stacks blockchain.

Instead of trusting a middleman, parties rely on:
- 🤖 **AI-parsed terms** — describe your deal in plain English, AI extracts every field
- 🎯 **Milestone-based escrow** — funds release per deliverable, not all-or-nothing  
- ⚖️ **AI-assisted arbitration** — neural dispute resolution with human arbitrator override
- ₿ **Bitcoin finality** — every state change settled via Proof of Transfer

```
User types:  "Pay Alex $2,000 for a website — 30% on wireframes, 40% on 
              development, 30% on final delivery. Dispute goes to John."

ClauseAI:    ✓ Parties extracted      → payer: you, receiver: Alex
             ✓ Milestones parsed      → 3 phases, exact percentages
             ✓ Arbitrator set         → John's wallet
             ✓ Smart contract ready   → deploy in 60 seconds
             ✓ sBTC locked on-chain   → Bitcoin-enforced
```

---

## 🎬 Demo

**[→ Try the Live Demo](https://clause-ai-bfno.vercel.app/)**

**Full flow in under 5 minutes:**
1. Describe your deal in plain English
2. AI parses it into a structured contract
3. Share a link with your counterparty
4. Both parties approve via Leather wallet
5. Party A locks sBTC into escrow
6. Milestones release funds on completion
7. Dispute? AI arbitrates. Arbitrator decides on-chain.

---

## ⚙️ How It Works

### 1. Natural Language Agreement

Users describe their deal in plain English. ClauseAI uses **Groq + LLaMA 3.3 70B** to extract:

| Field | Example |
|-------|---------|
| Payer | `SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7` |
| Receiver | `SP1HTBVD3JG9C05J7HBJTHGR0GGW7KXW28M5JS8QE` |
| Total Amount | `$2,000 USD → X sBTC` |
| Milestones | `[{30%, wireframes}, {40%, development}, {30%, delivery}]` |
| Arbitrator | `SP3FGQ8Z7JY9BWYZ5WM53E0M9NK7WHJF0691NZ159` |

### 2. Multi-Milestone Escrow

Real deals have phases. ClauseAI supports **multi-milestone conditional payments** — the first Bitcoin-native escrow protocol to parse them directly from plain English.

```
Input:   "30% on wireframes, 50% on development, 20% on launch day"

Output:  Milestone 0 → 30% ($600)  — status: locked
         Milestone 1 → 50% ($1000) — status: locked  
         Milestone 2 → 20% ($400)  — status: locked

         Each milestone is an independent Clarity contract state.
         If milestone 1 is disputed → only that $1000 is frozen.
         Milestones 0 and 2 proceed independently.
```

### 3. sBTC as Native Currency

ClauseAI uses **actual sBTC** (SIP-010 fungible token) — not STX, not a wrapper label.

Every agreement locks real sBTC. Every release moves real sBTC. Every dispute freezes real sBTC.

> *"Escrow in actual Bitcoin" is a fundamentally different product than "escrow on a Bitcoin layer."*

### 4. AI Dispute Arbitration

When a dispute opens, both parties submit their case as plain text. The AI engine:

1. Reads the original parsed contract terms
2. Reads Party A's statement + evidence links
3. Reads Party B's statement + evidence links
4. Outputs a structured, reasoned verdict

```json
{
  "verdict": "release_to_receiver",
  "confidence": 84,
  "reasoning": "The contract required logo delivery by March 15. Party B 
                submitted final files on March 13 with confirmation link 
                provided. Party A's objection references color preferences 
                not specified in the original agreement terms.",
  "key_factors": [
    "Delivery confirmed before deadline",
    "Objection outside contract scope",
    "Evidence submitted by receiver"
  ]
}
```

The human arbitrator reviews this and can **follow or override** with a single on-chain call. The AI is a legal analyst — the human retains final authority.

**This is the first AI judge on Bitcoin.**

### 5. Real-Time Presence via Socket.io + SSE

Both parties see live updates without polling:

- Party B opens the link → Party A's screen updates instantly  
- Party B approves → Party A gets notified in real time
- Funds locked → Party B's dashboard activates immediately
- Milestone completed → both dashboards update simultaneously
- Dispute resolved → arbitrator's decision propagates to all parties

---

## 🔐 Security Model

ClauseAI removes trust from the equation entirely.

| Guarantee | Mechanism |
|-----------|-----------|
| Funds locked on-chain | sBTC transferred to contract on deposit |
| Neither party can withdraw unilaterally | Clarity post-conditions enforce this |
| Milestone-level granularity | Each tranche tracked independently |
| Arbitrator decisions are final | On-chain resolution calls |
| Timeout protection | Auto-refund if arbitrator is inactive 48hrs |
| Bitcoin finality | Every state change settled via Proof of Transfer |

**Timeout Logic:**
- If deadline passes with no `complete-milestone()` call → payer triggers auto-refund
- If arbitrator doesn't resolve within 48 hours → anyone calls `trigger-arb-timeout()` → payer refunded

---

## 🧱 Tech Stack

### Blockchain
- **Stacks** — Bitcoin's smart contract layer
- **Clarity** — Deterministic, decidable smart contracts (no rug pulls possible)
- **sBTC (SIP-010)** — Actual Bitcoin as escrow currency
- **Proof of Transfer** — Bitcoin-finalized settlement

### AI Layer
- **Groq** inference API
- **LLaMA 3.3 70B** — Contract parsing + dispute arbitration
- Natural language → structured contract schema
- Multi-milestone extraction from plain English
- AI arbitration engine with confidence scoring

### Frontend
- **Next.js 14** + React
- **Tailwind CSS**
- **Redux Toolkit** (full async thunk architecture)
- **Socket.io client** — real-time presence & milestone updates
- **Server-Sent Events** — live counterparty detection

### Backend
- **Express** + TypeScript
- **MongoDB** (agreement + dispute persistence)
- **Redis** (presence store, 24hr TTL)
- **Socket.io** (agreement rooms + dispute rooms with ack sync)
- **SSE** (Server-Sent Events for approval flow)

### Wallet Integration
- **Leather Wallet** (non-custodial)
- **Stacks Connect**
- **stacks.js**

---

## 🗂️ Project Structure

```
ClauseAI/
├── frontend/                  # Next.js app
│   ├── app/
│   │   ├── page.tsx           # Party A landing + flow
│   │   └── agreement/[id]/    # Party B review + approval flow
│   ├── components/
│   │   ├── partyA/            # Screens: Describe → Parse → Share → Lock
│   │   └── partyB/            # Screens: Review → Connect → Approve → Wait
│   ├── store/
│   │   └── slices/
│   │       ├── partyASlice.ts # Full Party A state machine + thunks
│   │       └── partyBSlice.ts # Full Party B state machine + thunks
│   ├── lib/
│   │   ├── contractCalls.ts   # Clarity contract interactions
│   │   ├── contractReads.ts   # On-chain reads (milestone amounts, status)
│   │   ├── hiroWallet.ts      # Leather wallet connection
│   │   ├── socket.ts          # Socket.io singleton + room management
│   │   └── stacksConfig.ts    # Network config (mainnet/testnet)
│   └── api/
│       ├── parseApi.ts        # AI parsing endpoint calls
│       └── approvalApi.ts     # Presence + approval API calls
│
├── backend/                   # Express + TypeScript
│   ├── routes/
│   │   ├── parse.ts           # POST /parse — AI contract extraction
│   │   ├── agreement.ts       # Agreement presence, approvals, milestones
│   │   └── arbitrate.ts       # Dispute open/submit/verdict/resolve
│   ├── models/
│   │   ├── Agreement.ts       # MongoDB schema
│   │   └── Dispute.ts         # Dispute schema + mem-store fallback
│   └── lib/
│       ├── groq-client.ts     # Groq API client
│       ├── ai-config.ts       # Model configuration
│       ├── redis.ts           # Redis presence store
│       └── db.ts              # MongoDB connection
│
└── contracts/                 # Clarity smart contracts
    ├── escrow.clar            # Main escrow contract
    └── sip010-trait.clar      # sBTC token trait
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- [Leather Wallet](https://wallet.hiro.so) browser extension
- MongoDB (local or Atlas)
- Redis (local or Upstash)
- Groq API key → [console.groq.com](https://console.groq.com)

### Clone the Repository

```bash
git clone https://github.com/AymaanPathan/ClauseAI.git
cd ClauseAI
```

### Backend Setup

```bash
cd backend
npm install

# Create .env
cp .env.example .env
```

```env
PORT=8000
MONGODB_URI=mongodb://localhost:27017/clauseai
REDIS_URL=redis://localhost:6379
GROQ_API_KEY=your_groq_api_key
STACKS_NETWORK=testnet
FRONTEND_URL=http://localhost:3000
```

```bash
npm run dev
```

### Frontend Setup

```bash
cd frontend
npm install

# Create .env.local
cp .env.example .env.local
```

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_STACKS_NETWORK=testnet
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Smart Contract Deployment

```bash
# Install Clarinet
curl -L https://github.com/hirosystems/clarinet/releases/download/v2.0.0/clarinet-linux-x64.tar.gz | tar xz

# Deploy to testnet
clarinet deployments apply --testnet
```

---

## 📐 Contract Architecture

The Clarity escrow contract manages the full lifecycle:

```
States:   PENDING → ACTIVE → COMPLETE / REFUNDED
                 ↘           ↗
               DISPUTED (per milestone)

Milestone States:  PENDING → ACTIVE → COMPLETE
                                   ↘ DISPUTED → COMPLETE / REFUNDED
                                   ↘ REFUNDED (timeout)
```

**Core Functions:**

| Function | Who calls it | What it does |
|----------|-------------|--------------|
| `create-agreement` | Party A | Deploys contract with all terms |
| `deposit` | Party A | Locks sBTC, activates milestones |
| `complete-milestone` | Party A | Releases tranche to Party B |
| `dispute-milestone` | Either party | Freezes milestone, opens arbitration |
| `resolve-to-receiver` | Arbitrator | Releases disputed funds to Party B |
| `resolve-to-payer` | Arbitrator | Refunds disputed funds to Party A |
| `trigger-milestone-timeout` | Anyone | Auto-refund after deadline passes |
| `trigger-arb-timeout` | Anyone | Auto-refund if arbitrator inactive 48hrs |

---

## 🌍 Market Opportunity

| Segment | Market Size |
|---------|-------------|
| Global Freelance Market | $1.5 Trillion |
| Real Estate Deposits | $500B+ |
| Trade Finance | $9 Trillion |
| Prediction Markets | $100B+ |

ClauseAI is **infrastructure** — the legal layer that Bitcoin has never had. Not DeFi speculation. Actual economic activity, enforced by the most secure blockchain on earth.

Anyone with a Leather wallet and 60 seconds can create a legally-structured, Bitcoin-enforced escrow. No lawyers. No platforms. No trust required.

---

## 🏆 Built for Stacks BUIDL Battle #2

This project was built for the [Stacks BUIDL Battle #2 Hackathon](https://dorahacks.io) — The Bitcoin Builders Tournament.

**Why ClauseAI wins on judging criteria:**

- **Innovation** — First AI-parsed, milestone-based escrow on Bitcoin. First AI judge on Stacks.
- **Technical Depth** — Clarity contracts + sBTC + LLM parsing + Socket.io + SSE + Redis. Full stack.
- **Stacks Alignment** — Uses Clarity, sBTC, Proof of Transfer, Stacks.js, Leather wallet.
- **UX** — Plain English in. Bitcoin-enforced contract out. Zero crypto knowledge required.
- **Impact** — Unlocks Bitcoin for real commerce. $1.5T addressable market on day one.

---

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first.

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request


<div align="center">

**ClauseAI — Smart contracts for everyone, enforced by Bitcoin.**

[Live Demo](https://clause-ai-bfno.vercel.app/) · [GitHub](https://github.com/AymaanPathan/ClauseAI.git) · [Report Bug](https://github.com/AymaanPathan/ClauseAI/issues)

*Built with ₿ on Stacks*

</div>
