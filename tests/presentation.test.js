import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../server.js';
import {bookingsCsv} from '../shared/booking.js';

test('biotechnology specialization, purpose categories and room finder',async t=>{
 const {server,db}=createApp();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}/api`;
 async function req(route,method='GET',body,cookie=''){const r=await fetch(base+route,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 try{
  const student=(await req('/auth/login','POST',{email:'researcher@lab.test',password:'LabDemo123!'})).cookie;
  const admin=(await req('/auth/login','POST',{email:'manager@lab.test',password:'LabDemo123!'})).cookie;
  const rooms=(await req('/rooms','GET',undefined,student)).data;
  const bio=rooms.filter(r=>r.category==='Biotechnology');
  let id;
  const day=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  const start=day+'T10:00:00+05:30',end=day+'T11:00:00+05:30';
  const query=new URLSearchParams({start,end});
  await t.test('six distinct editable specializations',async()=>{
   assert.equal(bio.length,6);assert.equal(new Set(bio.map(b=>b.specialization)).size,6);
   assert.ok(bio.some(b=>b.specialization==='Bioinformatics'));
   assert.equal((await req('/rooms/'+bio[0].id,'PUT',{...bio[0],specialization:'Department-confirmed specialization'},student)).status,403);
   assert.equal((await req('/rooms/'+bio[0].id,'PUT',{...bio[0],specialization:'Department-confirmed specialization'},admin)).status,200);
   assert.equal((await req('/rooms','GET',undefined,student)).data.find(r=>r.id===bio[0].id).specialization,'Department-confirmed specialization');
  });
  await t.test('purpose categories persist and invalid categories fail',async()=>{
   const body={equipment_id:bio[0].id,start,end,purpose:'Biotechnology project presentation',purpose_category:'Project work'};
   assert.equal((await req('/bookings','POST',{...body,purpose_category:'Invalid category'},student)).status,400);
   const created=await req('/bookings','POST',body,student);assert.equal(created.status,201);id=created.data.id;
   const list=(await req('/bookings','GET',undefined,student)).data;
   assert.equal(list.find(b=>b.id===id).purpose_category,'Project work');
  });
  await t.test('finder excludes pending, approved and maintenance rooms; includes adjacent slots',async()=>{
   await req('/rooms/'+bio[1].id,'PUT',{...bio[1],status:'maintenance'},admin);
   const found=await req('/rooms/available?'+query,'GET',undefined,student);assert.equal(found.status,200);
   assert.ok(!found.data.rooms.some(r=>r.id===bio[0].id||r.id===bio[1].id));assert.equal(found.data.rooms.length,20);
   await req(`/admin/bookings/${id}/approve`,'PATCH',{},admin);
   assert.ok(!(await req('/rooms/available?'+query,'GET',undefined,student)).data.rooms.some(r=>r.id===bio[0].id));
   const adjacent=new URLSearchParams({start:end,end:day+'T12:00:00+05:30'});
   assert.ok((await req('/rooms/available?'+adjacent,'GET',undefined,student)).data.rooms.some(r=>r.id===bio[0].id));
   await req(`/bookings/${id}/cancel`,'PATCH',{},student);
   assert.ok((await req('/rooms/available?'+query,'GET',undefined,student)).data.rooms.some(r=>r.id===bio[0].id));
  });
  await t.test('finder enforces authentication and validates range',async()=>{
   assert.equal((await req('/rooms/available?'+query)).status,401);
   for(const params of [new URLSearchParams({start:'bad',end}),new URLSearchParams({start:end,end:start}),new URLSearchParams({start:'2020-01-01T10:00:00Z',end:'2020-01-01T11:00:00Z'})])assert.equal((await req('/rooms/available?'+params,'GET',undefined,student)).status,400);
  });
 }finally{await new Promise(resolve=>server.close(resolve));db.close();}
});

test('biotech migration is idempotent and retains edits and original bookings',()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'srm-biotech-'));const file=path.join(directory,'test.sqlite');
 const initial=createApp(file);const before=initial.db.prepare('SELECT count(*) n FROM bookings').get().n;
 initial.db.prepare("UPDATE equipment SET specialization='Custom department label' WHERE model='BIO-1'").run();initial.db.close();
 const reopened=createApp(file);
 try{assert.equal(reopened.db.prepare("SELECT count(*) n FROM equipment WHERE kind='room'").get().n,22);assert.equal(reopened.db.prepare("SELECT specialization FROM equipment WHERE model='BIO-1'").get().specialization,'Custom department label');assert.equal(reopened.db.prepare('SELECT count(*) n FROM bookings').get().n,before);}finally{reopened.db.close();rmSync(directory,{recursive:true,force:true});}
});

test('CSV quotes punctuation/newlines and neutralizes spreadsheet formulas',()=>{
 const csv=bookingsCsv([{id:1,equipment_name:'CS Lab 1',purpose:'=HYPERLINK("x")',user_name:' +SUM(1,2)',purpose_category:'Research',status:'pending'},{id:2,purpose:'Line one, "quoted"\nLine two'}]);
 assert.ok(csv.startsWith('\uFEFF"Booking ID"'));
 assert.ok(csv.includes('"\'=HYPERLINK(""x"")"'));
 assert.ok(csv.includes('"\' +SUM(1,2)"'));
 assert.ok(csv.includes('"Line one, ""quoted""\nLine two"'));
 assert.ok(bookingsCsv([]).includes('Purpose category'));
});
