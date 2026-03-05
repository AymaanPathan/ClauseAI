
(define-constant ERR-NOT-AUTHORIZED      (err u100))
(define-constant ERR-WRONG-STATE         (err u101))
(define-constant ERR-ALREADY-DEPOSITED   (err u102))
(define-constant ERR-INVALID-AMOUNT      (err u103))
(define-constant ERR-NOT-PARTY           (err u104))
(define-constant ERR-NOT-ARBITRATOR      (err u105))
(define-constant ERR-NOT-FOUND           (err u106))
(define-constant ERR-TIMEOUT-NOT-MET     (err u107))
(define-constant ERR-TIMEOUT-ACTIVE      (err u108))
(define-constant ERR-ZERO-BALANCE        (err u109))
(define-constant ERR-INVALID-MILESTONES  (err u110))
(define-constant ERR-INVALID-PERCENTAGES (err u111))
(define-constant ERR-MILESTONE-NOT-FOUND (err u112))

(define-constant STATE-PENDING  u0)
(define-constant STATE-ACTIVE   u1)
(define-constant STATE-COMPLETE u2)
(define-constant STATE-REFUNDED u3)
(define-constant STATE-DISPUTED u4)

(define-constant MS-PENDING  u0)
(define-constant MS-ACTIVE   u1)
(define-constant MS-COMPLETE u2)
(define-constant MS-REFUNDED u3)
(define-constant MS-DISPUTED u4)

(define-constant ARB-TIMEOUT-BLOCKS u288)
(define-constant MIN-AMOUNT         u1000)
(define-constant MAX-MILESTONES     u10)

(define-data-var contract-owner principal tx-sender)

(define-map agreements
  (string-ascii 64)
  {
    state:           uint,
    party-a:         principal,
    party-b:         principal,
    arbitrator:      principal,
    total-amount:    uint,
    deposited:       bool,
    total-deposited: uint,
    milestone-count: uint,
    created-at:      uint
  }
)

(define-map milestones
  { agreement-id: (string-ascii 64), index: uint }
  {
    percentage:     uint,
    amount:         uint,
    status:         uint,
    deadline-block: uint,
    dispute-block:  uint
  }
)


(define-read-only (get-owner)
  (var-get contract-owner)
)

(define-read-only (get-agreement (id (string-ascii 64)))
  (map-get? agreements id)
)

(define-read-only (get-milestone (id (string-ascii 64)) (index uint))
  (map-get? milestones { agreement-id: id, index: index })
)

(define-read-only (get-state (id (string-ascii 64)))
  (match (map-get? agreements id)
    agreement (ok (get state agreement))
    ERR-NOT-FOUND
  )
)

(define-read-only (get-milestone-status (id (string-ascii 64)) (index uint))
  (match (map-get? milestones { agreement-id: id, index: index })
    ms (ok (get status ms))
    ERR-MILESTONE-NOT-FOUND
  )
)

(define-read-only (get-status (id (string-ascii 64)))
  (let (
    (agreement (unwrap! (map-get? agreements id) ERR-NOT-FOUND))
  )
    (ok {
      agreement: agreement,

      milestones: {
        m0: (map-get? milestones { agreement-id: id, index: u0 }),
        m1: (map-get? milestones { agreement-id: id, index: u1 }),
        m2: (map-get? milestones { agreement-id: id, index: u2 }),
        m3: (map-get? milestones { agreement-id: id, index: u3 }),
        m4: (map-get? milestones { agreement-id: id, index: u4 }),
        m5: (map-get? milestones { agreement-id: id, index: u5 }),
        m6: (map-get? milestones { agreement-id: id, index: u6 }),
        m7: (map-get? milestones { agreement-id: id, index: u7 }),
        m8: (map-get? milestones { agreement-id: id, index: u8 }),
        m9: (map-get? milestones { agreement-id: id, index: u9 })
      }
    })
  )
)


