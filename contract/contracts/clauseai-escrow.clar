;; ============================================================
;; State machine: PENDING → ACTIVE → COMPLETE | REFUNDED | DISPUTED
;; ============================================================

;; ─── Error codes ─────────────────────────────────────────────
(define-constant ERR-NOT-AUTHORIZED    (err u100))
(define-constant ERR-WRONG-STATE       (err u101))
(define-constant ERR-ALREADY-DEPOSITED (err u102))
(define-constant ERR-INVALID-AMOUNT    (err u103))
(define-constant ERR-NOT-PARTY         (err u104))
(define-constant ERR-NOT-ARBITRATOR    (err u105))
(define-constant ERR-NOT-FOUND         (err u106))
(define-constant ERR-TIMEOUT-NOT-MET   (err u107))
(define-constant ERR-TIMEOUT-ACTIVE    (err u108))

;; ─── State constants ──────────────────────────────────────────
(define-constant STATE-PENDING  u0)
(define-constant STATE-ACTIVE   u1)
(define-constant STATE-COMPLETE u2)
(define-constant STATE-REFUNDED u3)
(define-constant STATE-DISPUTED u4)

;; ─── Timeouts ─────────────────────────────────────────────────
(define-constant TIMEOUT-BLOCKS     u432)  ;; 72 hours (~10 min/block)
(define-constant ARB-TIMEOUT-BLOCKS u288)  ;; 48 hours

;; ─── Minimum deposit (anti-spam) ──────────────────────────────
(define-constant MIN-AMOUNT u1000)

;; ─── Dynamic owner — set once at deploy time ──────────────────
(define-data-var contract-owner principal tx-sender)

;; ============================================================
;; MULTI-ESCROW MAP
;; ============================================================

(define-map agreements
  (string-ascii 64)
  {
    state:             uint,
    party-a:           principal,
    party-b:           principal,
    arbitrator:        principal,
    amount-per-party:  uint,
    party-a-deposited: bool,
    party-b-deposited: bool,
    deadline-block:    uint,
    dispute-block:     uint
  }
)

;; ============================================================
;; READ-ONLY
;; ============================================================

(define-read-only (get-owner)
  (var-get contract-owner)
)

(define-read-only (get-agreement (id (string-ascii 64)))
  (map-get? agreements id)
)

(define-read-only (get-state (id (string-ascii 64)))
  (match (map-get? agreements id)
    agreement (ok (get state agreement))
    ERR-NOT-FOUND
  )
)

(define-read-only (is-timed-out (id (string-ascii 64)))
  (match (map-get? agreements id)
    agreement (ok
      (and
        (is-eq (get state agreement) STATE-ACTIVE)
        (>= block-height (get deadline-block agreement))
      )
    )
    ERR-NOT-FOUND
  )
)

(define-read-only (is-arb-timed-out (id (string-ascii 64)))
  (match (map-get? agreements id)
    agreement (ok
      (and
        (is-eq (get state agreement) STATE-DISPUTED)
        (> (get dispute-block agreement) u0)
        (>= block-height (+ (get dispute-block agreement) ARB-TIMEOUT-BLOCKS))
      )
    )
    ERR-NOT-FOUND
  )
)

;; ============================================================
;; CREATE-AGREEMENT
;; Anyone can create. No owner permission needed.
;; ============================================================

(define-public (create-agreement
    (id  (string-ascii 64))
    (a   principal)
    (b   principal)
    (arb principal)
    (amt uint)
  )
  (begin
    (asserts! (>= amt MIN-AMOUNT)                           ERR-INVALID-AMOUNT)
    (asserts! (not (is-eq a b))                             ERR-NOT-AUTHORIZED)
    (asserts! (is-none (map-get? agreements id))            ERR-WRONG-STATE)

    (map-set agreements id {
      state:             STATE-PENDING,
      party-a:           a,
      party-b:           b,
      arbitrator:        arb,
      amount-per-party:  amt,
      party-a-deposited: false,
      party-b-deposited: false,
      deadline-block:    u0,
      dispute-block:     u0
    })

    (print {
      event:        "created",
      agreement-id: id,
      party-a:      a,
      party-b:      b,
      arbitrator:   arb,
      amount:       amt
    })

    (ok true)
  )
)

