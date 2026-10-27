# HotelPro: Complete hotel booking and management solution

Customers register, search live availability, book, pay and cancel. Administrators manage rooms, bookings and users.

> **Honest status:** this code was written without network access, so `npm install`, the build, the database and the payment flow
> have **not been run**. The only things executed were Node syntax checks on every server file and the unit tests in
> `server/tests` (dates, validators, concurrency maths, the booking lock), which pass. Follow the testing checklist below
> and expect to fix small issues on the first run.

## Stack
React 18 + Vite, React Router, Axios, Bootstrap + React Bootstrap, React Icons · Node, Express, Mongoose, bcryptjs, jsonwebtoken, Multer, helmet, express-rate-limit, Razorpay SDK.

Deliberate deviations from the brief:
- **Admin tabs use React Bootstrap `Tabs`** instead of `mdb-react-ui-kit`. The brief allows an equivalent accessible component, and mixing MDB's CSS with Bootstrap's causes style clashes.
- **Auth is a JWT in an HttpOnly cookie** (not localStorage), so scripts cannot read it.
- **Hero carousel uses gradients** because I had no verified photo URLs. Put your photos in `client/src/assets` and set `image` in `SLIDES` (`HomePage.jsx`).

## Quick start (Windows / VS Code terminals)

Prerequisites: Node 18+, and MongoDB Community Server running locally (or an Atlas URI).

**Terminal 1: backend**
```bash
cd server
npm install
copy .env.example .env        # then edit JWT_SECRET (long random string) and, if needed, MONGO_URI
npm run create-admin          # creates the first admin from ADMIN_* values in .env
npm run seed-rooms            # optional sample rooms
npm run dev                   # http://localhost:8001  (health: /api/health)
```

**Terminal 2: frontend**
```bash
cd client
npm install
copy .env.example .env
npm run dev                   # http://localhost:5173
```
(macOS/Linux: use `cp` instead of `copy`.)

Log in as the admin, open **Add Room** or edit the seeded rooms to upload photos.

## Payments
- **No Razorpay keys (default): SANDBOX mode.** The UI shows a yellow "SANDBOX MODE" notice and offers *Simulate successful / failed payment*. Nothing real is charged. Sandbox is disabled when `NODE_ENV=production`.
- **Real payments:** set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (use test keys first). The server creates the order, the browser opens Razorpay Checkout, and the server verifies the HMAC signature before marking a booking Paid.
- **Webhook (recommended):** point Razorpay to `POST https://<your-api>/api/payments/webhook`, subscribe to `payment.captured` and `payment.failed`, and set `RAZORPAY_WEBHOOK_SECRET`. Duplicate notifications are ignored (idempotent).

## Booking rules
- Price is always computed on the server (`room.pricePerNight × nights`); client prices are display-only.
- A new booking is **Pending** and holds the room for `HOLD_MINUTES` (15). Unpaid holds are released automatically. Payment confirms it.
- Availability is per night against room `inventory` (several identical rooms are supported). A customer cannot hold two overlapping bookings for the same room.
- **Cancellation policy:** allowed until arrival. A paid booking is refunded automatically if cancelled at least `FREE_CANCEL_HOURS` (48) before arrival; later cancellations are not refunded. If a refund call fails the booking stays Paid with a note, never silently "Refunded".
- Confirmed bookings become **Completed** after departure.
- **Concurrency:** a per-room in-process lock serialises "check then insert". That is correct for a single Node process. If you run several instances, switch to MongoDB transactions (needs a replica set) or a distributed lock.

## Security notes
Passwords hashed with bcrypt (cost 12) · role is never accepted from clients (public sign-up is always `customer`; admins come from `create-admin` or an admin promoting a user) · logout and role changes bump `tokenVersion`, revoking old tokens · CORS limited to `CLIENT_URL` · rate limiting on auth and the API · uploads limited to JPG/PNG/WEBP, 5 MB, server-generated filenames · password hash never returned · booking lookups return 404 for other people's bookings.
CSRF: cookies are `SameSite=Lax` with JSON bodies and a locked-down CORS origin. If you host client and API on different sites you need `COOKIE_SAMESITE=none` over HTTPS plus a CSRF token.

## API
All routes are under `/api`. 🔒 = login required, 👑 = admin only.