(define-read-only (is-milestone-timed-out (id (string-ascii 64)) (index uint))
  (match (map-get? milestones { agreement-id: id, index: index })
    ms (ok
      (and
        (is-eq (get status ms) MS-ACTIVE)
        (> (get deadline-block ms) u0)
        (>= stacks-block-height (get deadline-block ms))
      )
    )
    ERR-MILESTONE-NOT-FOUND
  )
)

(define-read-only (is-arb-timed-out (id (string-ascii 64)) (index uint))
  (match (map-get? milestones { agreement-id: id, index: index })
    ms (ok
      (and
        (is-eq (get status ms) MS-DISPUTED)
        (> (get dispute-block ms) u0)
        (>= stacks-block-height (+ (get dispute-block ms) ARB-TIMEOUT-BLOCKS))
      )
    )
    ERR-MILESTONE-NOT-FOUND
  )
)


(define-private (validate-percentages (id (string-ascii 64)) (count uint))
  (let (
    (p0 (default-to u0 (get percentage (map-get? milestones { agreement-id: id, index: u0 }))))
    (p1 (default-to u0 (get percentage (map-get? milestones { agreement-id: id, index: u1 }))))
    (p2 (default-to u0 (get percentage (map-get? milestones { agreement-id: id, index: u2 }))))
    (p3 (default-to u0 (get percentage (map-get? milestones { agreement-id: id, index: u3 }))))
    (p4 (default-to u0 (get percentage (map-get? milestones { agreement-id: id, index: u4 }))))
    (p5 (default-to u0 (get percentage (map-get? milestones { agreement-id: id, index: u5 }))))
    (p6 (default-to u0 (get percentage (map-get? milestones { agreement-id: id, index: u6 }))))
    (p7 (default-to u0 (get percentage (map-get? milestones { agreement-id: id, index: u7 }))))
    (p8 (default-to u0 (get percentage (map-get? milestones { agreement-id: id, index: u8 }))))
    (p9 (default-to u0 (get percentage (map-get? milestones { agreement-id: id, index: u9 }))))
    (total (+ p0 p1 p2 p3 p4 p5 p6 p7 p8 p9))
  )
    (is-eq total u10000)
  )
)

(define-private (all-milestones-resolved (id (string-ascii 64)) (count uint))
  (let (
    (s0 (default-to MS-COMPLETE (get status (map-get? milestones { agreement-id: id, index: u0 }))))
    (s1 (if (> count u1) (default-to MS-COMPLETE (get status (map-get? milestones { agreement-id: id, index: u1 }))) MS-COMPLETE))
    (s2 (if (> count u2) (default-to MS-COMPLETE (get status (map-get? milestones { agreement-id: id, index: u2 }))) MS-COMPLETE))
    (s3 (if (> count u3) (default-to MS-COMPLETE (get status (map-get? milestones { agreement-id: id, index: u3 }))) MS-COMPLETE))
    (s4 (if (> count u4) (default-to MS-COMPLETE (get status (map-get? milestones { agreement-id: id, index: u4 }))) MS-COMPLETE))
    (s5 (if (> count u5) (default-to MS-COMPLETE (get status (map-get? milestones { agreement-id: id, index: u5 }))) MS-COMPLETE))
    (s6 (if (> count u6) (default-to MS-COMPLETE (get status (map-get? milestones { agreement-id: id, index: u6 }))) MS-COMPLETE))
    (s7 (if (> count u7) (default-to MS-COMPLETE (get status (map-get? milestones { agreement-id: id, index: u7 }))) MS-COMPLETE))
    (s8 (if (> count u8) (default-to MS-COMPLETE (get status (map-get? milestones { agreement-id: id, index: u8 }))) MS-COMPLETE))
    (s9 (if (> count u9) (default-to MS-COMPLETE (get status (map-get? milestones { agreement-id: id, index: u9 }))) MS-COMPLETE))
  )
    (and
      (or (is-eq s0 MS-COMPLETE) (is-eq s0 MS-REFUNDED))
      (or (is-eq s1 MS-COMPLETE) (is-eq s1 MS-REFUNDED))
      (or (is-eq s2 MS-COMPLETE) (is-eq s2 MS-REFUNDED))
      (or (is-eq s3 MS-COMPLETE) (is-eq s3 MS-REFUNDED))
      (or (is-eq s4 MS-COMPLETE) (is-eq s4 MS-REFUNDED))
      (or (is-eq s5 MS-COMPLETE) (is-eq s5 MS-REFUNDED))
      (or (is-eq s6 MS-COMPLETE) (is-eq s6 MS-REFUNDED))
      (or (is-eq s7 MS-COMPLETE) (is-eq s7 MS-REFUNDED))
      (or (is-eq s8 MS-COMPLETE) (is-eq s8 MS-REFUNDED))
      (or (is-eq s9 MS-COMPLETE) (is-eq s9 MS-REFUNDED))
    )
  )
)


