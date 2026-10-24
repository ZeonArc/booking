# REST API

## Availability and presentation features

`GET /rooms/available?start=<ISO-with-zone>&end=<ISO-with-zone>` requires authentication and returns `{start,end,rooms}` with normalized UTC timestamps. Only available rooms with no pending/approved overlap are returned. The same future-date, same-IST-day and maximum-eight-hour validations used for creation apply. Availability is informational; creation always rechecks conflicts transactionally.

### Student access fields on `POST /bookings`

| Field | Rule |
|---|---|
| `access_type` | `"individual"` or `"lab"`. `"lab"` is accepted only for rooms (`resource_kind: "room"`). |
| `student_count` | JSON integer 1–200 (not a string). Must be `1` for `"individual"`. |
| `project_title` | String up to 120 characters. Required with at least 3 non-space characters when `purpose_category` is `"Project work"`; stored as `""` for every other category. |

If none of the three fields is sent (and no `practical` object), the booking is created with `access_type: null`, `student_count: null` and `project_title: ""` so older clients keep working. Once any of the three is sent, both `access_type` and `student_count` are required. With a `practical` object, `access_type` defaults to `"lab"` and `student_count` to `practical.students`; any other values return 400. Validation errors return 400 before conflict checks.

`GET /bookings`, `GET /bookings/:id` and `GET /admin/bookings/pending` include `access_type`, `student_count` and `project_title`. Researchers receive them only for their own bookings. `GET /availability` never includes them. Duration is not stored; clients compute it from `start` and `end`. The frontend CSV export adds `Access type`, `Student count`, `Project title` and `Duration (minutes)` columns; a missing access type or student count is written as `Not recorded`.

```json
// POST /bookings: a group project session in a lab room
{
  "equipment_id": 13,
  "start": "2030-01-10T10:00:00+05:30",
  "end": "2030-01-10T12:30:00+05:30",
  "purpose": "ECE Team B: sensor calibration and project testing",
  "purpose_category": "Project work",
  "access_type": "lab",
  "student_count": 25,
  "project_title": "Smart irrigation prototype"
}
```

Room creation/update accepts an optional `specialization` string, up to 120 characters. Six Biotechnology labs use distinct configurable specialization labels. Booking creation accepts `purpose_category`: `Practical class`, `Project work`, `Research`, `Workshop`, `Training`, `Assessment`, or `Other`. Omission defaults to `Other` for compatibility. The required detailed reason stays in `purpose`. Reports export the authenticated booking data already returned by `/bookings` using frontend date/type/status/category filters; no additional unrestricted export endpoint exists.

## Lab rooms

`GET /rooms` lists rooms for signed-in users. Administrators may `POST /rooms` or `PUT /rooms/:id` using `name`, `category` (department), `model` (reference code), `location`, `description`, `quantity: 1`, and `status`. Room IDs and equipment IDs share one unique resource ID space. Existing booking endpoints work for either kind: send the selected room ID in `equipment_id` and a required booking reason in `purpose`. `GET /bookings` and the pending queue include `resource_kind: "room"` or `"equipment"`. The dashboard adds `totalRooms` and `availableRooms`. Unavailable/maintenance rooms cannot receive new requests or approvals.

Base URL: `http://localhost:3000/api`. Send JSON for mutation bodies. Authentication is an HttpOnly `session` cookie. Responses are JSON; errors are `{ "error": "Helpful message" }`. Typical codes: 400 validation, 401 unauthenticated/invalid credentials, 403 forbidden, 404 missing, 409 conflict/invalid transition, 429 login rate limit.