;; ============================================================
;; DEPOSIT
;; Each party deposits once. Both deposited → ACTIVE.
;; ============================================================

(define-public (deposit (id (string-ascii 64)))
  (let (
    (agreement (unwrap! (map-get? agreements id) ERR-NOT-FOUND))
    (caller    tx-sender)
    (amt       (get amount-per-party agreement))
  )
    (asserts! (is-eq (get state agreement) STATE-PENDING) ERR-WRONG-STATE)
    (asserts!
      (or (is-eq caller (get party-a agreement))
          (is-eq caller (get party-b agreement)))
      ERR-NOT-PARTY
    )

    (if (is-eq caller (get party-a agreement))
      (begin
        (asserts! (not (get party-a-deposited agreement)) ERR-ALREADY-DEPOSITED)
        (try! (stx-transfer? amt caller (as-contract tx-sender)))
        (map-set agreements id (merge agreement { party-a-deposited: true }))
      )
      (begin
        (asserts! (not (get party-b-deposited agreement)) ERR-ALREADY-DEPOSITED)
        (try! (stx-transfer? amt caller (as-contract tx-sender)))
        (map-set agreements id (merge agreement { party-b-deposited: true }))
      )
    )

    (let ((updated (unwrap! (map-get? agreements id) ERR-NOT-FOUND)))
      (if (and (get party-a-deposited updated) (get party-b-deposited updated))
        (map-set agreements id (merge updated {
          state:          STATE-ACTIVE,
          deadline-block: (+ block-height TIMEOUT-BLOCKS)
        }))
        false
      )
    )

    (print {
      event:        "deposit",
      agreement-id: id,
      by:           caller,
      amount:       amt
    })

    (ok { deposited-by: caller, amount: amt })
  )
)

;; ============================================================
;; COMPLETE
;; Party B confirms delivery → full balance to Party A.
;; ============================================================

(define-public (complete (id (string-ascii 64)))
  (let (
    (agreement (unwrap! (map-get? agreements id) ERR-NOT-FOUND))
    (bal       (* (get amount-per-party agreement) u2))
  )
    (asserts! (is-eq (get state agreement) STATE-ACTIVE)          ERR-WRONG-STATE)
    (asserts! (is-eq tx-sender (get party-b agreement))           ERR-NOT-AUTHORIZED)
    (asserts! (< block-height (get deadline-block agreement))     ERR-TIMEOUT-ACTIVE)

    (try! (as-contract (stx-transfer? bal tx-sender (get party-a agreement))))
    (map-set agreements id (merge agreement { state: STATE-COMPLETE }))

    (print {
      event:        "complete",
      agreement-id: id,
      released-to:  (get party-a agreement),
      amount:       bal
    })

    (ok { released-to: (get party-a agreement), amount: bal })
  )
)

;; ============================================================
;; REFUND
;; Only Party A voluntarily cancels → balance back to Party B.
;; ============================================================

(define-public (refund (id (string-ascii 64)))
  (let (
    (agreement (unwrap! (map-get? agreements id) ERR-NOT-FOUND))
    (bal       (* (get amount-per-party agreement) u2))
  )
    (asserts! (is-eq (get state agreement) STATE-ACTIVE)  ERR-WRONG-STATE)
    (asserts! (is-eq tx-sender (get party-a agreement))   ERR-NOT-AUTHORIZED)

    (try! (as-contract (stx-transfer? bal tx-sender (get party-b agreement))))
    (map-set agreements id (merge agreement { state: STATE-REFUNDED }))

    (print {
      event:        "refund",
      agreement-id: id,
      refunded-to:  (get party-b agreement),
      amount:       bal
    })

    (ok { refunded-to: (get party-b agreement), amount: bal })
  )
)

;; ============================================================
;; TRIGGER-TIMEOUT
;; Anyone can call after 72hr deadline. Refunds Party B.
;; ============================================================

(define-public (trigger-timeout (id (string-ascii 64)))
  (let (
    (agreement (unwrap! (map-get? agreements id) ERR-NOT-FOUND))
    (bal       (* (get amount-per-party agreement) u2))
  )
    (asserts! (is-eq (get state agreement) STATE-ACTIVE)           ERR-WRONG-STATE)
    (asserts! (>= block-height (get deadline-block agreement))     ERR-TIMEOUT-NOT-MET)

    (try! (as-contract (stx-transfer? bal tx-sender (get party-b agreement))))
    (map-set agreements id (merge agreement { state: STATE-REFUNDED }))

    (print {
      event:        "timeout",
      agreement-id: id,
      refunded-to:  (get party-b agreement),
      amount:       bal
    })

    (ok { refunded-to: (get party-b agreement), amount: bal })
  )
)