(define-public (create-agreement
    (id    (string-ascii 64))
    (a     principal)
    (b     principal)
    (arb   principal)
    (amt   uint)
    (count uint)
    (pct-0 uint) (dl-0 uint)
    (pct-1 uint) (dl-1 uint)
    (pct-2 uint) (dl-2 uint)
    (pct-3 uint) (dl-3 uint)
    (pct-4 uint) (dl-4 uint)
    (pct-5 uint) (dl-5 uint)
    (pct-6 uint) (dl-6 uint)
    (pct-7 uint) (dl-7 uint)
    (pct-8 uint) (dl-8 uint)
    (pct-9 uint) (dl-9 uint)
  )
  (begin
    (asserts! (>= amt MIN-AMOUNT)                              ERR-INVALID-AMOUNT)
    (asserts! (not (is-eq a b))                                ERR-NOT-AUTHORIZED)
    (asserts! (is-none (map-get? agreements id))               ERR-WRONG-STATE)
    (asserts! (and (>= count u1) (<= count MAX-MILESTONES))    ERR-INVALID-MILESTONES)

    (map-set milestones { agreement-id: id, index: u0 }
      { percentage: pct-0, amount: u0, status: MS-PENDING, deadline-block: dl-0, dispute-block: u0 })
    (map-set milestones { agreement-id: id, index: u1 }
      { percentage: pct-1, amount: u0, status: MS-PENDING, deadline-block: dl-1, dispute-block: u0 })
    (map-set milestones { agreement-id: id, index: u2 }
      { percentage: pct-2, amount: u0, status: MS-PENDING, deadline-block: dl-2, dispute-block: u0 })
    (map-set milestones { agreement-id: id, index: u3 }
      { percentage: pct-3, amount: u0, status: MS-PENDING, deadline-block: dl-3, dispute-block: u0 })
    (map-set milestones { agreement-id: id, index: u4 }
      { percentage: pct-4, amount: u0, status: MS-PENDING, deadline-block: dl-4, dispute-block: u0 })
    (map-set milestones { agreement-id: id, index: u5 }
      { percentage: pct-5, amount: u0, status: MS-PENDING, deadline-block: dl-5, dispute-block: u0 })
    (map-set milestones { agreement-id: id, index: u6 }
      { percentage: pct-6, amount: u0, status: MS-PENDING, deadline-block: dl-6, dispute-block: u0 })
    (map-set milestones { agreement-id: id, index: u7 }
      { percentage: pct-7, amount: u0, status: MS-PENDING, deadline-block: dl-7, dispute-block: u0 })
    (map-set milestones { agreement-id: id, index: u8 }
      { percentage: pct-8, amount: u0, status: MS-PENDING, deadline-block: dl-8, dispute-block: u0 })
    (map-set milestones { agreement-id: id, index: u9 }
      { percentage: pct-9, amount: u0, status: MS-PENDING, deadline-block: dl-9, dispute-block: u0 })

    (asserts! (validate-percentages id count) ERR-INVALID-PERCENTAGES)

    (map-set agreements id {
      state:           STATE-PENDING,
      party-a:         a,
      party-b:         b,
      arbitrator:      arb,
      total-amount:    amt,
      deposited:       false,
      total-deposited: u0,
      milestone-count: count,
      created-at:      stacks-block-height
    })

    (print {
      event:           "created",
      agreement-id:    id,
      party-a:         a,
      party-b:         b,
      arbitrator:      arb,
      total-amount:    amt,
      milestone-count: count
    })

    (ok true)
  )
)


