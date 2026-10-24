# SRM LabReserve

For today's college presentation, use **[the five-minute script and faculty Q&A](docs/PRESENTATION.md)**.

New presentation features: a server-validated free-room finder on Lab rooms; editable biotechnology specialization fields in Manage labs; purpose categories on booking requests and review; and a Reports screen with date/type/status/purpose filters, approved reserved hours and CSV download. Exports use only records the signed-in user is allowed to see. Spreadsheet formula prefixes are neutralized in exported text.

## SRM Trichy room booking

The **Lab rooms** catalogue now contains the campus inventory supplied by the user: CS Lab 1–6; AR/VR Lab; Mac Lab; EEE Lab; ECE Lab; IoT Lab; Mechanical Workshop; Woodworking Workshop; Physics Lab; Chemistry Lab 1–2; and six Biotechnology labs. Total: **22 rooms**. The six biotechnology specialization labels are proposed and editable: Molecular Biology, Microbiology, Biochemistry, Cell Culture, Genetics and Bioinformatics. Building numbers, capacities, workstation counts and room assignments have not been supplied and are not invented. Reference codes are application labels, not official room numbers.

Choose **Lab rooms → Reserve**, enter date, times and a required **booking reason** (class/team and planned activity), then request approval. The booking type selector also allows equipment requests. Coordinators see the reason and requester before approving or rejecting; reasons and action notes remain visible in booking details. My bookings / All bookings combine rooms and equipment, with per-resource filtering.

**Manage labs** lets coordinators add rooms, edit names/departments/locations/descriptions/reference codes, and set Available, Maintenance or Unavailable. Unavailable rooms block new requests and approvals; existing approved bookings remain visible and can be cancelled with a recorded reason. Room booking reserves the entire space, with pending/approved requests holding time slots. Adjacent bookings are valid. Room availability now drives the dashboard timeline.

Rooms use the same transaction-protected booking and audit engine as equipment; a `kind` discriminator separates room and equipment inventory. Idempotent migrations add the 22 rooms to existing databases without replacing reservations or duplicating rooms on restart. The original equipment catalogue remains explicitly marked as demo equipment. Equipment is not automatically assigned to a room, so a room booking does not implicitly block equipment bookings; coordinators must manage those separately until verified equipment-to-room mappings are supplied.

Room APIs: `GET /api/rooms` for signed-in users; `POST /api/rooms` and `PUT /api/rooms/:id` for coordinators. Fields match the resource model (`name`, `category` as department, `location`, `model` as reference code, `description`, `quantity: 1`, `status`). `POST /api/bookings` uses the selected room's ID in the existing `equipment_id` resource-key field and the required reason in `purpose`. Joined booking responses include `resource_kind`. Dashboard API adds `totalRooms` and `availableRooms`.

`tests/rooms.test.js` covers the exact room inventory, required reasons, overlap/adjacency, cross-room availability, management authorization, maintenance/approval protection, reasons in review, cancellation/rejection history, rebooking and concurrent requests.

A working laboratory equipment booking prototype tailored to **SRM Institute of Science and Technology, Trichy**. Students and research scholars reserve instruments; lab coordinators review requests and manage inventory.

## Run locally

Requires Node.js **24 or later** and npm. SQLite is provided by Node; no database server is needed.

```powershell
npm install
npm run build
npm start
```

Open **http://localhost:3000**. First launch creates `data/lab.sqlite` with three accounts, 22 rooms, ten demo instruments and six example equipment reservations. Subsequent launches preserve all data. Stop with Ctrl+C. For frontend development, keep `npm start` running in one terminal and run `npm run dev` in another; Vite proxies API requests to port 3000.

Configuration: set `$env:PORT='3000'` before starting. `COOKIE_SECURE=1` enables Secure cookies for HTTPS deployments. `.env.example` documents available variables; `.env` is not automatically loaded. The server binds to loopback. No signing secret is needed: opaque random session tokens are stored in SQLite and expire after eight hours.

## Local demonstration accounts

