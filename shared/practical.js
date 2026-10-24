import {validateInterval} from './booking.js';

// Presentation fixtures, NOT verified campus capacity or safety certification.
export const ACTIVITIES = [
  ['python','Python programming'],['database','Database practical'],['web','Web development'],
  ['arvr','AR / VR development'],['ios','iOS / macOS development'],
  ['electrical','Electrical circuits'],['electronics','Electronics & signals'],['iot','IoT prototyping'],
  ['mechanical','Mechanical fabrication'],['wood','Woodworking'],['physics','Physics experiments'],
  ['chemistry','Chemistry practical'],['molecular','Molecular biology'],['microbiology','Microbiology'],
  ['biochemistry','Biochemistry'],['culture','Cell culture'],['genetics','Genetics'],['bioinformatics','Bioinformatics']
].map(([id,label])=>({id,label}));
export const DEMO_PROFILES = {
  'CS-1':[60,['python','database','web']], 'CS-2':[40,['python','database','web']],
  'CS-3':[45,['python','database','web']], 'CS-4':[60,['python','database','web']],
  'CS-5':[30,['python','database','web']], 'CS-6':[50,['python','database','web']],
  ARVR:[24,['arvr']], MAC:[30,['ios','python','web']], EEE:[30,['electrical']],
  ECE:[36,['electronics']], IOT:[30,['iot']], MECH:[30,['mechanical']], WOOD:[20,['wood']],
  PHY:[40,['physics']], 'CHEM-1':[30,['chemistry']], 'CHEM-2':[36,['chemistry']],
  'BIO-1':[24,['molecular']], 'BIO-2':[24,['microbiology']], 'BIO-3':[30,['biochemistry']],
  'BIO-4':[20,['culture']], 'BIO-5':[24,['genetics']], 'BIO-6':[32,['bioinformatics','python']]
};
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
export function profileFor(room){
  const p=room.kind==='room'&&Object.hasOwn(DEMO_PROFILES,room.model)?DEMO_PROFILES[room.model]:null;
  // Supplied workstation counts replace the demo seat guess; one student works at one system.
  return p?{capacity:room.systems>0?room.systems:p[0],capabilities:p[1],source:room.systems>0?'systems':'demo'}:null;
}
export function validateRequirements(input){
  if(!input||!ACTIVITIES.some(a=>a.id===input.activity))fail('Choose a supported practical activity');
  if(!Number.isInteger(input.students)||input.students<1||input.students>200)fail('Student count must be a whole number between 1 and 200');
}
export function validatePracticalRoom(room,input){
  validateRequirements(input);
  const p=profileFor(room);
  if(!p||!p.capabilities.includes(input.activity))fail('This room does not support the activity in the demo capability profile');
  if(p.capacity<input.students)fail('This room is too small for this class in the demo capacity profile');
}
export function planPractical(rooms,bookings,input,now=Date.now()){
  validateRequirements(input);
  const {start,end}=validateInterval(input.start,input.end,now);
  if(input.preferredRoom!==undefined&&input.preferredRoom!==null&&(!Number.isSafeInteger(input.preferredRoom)||!rooms.some(r=>r.id===input.preferredRoom)))fail('Choose a valid preferred lab room');
  const startMs=Date.parse(start), duration=Date.parse(end)-startMs;
  const day=new Date(startMs+19800000).toISOString().slice(0,10);
  const opening=Date.parse(day+'T08:00:00+05:30'), closing=Date.parse(day+'T18:00:00+05:30');
  if(startMs<opening||startMs+duration>closing)fail('For this demo, choose a session within 08:00–18:00 IST');
  const label=ACTIVITIES.find(a=>a.id===input.activity).label;
  const supported=rooms.filter(r=>profileFor(r)?.capabilities.includes(input.activity));
  const enough=supported.filter(r=>profileFor(r).capacity>=input.students);
  const ready=enough.filter(r=>r.status==='available');
  const blocks=bookings.filter(b=>['pending','approved'].includes(b.status));
  const free=(room,s)=>!blocks.some(b=>b.equipment_id===room.id&&Date.parse(b.start)<s+duration&&Date.parse(b.end)>s);
  const candidates=[];
  for(const room of ready){
    // Keep the requested minute offset, then search in 30-minute steps on the same day.
    const times=[];
    for(let offset=-20;offset<=20;offset++){
      const s=startMs+offset*1800000;
      if(s>=opening&&s>=now&&s+duration<=closing&&free(room,s))times.push(s);
    }
    times.sort((a,b)=>Math.abs(a-startMs)-Math.abs(b-startMs)||a-b);
    if(!times.length)continue;
    const s=times[0], p=profileFor(room), shiftMinutes=(s-startMs)/60000;
    candidates.push({room,capacity:p.capacity,start:new Date(s).toISOString(),end:new Date(s+duration).toISOString(),shiftMinutes,
      preferred:room.id===input.preferredRoom,reasons:[`${label} is supported by the demo profile.`,`${p.capacity} demo seats for ${input.students} students.`,
      shiftMinutes===0?'Your requested time is free.':`${Math.abs(shiftMinutes)} minutes ${shiftMinutes>0?'later':'earlier'}; the full session is preserved.`,
      'No pending or approved room bookings overlap this slot.']});
  }
  candidates.sort((a,b)=>Math.abs(a.shiftMinutes)-Math.abs(b.shiftMinutes)||Number(b.preferred)-Number(a.preferred)||(a.capacity-input.students)-(b.capacity-input.students)||a.room.id-b.room.id);
  let preferredMessage='No preferred room selected. Comparing all compatible labs.';
  const preferred=rooms.find(r=>r.id===input.preferredRoom);
  if(preferred){const p=profileFor(preferred);
    preferredMessage=!p?.capabilities.includes(input.activity)?`${preferred.name} does not match this activity in the demo profile.`:
      p.capacity<input.students?`${preferred.name} has ${p.capacity} demo seats; your class needs ${input.students}.`:
      preferred.status!=='available'?`${preferred.name} is marked ${preferred.status}.`:
      !free(preferred,startMs)?`${preferred.name} is occupied at your requested time. Here are alternatives.`:
      `${preferred.name} fits your class and is free at your requested time.`;
  }
  return {source:'demo',activity:label,students:input.students,preferredMessage,
    counts:{supported:supported.length,largeEnough:enough.length,ready:ready.length,matched:candidates.length},
    suggestions:candidates.slice(0,6),
    emptyReason:!supported.length?'No room has this demo capability.':!enough.length?'No compatible room has enough demo seats. Reduce the group size or ask a coordinator to arrange separate batches.':!ready.length?'All capacity-matched rooms are in maintenance or unavailable.':'No free slot fits the full session within 08:00–18:00 IST. Try another date or a shorter session.'};
}
