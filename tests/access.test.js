import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../server.js';
import {validateAccess,summarizeAccess,durationLabel,durationMinutes} from '../shared/access.js';
import {bookingsCsv} from '../shared/booking.js';

test('access validation enforces individual headcount, room-only groups and project title',()=>{
 const room={kind:'room'},instrument={kind:'equipment'};
 assert.deepEqual(validateAccess({},room),{access_type:null,student_count:null,project_title:''});
 assert.deepEqual(validateAccess({access_type:'individual',student_count:1},instrument),{access_type:'individual',student_count:1,project_title:''});
 assert.equal(validateAccess({access_type:'lab',student_count:5,purpose_category:'Project work',project_title:'  Sensor network  '},room).project_title,'Sensor network');
 for(const body of [{access_type:'invalid',student_count:1},{access_type:'individual',student_count:2},{access_type:'lab',student_count:0},{access_type:'lab',student_count:201},{access_type:'lab',student_count:1.5},{access_type:'lab',student_count:'4'},{student_count:4},{access_type:'lab',student_count:4,purpose_category:'Project work',project_title:'  '},{access_type:'lab',student_count:4,project_title:'x'.repeat(121)},{access_type:'lab',student_count:4,project_title:42}])assert.throws(()=>validateAccess(body,room),{status:400});
 assert.throws(()=>validateAccess({access_type:'lab',student_count:2},instrument),{status:400});
});

test('practical handoff derives group headcount and rejects inconsistent requirements',()=>{
 const practical={activity:'python',students:40};
 assert.equal(validateAccess({practical},{kind:'room'}).student_count,40);
 assert.throws(()=>validateAccess({practical,access_type:'lab',student_count:20},{kind:'room'}),{status:400});
 assert.throws(()=>validateAccess({practical,access_type:'individual',student_count:1},{kind:'room'}),{status:400});
});

test('student summary separates requests, accounts, participation totals and approved durations',()=>{
 const base={start:'2035-01-01T10:00:00Z',end:'2035-01-01T11:30:00Z',purpose_category:'Project work',user_id:1};
 const rows=[{...base,access_type:'individual',student_count:1,status:'pending'},{...base,access_type:'individual',student_count:1,status:'approved'},
  {...base,user_id:3,access_type:'lab',student_count:5,status:'cancelled'},{...base,access_type:null,student_count:null,status:'rejected'}];
 const s=summarizeAccess(rows);
 assert.equal(s.individual.requests,2);assert.equal(s.individual.requesters,1);assert.equal(s.individual.students,2);
 assert.equal(s.individual.pending,1);assert.equal(s.individual.minutes,180);assert.equal(s.individual.approvedMinutes,90);
 assert.equal(s.lab.students,5);assert.equal(s.lab.approvedMinutes,0);assert.equal(s.project.students,7);assert.equal(s.project.unknownStudents,1);assert.equal(s.unclassified,1);
 assert.equal(summarizeAccess([]).lab.requests,0);assert.equal(durationLabel(base.start,base.end),'1 h 30 min');
 assert.equal(durationMinutes(base.end,base.start),0);assert.equal(durationLabel('bad','bad'),'Choose a valid time range');
 const csv=bookingsCsv([{...rows[0],project_title:'=SUM(1,2)'}]);
 assert.ok(csv.includes('"Access type","Student count","Project title","Duration (minutes)"'));
 assert.ok(csv.includes('"Individual access","1","\'=SUM(1,2)","90"'));
 assert.ok(bookingsCsv([rows[3]]).includes('"Not recorded","Not recorded"'));
});

test('access migration preserves older bookings and is idempotent',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'srm-access-')),file=path.join(dir,'test.sqlite');
 const initial=createApp(file);
 const before=initial.db.prepare('SELECT id,purpose,start,end FROM bookings').all();
 for(const name of ['access_type','student_count','project_title'])initial.db.exec(`ALTER TABLE bookings DROP COLUMN ${name}`);
 initial.db.close();
 let reopened;
 try{
  reopened=createApp(file);
  assert.deepEqual(reopened.db.prepare('SELECT id,purpose,start,end FROM bookings').all(),before);
  assert.ok(reopened.db.prepare('SELECT access_type,student_count,project_title FROM bookings').all().every(b=>b.access_type===null&&b.student_count===null&&b.project_title===''));
  reopened.db.prepare("UPDATE bookings SET access_type='lab',student_count=6,project_title='Retained project' WHERE id=1").run();reopened.db.close();reopened=null;
  reopened=createApp(file);assert.equal(reopened.db.prepare('SELECT student_count FROM bookings WHERE id=1').get().student_count,6);
 }finally{reopened?.db.close();rmSync(dir,{recursive:true,force:true});}
});

test('access details persist through approval and cancellation without leaking to other students',async()=>{
 const {server,db}=createApp();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}/api`;
 async function req(route,method='GET',body,cookie=''){const r=await fetch(base+route,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 try{
  const login=async email=>(await req('/auth/login','POST',{email,password:'LabDemo123!'})).cookie;
  const student=await login('researcher@lab.test'),admin=await login('manager@lab.test'),other=await login('sam@lab.test');
  const room=(await req('/rooms','GET',undefined,student)).data[0];
  const day=new Date(Date.now()+45*86400000).toISOString().slice(0,10);
  const body={equipment_id:room.id,start:day+'T13:00:00+05:30',end:day+'T15:30:00+05:30',purpose:'Build a smart irrigation prototype',purpose_category:'Project work',access_type:'lab',student_count:6,project_title:'Smart irrigation'};
  assert.equal((await req('/bookings','POST',{...body,student_count:-2},student)).status,400);
  assert.equal((await req('/bookings','POST',{...body,project_title:''},student)).status,400);
  const created=await req('/bookings','POST',body,student);assert.equal(created.status,201);const id=created.data.id;
  const pending=(await req('/admin/bookings/pending','GET',undefined,admin)).data.find(b=>b.id===id);
  assert.equal(pending.student_count,6);assert.equal(pending.access_type,'lab');assert.equal(pending.project_title,'Smart irrigation');assert.equal(durationMinutes(pending.start,pending.end),150);
  assert.equal((await req('/bookings/'+id,'GET',undefined,other)).status,403);
  assert.ok(!(await req('/bookings','GET',undefined,other)).data.some(b=>b.id===id));
  assert.ok(!(await req('/availability','GET',undefined,other)).data.some(b=>Object.hasOwn(b,'student_count')||Object.hasOwn(b,'project_title')));
  // CS Lab 1 has numbered systems: individual access must pick one, and a whole-room booking blocks every system.
  assert.equal((await req('/bookings','POST',{...body,access_type:'individual',student_count:1},other)).status,400);
  assert.equal((await req('/bookings','POST',{...body,access_type:'individual',student_count:1,system_number:12},other)).status,409);
  assert.equal((await req(`/admin/bookings/${id}/approve`,'PATCH',{},admin)).status,200);
  assert.equal((await req(`/bookings/${id}/cancel`,'PATCH',{},student)).status,200);
  const saved=(await req('/bookings/'+id,'GET',undefined,student)).data;
  assert.equal(saved.student_count,6);assert.equal(saved.project_title,'Smart irrigation');assert.equal(saved.status,'cancelled');
  const single=await req('/bookings','POST',{...body,access_type:'individual',student_count:1,system_number:12},other);assert.equal(single.status,201);
  assert.equal((await req('/bookings/'+single.data.id,'GET',undefined,other)).data.student_count,1);
 }finally{await new Promise(r=>server.close(r));db.close();}
});
