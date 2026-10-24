import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.js';

test('SRM Trichy room inventory and full booking lifecycle',async t=>{
 const {server,db}=createApp();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}/api`;
 async function req(route,method='GET',body,cookie=''){const r=await fetch(base+route,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 try{
 const student=(await req('/auth/login','POST',{email:'researcher@lab.test',password:'LabDemo123!'})).cookie;
 const other=(await req('/auth/login','POST',{email:'sam@lab.test',password:'LabDemo123!'})).cookie;
 const admin=(await req('/auth/login','POST',{email:'manager@lab.test',password:'LabDemo123!'})).cookie;
 let rooms,id;
 const day=new Date(Date.now()+86400000*20).toISOString().slice(0,10);
 const booking={equipment_id:11,start:day+'T10:00:00+05:30',end:day+'T11:00:00+05:30',purpose:'CS practical for Section A: database lab exercise'};
 await t.test('22 campus rooms including six biotechnology labs, separate from demo equipment',async()=>{
   rooms=(await req('/rooms','GET',undefined,student)).data;
   assert.equal(rooms.length,22);assert.ok(rooms.every(r=>r.kind==='room'&&r.quantity===1));
   assert.equal(rooms.filter(r=>/^CS Lab \d$/.test(r.name)).length,6);
   assert.equal(rooms.filter(r=>/^Chemistry Lab/.test(r.name)).length,2);
   for(const name of ['AR/VR Lab','Mac Lab','EEE Lab','ECE Lab','IoT Lab','Mechanical Workshop','Woodworking Workshop','Physics Lab'])assert.ok(rooms.some(r=>r.name===name));
   assert.equal((await req('/equipment','GET',undefined,student)).data.length,10);
   booking.equipment_id=rooms[0].id;
 });
 await t.test('room requests require a reason and reject overlaps but allow adjacency',async()=>{
   assert.equal((await req('/bookings','POST',{...booking,purpose:''},student)).status,400);
   const created=await req('/bookings','POST',booking,student);assert.equal(created.status,201);id=created.data.id;
   assert.equal((await req('/bookings','POST',{...booking,start:day+'T10:30:00+05:30',end:day+'T11:30:00+05:30'},other)).status,409);
   assert.equal((await req('/bookings','POST',{...booking,start:day+'T11:00:00+05:30',end:day+'T12:00:00+05:30'},other)).status,201);
   assert.equal((await req('/bookings','POST',{...booking,equipment_id:rooms[1].id},other)).status,201);
 });
 await t.test('room management is administrator-only and maintenance blocks requests/approval',async()=>{
   const room=rooms[0];
   assert.equal((await req('/rooms/'+room.id,'PUT',{...room,status:'maintenance'},student)).status,403);
   assert.equal((await req('/rooms/'+room.id,'PUT',{...room,status:'maintenance'},admin)).status,200);
   assert.equal((await req('/bookings','POST',{...booking,start:day+'T15:00:00+05:30',end:day+'T16:00:00+05:30'},student)).status,409);
   assert.equal((await req(`/admin/bookings/${id}/approve`,'PATCH',{},admin)).status,409);
   assert.equal((await req('/rooms/'+room.id,'PUT',room,admin)).status,200);
   assert.equal((await req('/equipment/'+room.id,'PUT',room,admin)).status,404);
 });
 await t.test('reason and resource type are visible to coordinator; approvals enforce permissions',async()=>{
   const queue=(await req('/admin/bookings/pending','GET',undefined,admin)).data;
   const row=queue.find(b=>b.id===id);assert.equal(row.resource_kind,'room');assert.equal(row.purpose,booking.purpose);
   assert.equal((await req(`/admin/bookings/${id}/approve`,'PATCH',{},student)).status,403);
   assert.equal((await req(`/admin/bookings/${id}/approve`,'PATCH',{note:'Faculty session confirmed'},admin)).status,200);
   assert.equal((await req(`/bookings/${id}/cancel`,'PATCH',{},other)).status,403);
 });
 await t.test('cancellation and rejection preserve reasons and release slots',async()=>{
   assert.equal((await req(`/bookings/${id}/cancel`,'PATCH',{note:'Class rescheduled'},student)).status,200);
   const events=(await req(`/bookings/${id}/events`,'GET',undefined,student)).data;
   assert.deepEqual(events.map(e=>e.action),['created','approved','cancelled']);assert.equal(events.at(-1).note,'Class rescheduled');
   const again=await req('/bookings','POST',booking,student);assert.equal(again.status,201);
   assert.equal((await req(`/admin/bookings/${again.data.id}/reject`,'PATCH',{note:'Faculty supervision required'},admin)).status,200);
   assert.equal((await req('/bookings','POST',booking,student)).status,201);
 });
 await t.test('room creation, dashboard totals and simultaneous room requests',async()=>{
   const room={name:'Additional CS Lab',category:'Computer Science',model:'CS-NEW',location:'SRM Trichy',description:'New lab room',quantity:1,status:'available'};
   assert.equal((await req('/rooms','POST',room,student)).status,403);
   assert.equal((await req('/rooms','POST',{...room,quantity:2},admin)).status,400);
   assert.equal((await req('/rooms','POST',room,admin)).status,201);
   const stats=(await req('/admin/dashboard','GET',undefined,admin)).data;assert.equal(stats.totalRooms,23);assert.equal(stats.totalEquipment,10);
   const results=await Promise.all([req('/bookings','POST',{...booking,equipment_id:rooms[2].id},student),req('/bookings','POST',{...booking,equipment_id:rooms[2].id},other)]);
   assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
 });
 }finally{await new Promise(resolve=>server.close(resolve));db.close();}
});
