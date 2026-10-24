import React,{useState} from 'react';
import {PURPOSE_CATEGORIES} from '../shared/booking.js';
import {accessLabel,durationLabel,summarizeAccess} from '../shared/access.js';
import './access.css';

export function BookingAccessFields({kind,practical,startIndividual=false}){
 const [type,setType]=useState(kind==='room'&&!startIndividual?'lab':'individual');
 const [purpose,setPurpose]=useState('Practical class');
 const [count,setCount]=useState(String(practical?.students||1));
 return <fieldset className="access-fields"><legend>Who needs access?</legend>
  <label>Access type<select name="access_type" value={type} onChange={e=>{setType(e.target.value);if(e.target.value==='individual')setCount('1');}}>
   {!practical&&<option value="individual">Individual access · one student</option>}{kind==='room'&&<option value="lab">Lab / group access</option>}
  </select></label>
  <label>Number of students<input name="student_count" type="number" min="1" max="200" required value={type==='individual'?'1':count} readOnly={type==='individual'||!!practical} onChange={e=>setCount(e.target.value)}/></label>
  <p className="hint">Include yourself if you are participating. This is a requested headcount, not recorded attendance. Each booking still reserves the selected resource exclusively.</p>
  <label>Purpose category<select name="purpose_category" value={purpose} onChange={e=>setPurpose(e.target.value)} required>{PURPOSE_CATEGORIES.map(p=><option key={p}>{p}</option>)}</select></label>
  {purpose==='Project work'&&<label>Project title<input name="project_title" placeholder="e.g. Smart irrigation prototype" minLength={3} maxLength={120} required/></label>}
 </fieldset>;
}

export function BookingSessionFields({modal}){
 const today=new Date(Date.now()+19800000).toISOString().slice(0,10);
 const [day,setDay]=useState(modal.date||new Date(Date.now()+86400000+19800000).toISOString().slice(0,10));
 const [start,setStart]=useState(modal.start||'10:00');
 const [end,setEnd]=useState(modal.end||(modal.start?`${String(Math.min(23,Number(modal.start.slice(0,2))+1)).padStart(2,'0')}:${modal.start.slice(3)}`:'11:00'));
 return <div className="session-fields"><label>Booking date<input name="date" type="date" min={today} value={day} onChange={e=>setDay(e.target.value)} required/></label>
  <div className="form-row"><label>Start time · IST<input name="start" type="time" value={start} onChange={e=>setStart(e.target.value)} required/></label><label>End time · IST<input name="end" type="time" value={end} onChange={e=>setEnd(e.target.value)} required/></label></div>
  <p className="duration-preview" role="status">Requested duration: <strong>{durationLabel(`${day}T${start}:00+05:30`,`${day}T${end}:00+05:30`)}</strong> · maximum 8 hours</p>
 </div>;
}

export function AccessDetails({booking}){
 return <div className="access-detail"><span>{accessLabel(booking.access_type)}</span><span>{booking.student_count==null?'Student count not recorded':`${booking.student_count} student${booking.student_count===1?'':'s'}`}</span><span>{durationLabel(booking.start,booking.end)}</span>{booking.system_number&&<span className="system-tag">System {booking.system_number}</span>}{booking.project_title&&<strong>Project: {booking.project_title}</strong>}</div>;
}

export function AccessSummary({bookings,scope='Current selection'}){
 const data=summarizeAccess(bookings);
 return <section className="access-summary" aria-label="Student access summary"><h2>Student access & project work</h2><p>{scope} · totals follow the records and filters shown below.</p>
  <div className="access-summary-grid">{[['individual','Individual access'],['lab','Lab / group access'],['project','Project work (both access types)']].map(([key,title])=>{const s=data[key];return <article key={key} className="access-summary-card"><h3>{title}</h3><strong>{s.requests} <small>requests · {s.pending} pending</small></strong><dl><div><dt>Distinct requester accounts</dt><dd>{s.requesters}</dd></div><div><dt>Student participations requested</dt><dd>{s.students}</dd></div><div><dt>Total requested duration</dt><dd>{(s.minutes/60).toFixed(1)} h</dd></div><div><dt>Approved reserved duration</dt><dd>{(s.approvedMinutes/60).toFixed(1)} h</dd></div></dl>{s.unknownStudents>0&&<p>{s.unknownStudents} request(s) have no recorded headcount.</p>}</article>;})}</div>
  <p className="access-metric-note">Participation totals sum the headcount on each request; repeat students may be counted more than once. Requester accounts are not a roster of all participants. Durations are booking hours, not student-hours or actual attendance. Project work overlaps the access-type totals; do not add the three cards together. {data.unclassified>0&&`${data.unclassified} older/unclassified request(s) have no access type recorded.`}</p>
 </section>;
}
