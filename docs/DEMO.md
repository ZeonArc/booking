# Five-minute demonstration and manual checks

## SRM Trichy room workflow

Open **Lab rooms** and verify 22 rooms: six biotechnology labs, six CS labs, AR/VR, Mac, EEE, ECE, IoT, Mechanical Workshop, Woodworking Workshop, Physics and two Chemistry labs. Reserve CS Lab 1 for an unused future 10:00–11:00 interval with a class/team and activity in Booking reason. Verify the same room rejects 10:30–11:30, accepts 11:00–12:00, and CS Lab 2 accepts 10:00–11:00. Sign in as coordinator; review the reason in Approvals, approve the request, and inspect its audit history. Cancel with a reason and rebook the released interval. In Manage labs, put a room into maintenance and verify new requests/approval are blocked, then restore availability. All changes persist after restarting.

## Student access tracking

Reserve CS Lab 3 for a future 10:00–12:30 interval with **Lab / group access**, 25 students, purpose category **Project work** and project title "Smart irrigation prototype". While choosing times, the form shows "Requested duration: 2 h 30 min". Open My bookings: the row shows Lab / group access, 25 students, 2 h 30 min and the project title, and the Lab / group and Project work summary cards include it. Filter by access type, then open Reports and download the CSV; it contains the Access type, Student count, Project title and Duration (minutes) columns. Switch the access type to Individual: the student count locks to 1. Choose Equipment as the booking type: only Individual access is offered. Records created before this feature show "Not recorded".

## Lab systems

Open **Lab rooms**, choose **View systems** on CS Lab 3 and pick tomorrow 10:00–11:00. Point out the front-of-lab bar, the aisle, and the free, booked and your-booking systems; the count reads "X of 70 systems free". Select a free system and choose **Book system N**: the booking form opens with Individual access and that system already chosen. Submit, then open **My bookings**: the row shows "System N". Sign in as the second student, view the same lab and time: the first student's system is booked, and requesting it returns "System N is not free". Switch the form to Lab / group access: the map disappears and the whole room is requested. A group request for the same time is refused while any system is booked. On the dashboard, the timeline slot for that lab is hatched ("N of 70 systems booked") rather than fully booked.

## Repeatable setup

Run `npm test` for an isolated, reproducible suite that creates and removes its own temporary database. The manual demo uses the persistent local database. Pick a future date with no microscope reservations (ten days ahead works on a fresh seed); use another unused date if repeating the demo. Seed data has ten instruments and pending/approved/rejected/cancelled examples.

For a fresh demo without losing previous records, stop the server, **rename** the `data` folder to a unique backup such as `data-demo-backup-01`, and restart. Keep the backup to recover prior bookings. Do not rename a database while the server is running.

## Presentation sequence

1. Sign in using the researcher demo button. Explain dashboard totals and the IST availability timeline.
2. Open Equipment. Search for microscope and request a future 10:00–11:00 session with purpose “Final-year project: cell imaging”. Expect a pending booking and success notice.
3. Request the same microscope on that date from 10:30–11:30. Expect the overlap error; the form remains open for correction.
4. Change the interval to 11:00–12:00. Expect success: adjacent sessions are valid.
5. Sign out, choose Administrator, then sign in. Open Approvals; inspect the user, purpose and interval. Approve one request.
6. Explain that conflicting pending requests cannot normally be created. Run `npm test` to show the approval recheck case, which injects conflicting legacy data only into an isolated test database and expects HTTP 409.
7. Open approved booking details; cancel with a reason. The record remains cancelled and its activity shows who acted and when.
8. Reject the other request with a reason. Sign back in as researcher and inspect both records and reasons.
9. Rebook each released interval. Expect success. Show history filters and administrator Inventory editing.

## Manual checklist

- [ ] Register a new account and sign in. A duplicate email and password shorter than 10 characters are rejected.
- [ ] Wrong password returns a clear error. Sign-out prevents subsequent API access.
- [ ] The labelled Sign out button stays visible in the top bar on desktop and at 390 px and 320 px widths, and works from the keyboard.
- [ ] Individual access locks the student count to 1; lab / group access is offered only for rooms; Project work requires a project title.
- [ ] Individual access in a CS lab, AR/VR or Mac Lab needs a system; two students can hold different systems at once, and the same system twice is refused.
- [ ] Access filters and summary cards on My bookings, All bookings, Approvals and Reports match the visible rows; older bookings show "Not recorded".
- [ ] Researcher navigation excludes approvals and inventory; protected API routes reject researcher calls.
- [ ] Search matches name/model/location; category and availability filters combine correctly.
- [ ] Maintenance and unavailable equipment cannot be booked.
- [ ] Dates are displayed consistently in IST; an end before start or a past start is rejected.
- [ ] Overlaps are rejected and adjacent intervals are accepted.
- [ ] Booking submit failure leaves entered form values intact.
- [ ] Booking details show purpose, status and activity history.
- [ ] Reject and administrator cancel require reasons and confirmation; closing the dialog changes nothing.
- [ ] Approval, cancellation and rejection update dashboard/list state.
- [ ] Cancelled/rejected slots can be requested again; old records remain visible.
- [ ] Researcher cannot read/cancel another user's booking via API.
- [ ] Administrator can create/edit equipment and use all history filters.
- [ ] Reload/restart preserves records and signed-in sessions until expiry/logout.
- [ ] Tab reaches all form controls; modal traps focus; Escape closes it.
- [ ] At phone width, navigation wraps/scrolls, catalogue is one column, forms fit, and tables/timeline scroll horizontally.
- [ ] Official SRM logo loads locally; blue-and-gold theme is consistent; demo lab location notice is visible.

## Automated evidence

`npm test` currently reports 48 passing results across the booking, room, biotechnology, availability, Save My Practical, student access, lab systems, migration and CSV tests. Tests use real HTTP requests, two independently signed-in users, a coordinator, and a disk-backed temporary SQLite database. The approval-conflict test deliberately creates impossible-via-API overlapping records to prove defense against legacy/inconsistent data. Reopening SQLite verifies durable cancellation and audit events.
