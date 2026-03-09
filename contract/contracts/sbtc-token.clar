(define-fungible-token sbtc)

(define-public (transfer
    (amount    uint)
    (sender    principal)
    (recipient principal)
    (memo      (optional (buff 34)))
  )
  (begin
    (asserts! (is-eq tx-sender sender) (err u100))
    (ft-transfer? sbtc amount sender recipient)
  )
)

(define-public (mint (amount uint) (recipient principal))
  (ft-mint? sbtc amount recipient)
)

(define-read-only (get-balance (who principal))
  (ok (ft-get-balance sbtc who))
)

(define-read-only (get-total-supply)
  (ok (ft-get-supply sbtc))
)

(define-read-only (get-name)
  (ok "Synthetic Bitcoin")
)

(define-read-only (get-symbol)
  (ok "sBTC")
)

(define-read-only (get-decimals)
  (ok u8)
)

(define-read-only (get-token-uri)
  (ok none)
)