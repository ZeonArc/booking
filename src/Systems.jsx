import React,{useEffect,useRef,useState} from 'react';
import {Monitor} from 'lucide-react';
import './systems.css';

const STATUS_LABEL={free:'available',booked:'booked',yours:'booked by you',blocked:'not available'};
const tomorrow=()=>new Date(Date.now()+86400000+19800000).toISOString().slice(0,10);

// Loads which systems of a lab are free for a session; waits briefly so typing a time does not fire a request per key.
function useSystemMap(api,roomId,date,start,end,enabled){
 const [state,setState]=useState({data:null,error:'',loading:false});
 useEffect(()=>{
  if(!enabled||!roomId||!date||!start||!end){setState({data:null,error:'',loading:false});return;}
  let stale=false;setState(s=>({...s,error:'',loading:true}));
  const query=new URLSearchParams({start:`${date}T${start}:00+05:30`,end:`${date}T${end}:00+05:30`});
  const timer=setTimeout(()=>api(`/rooms/${roomId}/systems?${query}`).then(data=>{if(!stale)setState({data,error:'',loading:false});}).catch(e=>{if(!stale)setState({data:null,error:e.message,loading:false});}),250);
  return()=>{stale=true;clearTimeout(timer);};
 },[enabled,roomId,date,start,end]);
 return state;
}

// Cinema-style ticket view: a "front of lab" bar, then rows of numbered systems split by an aisle.
export function SystemMap({systems,selected,onSelect}){
 const rows=[];for(let i=0;i<systems.length;i+=10)rows.push(systems.slice(i,i+10));
 const seat=s=><button type="button" key={s.number} className={'seat '+(selected===s.number?'selected':s.status)} disabled={s.status!=='free'&&selected!==s.number} aria-pressed={s.status==='free'||selected===s.number?selected===s.number:undefined} aria-label={`System ${s.number}, ${selected===s.number?'selected':STATUS_LABEL[s.status]}`} title={`System ${s.number} · ${selected===s.number?'selected':STATUS_LABEL[s.status]}`} onClick={()=>onSelect(selected===s.number?null:s.number)}>{s.number}</button>;
 return <div className="lab-map" role="group" aria-label="Lab systems">
  <div className="lab-front" aria-hidden="true">FRONT OF LAB</div>
  {rows.map((row,r)=><div className="seat-row" key={r}><span className="row-label" aria-hidden="true">{String.fromCharCode(65+r)}</span><div className="seat-group">{row.slice(0,5).map(seat)}</div>{row.length>5&&<div className="seat-group">{row.slice(5).map(seat)}</div>}</div>)}
  <ul className="seat-legend" aria-label="Legend"><li><i className="free"/>Available</li><li><i className="booked"/>Booked</li><li><i className="yours"/>Your booking</li><li><i className="selected"/>Selected</li></ul>
 </div>;
}

function MapStatus({state,room}){
 const {data,error,loading}=state;
 if(error)return <div className="alert" role="alert">{error}</div>;
 if(!data)return <p className="hint" role="status">{loading?'Checking systems…':'Choose a future date and time to see which systems are free.'}</p>;
 const booked=data.systems.filter(s=>s.status==='booked'||s.status==='yours').length;
 return <p className="map-summary" role="status"><Monitor size={16} aria-hidden="true"/><strong>{data.free} of {data.room.systems}</strong> systems free{booked>0&&<> · {booked} booked</>}{data.wholeRoomBooked&&<> · the whole lab is reserved for this time</>}{!data.wholeRoomBooked&&data.room.status!=='available'&&<> · this lab is not open for booking</>}</p>;
}

// Inside the booking form: appears for individual access in a lab that has numbered systems.
export function SystemPicker({api,rooms,initial}){
 const anchor=useRef(null);
 const [vals,setVals]=useState({}),[selected,setSelected]=useState(initial||null);
 useEffect(()=>{
  const form=anchor.current.closest('form');
  const read=()=>{const f=new FormData(form);setVals({room:Number(f.get('equipment_id'))||0,date:f.get('date'),start:f.get('start'),end:f.get('end'),type:f.get('access_type')});};
  read();form.addEventListener('input',read);form.addEventListener('change',read);
  return()=>{form.removeEventListener('input',read);form.removeEventListener('change',read);};
 },[]);
 const room=rooms.find(r=>r.id===vals.room);
 const active=vals.type==='individual'&&room?.systems>0;
 const state=useSystemMap(api,room?.id,vals.date,vals.start,vals.end,active);
 // A chosen system that is no longer free for the new time is dropped rather than silently submitted.
 useEffect(()=>{if(state.data&&selected&&state.data.systems.find(s=>s.number===selected)?.status!=='free')setSelected(null);},[state.data]);
 return <div ref={anchor}>
  <input type="hidden" name="system_number" value={active&&selected?selected:''}/>
  {active&&<fieldset className="system-picker"><legend>Choose your system</legend>
   <p className="hint">Individual access books one numbered system, not the whole lab. Other students can book the rest for the same time.</p>
   <MapStatus state={state} room={room}/>
   {state.data&&state.data.systems.length>0&&<SystemMap systems={state.data.systems} selected={selected} onSelect={setSelected}/>}
   <p className="map-choice" aria-live="polite">{selected?`You chose system ${selected}.`:'No system chosen yet.'}</p>
  </fieldset>}
 </div>;
}

// Read-only look at a lab with a button to book the chosen system.
export function LabSystemsView({api,room,defaults,onBook}){
 const [date,setDate]=useState(defaults.date||tomorrow()),[start,setStart]=useState(defaults.start||'10:00'),[end,setEnd]=useState(defaults.end||'11:00'),[selected,setSelected]=useState(null);
 const state=useSystemMap(api,room.id,date,start,end,true);
 useEffect(()=>{if(state.data&&selected&&state.data.systems.find(s=>s.number===selected)?.status!=='free')setSelected(null);},[state.data]);
 const today=new Date(Date.now()+19800000).toISOString().slice(0,10);
 return <div className="lab-view">
  <p className="form-intro">{room.location} · {room.systems} systems. Pick a session to see which systems are free.</p>
  <div className="form-row session-row"><label>Date · IST<input type="date" min={today} value={date} onChange={e=>setDate(e.target.value)} required/></label><label>From<input type="time" value={start} onChange={e=>setStart(e.target.value)} required/></label><label>Until<input type="time" value={end} onChange={e=>setEnd(e.target.value)} required/></label></div>
  <MapStatus state={state} room={room}/>
  {state.data&&state.data.systems.length>0&&<SystemMap systems={state.data.systems} selected={selected} onSelect={setSelected}/>}
  <div className="modal-actions"><button type="button" className="primary" disabled={!selected} onClick={()=>onBook({type:'book',item:room,date,start,end,system:selected,individual:true})}>{selected?`Book system ${selected}`:'Choose a system to book'}</button></div>
 </div>;
}
