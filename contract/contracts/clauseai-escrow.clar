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

(define-constant TIMEOUT-BLOCKS     u432)
(define-constant ARB-TIMEOUT-BLOCKS u288)

(define-constant MIN-AMOUNT u1000)  

(define-data-var contract-owner principal tx-sender)


(define-map agreements
  (string-ascii 64)
  {
    state:           uint,
    party-a:         principal,
    party-b:         principal,
    arbitrator:      principal,
    amount:          uint,
    deposited:       bool,
    total-deposited: uint,
    deadline-block:  uint,
    dispute-block:   uint
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
      state:           STATE-PENDING,
      party-a:         a,
      party-b:         b,
      arbitrator:      arb,
      amount:          amt,
      deposited:       false,
      total-deposited: u0,
      deadline-block:  u0,
      dispute-block:   u0
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
    (amt       (get amount agreement))
  )
    (asserts! (is-eq (get state agreement) STATE-PENDING) ERR-WRONG-STATE)
    (asserts! (is-eq caller (get party-a agreement))      ERR-NOT-AUTHORIZED)
    (asserts! (not (get deposited agreement))             ERR-ALREADY-DEPOSITED)

    (try! (stx-transfer? amt caller (as-contract tx-sender)))

    (map-set agreements id (merge agreement {
      deposited:       true,
      total-deposited: amt,
      state:           STATE-ACTIVE,
      deadline-block:  (+ stacks-block-height TIMEOUT-BLOCKS)
    }))

    (print {
      event:          "deposit",
      agreement-id:   id,
      by:             caller,
      amount:         amt,
      deadline-block: (+ stacks-block-height TIMEOUT-BLOCKS)
    })

    (ok { deposited-by: caller, amount: amt })
  )
)


(define-public (cancel-agreement (id (string-ascii 64)))
  (let (
    (agreement (unwrap! (map-get? agreements id) ERR-NOT-FOUND))
    (caller    tx-sender)
  )
    (asserts! (is-eq (get state agreement) STATE-PENDING) ERR-WRONG-STATE)
    (asserts! (is-eq caller (get party-a agreement))      ERR-NOT-AUTHORIZED)

    (map-set agreements id (merge agreement {
      state: STATE-REFUNDED
    }))

    (print {
      event:        "cancelled",
      agreement-id: id,
      by:           caller
    })

    (ok { cancelled: true })
  )
)


(define-public (complete (id (string-ascii 64)))
  (let (
    (agreement (unwrap! (map-get? agreements id) ERR-NOT-FOUND))
    (bal       (get total-deposited agreement))
  )
    (asserts! (is-eq (get state agreement) STATE-ACTIVE)                     ERR-WRONG-STATE)
    (asserts! (is-eq tx-sender (get party-a agreement))                      ERR-NOT-AUTHORIZED)
    (asserts! (< stacks-block-height (get deadline-block agreement))         ERR-TIMEOUT-ACTIVE)
    (asserts! (> bal u0)                                                     ERR-ZERO-BALANCE)

    (try! (as-contract (stx-transfer? bal tx-sender (get party-b agreement))))

    (map-set agreements id (merge agreement {
      state:           STATE-COMPLETE,
      total-deposited: u0
    }))

    (print {
      event:        "complete",
      agreement-id: id,
      released-to:  (get party-b agreement),
      amount:       bal
    })

    (ok { released-to: (get party-b agreement), amount: bal })
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

    (try! (as-contract (stx-transfer? bal tx-sender (get party-a agreement))))

    (map-set agreements id (merge agreement {
      state:           STATE-REFUNDED,
      total-deposited: u0
    }))

    (print {
      event:        "refund",
      agreement-id: id,
      refunded-to:  (get party-a agreement),
      amount:       bal
    })

    (ok { refunded-to: (get party-a agreement), amount: bal })
  )
)


(define-public (trigger-timeout (id (string-ascii 64)))
  (let (
    (agreement (unwrap! (map-get? agreements id) ERR-NOT-FOUND))
    (bal       (get total-deposited agreement))
  )
    (asserts! (is-eq (get state agreement) STATE-ACTIVE)              ERR-WRONG-STATE)
    (asserts! (>= stacks-block-height (get deadline-block agreement)) ERR-TIMEOUT-NOT-MET)
    (asserts! (> bal u0)                                              ERR-ZERO-BALANCE)

    (try! (as-contract (stx-transfer? bal tx-sender (get party-a agreement))))

    (map-set agreements id (merge agreement {
      state:           STATE-REFUNDED,
      total-deposited: u0
    }))

    (print {
      event:        "timeout",
      agreement-id: id,
      refunded-to:  (get party-a agreement),
      amount:       bal
    })

    (ok { refunded-to: (get party-a agreement), amount: bal })
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


(define-public (resolve-to-receiver (id (string-ascii 64)))
  (let (
    (agreement (unwrap! (map-get? agreements id) ERR-NOT-FOUND))
    (bal       (get total-deposited agreement))
  )
    (asserts! (is-eq (get state agreement) STATE-DISPUTED) ERR-WRONG-STATE)
    (asserts! (is-eq tx-sender (get arbitrator agreement)) ERR-NOT-ARBITRATOR)
    (asserts! (> bal u0)                                   ERR-ZERO-BALANCE)

    (try! (as-contract (stx-transfer? bal tx-sender (get party-b agreement))))

    (map-set agreements id (merge agreement {
      state:           STATE-COMPLETE,
      total-deposited: u0
    }))

    (print {
      event:        "resolved",
      agreement-id: id,
      winner:       (get party-b agreement),
      amount:       bal
    })

    (ok { released-to: (get party-b agreement), amount: bal })
  )
)


(define-public (resolve-to-payer (id (string-ascii 64)))
  (let (
    (agreement (unwrap! (map-get? agreements id) ERR-NOT-FOUND))
    (bal       (get total-deposited agreement))
  )
    (asserts! (is-eq (get state agreement) STATE-DISPUTED) ERR-WRONG-STATE)
    (asserts! (is-eq tx-sender (get arbitrator agreement)) ERR-NOT-ARBITRATOR)
    (asserts! (> bal u0)                                   ERR-ZERO-BALANCE)

    (try! (as-contract (stx-transfer? bal tx-sender (get party-a agreement))))

    (map-set agreements id (merge agreement {
      state:           STATE-REFUNDED,
      total-deposited: u0
    }))

    (print {
      event:        "resolved",
      agreement-id: id,
      winner:       (get party-a agreement),
      amount:       bal
    })

    (ok { refunded-to: (get party-a agreement), amount: bal })
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

    (try! (as-contract (stx-transfer? bal tx-sender (get party-a agreement))))

    (map-set agreements id (merge agreement {
      state:           STATE-REFUNDED,
      total-deposited: u0
    }))

    (print {
      event:        "arb-timeout",
      agreement-id: id,
      refunded-to:  (get party-a agreement),
      amount:       bal
    })

    (ok { refunded-to: (get party-a agreement), amount: bal })
  )
)