(define-public (deposit (id (string-ascii 64)))
  (let (
    (agreement (unwrap! (map-get? agreements id) ERR-NOT-FOUND))
    (caller    tx-sender)
    (amt       (get total-amount agreement))
    (count     (get milestone-count agreement))
  )
    (asserts! (is-eq (get state agreement) STATE-PENDING) ERR-WRONG-STATE)
    (asserts! (is-eq caller (get party-a agreement))      ERR-NOT-AUTHORIZED)
    (asserts! (not (get deposited agreement))             ERR-ALREADY-DEPOSITED)

    (try! (stx-transfer? amt caller (as-contract tx-sender)))

    (let (
      (ms0    (unwrap! (map-get? milestones { agreement-id: id, index: u0 }) ERR-MILESTONE-NOT-FOUND))
      (alloc0 (/ (* amt (get percentage ms0)) u10000))
    )
      (map-set milestones { agreement-id: id, index: u0 }
        (merge ms0 { amount: alloc0, status: MS-ACTIVE }))
    )

    (if (> count u1)
      (let (
        (ms1    (unwrap! (map-get? milestones { agreement-id: id, index: u1 }) ERR-MILESTONE-NOT-FOUND))
        (alloc1 (/ (* amt (get percentage ms1)) u10000))
      )
        (map-set milestones { agreement-id: id, index: u1 }
          (merge ms1 { amount: alloc1, status: MS-ACTIVE }))
      )
      true
    )

    (if (> count u2)
      (let (
        (ms2    (unwrap! (map-get? milestones { agreement-id: id, index: u2 }) ERR-MILESTONE-NOT-FOUND))
        (alloc2 (/ (* amt (get percentage ms2)) u10000))
      )
        (map-set milestones { agreement-id: id, index: u2 }
          (merge ms2 { amount: alloc2, status: MS-ACTIVE }))
      )
      true
    )

    (if (> count u3)
      (let (
        (ms3    (unwrap! (map-get? milestones { agreement-id: id, index: u3 }) ERR-MILESTONE-NOT-FOUND))
        (alloc3 (/ (* amt (get percentage ms3)) u10000))
      )
        (map-set milestones { agreement-id: id, index: u3 }
          (merge ms3 { amount: alloc3, status: MS-ACTIVE }))
      )
      true
    )

    (if (> count u4)
      (let (
        (ms4    (unwrap! (map-get? milestones { agreement-id: id, index: u4 }) ERR-MILESTONE-NOT-FOUND))
        (alloc4 (/ (* amt (get percentage ms4)) u10000))
      )
        (map-set milestones { agreement-id: id, index: u4 }
          (merge ms4 { amount: alloc4, status: MS-ACTIVE }))
      )
      true
    )

    (if (> count u5)
      (let (
        (ms5    (unwrap! (map-get? milestones { agreement-id: id, index: u5 }) ERR-MILESTONE-NOT-FOUND))
        (alloc5 (/ (* amt (get percentage ms5)) u10000))
      )
        (map-set milestones { agreement-id: id, index: u5 }
          (merge ms5 { amount: alloc5, status: MS-ACTIVE }))
      )
      true
    )

    (if (> count u6)
      (let (
        (ms6    (unwrap! (map-get? milestones { agreement-id: id, index: u6 }) ERR-MILESTONE-NOT-FOUND))
        (alloc6 (/ (* amt (get percentage ms6)) u10000))
      )
        (map-set milestones { agreement-id: id, index: u6 }
          (merge ms6 { amount: alloc6, status: MS-ACTIVE }))
      )
      true
    )

    (if (> count u7)
      (let (
        (ms7    (unwrap! (map-get? milestones { agreement-id: id, index: u7 }) ERR-MILESTONE-NOT-FOUND))
        (alloc7 (/ (* amt (get percentage ms7)) u10000))
      )
        (map-set milestones { agreement-id: id, index: u7 }
          (merge ms7 { amount: alloc7, status: MS-ACTIVE }))
      )
      true
    )

    (if (> count u8)
      (let (
        (ms8    (unwrap! (map-get? milestones { agreement-id: id, index: u8 }) ERR-MILESTONE-NOT-FOUND))
        (alloc8 (/ (* amt (get percentage ms8)) u10000))
      )
        (map-set milestones { agreement-id: id, index: u8 }
          (merge ms8 { amount: alloc8, status: MS-ACTIVE }))
      )
      true
    )

    (if (> count u9)
      (let (
        (ms9    (unwrap! (map-get? milestones { agreement-id: id, index: u9 }) ERR-MILESTONE-NOT-FOUND))
        (alloc9 (/ (* amt (get percentage ms9)) u10000))
      )
        (map-set milestones { agreement-id: id, index: u9 }
          (merge ms9 { amount: alloc9, status: MS-ACTIVE }))
      )
      true
    )

    (map-set agreements id (merge agreement {
      deposited:       true,
      total-deposited: amt,
      state:           STATE-ACTIVE
    }))

    (print {
      event:        "deposit",
      agreement-id: id,
      by:           caller,
      amount:       amt,
      milestones:   count
    })

    (ok { deposited-by: caller, amount: amt, milestones: count })
  )
)