| Role | Email | Password |
|---|---|---|
| Student / researcher | researcher@lab.test | LabDemo123! |
| Lab coordinator / administrator | manager@lab.test | LabDemo123! |
| Second researcher | sam@lab.test | LabDemo123! |

These are fictional local demo accounts, not SRM accounts. Registration always creates a researcher; clients cannot assign themselves administrator privileges. This prototype does not connect to SRM SSO.

## Features

- Login, registration, logout, scrypt password hashes with per-user random salts, persistent server sessions.
- Responsive dashboard, equipment catalogue, search, category/status filters, daily equipment timeline.
- Ten seeded instruments: microscope, centrifuge, spectrophotometer, thermal cycler, balance, incubator, oscilloscope, laboratory oven, pH meter, 3D printer.
- Administrator inventory creation and editing, quantity and availability controls.
- Booking requests, server-side overlap checks, approval/rejection, user and administrator cancellation.
- Required rejection and administrative cancellation reasons. Immutable action records retain actor, timestamp and note.
- Booking details, audit history, date/equipment/status filters and administrator researcher filtering.
- Accessible labelled forms, native modal focus management, status messages, errors, confirmations and empty states.

## Architecture and source map

```text
React UI (src/main.jsx, style.css, srm.css)
    → same-origin REST requests
Express API (server.js)
    → authentication + role/ownership checks + validation
    → SQLite transactions and parameterized statements
SQLite (data/lab.sqlite): users, equipment, bookings, events, sessions
```

`vite.config.js` builds frontend assets to `dist/`. Express serves the production build and API from one origin. `server.js` contains the executable schema, idempotent seed routine and SRM demo location migration. `tests/api.test.js` exercises a real HTTP server with an isolated temporary SQLite database. `docs/API.md` contains the API contract; `docs/DEMO.md` contains the demonstration and manual tests.

### Booking correctness

The interval condition is `new_start < existing_end AND new_end > existing_start`, scoped to equipment and active (`pending`, `approved`) status. Timestamps are normalized to UTC; the UI uses IST and requires the same IST calendar date. Comparing full UTC intervals inherently scopes overlaps to the relevant date. Adjacent slots are allowed. Rejected/cancelled records do not occupy slots.

Creation and approval checks execute inside `BEGIN IMMEDIATE` transactions. Synchronous SQLite operations do not yield between the check and write. Approval rechecks availability and overlaps. Pending requests reserve the slot immediately, so normal API requests cannot create two conflicting pending reservations. The automated test injects conflicting legacy data directly into its isolated test database to demonstrate the approval safeguard.

### Data model

| Table | Key data and constraints |
|---|---|
| users | integer PK, unique email, name, constrained role, salt and password hash |
| equipment | integer PK, name/category/model/location/description, positive quantity, constrained status |
| bookings | integer PK; user/equipment FKs; UTC start/end; purpose; constrained status; creation timestamp |
| events | integer PK; booking/actor FKs; action; note; UTC timestamp |
| sessions | random token PK; user FK; expiry |
| migrations | applied migration name PK |

Foreign keys are enabled, WAL is used, and `(equipment_id,status,start,end)` is indexed for conflict checks. Booking and audit records are never deleted by the API.

### Security

Passwords use Node scrypt, random salts and timing-safe verification. Session cookies are HttpOnly and SameSite=Strict. Cross-origin mutation requests are blocked. Login attempts are limited per client address. All queries receiving user values are parameterized. Researchers only receive their own booking details; shared availability omits purpose and user identity. The frontend renders text through React. CSP blocks third-party scripts and assets; fonts and the SRM logo are served locally.

## SRM visual identity and lab context

