# Save My Practical — 90-second presentation demo

## What to show

1. Sign in as student and open **Save My Practical** in the sidebar.
2. Click **Load demo example**. It selects Python, 40 students, tomorrow 14:00–16:00 IST, and CS Lab 5.
3. Click **Save my practical**. CS Lab 5 has only 30 demonstration seats. The system explains this and recommends larger compatible labs. With a free schedule, CS Lab 2 ranks first with 40 seats.
4. Point to the decision trail: capability matches → enough seats → free slots. Every recommendation explains its fit.
5. Click **Review & request this lab**. Show the prefilled room, date, times and booking reason. Submit if you want a real local demo reservation; it is pending, not automatically approved.
6. Return to the planner, choose the room you just requested as preferred, and run the same session again. Explain the conflict message, other available labs and alternative times. If other existing bookings affect results, use a fresh future date.
7. For a time-shift example, book a Molecular Biology session for 20 students at 14:00–16:00 on a free future date. Run that same request again. With only one matching specialized lab, the planner suggests an adjacent free time, preserving the full two hours. This requires actual demo booking submission; nothing is silently seeded.
8. Sign in as coordinator to approve, or cancel your demonstration reservations afterward.

## What to say

“A normal booking form checks whether my chosen room is free. Save My Practical also checks whether the room fits my teaching activity and class size. Here, 40 students cannot fit into the preferred lab's 30 demo seats. Rather than just rejecting me, the system explains the mismatch and recommends a compatible room. If a room is occupied, it searches nearby times without shortening the practical. I review the suggestion before submitting, and the coordinator still approves it.”

## Technical explanation

“This is a transparent rule-based constraint matcher, not a generative AI model. React sends the activity, group size and preferred interval to Express. The server combines demo capability profiles with SQLite booking availability. It filters for capability, capacity and operational status, then checks interval overlap against pending and approved requests. Suggestions are ranked by smallest time change, preferred room, and fewest unused seats. The normal booking transaction rechecks conflicts at submission to prevent stale recommendations from double-booking.”

## Honest answers to likely questions

- **Are these official lab capacities?** No. All capacities, capabilities and search hours are clearly marked demonstration data; department verification is needed before deployment.
- **Is this a world-first feature?** No such claim is made. The contribution is an explainable, campus-specific recovery workflow integrated with approval and audit history.
- **Does it book automatically?** No. Suggestions are read-only. The user reviews and submits a pending request.
- **Can it split classes?** Not in this version. It requires one lab to fit the whole class; an oversized class gets a clear empty-state explanation.
- **Is lab equipment guaranteed?** No. Capability labels describe the demonstration room profile. Equipment reservations remain independent; safety, consumables and supervision need coordinator confirmation.
- **Can coordinators edit capacities in the UI?** Not yet. Demo profiles are versioned in `shared/practical.js`, keyed by room reference code. Unknown codes are excluded. A verified profile-management screen is a future enhancement.
- **How far does it search?** Same date, within illustrative 08:00–18:00 IST hours, in 30-minute offsets from the requested start. It returns up to six labs, one best slot per lab. Equal-distance times prefer the earlier slot.
- **What if someone else books first?** Submission rechecks the slot transactionally and rejects a conflict; rerun the planner for fresh alternatives.

## Architecture

React planner → authenticated POST /api/practical/plan → demo profiles + current SQLite bookings → ranked explanations → normal booking review → transactional POST /api/bookings → coordinator approval → retained event history.

The planning endpoints do not create reservations or expose requester names/purposes. Guided submissions include an optional `practical` object so the server can revalidate demo capacity and capability. Ordinary bookings remain unchanged. The generated booking reason records the planning context as text; this is not a separate structured practical-request database.
