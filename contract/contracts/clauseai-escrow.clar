(define-constant ERR-NOT-AUTHORIZED    (err u100))
(define-constant ERR-WRONG-STATE       (err u101))
(define-constant ERR-ALREADY-DEPOSITED (err u102))
(define-constant ERR-INVALID-AMOUNT    (err u103))
(define-constant ERR-NOT-PARTY         (err u104))
(define-constant ERR-NOT-ARBITRATOR    (err u105))
(define-constant ERR-NOT-FOUND         (err u106))
(define-constant ERR-TIMEOUT-NOT-MET   (err u107))
(define-constant ERR-TIMEOUT-ACTIVE    (err u108))
(define-constant ERR-ZERO-BALANCE      (err u109))


(define-constant STATE-PENDING  u0)
(define-constant STATE-ACTIVE   u1)
(define-constant STATE-COMPLETE u2)
(define-constant STATE-REFUNDED u3)
(define-constant STATE-DISPUTED u4)

(define-constant TIMEOUT-BLOCKS     u432)  ;; 72 hours
(define-constant ARB-TIMEOUT-BLOCKS u288)  ;; 48 hours

(define-constant MIN-AMOUNT u1000)

(define-data-var contract-owner principal tx-sender)


(define-map agreements
  (string-ascii 64)
  {
    state:              uint,
    party-a:            principal,
    party-b:            principal,
    arbitrator:         principal,
    amount-per-party:   uint,
    party-a-deposited:  bool,
    party-b-deposited:  bool,
    party-a-amount:     uint,  
    party-b-amount:     uint,   
    total-deposited:    uint,  
    deadline-block:     uint,
    dispute-block:      uint
  }
)


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

(define-read-only (get-total-deposited (id (string-ascii 64)))
  (match (map-get? agreements id)
    agreement (ok (get total-deposited agreement))
    ERR-NOT-FOUND
  )
)

(define-read-only (is-timed-out (id (string-ascii 64)))
  (match (map-get? agreements id)
    agreement (ok
      (and
        (is-eq (get state agreement) STATE-ACTIVE)
        (>= stacks-block-height (get deadline-block agreement))
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
        (>= stacks-block-height (+ (get dispute-block agreement) ARB-TIMEOUT-BLOCKS))
      )
    )
    ERR-NOT-FOUND
  )
)


(define-public (create-agreement
    (id  (string-ascii 64))
    (a   principal)
    (b   principal)
    (arb principal)
    (amt uint)
  )
  (begin
    (asserts! (>= amt MIN-AMOUNT)                ERR-INVALID-AMOUNT)
    (asserts! (not (is-eq a b))                  ERR-NOT-AUTHORIZED)
    (asserts! (is-none (map-get? agreements id)) ERR-WRONG-STATE)

    (map-set agreements id {
      state:             STATE-PENDING,
      party-a:           a,
      party-b:           b,
      arbitrator:        arb,
      amount-per-party:  amt,
      party-a-deposited: false,
      party-b-deposited: false,
      party-a-amount:    u0,
      party-b-amount:    u0,
      total-deposited:   u0,
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
        (map-set agreements id (merge agreement {
          party-a-deposited: true,
          party-a-amount:    amt,
          total-deposited:   (+ (get total-deposited agreement) amt)
        }))
      )
      (begin
        (asserts! (not (get party-b-deposited agreement)) ERR-ALREADY-DEPOSITED)
        (try! (stx-transfer? amt caller (as-contract tx-sender)))
        (map-set agreements id (merge agreement {
          party-b-deposited: true,
          party-b-amount:    amt,
          total-deposited:   (+ (get total-deposited agreement) amt)
        }))
      )
    )

    (let ((updated (unwrap! (map-get? agreements id) ERR-NOT-FOUND)))
      (if (and (get party-a-deposited updated) (get party-b-deposited updated))
        (map-set agreements id (merge updated {
          state:          STATE-ACTIVE,
          deadline-block: (+ stacks-block-height TIMEOUT-BLOCKS)
        }))
        false
      )
    )

    (print {
      event:           "deposit",
      agreement-id:    id,
      by:              caller,
      amount:          amt,
      total-deposited: (get total-deposited (unwrap! (map-get? agreements id) ERR-NOT-FOUND))
    })

    (ok { deposited-by: caller, amount: amt })
  )
)


