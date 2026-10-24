# Feature reference

Detailed behaviour of each feature, kept out of the main [README](../README.md) so that it can stay a readable project overview. Everything here describes the implemented prototype.

Contents: [Room booking](#srm-trichy-room-booking) · [Save My Practical](#save-my-practical) · [Lab systems](#lab-systems-individual-access-by-system) · [Student access tracking](#student-access-tracking) · [Visual identity](#srm-visual-identity-and-lab-context) · [Limitations](#general-limitations)

## SRM Trichy room booking

The **Lab rooms** catalogue now contains the campus inventory supplied by the user: CS Lab 1–6; AR/VR Lab; Mac Lab; EEE Lab; ECE Lab; IoT Lab; Mechanical Workshop; Woodworking Workshop; Physics Lab; Chemistry Lab 1–2; and six Biotechnology labs. Total: **22 rooms**. The six biotechnology specialization labels are proposed and editable: Molecular Biology, Microbiology, Biochemistry, Cell Culture, Genetics and Bioinformatics. Workstation counts were supplied for eight labs (see [Lab systems](#lab-systems-individual-access-by-system)). Building numbers, other capacities and room assignments have not been supplied and are not invented. Reference codes are application labels, not official room numbers.

Choose **Lab rooms → Reserve**, enter date, times and a required **booking reason** (class/team and planned activity), then request approval. The booking type selector also allows equipment requests. Coordinators see the reason and requester before approving or rejecting; reasons and action notes remain visible in booking details. My bookings / All bookings combine rooms and equipment, with per-resource filtering.

**Manage labs** lets coordinators add rooms, edit names/departments/locations/descriptions/reference codes, and set Available, Maintenance or Unavailable. Unavailable rooms block new requests and approvals; existing approved bookings remain visible and can be cancelled with a recorded reason. Room booking reserves the entire space, with pending/approved requests holding time slots. Adjacent bookings are valid. Room availability now drives the dashboard timeline.

Rooms use the same transaction-protected booking and audit engine as equipment; a `kind` discriminator separates room and equipment inventory. Idempotent migrations add the 22 rooms to existing databases without replacing reservations or duplicating rooms on restart. The original equipment catalogue remains explicitly marked as demo equipment. Equipment is not automatically assigned to a room, so a room booking does not implicitly block equipment bookings; coordinators must manage those separately until verified equipment-to-room mappings are supplied.

Room APIs: `GET /api/rooms` for signed-in users; `POST /api/rooms` and `PUT /api/rooms/:id` for coordinators. Fields match the resource model (`name`, `category` as department, `location`, `model` as reference code, `description`, `quantity: 1`, `status`). `POST /api/bookings` uses the selected room's ID in the existing `equipment_id` resource-key field and the required reason in `purpose`. Joined booking responses include `resource_kind`. Dashboard API adds `totalRooms` and `availableRooms`.

`tests/rooms.test.js` covers the exact room inventory, required reasons, overlap/adjacency, cross-room availability, management authorization, maintenance/approval protection, reasons in review, cancellation/rejection history, rebooking and concurrent requests.

A working laboratory equipment booking prototype tailored to **SRM Institute of Science and Technology, Trichy**. Students and research scholars reserve instruments; lab coordinators review requests and manage inventory.

## Save My Practical

Open **Save My Practical** in the sidebar and click **Load demo example**. The explainable planner matches activity and class size to demonstration lab profiles and current booking availability. It returns up to six ranked alternatives, including nearby times, and prefills the ordinary booking request for coordinator approval. It never creates a booking merely by searching.

Capabilities, and the capacity of labs without numbered systems, are explicitly unverified demo fixtures in `shared/practical.js`, keyed by room reference code. For labs with numbered systems the capacity is the supplied system count (70, 40 or 40), shown as source `systems`. Unknown codes are excluded. Search hours are illustrative 08:00–18:00 IST, same date, in 30-minute offsets; one full class per room, no automatic batch splitting or equipment reservations. Guided submissions revalidate capacity/capability as well as the normal status/conflict checks. Profile management is code-based for this prototype, not an admin screen.

Presentation walkthrough, speaking notes and Q&A: [Save My Practical](SAVE-MY-PRACTICAL.md). Screenshots: `save-my-practical-desktop.png` and `save-my-practical-mobile.png` (captured using an isolated in-memory demo database). Automated coverage: `tests/practical.test.js`; optional isolated browser smoke: `node presentation/check-practical.mjs <path-to-playwright>` (requires Edge and Playwright).

## Lab systems: individual access by system

The supplied workstation counts are built in: **CS Lab 1–6 have 70 systems each, AR/VR Lab has 40 and Mac Lab has 40**. The counts are stored per room (`systems`), so a coordinator can change them in **Manage labs** (0 means a lab has no numbered systems). Reducing the count below a system that has an active booking is refused.

- **Individual access books one system, not the room.** In the booking form, choosing *Individual access* for one of these labs shows a ticket-style map: a "front of lab" bar and rows of numbered systems split by an aisle. Systems are *Available*, *Booked*, *Your booking* or *Selected*. Pick one; the request holds that system only, so other students can book the rest at the same time.
- **View systems.** Each of these labs on **Lab rooms** has a *View systems* button. Pick a date and time, see which systems are free, select one and choose *Book system N*.
- **Group and whole-lab bookings still reserve the entire room.** A lab / group booking is blocked while any system is booked for that time, and a system booking is blocked while the whole lab is reserved or in maintenance. Adjacent times never conflict.
- **Other labs and instruments are unchanged.** Rooms without numbered systems keep whole-room individual access, and requests that omit the access fields still reserve the whole room.
- **Where it shows up.** The dashboard timeline marks partly booked labs with a hatched slot (for example "19 of 70 systems booked"). The room finder lists labs that still have free systems, with the count. Booking lists, details and the CSV export show the system number.
- **Privacy.** The system map says whether a system is free, booked or yours. It never says who booked it.

Systems are not tracked as physical machines: a number is a seat in the lab, not an asset record, and a booking does not prove attendance.

## Student access tracking

Every new booking request records **who needs the resource**:

- **Access type.** *Individual access* is for exactly one student and works for rooms or equipment. *Lab / group access* is for a group and is offered only for lab rooms and workshops.
- **Number of students.** The requested headcount, a whole number from 1 to 200. Individual access is fixed at 1. The form asks requesters to include themselves if they take part.
- **Project title.** Required (3–120 characters) when the purpose category is *Project work*; not stored for other categories.
- **Duration.** The form previews the requested duration (for example "2 h 30 min") as the times change. Durations are calculated from start and end, not stored separately.

Bookings handed over from Save My Practical are always lab/group access, and their headcount must match the class size used in the plan.

**My bookings**, **All bookings** and **Approvals** add access-type and purpose filters. Above the list, a summary shows three cards: Individual access, Lab / group access, and Project work. Each card shows requests, pending requests, distinct requester accounts, student participations requested, total requested duration and approved reserved duration. **Reports** adds the same access filter, summary and an access column, and the CSV export adds *Access type*, *Student count*, *Project title* and *Duration (minutes)*. Coordinators see access details in review; a researcher sees them only on their own bookings, and the shared availability feed never includes them.

How to read the numbers:

- Participation totals add up the headcount on each request, so a student in two sessions is counted twice. Requester accounts are not a roster of participants.
- Durations are booking hours, not student-hours or measured attendance.
- Project work overlaps the two access-type cards; do not add the three cards together.

Upgrading an existing database is additive: on the next start the server adds three nullable columns and changes nothing else. Bookings made before this feature show **Not recorded** and are never assigned a guessed headcount. API clients that omit all three fields still work and create unclassified records. Restart `npm start` after pulling this change so the migration runs.

## SRM visual identity and lab context

The official SRMIST logo is stored in `public/srm-logo.svg`, sourced from [SRMIST's official website](https://www.srmist.edu.in/wp-content/uploads/2022/01/srm-logo.svg). The interface uses an SRM-inspired blue, white and gold palette, institutional typography, Trichy campus context, and student/researcher/coordinator language. This is not a claim of compliance with a published brand manual or official endorsement.

The seeded Biotechnology, Chemistry, ECE and Mechanical laboratory labels are **illustrative demo locations**, not a verified SRM asset register. Replace them using Inventory for a real department deployment. Existing bookings are preserved when applying the SRM location migration.

## General limitations

- This is a local academic prototype with openly documented seed passwords, not a production SRM service.
- Each equipment entry is one exclusively bookable resource, even when quantity exceeds one. Quantity is informational; create separate entries for independently bookable units. This follows the requested same-equipment overlap prohibition.
- Bookings are same-day, future-starting and at most eight hours. Pending/approved bookings can be cancelled until their end time; completed records cannot be altered. Approved bookings are not automatically cancelled when an instrument is put into maintenance; coordinators should review and cancel affected bookings.
- All laboratory dates use Asia/Kolkata. Seed bookings use tomorrow relative to first launch; tests generate their own future dates.
- Dashboard totals are scoped to the signed-in user's visible bookings; administrators see all. The scrollable availability timeline shows all rooms from 08:00–18:00; the full inventory is bookable through the catalogue.
- No email delivery, password recovery, recurring reservations, SSO, file uploads or multi-campus tenancy. Reports support date, type, status, purpose and access-type filters plus CSV export of the visible records. Student counts are requested headcounts entered by the requester, not verified rosters. Approved reserved hours are planned durations, not measured attendance or actual utilization.
- SQLite and synchronous password hashing suit a small demonstration. A production rollout needs institution-provided inventory, account provisioning, abuse controls for registration, HTTPS, backups, monitoring, pagination and load testing.