The official SRMIST logo is stored in `public/srm-logo.svg`, sourced from [SRMIST's official website](https://www.srmist.edu.in/wp-content/uploads/2022/01/srm-logo.svg). The interface uses an SRM-inspired blue, white and gold palette, institutional typography, Trichy campus context, and student/researcher/coordinator language. This is not a claim of compliance with a published brand manual or official endorsement.

The seeded Biotechnology, Chemistry, ECE and Mechanical laboratory labels are **illustrative demo locations**, not a verified SRM asset register. Replace them using Inventory for a real department deployment. Existing bookings are preserved when applying the SRM location migration.

## Verification

```powershell
npm test
npm run build
```

The API suite covers registration, invalid credentials, authorization, inventory management, time validation, overlap and adjacency, concurrent requests, approval rechecks, reasons, cancellation/rebooking, privacy, logout, and database reopen persistence. It does not touch `data/lab.sqlite`.

## Five-hour implementation plan

| Hour | Deliverable |
|---|---|
| 1 | Workflow, roles, architecture, relational schema and seeded project |
| 2 | Sessions, APIs, validation and transaction-protected conflict checking |
| 3 | React navigation, catalogue, dashboard and booking form |
| 4 | Approval/cancellation, inventory editing, filters and audit details |
| 5 | Automated tests, UI checks, fixes, API documentation and demo rehearsal |

## Evaluation evidence

| Criterion | Marks | Implemented evidence |
|---|---:|---|
| Problem understanding and workflow | 10 | Two roles; request → review → decision/cancellation; documented rules and architecture |
| UI and usability | 15 | SRM theme, responsive screens, availability timeline, search/filters, labels and confirmations |
| Backend and database | 25 | Express REST API, SQLite relational schema, FKs/indexes, persistent sessions and records |
| Core workflow | 20 | Catalogue, booking, conflict detection, approvals, rejection, cancellation and audit history |
| Validation/security/access control | 15 | Scrypt, role and ownership enforcement, parameterized queries, transactions, input validation |
| Testing and demonstration | 15 | Automated API suite, isolated test data, manual checklist and reproducible demonstration |
| Total evaluation scope | 100 | Evidence supplied for every criterion; actual marks are evaluator-assigned |

## Save My Practical

Open **Save My Practical** in the sidebar and click **Load demo example**. The explainable planner matches activity and class size to demonstration lab profiles and current booking availability. It returns up to six ranked alternatives, including nearby times, and prefills the ordinary booking request for coordinator approval. It never creates a booking merely by searching.

Capacities and capabilities are explicitly unverified demo fixtures in `shared/practical.js`, keyed by room reference code. Unknown codes are excluded. Search hours are illustrative 08:00–18:00 IST, same date, in 30-minute offsets; one full class per room, no automatic batch splitting or equipment reservations. Guided submissions revalidate capacity/capability as well as the normal status/conflict checks. Profile management is code-based for this prototype, not an admin screen.

Presentation walkthrough, speaking notes and Q&A: [Save My Practical](docs/SAVE-MY-PRACTICAL.md). Screenshots: `docs/save-my-practical-desktop.png` and `docs/save-my-practical-mobile.png` (captured using an isolated in-memory demo database). Automated coverage: `tests/practical.test.js`; optional isolated browser smoke: `node presentation/check-practical.mjs <path-to-playwright>` (requires Edge and Playwright).

## General limitations

- This is a local academic prototype with openly documented seed passwords, not a production SRM service.
- Each equipment entry is one exclusively bookable resource, even when quantity exceeds one. Quantity is informational; create separate entries for independently bookable units. This follows the requested same-equipment overlap prohibition.
- Bookings are same-day, future-starting and at most eight hours. Pending/approved bookings can be cancelled until their end time; completed records cannot be altered. Approved bookings are not automatically cancelled when an instrument is put into maintenance; coordinators should review and cancel affected bookings.
- All laboratory dates use Asia/Kolkata. Seed bookings use tomorrow relative to first launch; tests generate their own future dates.
- Dashboard totals are scoped to the signed-in user's visible bookings; administrators see all. The scrollable availability timeline shows all rooms from 08:00–18:00; the full inventory is bookable through the catalogue.
- No email delivery, password recovery, recurring reservations, SSO, file uploads or multi-campus tenancy. Reports support date, type, status and purpose filters plus CSV export of the visible records. Approved reserved hours are planned durations, not measured attendance or actual utilization.
- SQLite and synchronous password hashing suit a small demonstration. A production rollout needs institution-provided inventory, account provisioning, abuse controls for registration, HTTPS, backups, monitoring, pagination and load testing.
