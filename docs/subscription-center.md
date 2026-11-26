# Subscription Center

The global Subscription Center is available to authorized Super Admins at
`/subscriptions`. Institution Admin views remain institution-scoped; plan and
subscription management actions independently require Super Admin authorization.
The register also lists ERP-only institutions that have no matching platform
institution ID. They are marked **Not linked** and cannot receive a
subscription until the records are reconciled; subscription foreign keys refer
to the platform institution table, and some ERP IDs are not UUIDs. Do not
automatically create or match these records without reviewing their identities.

Plans use the existing platform feature catalogue and subscription tables.
Student capacity is controlled by the plan's student limit. The old user-limit
column is retained for existing data but is not shown or changed by plan management.
Plans with existing subscriptions cannot have their price, billing period, or
limits changed; create a new plan instead. Plans serving active or trial
subscriptions cannot be disabled because doing so would remove feature access.

Free plan assignments activate immediately and, after confirmation, replace the
current subscription. Paid assignments are recorded as pending; the institution
must complete the existing checkout before access is activated. Paid purchases
are scheduled after existing active or scheduled subscription periods. Paid
renewals also use checkout. A validity extension is a
complimentary administrative action and does not create a payment or invoice.
Actions and plan changes are audited; subscription history includes the recorded
events, invoices, and payment references. A payment reference is not a
downloadable receipt document.

## Order reconciliation

The payment and invoice are saved before requesting a Razorpay order. A received
order ID is conditionally saved with up to three local attempts; an uncertain
write is checked before retrying. The provider order request is never retried
automatically. If its outcome or local persistence cannot be confirmed, checkout
is not opened and the invoice remains issued with a pending payment. Contact
support with the invoice number rather than retrying checkout. This guidance
does not enforce request-level idempotency: a new checkout request creates a
new invoice and can create another order.

Operators can search payment records by invoice, order ID, or payment reference
in Super Admin billing; Subscription Center payment search also includes order
and payment IDs. Check application logs for the invoice and, if received,
the order ID. Compare the invoice, institution, amount, currency and provider
records before any manual reconciliation. A timeout or invalid provider
response does not establish whether an order exists. A process crash before
logging the response can also leave the ID unavailable locally. Do not mark an
invoice paid or activate a subscription merely from an order ID: captured
payment verification and normal settlement remain necessary. The current schema
provides no durable provider-order lookup or automated recovery for an unknown
ID; logs are not guaranteed durable, and webhook settlement requires a stored
order ID. Reconciliation may therefore require provider-side investigation.

## Database prerequisites

The existing migrations `7_subscription_razorpay_billing` and
`8_student_capacity_limit` add the payment order and invoice description fields
required by checkout and printable invoice views, and the plan student limit field respectively. If they
have not been applied, plan student limits are shown as unavailable, and
checkout cannot function correctly. No database changes are made by opening
the Subscription Center.

Review the migration history and back up the target database before deploying:

```powershell
npx prisma migrate status
npx prisma migrate deploy
```

`migrate deploy` applies **all** pending migrations, not only the two listed
above. Review any other pending migrations and any differences between the
database migration history and this repository before running it. Do not use
`prisma db push` against an existing shared database to work around migration
history issues.

Revenue includes only payments with status `SUCCEEDED`, grouped by currency.
The pending subscription count represents records in `PAST_DUE`; the schema
does not define a separate pending subscription status. Renewal notifications
and standalone downloadable receipt files are not implemented by these pages.