| Method | Path | Access / response |
|---|---|---|
| POST | /auth/register | Public: name, email, password (10–200 characters); 201 id/message |
| POST | /auth/login | Public: email/password; 200 user and session cookie |
| POST | /auth/logout | Signed in: revoke session and clear cookie |
| GET | /me | Current user's id/name/email/role |
| GET | /equipment | Signed in: all equipment |
| POST | /equipment | Admin: create inventory entry; 201 id |
| PUT | /equipment/:id | Admin: update inventory entry; 200 id |
| GET | /bookings | Researcher's own bookings or all for admin; joined equipment/user names |
| POST | /bookings | Signed in: create request with optional access fields (see above); 201 id/status |
| GET | /bookings/:id | Owner or admin: booking record |
| GET | /bookings/:id/events | Owner or admin: ordered action/actor/note/timestamp history |
| PATCH | /bookings/:id/cancel | Owner or admin; admin must supply note |
| GET | /availability | Signed in: active intervals, no personal details |
| GET | /admin/bookings/pending | Admin: pending requests with equipment/user names |
| PATCH | /admin/bookings/:id/approve | Admin: approve pending booking; optional note |
| PATCH | /admin/bookings/:id/reject | Admin: reject pending booking; mandatory note |
| GET | /admin/dashboard | Admin: totalEquipment, availableEquipment, pending, approved |

Internal role names are `researcher` and `manager`; the UI labels managers as lab coordinators. Dates/times are ISO strings with a timezone. Responses use UTC timestamps. Catalogue and history filters run on the permitted result sets in the frontend.

## Examples (PowerShell)

```powershell
$base = 'http://localhost:3000/api'
Invoke-RestMethod "$base/auth/login" -Method Post -ContentType 'application/json' -Body '{"email":"researcher@lab.test","password":"LabDemo123!"}' -SessionVariable labSession

$bookingDate = (Get-Date).AddDays(10).ToString('yyyy-MM-dd')
$booking = @{ equipment_id=1; start="$($bookingDate)T10:00:00+05:30"; end="$($bookingDate)T11:00:00+05:30"; purpose='Final-year project: cell imaging' } | ConvertTo-Json
Invoke-RestMethod "$base/bookings" -Method Post -WebSession $labSession -ContentType 'application/json' -Body $booking
# 201: { "id": 7, "status": "pending" } (id varies)

Invoke-RestMethod "$base/bookings" -WebSession $labSession
```

Submitting the same interval again gives 409: `This time overlaps an existing booking. Choose another slot.` Submitting 11:00–12:00 after 10:00–11:00 succeeds.

```json
// POST /equipment or PUT /equipment/:id (administrator session)
{
  "name": "Digital oscilloscope",
  "category": "Electronics",
  "model": "DS-100",
  "location": "ECE · Electronics Lab",
  "description": "Four-channel signal analysis",
  "quantity": 1,
  "status": "available"
}
```

```json
// PATCH /admin/bookings/7/reject
{ "note": "Complete equipment induction before booking." }
// 200 response
{ "id": 7, "status": "rejected" }
```

Cancel and approve return the same shape with `cancelled` or `approved`. A rejected/cancelled record cannot be approved later. Create a fresh request instead. Equipment statuses: `available`, `maintenance`, `unavailable`; booking statuses: `pending`, `approved`, `rejected`, `cancelled`.

## Save My Practical (authenticated)

- `GET /api/practical/profiles`: `{source: "demo", activities, rooms}`. Each room has a nullable demo profile containing `capacity`, capability IDs, and `source`. Unknown reference codes have no profile.
- `POST /api/practical/plan`: `{activity: "python", students: 40, start: "2030-01-10T14:00:00+05:30", end: "2030-01-10T16:00:00+05:30", preferredRoom: null}`. Use a future date. Returns `source`, activity label, students, preferred-room explanation, funnel counts, up to six suggestions, and an empty-state explanation. Each suggestion includes room, demo capacity, UTC start/end, shift in minutes and reasons. No booking write occurs; no requester data is returned.
- Normal `POST /api/bookings` optionally accepts `practical: {activity: "python", students: 40}` for guided booking validation against the chosen room's demo capacity/capabilities. Existing booking authorization, conflict transaction and approval rules still apply. Purpose text retains the human-readable context. The activity is not stored as a structured field; the class size is stored as `student_count` with `access_type: "lab"`.

Planner inputs: supported activity, integer student count 1–200, valid future same-day interval up to eight hours, within illustrative 08:00–18:00 IST search hours. Alternative starts use 30-minute offsets on the same date. Rank: smallest absolute time shift, preferred room, fewest unused seats, resource ID. One best slot per room, earlier first for equal-distance alternatives. Cancelled/rejected bookings do not block; pending/approved bookings do. Validation errors return 400; unauthenticated requests return 401.