(define-public (complete-milestone (id (string-ascii 64)) (index uint))
  (let (
    (agreement (unwrap! (map-get? agreements id) ERR-NOT-FOUND))
    (ms        (unwrap! (map-get? milestones { agreement-id: id, index: index }) ERR-MILESTONE-NOT-FOUND))
    (bal       (get amount ms))
    (count     (get milestone-count agreement))
  )
    (asserts! (is-eq (get state agreement) STATE-ACTIVE) ERR-WRONG-STATE)
    (asserts! (is-eq tx-sender (get party-a agreement))  ERR-NOT-AUTHORIZED)
    (asserts! (is-eq (get status ms) MS-ACTIVE)          ERR-WRONG-STATE)
    (asserts! (> bal u0)                                 ERR-ZERO-BALANCE)
    (asserts!
      (or
        (is-eq (get deadline-block ms) u0)
        (< stacks-block-height (get deadline-block ms))
      )
      ERR-TIMEOUT-ACTIVE
    )

    (try! (as-contract (stx-transfer? bal tx-sender (get party-b agreement))))

    (map-set milestones { agreement-id: id, index: index }
      (merge ms { status: MS-COMPLETE, amount: u0 })
    )

    (let ((remaining (- (get total-deposited agreement) bal)))
      (map-set agreements id (merge agreement {
        total-deposited: remaining,
        state: (if (all-milestones-resolved id count) STATE-COMPLETE STATE-ACTIVE)
      }))
    )

    (print {
      event:        "milestone-complete",
      agreement-id: id,
      milestone:    index,
      released-to:  (get party-b agreement),
      amount:       bal
    })

    (ok { milestone: index, released-to: (get party-b agreement), amount: bal })
  )
)


