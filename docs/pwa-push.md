# Teacher and Student PWA push rollout

The browser-installable experience is intentionally limited to `/teacher` and
`/student` routes. The service worker is network-only and never stores portal
API responses, messages, attendance, grades, or class data for offline use.

Before enabling delivery in a deployment, configure these server variables:

- `NEXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY`
- `PUSH_VAPID_PRIVATE_KEY`
- `PUSH_VAPID_SUBJECT` (for example, `mailto:admin@example.com`)

Generate the VAPID key pair once, store the private key only in the server
environment, and expose only the public key to the browser. Apply the push
subscription migration before enabling the feature. The migration adds private,
service-role-only subscription and delivery-idempotency tables; it does not
create subscriptions or send notifications by itself.

Push permission is requested only after a user action. iOS/iPadOS requires the
portal to be installed on the Home Screen before Web Push is available. Users
can disable a device subscription from the same portal control.

## Local development

Localhost is a separate origin from production. A production PWA subscription
must not be assumed to work from `http://localhost:3000`: the local server needs
the same VAPID public/private pair and subject to deliver to it. If those values
are absent locally, message insertion still succeeds but push is reported as
unavailable. Use local-only VAPID values in an ignored `.env.local` file for
local testing; never copy production private keys into the repository or logs.
