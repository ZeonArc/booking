import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../server.js';

test('complete API workflow, authorization, conflicts and persistence',async t=>{
 const directory=mkdtempSync(path.join(tmpdir(),'labreserve-test-'));const dbPath=path.join(directory,'test.sqlite');
 const {server,db}=createApp(dbPath);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 async function request(route,method='GET',body,cookie=''){const res=await fetch(base+'/api'+route,{method,headers:{'Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};}
 let user,admin,other,id;
 const start=new Date();start.setUTCDate(start.getUTCDate()+10);start.setUTCHours(4,30,0,0);const timestamp=minutes=>new Date(+start+minutes*60000).toISOString();
 const booking=(offset=0,end=60)=>({equipment_id:1,start:timestamp(offset),end:timestamp(end),purpose:'Microscopy research experiment'});
 try{
 await t.test('registration, duplicate registration and login',async()=>{
   assert.equal((await request('/auth/register','POST',{name:'Test Researcher',email:'new@lab.test',password:'SecureTest123!',role:'manager'})).status,201);
   assert.equal((await request('/auth/register','POST',{name:'Test Researcher',email:'new@lab.test',password:'SecureTest123!'})).status,409);
   const login=await request('/auth/login','POST',{email:'new@lab.test',password:'SecureTest123!'});assert.equal(login.status,200);assert.equal(login.data.user.role,'researcher');user=login.cookie;
   assert.equal((await request('/auth/login','POST',{email:'new@lab.test',password:'bad'})).status,401);
   admin=(await request('/auth/login','POST',{email:'manager@lab.test',password:'LabDemo123!'})).cookie;
   other=(await request('/auth/login','POST',{email:'sam@lab.test',password:'LabDemo123!'})).cookie;
 });
 await t.test('authentication, role protection and cross-origin protection',async()=>{
   assert.equal((await request('/equipment')).status,401);
   assert.equal((await request('/admin/dashboard','GET',undefined,user)).status,403);
   assert.equal((await request('/equipment','POST',{},user)).status,403);
   const r=await fetch(base+'/api/auth/logout',{method:'POST',headers:{Origin:'https://evil.example',Cookie:user}});assert.equal(r.status,403);
 });
 await t.test('catalog and equipment management',async()=>{
   assert.ok((await request('/equipment','GET',undefined,user)).data.length>=8);
   const body={name:'Test scope',category:'Electronics',location:'Lab T',model:'TS-1',description:'Test instrument',quantity:2,status:'available'};
   const created=await request('/equipment','POST',body,admin);assert.equal(created.status,201);
   assert.equal((await request('/equipment/'+created.data.id,'PUT',{...body,status:'unavailable'},admin)).status,200);
   assert.equal((await request('/bookings','POST',{...booking(),equipment_id:created.data.id},user)).status,409);
   assert.equal((await request('/bookings','POST',{...booking(),equipment_id:6},user)).status,409);
   assert.equal((await request('/bookings','POST',{...booking(),equipment_id:99999},user)).status,400);
   assert.equal((await request('/bookings','POST',{...booking(),equipment_id:1.5},user)).status,400);
 });
 await t.test('create booking; reject overlaps; accept adjacent intervals',async()=>{
   const r=await request('/bookings','POST',booking(),user);assert.equal(r.status,201);id=r.data.id;
   assert.equal((await request('/bookings','POST',booking(30,90),other)).status,409);
   assert.equal((await request('/bookings','POST',booking(60,120),other)).status,201);
   assert.equal((await request('/bookings','POST',booking(20,30),user)).status,409);
   assert.equal((await request('/bookings','POST',booking(-30,150),user)).status,409);
 });
 await t.test('invalid, reversed, long and past time ranges',async()=>{
   for(const body of [booking(180,120),booking(180,180),booking(0,540),{...booking(),start:'invalid'},{...booking(),start:'2020-01-01T04:30:00Z',end:'2020-01-01T05:30:00Z'},{...booking(),purpose:'x'}])assert.equal((await request('/bookings','POST',body,user)).status,400);
 });
 await t.test('ownership and unauthorized decisions',async()=>{
   assert.equal((await request(`/bookings/${id}`,'GET',undefined,other)).status,403);
   assert.equal((await request(`/bookings/${id}/cancel`,'PATCH',{},other)).status,403);
   assert.equal((await request(`/admin/bookings/${id}/approve`,'PATCH',{},user)).status,403);
 });
 await t.test('approval rechecks conflicts even if overlapping data is injected',async()=>{
   const injected=db.prepare("INSERT INTO bookings(user_id,equipment_id,start,end,purpose,status,created_at) VALUES(3,1,?,?,?,'pending',?)").run(timestamp(10),timestamp(40),'Injected conflict test',new Date().toISOString());
   assert.equal((await request(`/admin/bookings/${id}/approve`,'PATCH',{},admin)).status,409);
   db.prepare("UPDATE bookings SET status='rejected' WHERE id=?").run(injected.lastInsertRowid);
   assert.equal((await request(`/admin/bookings/${id}/approve`,'PATCH',{},admin)).status,200);
   assert.equal((await request(`/admin/bookings/${id}/approve`,'PATCH',{},admin)).status,409);
 });
 await t.test('cancel, audit history and rebook',async()=>{
   assert.equal((await request(`/bookings/${id}/cancel`,'PATCH',{},admin)).status,400);
   assert.equal((await request(`/bookings/${id}/cancel`,'PATCH',{note:'Schedule changed'},admin)).status,200);
   const events=(await request(`/bookings/${id}/events`,'GET',undefined,user)).data;
   assert.deepEqual(events.map(e=>e.action),['created','approved','cancelled']);assert.equal(events.at(-1).note,'Schedule changed');assert.equal(events.at(-1).actor,'Dr. Maya Chen');
   const r=await request('/bookings','POST',booking(),user);assert.equal(r.status,201);
   assert.equal((await request(`/admin/bookings/${r.data.id}/reject`,'PATCH',{},admin)).status,400);
   assert.equal((await request(`/admin/bookings/${r.data.id}/reject`,'PATCH',{note:'Training required'},admin)).status,200);
   assert.equal((await request('/bookings','POST',booking(),user)).status,201);
 });
 await t.test('simultaneous overlapping requests only accept one',async()=>{
   const results=await Promise.all([request('/bookings','POST',booking(180,240),user),request('/bookings','POST',booking(180,240),other)]);
   assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
 });
 await t.test('user cancellation, dashboards, privacy and logout',async()=>{
   const r=await request('/bookings','POST',booking(300,360),user);
   assert.equal((await request(`/bookings/${r.data.id}/cancel`,'PATCH',{},user)).status,200);
   assert.equal((await request('/admin/dashboard','GET',undefined,admin)).status,200);
   const own=(await request('/bookings','GET',undefined,user)).data;assert.ok(own.every(b=>b.user_name==='Test Researcher'));
   const availability=(await request('/availability','GET',undefined,other)).data;assert.ok(availability.every(b=>!('purpose' in b)&&!('user_id' in b)));
   assert.equal((await request('/auth/logout','POST',{},user)).status,200);assert.equal((await request('/me','GET',undefined,user)).status,401);
 });
 }finally{await new Promise(resolve=>server.close(resolve));db.close();}
 await t.test('records survive database reopen',()=>{const reopened=createApp(dbPath);try{assert.equal(reopened.db.prepare('SELECT status FROM bookings WHERE id=?').get(id).status,'cancelled');assert.equal(reopened.db.prepare('SELECT count(*) n FROM events WHERE booking_id=?').get(id).n,3);}finally{reopened.db.close();}});
 rmSync(directory,{recursive:true,force:true});
});