(define-public (cancel-deposit (id (string-ascii 64)))
  (let (
    (agreement (unwrap! (map-get? agreements id) ERR-NOT-FOUND))
    (caller    tx-sender)
  )
    ;; Only valid while PENDING (one party deposited, other hasn't)
    (asserts! (is-eq (get state agreement) STATE-PENDING) ERR-WRONG-STATE)
    (asserts!
      (or (is-eq caller (get party-a agreement))
          (is-eq caller (get party-b agreement)))
      ERR-NOT-PARTY
    )

    (if (is-eq caller (get party-a agreement))
      (begin
        ;; Party A can only cancel their own deposit
        (asserts! (get party-a-deposited agreement) ERR-WRONG-STATE)
        (let ((refund-amt (get party-a-amount agreement)))
          (asserts! (> refund-amt u0) ERR-ZERO-BALANCE)
          (try! (as-contract (stx-transfer? refund-amt tx-sender caller)))
          (map-set agreements id (merge agreement {
            party-a-deposited: false,
            party-a-amount:    u0,
            total-deposited:   (- (get total-deposited agreement) refund-amt)
          }))
          (print {
            event:        "cancel-deposit",
            agreement-id: id,
            by:           caller,
            refunded:     refund-amt
          })
          (ok { refunded: refund-amt })
        )
      )
      (begin
        ;; Party B can only cancel their own deposit
        (asserts! (get party-b-deposited agreement) ERR-WRONG-STATE)
        (let ((refund-amt (get party-b-amount agreement)))
          (asserts! (> refund-amt u0) ERR-ZERO-BALANCE)
          (try! (as-contract (stx-transfer? refund-amt tx-sender caller)))
          (map-set agreements id (merge agreement {
            party-b-deposited: false,
            party-b-amount:    u0,
            total-deposited:   (- (get total-deposited agreement) refund-amt)
          }))
          (print {
            event:        "cancel-deposit",
            agreement-id: id,
            by:           caller,
            refunded:     refund-amt
          })
          (ok { refunded: refund-amt })
        )
      )
    )
  )
)


(define-public (complete (id (string-ascii 64)))
  (let (
    (agreement (unwrap! (map-get? agreements id) ERR-NOT-FOUND))
    (bal       (get total-deposited agreement))
  )
    (asserts! (is-eq (get state agreement) STATE-ACTIVE)      ERR-WRONG-STATE)
    (asserts! (is-eq tx-sender (get party-b agreement))       ERR-NOT-AUTHORIZED)
    (asserts! (< stacks-block-height (get deadline-block agreement)) ERR-TIMEOUT-ACTIVE)
    (asserts! (> bal u0)                                      ERR-ZERO-BALANCE)

    (try! (as-contract (stx-transfer? bal tx-sender (get party-a agreement))))
    (map-set agreements id (merge agreement {
      state:           STATE-COMPLETE,
      total-deposited: u0
    }))

    (print {
      event:        "complete",
      agreement-id: id,
      released-to:  (get party-a agreement),
      amount:       bal
    })

    (ok { released-to: (get party-a agreement), amount: bal })
  )
)


(define-public (refund (id (string-ascii 64)))
  (let (
    (agreement (unwrap! (map-get? agreements id) ERR-NOT-FOUND))
    (bal       (get total-deposited agreement))
  )
    (asserts! (is-eq (get state agreement) STATE-ACTIVE) ERR-WRONG-STATE)
    (asserts! (is-eq tx-sender (get party-a agreement))  ERR-NOT-AUTHORIZED)
    (asserts! (> bal u0)                                 ERR-ZERO-BALANCE)

    (try! (as-contract (stx-transfer? bal tx-sender (get party-b agreement))))
    (map-set agreements id (merge agreement {
      state:           STATE-REFUNDED,
      total-deposited: u0
    }))

    (print {
      event:        "refund",
      agreement-id: id,
      refunded-to:  (get party-b agreement),
      amount:       bal
    })

    (ok { refunded-to: (get party-b agreement), amount: bal })
  )
)


(define-public (trigger-timeout (id (string-ascii 64)))
  (let (
    (agreement (unwrap! (map-get? agreements id) ERR-NOT-FOUND))
    (bal       (get total-deposited agreement))
  )
    (asserts! (is-eq (get state agreement) STATE-ACTIVE)        ERR-WRONG-STATE)
    (asserts! (>= stacks-block-height (get deadline-block agreement))  ERR-TIMEOUT-NOT-MET)
    (asserts! (> bal u0)                                        ERR-ZERO-BALANCE)

    (try! (as-contract (stx-transfer? bal tx-sender (get party-b agreement))))
    (map-set agreements id (merge agreement {
      state:           STATE-REFUNDED,
      total-deposited: u0
    }))

    (print {
      event:        "timeout",
      agreement-id: id,
      refunded-to:  (get party-b agreement),
      amount:       bal
    })

    (ok { refunded-to: (get party-b agreement), amount: bal })
  )
)


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
      dispute-block: stacks-block-height
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


(define-public (resolve-to-a (id (string-ascii 64)))
  (let (
    (agreement (unwrap! (map-get? agreements id) ERR-NOT-FOUND))
    (bal       (get total-deposited agreement))
  )
    (asserts! (is-eq (get state agreement) STATE-DISPUTED) ERR-WRONG-STATE)
    (asserts! (is-eq tx-sender (get arbitrator agreement)) ERR-NOT-ARBITRATOR)
    (asserts! (> bal u0)                                   ERR-ZERO-BALANCE)

    (try! (as-contract (stx-transfer? bal tx-sender (get party-a agreement))))
    (map-set agreements id (merge agreement {
      state:           STATE-COMPLETE,
      total-deposited: u0
    }))

    (print {
      event:        "resolved",
      agreement-id: id,
      winner:       (get party-a agreement),
      amount:       bal
    })

    (ok { released-to: (get party-a agreement), amount: bal })
  )
)


(define-public (resolve-to-b (id (string-ascii 64)))
  (let (
    (agreement (unwrap! (map-get? agreements id) ERR-NOT-FOUND))
    (bal       (get total-deposited agreement))
  )
    (asserts! (is-eq (get state agreement) STATE-DISPUTED) ERR-WRONG-STATE)
    (asserts! (is-eq tx-sender (get arbitrator agreement)) ERR-NOT-ARBITRATOR)
    (asserts! (> bal u0)                                   ERR-ZERO-BALANCE)

    (try! (as-contract (stx-transfer? bal tx-sender (get party-b agreement))))
    (map-set agreements id (merge agreement {
      state:           STATE-REFUNDED,
      total-deposited: u0
    }))

    (print {
      event:        "resolved",
      agreement-id: id,
      winner:       (get party-b agreement),
      amount:       bal
    })

    (ok { refunded-to: (get party-b agreement), amount: bal })
  )
)


(define-public (trigger-arb-timeout (id (string-ascii 64)))
  (let (
    (agreement (unwrap! (map-get? agreements id) ERR-NOT-FOUND))
    (bal       (get total-deposited agreement))
  )
    (asserts! (is-eq (get state agreement) STATE-DISPUTED) ERR-WRONG-STATE)
    (asserts!
      (>= stacks-block-height (+ (get dispute-block agreement) ARB-TIMEOUT-BLOCKS))
      ERR-TIMEOUT-NOT-MET
    )
    (asserts! (> bal u0) ERR-ZERO-BALANCE)

    (try! (as-contract (stx-transfer? bal tx-sender (get party-b agreement))))
    (map-set agreements id (merge agreement {
      state:           STATE-REFUNDED,
      total-deposited: u0
    }))

    (print {
      event:        "arb-timeout",
      agreement-id: id,
      refunded-to:  (get party-b agreement),
      amount:       bal
    })

    (ok { refunded-to: (get party-b agreement), amount: bal })
  )
)