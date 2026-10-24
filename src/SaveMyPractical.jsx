import React,{useEffect,useRef,useState} from 'react';
import {ArrowRight,Check,FlaskConical} from 'lucide-react';
import './practical.css';

const local=iso=>new Date(Date.parse(iso)+19800000).toISOString();
const tomorrow=()=>local(new Date(Date.now()+86400000).toISOString()).slice(0,10);
export function SaveMyPractical({api,onReserve}){
  const [catalog,setCatalog]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[result,setResult]=useState(null);
  const [activity,setActivity]=useState('python'),[students,setStudents]=useState('40'),[day,setDay]=useState(tomorrow),[start,setStart]=useState('14:00'),[duration,setDuration]=useState('120'),[preferred,setPreferred]=useState('');
  const version=useRef(0);
  async function load(){setError('');try{setCatalog(await api('/practical/profiles'));}catch(e){setError(e.message);}}
  useEffect(()=>{load();return()=>{version.current++;};},[]);
  function changed(){version.current++;setResult(null);setError('');setBusy(false);}
  function example(){changed();setActivity('python');setStudents('40');setDay(tomorrow());setStart('14:00');setDuration('120');setPreferred(String(catalog.rooms.find(r=>r.model==='CS-5')?.id||''));}
  async function plan(e){
    e.preventDefault();const current=++version.current;setBusy(true);setError('');setResult(null);
    try{
      const from=new Date(`${day}T${start}:00+05:30`),to=new Date(+from+Number(duration)*60000);
      const input={activity,students:Number(students),start:from.toISOString(),end:to.toISOString(),preferredRoom:preferred?Number(preferred):null};
      const data=await api('/practical/plan','POST',input);
      if(current===version.current)setResult({...data,input});
    }catch(e){if(current===version.current)setError(e.message);}finally{if(current===version.current)setBusy(false);}
  }
  function choose(s){onReserve({type:'book',item:s.room,date:local(s.start).slice(0,10),start:local(s.start).slice(11,16),end:local(s.end).slice(11,16),
    practical:{activity:result.input.activity,students:result.students},
    purpose:`Save My Practical: ${result.activity} for ${result.students} students. Demo profile: ${s.capacity} seats. Coordinator to verify facilities and supervision.`});}
  return <div className="practical">
    <section className="rescue-intro"><div><div className="eyebrow">FROM A BOOKING PROBLEM TO A PRACTICAL PLAN</div><h2>Keep the practical.<br/>Rethink the room.</h2><p>Tell us what you’re teaching, how many students are coming, and when. Find a lab that fits—with a reason for every recommendation.</p></div><div className="rescue-route" aria-label="Planner workflow"><span>Activity + class size</span><ArrowRight/><span>Compatible, free lab</span><ArrowRight/><span>Coordinator review</span></div></section>
    <div className="rescue-disclaimer"><strong>Presentation demo data</strong> Capacities, capabilities and the 08:00–18:00 search window are illustrative, not verified SRM specifications. Room availability comes from current bookings. This does not certify equipment, safety or staffing.</div>
    {error&&<div className="alert" role="alert">{error}{!catalog&&<button type="button" onClick={load}>Retry loading planner</button>}</div>}
    {!catalog&&!error&&<p role="status">Loading lab capability profiles…</p>}
    {catalog&&<><section className="panel rescue-input"><div className="panel-heading"><div><h2>What does your practical need?</h2><p>One whole class, one room, the full session duration.</p></div><button className="secondary" onClick={example}>Load demo example</button></div>
      <form onSubmit={plan} onChange={changed}><div className="rescue-fields">
        <label>Practical activity<select value={activity} onChange={e=>setActivity(e.target.value)}>{catalog.activities.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
        <label>Number of students<input type="number" min="1" max="200" required value={students} onChange={e=>setStudents(e.target.value)}/></label>
        <label>Date · IST<input type="date" min={local(new Date().toISOString()).slice(0,10)} required value={day} onChange={e=>setDay(e.target.value)}/></label>
        <label>Preferred start · IST<input type="time" min="08:00" max="17:30" required value={start} onChange={e=>setStart(e.target.value)}/></label>
        <label>Session duration<select value={duration} onChange={e=>setDuration(e.target.value)}>{[30,60,90,120,180,240,360,480].map(n=><option key={n} value={n}>{n} minutes</option>)}</select></label>
        <label>Preferred lab (optional)<select value={preferred} onChange={e=>setPreferred(e.target.value)}><option value="">Any compatible lab</option>{catalog.rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      </div><div className="rescue-submit"><p>Ranked by nearest time → preferred lab → fewer unused seats. Nearby times use 30-minute steps on the same day.</p><button className="primary" disabled={busy}><FlaskConical size={18}/>{busy?'Finding a rescue plan…':'Save my practical'}</button></div></form></section>
      {result&&<section className="rescue-results" aria-live="polite"><h2>{result.suggestions.length?'Your practical has options.':'Let’s adjust the plan.'}</h2><p className="rescue-verdict">{result.preferredMessage}</p>
        <div className="rescue-funnel"><span>{result.counts.supported} capability matches</span><ArrowRight size={15}/><span>{result.counts.largeEnough} fit the class</span><ArrowRight size={15}/><span>{result.counts.matched} have a free slot</span></div>
        {!result.suggestions.length&&<div className="panel rescue-empty">{result.emptyReason} No booking has been made.</div>}
        <div className="rescue-options">{result.suggestions.map((s,i)=><article className="panel rescue-option" key={s.room.id}><div className="rescue-option-top"><span>{i===0?'BEST MATCH':`ALTERNATIVE ${i}`}</span><strong>{s.shiftMinutes===0?'Same time':'Time adjustment'}</strong></div><h3>{s.room.name}</h3><div className="rescue-session">{local(s.start).slice(11,16)}–{local(s.end).slice(11,16)} <small>IST · {local(s.start).slice(0,10)}</small></div><ul>{s.reasons.map(reason=><li key={reason}><Check size={15}/><span>{reason}</span></li>)}</ul><button className={i===0?'primary':'secondary'} onClick={()=>choose(s)}>Review & request this lab<ArrowRight size={16}/></button></article>)}</div>
        <p className="rescue-footnote">Showing up to six labs, one best slot per lab. Suggestions do not hold a slot. Submission rechecks conflicts, room status, demo capacity and capability. Approval is still required.</p>
      </section>}
      <details className="panel rescue-profiles"><summary>Inspect demo lab capacities & capabilities</summary><div className="table-wrap"><table><thead><tr><th>Lab</th><th>Demo seats</th><th>Demo capabilities</th></tr></thead><tbody>{catalog.rooms.map(r=><tr key={r.id}><td>{r.name}</td><td>{r.profile?.capacity??'Not configured'}</td><td>{r.profile?.capabilities.map(id=>catalog.activities.find(a=>a.id===id)?.label).join(', ')||'Excluded from recommendations'}</td></tr>)}</tbody></table></div></details>
    </>}
  </div>;
}