(define-public (dispute-milestone (id (string-ascii 64)) (index uint))
  (let (
    (agreement (unwrap! (map-get? agreements id) ERR-NOT-FOUND))
    (ms        (unwrap! (map-get? milestones { agreement-id: id, index: index }) ERR-MILESTONE-NOT-FOUND))
  )
    (asserts! (is-eq (get state agreement) STATE-ACTIVE) ERR-WRONG-STATE)
    (asserts! (is-eq (get status ms) MS-ACTIVE)          ERR-WRONG-STATE)
    (asserts!
      (or (is-eq tx-sender (get party-a agreement))
          (is-eq tx-sender (get party-b agreement)))
      ERR-NOT-PARTY
    )

    (map-set milestones { agreement-id: id, index: index }
      (merge ms { status: MS-DISPUTED, dispute-block: stacks-block-height })
    )

    (print {
      event:        "dispute",
      agreement-id: id,
      milestone:    index,
      opened-by:    tx-sender,
      arbitrator:   (get arbitrator agreement)
    })

    (ok { milestone: index, arbitrator: (get arbitrator agreement) })
  )
)


(define-public (resolve-to-receiver (id (string-ascii 64)) (index uint))
  (let (
    (agreement (unwrap! (map-get? agreements id) ERR-NOT-FOUND))
    (ms        (unwrap! (map-get? milestones { agreement-id: id, index: index }) ERR-MILESTONE-NOT-FOUND))
    (bal       (get amount ms))
    (count     (get milestone-count agreement))
  )
    (asserts! (is-eq (get state agreement) STATE-ACTIVE)  ERR-WRONG-STATE)
    (asserts! (is-eq tx-sender (get arbitrator agreement)) ERR-NOT-ARBITRATOR)
    (asserts! (is-eq (get status ms) MS-DISPUTED)         ERR-WRONG-STATE)
    (asserts! (> bal u0)                                  ERR-ZERO-BALANCE)

    (try! (as-contract (stx-transfer? bal tx-sender (get party-b agreement))))

    (map-set milestones { agreement-id: id, index: index }
      (merge ms { status: MS-COMPLETE, amount: u0 })
    )

    (let ((remaining (- (get total-deposited agreement) bal)))
      (map-set agreements id (merge agreement {
        total-deposited: remaining,
        state: (if (all-milestones-resolved id count) STATE-COMPLETE STATE-ACTIVE)
      }))
    )

    (print {
      event:        "resolved",
      agreement-id: id,
      milestone:    index,
      winner:       (get party-b agreement),
      amount:       bal
    })

    (ok { milestone: index, released-to: (get party-b agreement), amount: bal })
  )
)


(define-public (resolve-to-payer (id (string-ascii 64)) (index uint))
  (let (
    (agreement (unwrap! (map-get? agreements id) ERR-NOT-FOUND))
    (ms        (unwrap! (map-get? milestones { agreement-id: id, index: index }) ERR-MILESTONE-NOT-FOUND))
    (bal       (get amount ms))
    (count     (get milestone-count agreement))
  )
    (asserts! (is-eq (get state agreement) STATE-ACTIVE)  ERR-WRONG-STATE)
    (asserts! (is-eq tx-sender (get arbitrator agreement)) ERR-NOT-ARBITRATOR)
    (asserts! (is-eq (get status ms) MS-DISPUTED)         ERR-WRONG-STATE)
    (asserts! (> bal u0)                                  ERR-ZERO-BALANCE)

    (try! (as-contract (stx-transfer? bal tx-sender (get party-a agreement))))

    (map-set milestones { agreement-id: id, index: index }
      (merge ms { status: MS-REFUNDED, amount: u0 })
    )

    (let ((remaining (- (get total-deposited agreement) bal)))
      (map-set agreements id (merge agreement {
        total-deposited: remaining,
        state: (if (all-milestones-resolved id count) STATE-REFUNDED STATE-ACTIVE)
      }))
    )

    (print {
      event:        "resolved",
      agreement-id: id,
      milestone:    index,
      winner:       (get party-a agreement),
      amount:       bal
    })

    (ok { milestone: index, refunded-to: (get party-a agreement), amount: bal })
  )
)


