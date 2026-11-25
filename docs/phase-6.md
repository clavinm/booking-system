# Phase 6 guided walkthrough

SeatSync uses Easebuzz hosted checkout. Click **Pay ₹…** in the seat picker to hold the selected seats and open the gateway in the same tab.

## Configuration

Set `EB_MERCHANT_KEY` and `EB_SALT` in the ignored `.env` file. The app signs requests on the server. Set `EB_ENV=test`, `APP_EB_MODE=test`, and `EB_LINK=https://testpay.easebuzz.in/payment/initiateLink`. Apply the migration with `npm run db:deploy` and restart Next.js. [Easebuzz integration kit](https://github.com/easebuzz/paywitheasebuzz-php-lib)

SeatSync sends a fixed sandbox buyer name, email, and phone to Easebuzz. For checkout the app uses the success and failure return URL under `AUTH_URL`. To receive server-to-server notifications on a deployed app, point the Easebuzz dashboard at your public HTTPS origin followed by `/api/payments/easebuzz/webhook`.

## Follow the booking

1. The [seat picker](../src/components/booking/seat-picker.tsx) sends the slot, seat IDs, and an idempotency key to the [checkout route](../src/app/api/payments/checkout/route.ts). PostgreSQL calculates the amount in paise and holds all seats together for up to five minutes. A retry uses the same held reservation.
2. The [payment service](../src/services/payments.ts) claims initiation for one app process and makes the network request outside the database transaction. The [Easebuzz adapter](../src/lib/easebuzz.ts) signs the amount and transaction ID with SHA-512. It turns the access key into a hosted checkout address. The service saves that key, so a retried checkout opens the same order. [Easebuzz hosted checkout](https://github.com/easebuzz/paywitheasebuzz-php-lib/blob/master/easebuzz-lib/initiate_payment.php)
3. Easebuzz posts the result to the [notification handler](../src/lib/easebuzz-http.ts). SeatSync checks the signature and separately retrieves the transaction using Easebuzz’s status API. Confirmation requires a matching transaction ID, amount, and successful payment. [Easebuzz transaction API](https://github.com/easebuzz/paywitheasebuzz-php-lib/blob/master/easebuzz-lib/transaction.php)
4. The [reservation service](../src/services/reservations.ts) uses a PostgreSQL transaction to verify ownership and expiry, save the successful payment, and create all the seat allocations. After expiry, the seats become available and SeatSync records late payments without booking the seats. An automatic refund workflow is outside the sandbox integration.

The [idempotency service](../src/services/idempotency.ts) scopes keys by account and operation. An identical retry returns the original hold or confirmation, and a changed payload with the same key gets HTTP 409. PostgreSQL also enforces unique seat allocations and unique provider payment IDs. Browser confirmation and webhook delivery can race safely.

A failed card attempt keeps the existing Easebuzz order available while the hold is active. On the reservation page, **Continue checkout** opens that order and **Check payment status** queries Easebuzz again. When the hold expires, select available seats again.