;; ============================================================
;; DISPUTE
;; Either party opens dispute → STATE-DISPUTED.
;; ============================================================

(define-public (dispute (id (string-ascii 64)))
  (let ((agreement (unwrap! (map-get? agreements id) ERR-NOT-FOUND)))
    (asserts! (is-eq (get state agreement) STATE-ACTIVE) ERR-WRONG-STATE)
    (asserts!
      (or (is-eq tx-sender (get party-a agreement))
          (is-eq tx-sender (get party-b agreement)))
      ERR-NOT-PARTY
    )

    (map-set agreements id (merge agreement {
      state:         STATE-DISPUTED,
      dispute-block: block-height
    }))

    (print {
      event:        "dispute",
      agreement-id: id,
      opened-by:    tx-sender,
      arbitrator:   (get arbitrator agreement)
    })

    (ok { arbitrator: (get arbitrator agreement) })
  )
)

;; ============================================================
;; RESOLVE-TO-A
;; Arbitrator rules for Party A.
;; ============================================================

(define-public (resolve-to-a (id (string-ascii 64)))
  (let (
    (agreement (unwrap! (map-get? agreements id) ERR-NOT-FOUND))
    (bal       (* (get amount-per-party agreement) u2))
  )
    (asserts! (is-eq (get state agreement) STATE-DISPUTED)  ERR-WRONG-STATE)
    (asserts! (is-eq tx-sender (get arbitrator agreement))  ERR-NOT-ARBITRATOR)

    (try! (as-contract (stx-transfer? bal tx-sender (get party-a agreement))))
    (map-set agreements id (merge agreement { state: STATE-COMPLETE }))

    (print {
      event:        "resolved",
      agreement-id: id,
      winner:       (get party-a agreement),
      amount:       bal
    })

    (ok { released-to: (get party-a agreement), amount: bal })
  )
)

;; ============================================================
;; RESOLVE-TO-B
;; Arbitrator rules for Party B.
;; ============================================================

(define-public (resolve-to-b (id (string-ascii 64)))
  (let (
    (agreement (unwrap! (map-get? agreements id) ERR-NOT-FOUND))
    (bal       (* (get amount-per-party agreement) u2))
  )
    (asserts! (is-eq (get state agreement) STATE-DISPUTED)  ERR-WRONG-STATE)
    (asserts! (is-eq tx-sender (get arbitrator agreement))  ERR-NOT-ARBITRATOR)

    (try! (as-contract (stx-transfer? bal tx-sender (get party-b agreement))))
    (map-set agreements id (merge agreement { state: STATE-REFUNDED }))

    (print {
      event:        "resolved",
      agreement-id: id,
      winner:       (get party-b agreement),
      amount:       bal
    })

    (ok { refunded-to: (get party-b agreement), amount: bal })
  )
)

;; ============================================================
;; TRIGGER-ARB-TIMEOUT
;; Anyone calls if arbitrator inactive 48hr. Refunds Party B.
;; ============================================================

(define-public (trigger-arb-timeout (id (string-ascii 64)))
  (let (
    (agreement (unwrap! (map-get? agreements id) ERR-NOT-FOUND))
    (bal       (* (get amount-per-party agreement) u2))
  )
    (asserts! (is-eq (get state agreement) STATE-DISPUTED) ERR-WRONG-STATE)
    (asserts!
      (>= block-height (+ (get dispute-block agreement) ARB-TIMEOUT-BLOCKS))
      ERR-TIMEOUT-NOT-MET
    )

    (try! (as-contract (stx-transfer? bal tx-sender (get party-b agreement))))
    (map-set agreements id (merge agreement { state: STATE-REFUNDED }))

    (print {
      event:        "arb-timeout",
      agreement-id: id,
      refunded-to:  (get party-b agreement),
      amount:       bal
    })

    (ok { refunded-to: (get party-b agreement), amount: bal })
  )
)