(define-public (trigger-milestone-timeout (id (string-ascii 64)) (index uint))
  (let (
    (agreement (unwrap! (map-get? agreements id) ERR-NOT-FOUND))
    (ms        (unwrap! (map-get? milestones { agreement-id: id, index: index }) ERR-MILESTONE-NOT-FOUND))
    (bal       (get amount ms))
    (count     (get milestone-count agreement))
  )
    (asserts! (is-eq (get state agreement) STATE-ACTIVE)       ERR-WRONG-STATE)
    (asserts! (is-eq (get status ms) MS-ACTIVE)                ERR-WRONG-STATE)
    (asserts! (> (get deadline-block ms) u0)                   ERR-WRONG-STATE)
    (asserts! (>= stacks-block-height (get deadline-block ms)) ERR-TIMEOUT-NOT-MET)
    (asserts! (> bal u0)                                       ERR-ZERO-BALANCE)

    (try! (as-contract (stx-transfer? bal tx-sender (get party-a agreement))))

    (map-set milestones { agreement-id: id, index: index }
      (merge ms { status: MS-REFUNDED, amount: u0 })
    )

    (let ((remaining (- (get total-deposited agreement) bal)))
      (map-set agreements id (merge agreement {
        total-deposited: remaining,
        state: (if (all-milestones-resolved id count) STATE-REFUNDED STATE-ACTIVE)
      }))
    )

    (print {
      event:        "milestone-timeout",
      agreement-id: id,
      milestone:    index,
      refunded-to:  (get party-a agreement),
      amount:       bal
    })

    (ok { milestone: index, refunded-to: (get party-a agreement), amount: bal })
  )
)


(define-public (trigger-arb-timeout (id (string-ascii 64)) (index uint))
  (let (
    (agreement (unwrap! (map-get? agreements id) ERR-NOT-FOUND))
    (ms        (unwrap! (map-get? milestones { agreement-id: id, index: index }) ERR-MILESTONE-NOT-FOUND))
    (bal       (get amount ms))
    (count     (get milestone-count agreement))
  )
    (asserts! (is-eq (get state agreement) STATE-ACTIVE)  ERR-WRONG-STATE)
    (asserts! (is-eq (get status ms) MS-DISPUTED)         ERR-WRONG-STATE)
    (asserts!
      (>= stacks-block-height (+ (get dispute-block ms) ARB-TIMEOUT-BLOCKS))
      ERR-TIMEOUT-NOT-MET
    )
    (asserts! (> bal u0) ERR-ZERO-BALANCE)

    (try! (as-contract (stx-transfer? bal tx-sender (get party-a agreement))))

    (map-set milestones { agreement-id: id, index: index }
      (merge ms { status: MS-REFUNDED, amount: u0 })
    )

    (let ((remaining (- (get total-deposited agreement) bal)))
      (map-set agreements id (merge agreement {
        total-deposited: remaining,
        state: (if (all-milestones-resolved id count) STATE-REFUNDED STATE-ACTIVE)
      }))
    )

    (print {
      event:        "arb-timeout",
      agreement-id: id,
      milestone:    index,
      refunded-to:  (get party-a agreement),
      amount:       bal
    })

    (ok { milestone: index, refunded-to: (get party-a agreement), amount: bal })
  )
)


(define-public (cancel-agreement (id (string-ascii 64)))
  (let (
    (agreement (unwrap! (map-get? agreements id) ERR-NOT-FOUND))
    (caller    tx-sender)
  )
    (asserts! (is-eq (get state agreement) STATE-PENDING) ERR-WRONG-STATE)
    (asserts! (is-eq caller (get party-a agreement))      ERR-NOT-AUTHORIZED)

    (map-set agreements id (merge agreement { state: STATE-REFUNDED }))

    (print { event: "cancelled", agreement-id: id, by: caller })

    (ok { cancelled: true })
  )
)