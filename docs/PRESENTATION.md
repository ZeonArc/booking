# SRM Trichy LabReserve — presentation guide

## Your opening (30 seconds)

“Our project is SRM Trichy LabReserve, a laboratory room and equipment booking system. It addresses three practical problems: people cannot easily see which lab is free, two groups may request the same time, and approval decisions are hard to track. Our application combines availability, booking reasons, coordinator approval and a permanent action history in one place.”

## What to show in five minutes

| Time | Show | What to say |
|---|---|---|
| 0:00–0:40 | Dashboard and Lab rooms | “We configured 22 spaces from our campus inventory: six CS labs, six biotechnology labs, AR/VR, Mac, EEE, ECE, IoT, two workshops, Physics and two Chemistry labs.” |
| 0:40–1:15 | Filter Biotechnology | “Each biotechnology room has a separate specialization. These six labels are configurable and must be confirmed with our department.” |
| 1:15–2:00 | Find a free lab room | “The server checks pending and approved reservations for our selected date and time, then lists free rooms.” |
| 2:00–2:40 | Reserve a room | “A request records whether it is individual or group access, how many students need the room, the purpose category and a written reason, so the coordinator knows who needs the lab and why. Project work also needs a project title.” |
| 2:40–3:15 | Try an overlapping booking | “The server rejects a conflicting request. A booking that starts exactly when another ends is allowed.” |
| 3:15–4:15 | Coordinator → Approvals → Review | “Only a coordinator can approve or reject. Rejection and administrative cancellation require reasons. Every action records who performed it and when.” |
| 4:15–5:00 | Reports and booking details | “We can filter records and export CSV. Cancelled bookings release their slots but remain in the history for accountability.” |

## Reliable live demo inputs

Use a future date with no reservations, preferably a week ahead. Choose **Biotech Lab 6 · Bioinformatics**, 10:00–11:00 IST. Keep **Lab / group access**, enter 6 students, select **Project work**, enter the project title “Bioinformatics pipeline” and the reason “Final-year project demonstration for Team A.” Point out the duration preview. Then request the same room from 10:30–11:30 to show the overlap error. Correct it to 11:00–12:00 to show adjacency. Sign in as coordinator, approve one request, and reject or cancel the second with a reason. Export only the selected date using Reports.

Before presenting, run `npm run build`, `npm test`, and `npm start`. Open http://localhost:3000. The app has locally bundled fonts and logo and does not require internet after dependencies are installed. Keep one terminal available for showing the test results. Do not erase the database before presenting; choose a fresh future date instead.

Demo accounts: `researcher@lab.test` and `manager@lab.test`; both use `LabDemo123!`. These are local demo identities. The browser's session is shared across its tabs, so switch roles using Sign out rather than treating two tabs as independent users.

## Explain the technology simply

“React provides the screens. Express receives requests and enforces permissions. SQLite stores users, resources, bookings and action history. A session cookie identifies the logged-in user. We store password hashes, not plaintext passwords. The same booking engine supports both equipment and whole-room reservations.”

For the main algorithm, write:

```text
new_start < existing_end AND new_end > existing_start
```

“This condition detects overlapping intervals for the same resource. We only consider pending and approved records. The check and write happen within a database transaction, so two simultaneous requests cannot both reserve the same slot. We check again during approval.”

## Questions your faculty may ask

**Why SQLite?** It provides relational tables, foreign keys, indexes and transactions without a separate database server. It is suitable for a small college prototype; a larger campus deployment would need load testing and may use PostgreSQL.

**What makes this more than a form?** Server-side conflict checks, permissions, persistent records, an approval state machine, an action audit trail, a free-room finder and filtered reports.

**Can someone approve using a direct API request?** The server checks the logged-in user's role; hiding the button is not the security mechanism. Researchers also cannot read or cancel another person's reservation.

**What happens when a lab is under maintenance?** New requests and approvals are blocked. Existing approved reservations remain visible so the coordinator can explicitly cancel them with reasons.

**What happens after a cancellation?** The interval becomes available again, while the record and cancellation event remain in the database.

**Are the statistics actual utilization?** No. Approved reserved hours measure planned bookings, not attendance or measured usage. We would need check-in/check-out or device telemetry for actual utilization.

**Do the student counts show who attended?** No. They are headcounts entered when requesting. The summary adds them per request, so a student in two sessions counts twice, and booking hours are not student-hours. Bookings made before this feature show “Not recorded” instead of a guessed number.

**Are all lab details official?** Room counts come from the campus inventory provided for this project. Biotechnology specializations are proposed, editable labels. Building numbers, capacity and equipment mappings have not been supplied. Do not claim department verification or SRM SSO integration.

**What is the next step?** Department-confirmed room metadata, faculty/SSO accounts, notifications, recurring class timetables, equipment-to-room links and attendance tracking. These are future enhancements, not features already implemented.

## Your closing (20 seconds)

“The prototype demonstrates the complete booking cycle: discover availability, request with a reason, prevent conflicts, approve or reject, cancel when necessary, and retain history. It is tailored to our campus inventory while keeping the core design reusable for other departments.”

## Specialization labels used for the six new rooms

Molecular Biology, Microbiology, Biochemistry, Cell Culture, Genetics, and Bioinformatics. Each is an editable specialization in Manage labs; these labels are not a verified list of SRM Trichy's official lab allocations.