| Method & path | Purpose |
|---|---|
| POST `/auth/register` | Create customer account |
| POST `/auth/login` | Log in (sets cookie) |
| POST `/auth/logout` 🔒 | Log out, revoke tokens |
| GET `/auth/me` 🔒 | Current user |
| GET `/rooms` | Active rooms (`?limit=`) |
| GET `/rooms/availability?arrival=YYYY-MM-DD&departure=YYYY-MM-DD&guests=n` | Rooms free for the whole stay |
| GET `/rooms/:id` | One active room |
| POST `/rooms` 👑 | Create (multipart, field `images`) |
| PUT `/rooms/:id` 👑 | Update (`keepImages` JSON list + new `images`) |
| DELETE `/rooms/:id` 👑 | Deactivate; `?permanent=true` only if never booked |
| POST `/bookings` 🔒 | `{roomId, arrivalDate, departureDate, guests}` → Pending booking with hold |
| GET `/bookings/my` 🔒 | My bookings |
| GET `/bookings/:id` 🔒 | Owner or admin |
| PATCH `/bookings/:id/cancel` 🔒 | Cancel per policy |
| GET `/payments/config` | Payment mode |
| POST `/payments/order` 🔒 | Create gateway order for a held booking |
| POST `/payments/verify` 🔒 | Verify Razorpay signature, confirm booking |
| POST `/payments/failed` 🔒 | Record a failed attempt |
| POST `/payments/sandbox/confirm` 🔒 | Sandbox only |
| POST `/payments/webhook` | Razorpay webhook (signature-verified) |
| GET `/admin/stats`, `/admin/bookings` (`q,status,paymentStatus`), `/admin/rooms`, `/admin/users` 👑 | Dashboard data |
| PATCH `/admin/users/:id/role` 👑 | Change role (not self, not the last admin) |

Errors look like `{ "message": "...", "errors": { "field": "..." } }`.

## Data models
- **User:** name, email (unique), password hash (hidden), phone, role (`customer|admin`), tokenVersion.
- **Room:** name, description, pricePerNight, images[], amenities[], maxOccupancy, inventory, isActive.
- **Booking:** bookingId (`RMY-YYYYMMDD-XXXXXX`), user→User, room→Room, arrival/departure, nights, guests, price snapshot, totalAmount, phone, bookingStatus (`Pending|Confirmed|Cancelled|Completed`), paymentStatus (`Pending|Paid|Failed|Refunded`), holdExpiresAt, gateway ids, cancel/refund notes.

## Architecture (MVC)
```
React pages/components (View) → services/api.js (Axios) → routes/* → middleware (auth, admin, upload) → controllers/* → models/* (Mongoose) → MongoDB
```
Business rules (pricing, availability, policy, payment verification) live in controllers and `utils/`; the React route guards are UX only.

## User flow
```
Visitor → Home ─┬─ Login / Sign Up
                ├─ Rooms (public browse)
                └─ About
Customer → Login → UserHome ─┬─ Rooms → dates → Search → Select → Review → Pay → Confirmation
                             ├─ My Bookings → View / Pay / Cancel
                             └─ Logout → Home
Admin → Login → AdminHome ─┬─ All Bookings   ├─ All Rooms (edit / deactivate)
                           ├─ Add Room       └─ All Users (roles) → Logout → Home
```

## Testing checklist
Unit: `cd server && npm test`.
Customer: register (valid / invalid / duplicate email) · login (valid / wrong password) · browse rooms · pick past or reversed dates (expect errors) · search availability · book → pay (sandbox success; sandbox failure then retry) · My Bookings shows statuses · cancel a booking · logout · open `/adminhome` as a customer (redirected) · call `GET /api/admin/users` as a customer (403).
Admin: login · all four tabs · add room with images · reject a `.gif` or >5 MB file · edit room · deactivate / activate · promote and demote a user · demoting yourself or the last admin is refused.
Edge: tamper `JWT` cookie (401) · book the last unit twice from two browsers (second gets 409) · let a hold expire (booking becomes Cancelled) · cancel another user's booking id (404) · stop MongoDB (health returns 503).

## Troubleshooting
- *CORS or cookie not set:* `CLIENT_URL` must exactly match the browser origin (`http://localhost:5173`), and `VITE_API_URL` must point at the API. Use `localhost` for both, not a mix of `localhost` and `127.0.0.1`.
- *`ECONNREFUSED 27017`:* start MongoDB or use an Atlas URI in `MONGO_URI` (allow your IP in Atlas).
- *Images 404:* the API serves `/uploads`; check `VITE_API_URL` ends with `/api`.
- *"JWT_SECRET missing":* create `server/.env` from `.env.example`.
- *Port in use:* change `PORT` in `server/.env` and `VITE_API_URL`.

## Screenshot checklist (capture from the running app)
1 Landing · 2 Sign Up · 3 Login · 4 Customer dashboard · 5 Rooms · 6 Date selection and search results · 7 Booking review and confirmation · 8 Payment result · 9 My Bookings · 10 Cancellation message · 11 Admin dashboard · 12 All Bookings · 13 All Rooms · 14 Add Room · 15 All Users.
