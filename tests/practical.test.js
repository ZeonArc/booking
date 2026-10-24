import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planPractical,profileFor,DEMO_PROFILES} from '../shared/practical.js';
import {createApp} from '../server.js';
const rooms=Object.keys(DEMO_PROFILES).map((model,i)=>({id:i+1,model,name:model,kind:'room',status:'available'}));
const start='2035-01-10T14:00:00+05:30',end='2035-01-10T16:00:00+05:30';
const input={activity:'python',students:40,start,end,preferredRoom:5};
const now=Date.parse('2035-01-01T00:00:00Z');
const run=(r=rooms,b=[],p=input)=>planPractical(r,b,p,now);

test('planner ranks capacity fit, explains rejection and never changes inventory',()=>{
 const before=JSON.stringify(rooms),r=run();
 assert.equal(r.source,'demo');assert.match(r.preferredMessage,/30 demo seats/);
 assert.equal(r.suggestions[0].room.model,'CS-2');assert.equal(r.suggestions[0].shiftMinutes,0);
 assert.equal(r.counts.supported,8);assert.equal(r.counts.largeEnough,5);
 assert.ok(r.suggestions.every(s=>s.capacity>=40));assert.equal(JSON.stringify(rooms),before);
 assert.equal(profileFor({kind:'room',model:'UNKNOWN'}),null);
 assert.equal(profileFor({kind:'equipment',model:'CS-1'}),null);
});
test('preferred room wins equal-time ties but time takes priority',()=>{
 const r=run(rooms,[],{...input,preferredRoom:1});assert.equal(r.suggestions[0].room.id,1);
 const block={equipment_id:1,status:'pending',start,end};
 const shifted=run(rooms,[block],{...input,preferredRoom:1});
 assert.equal(shifted.suggestions[0].room.model,'CS-2');assert.match(shifted.preferredMessage,/occupied/);
 assert.notEqual(shifted.suggestions.find(s=>s.room.id===1).shiftMinutes,0);
});
test('single-specialization rescue preserves duration and accepts adjacent slots',()=>{
 const bio=rooms.find(r=>r.model==='BIO-1');
 const block={equipment_id:bio.id,status:'approved',start,end};
 const r=run(rooms,[block],{...input,activity:'molecular',students:20,preferredRoom:bio.id});
 assert.equal(r.suggestions.length,1);assert.equal(r.suggestions[0].shiftMinutes,-120);
 assert.equal(Date.parse(r.suggestions[0].end),Date.parse(start));
 assert.equal(Date.parse(r.suggestions[0].end)-Date.parse(r.suggestions[0].start),7200000);
 for(const status of ['cancelled','rejected'])assert.equal(run(rooms,[{...block,status}],{...input,activity:'molecular',students:20}).suggestions[0].shiftMinutes,0);
});
test('maintenance, unknown capabilities, overcapacity and full-day occupancy return honest empty states',()=>{
 const bio=rooms.find(r=>r.model==='BIO-1'), p={...input,activity:'molecular',students:20};
 assert.match(run([{...bio,status:'maintenance'}],[],{...p,preferredRoom:null}).emptyReason,/maintenance/);
 assert.equal(run(rooms,[],{...input,students:200}).suggestions.length,0);
 assert.equal(run([],[],{...input,preferredRoom:null}).suggestions.length,0);
 const full={equipment_id:bio.id,status:'pending',start:'2035-01-10T08:00:00+05:30',end:'2035-01-10T18:00:00+05:30'};
 assert.equal(run(rooms,[full],p).suggestions.length,0);
});
test('planner rejects malformed input, out-of-hours, impossible dates and past sessions',()=>{
 for(const bad of [{activity:'invented'},{students:0},{students:2.5},{students:'40'},{students:201},{preferredRoom:'1'},{preferredRoom:999},{start:'bad'},{start:end},{start:'2035-01-10T07:00:00+05:30',end:'2035-01-10T09:00:00+05:30'},{end:'2035-01-10T19:00:00+05:30'},{start:'2035-02-30T10:00:00+05:30',end:'2035-02-30T11:00:00+05:30'},{start:'2020-01-10T10:00:00+05:30',end:'2020-01-10T11:00:00+05:30'}])assert.throws(()=>run(rooms,[],{...input,...bad}),{status:400});
});
test('authenticated API plans without writes, revalidates stale requests, retains approval and history',async()=>{
 const {server,db}=createApp();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}/api`;
 async function req(route,method='GET',body,cookie=''){const r=await fetch(base+route,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 try{
  assert.equal((await req('/practical/plan','POST',input)).status,401);
  assert.equal((await req('/practical/profiles')).status,401);
  const student=(await req('/auth/login','POST',{email:'researcher@lab.test',password:'LabDemo123!'})).cookie;
  const admin=(await req('/auth/login','POST',{email:'manager@lab.test',password:'LabDemo123!'})).cookie;
  const profiles=(await req('/practical/profiles','GET',undefined,student)).data;
  assert.equal(profiles.rooms.length,22);assert.ok(profiles.rooms.every(r=>['demo','systems'].includes(r.profile.source)));
  const before=db.prepare('SELECT count(*) n FROM bookings').get().n;
  const result=await req('/practical/plan','POST',{...input,preferredRoom:null},student);
  assert.equal(result.status,200);assert.equal(db.prepare('SELECT count(*) n FROM bookings').get().n,before);
  assert.ok(!JSON.stringify(result.data).includes('user_id'));
  const s=result.data.suggestions[0];
  const body={equipment_id:s.room.id,start:s.start,end:s.end,purpose:'Save My Practical: Python for 40 students; demo profile.',purpose_category:'Practical class',practical:{activity:'python',students:40}};
  const created=await req('/bookings','POST',body,student);assert.equal(created.status,201);assert.equal(created.data.status,'pending');
  assert.equal((await req('/bookings','POST',body,student)).status,409);
  assert.equal((await req('/bookings','POST',{...body,practical:{activity:'python',students:80},equipment_id:profiles.rooms.find(r=>r.model==='CS-5').id},student)).status,400);
  assert.equal((await req('/bookings','POST',{...body,equipment_id:profiles.rooms.find(r=>r.model==='PHY').id},student)).status,400);
  assert.equal((await req(`/admin/bookings/${created.data.id}/approve`,'PATCH',{},student)).status,403);
  assert.equal((await req(`/admin/bookings/${created.data.id}/approve`,'PATCH',{},admin)).status,200);
  assert.equal((await req(`/bookings/${created.data.id}/cancel`,'PATCH',{},student)).status,200);
  const events=(await req(`/bookings/${created.data.id}/events`,'GET',undefined,student)).data;
  assert.deepEqual(events.map(e=>e.action),['created','approved','cancelled']);
  db.prepare("UPDATE equipment SET status='maintenance' WHERE id=?").run(s.room.id);
  assert.equal((await req('/bookings','POST',body,student)).status,409);
 }finally{await new Promise(r=>server.close(r));db.close();}
});
