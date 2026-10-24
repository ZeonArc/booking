import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../server.js';
import {validateSystem} from '../shared/access.js';
import {bookingsCsv} from '../shared/booking.js';

const day=new Date(Date.now()+60*86400000).toISOString().slice(0,10);
const at=(from,to)=>({start:`${day}T${from}:00+05:30`,end:`${day}T${to}:00+05:30`});

async function withApp(fn){
 const {server,db}=createApp();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}/api`;
 async function req(route,method='GET',body,cookie=''){const r=await fetch(base+route,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 const login=async email=>(await req('/auth/login','POST',{email,password:'LabDemo123!'})).cookie;
 try{await fn({req,db,login,room:code=>db.prepare("SELECT * FROM equipment WHERE kind='room' AND model=?").get(code)});}
 finally{await new Promise(r=>server.close(r));db.close();}
}
const seat=(roomId,number,from='10:00',to='11:00',extra={})=>({equipment_id:roomId,...at(from,to),purpose:'Individual practice on a lab system',purpose_category:'Practical class',access_type:'individual',student_count:1,system_number:number,...extra});

test('supplied system counts are seeded once and never overwrite later edits',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'srm-systems-')),file=path.join(dir,'test.sqlite');
 let app=createApp(file);
 try{
  const counts=()=>Object.fromEntries(app.db.prepare("SELECT model,systems FROM equipment WHERE kind='room' AND systems>0 ORDER BY id").all().map(r=>[r.model,r.systems]));
  assert.deepEqual(counts(),{'CS-1':70,'CS-2':70,'CS-3':70,'CS-4':70,'CS-5':70,'CS-6':70,ARVR:40,MAC:40});
  assert.equal(app.db.prepare("SELECT count(*) n FROM equipment WHERE kind='equipment' AND systems>0").get().n,0);
  app.db.prepare("UPDATE equipment SET systems=60 WHERE model='CS-1'").run();app.db.prepare("UPDATE equipment SET systems=0 WHERE model='MAC'").run();app.db.close();
  app=createApp(file);
  assert.equal(counts()['CS-1'],60);assert.equal(counts().MAC,undefined);assert.equal(counts()['CS-2'],70);
  app.db.exec('ALTER TABLE bookings DROP COLUMN system_number');app.db.close();
  app=createApp(file);assert.ok(app.db.prepare('PRAGMA table_info(bookings)').all().some(c=>c.name==='system_number'));
 }finally{app.db.close();rmSync(dir,{recursive:true,force:true});}
});

test('validateSystem accepts one in-range number only for individual access in a lab with systems',()=>{
 const lab={kind:'room',systems:70},plain={kind:'room',systems:0},tool={kind:'equipment',systems:0};
 assert.equal(validateSystem({system_number:70},lab,{access_type:'individual'}),70);
 for(const value of [undefined,0,71,1.5,'3',null,-1])assert.throws(()=>validateSystem({system_number:value},lab,{access_type:'individual'}),{status:400});
 assert.equal(validateSystem({},lab,{access_type:'lab'}),null);assert.equal(validateSystem({},lab,{access_type:null}),null);
 assert.equal(validateSystem({},plain,{access_type:'individual'}),null);assert.equal(validateSystem({system_number:null},tool,{access_type:'individual'}),null);
 for(const [resource,access] of [[lab,'lab'],[plain,'individual'],[tool,'individual']])assert.throws(()=>validateSystem({system_number:3},resource,{access_type:access}),{status:400});
});

test('two students can book different systems at once, but never the same system',async()=>{
 await withApp(async({req,db,login,room})=>{
  const a=await login('researcher@lab.test'),b=await login('sam@lab.test'),cs=room('CS-1');
  const first=await req('/bookings','POST',seat(cs.id,5),a);assert.equal(first.status,201);
  assert.equal(db.prepare('SELECT system_number FROM bookings WHERE id=?').get(first.data.id).system_number,5);
  const clash=await req('/bookings','POST',seat(cs.id,5,'10:30','11:30'),b);assert.equal(clash.status,409);assert.match(clash.data.error,/System 5/);
  assert.equal((await req('/bookings','POST',seat(cs.id,6,'10:30','11:30'),b)).status,201);
  assert.equal((await req('/bookings','POST',seat(cs.id,5,'11:00','12:00'),b)).status,201,'adjacent slots on the same system are valid');
  assert.equal((await req('/bookings','POST',seat(cs.id,5,'10:00','11:00'),a)).status,409,'a student cannot double-book a system');
 });
});

test('a whole-room booking blocks every system and a system booking blocks the whole room',async()=>{
 await withApp(async({req,login,room})=>{
  const a=await login('researcher@lab.test'),b=await login('sam@lab.test'),cs2=room('CS-2'),cs3=room('CS-3');
  const group={equipment_id:cs2.id,...at('10:00','12:00'),purpose:'Whole class practical session',purpose_category:'Practical class',access_type:'lab',student_count:40};
  assert.equal((await req('/bookings','POST',group,a)).status,201);
  assert.equal((await req('/bookings','POST',seat(cs2.id,70,'11:00','12:00'),b)).status,409);
  assert.equal((await req('/bookings','POST',seat(cs2.id,70,'12:00','13:00'),b)).status,201);
  assert.equal((await req('/bookings','POST',seat(cs3.id,1),a)).status,201);
  assert.equal((await req('/bookings','POST',{...group,equipment_id:cs3.id},b)).status,409);
  assert.equal((await req('/bookings','POST',{...group,equipment_id:cs3.id,...at('11:00','12:00')},b)).status,201);
 });
});

test('individual access in a lab needs a valid system; other resources keep the old behaviour',async()=>{
 await withApp(async({req,login,room})=>{
  const a=await login('researcher@lab.test'),cs=room('CS-4'),mac=room('MAC'),eee=room('EEE');
  const missing={...seat(cs.id,1)};delete missing.system_number;
  assert.equal((await req('/bookings','POST',missing,a)).status,400);
  for(const value of [0,71,2.5,'7'])assert.equal((await req('/bookings','POST',seat(cs.id,value),a)).status,400);
  assert.equal((await req('/bookings','POST',seat(mac.id,41),a)).status,400,'Mac Lab has 40 systems');
  assert.equal((await req('/bookings','POST',seat(mac.id,40),a)).status,201);
  assert.equal((await req('/bookings','POST',seat(eee.id,3),a)).status,400,'rooms without systems take no system number');
  assert.equal((await req('/bookings','POST',seat(eee.id,undefined),a)).status,201,'individual access still reserves a room that has no numbered systems');
  const legacy={equipment_id:cs.id,...at('14:00','15:00'),purpose:'Older client without access fields'};
  assert.equal((await req('/bookings','POST',legacy,a)).status,201,'clients that omit access fields still reserve the whole room');
 });
});

test('system map shows free, booked and own systems without revealing other students',async()=>{
 await withApp(async({req,db,login,room})=>{
  const a=await login('researcher@lab.test'),b=await login('sam@lab.test'),cs=room('CS-1'),arvr=room('ARVR');
  const q=`?start=${encodeURIComponent(at('10:00','11:00').start)}&end=${encodeURIComponent(at('10:00','11:00').end)}`;
  assert.equal((await req(`/rooms/${cs.id}/systems${q}`)).status,401);
  await req('/bookings','POST',seat(cs.id,7),a);await req('/bookings','POST',seat(cs.id,8),b);
  const map=(await req(`/rooms/${cs.id}/systems${q}`,'GET',undefined,a)).data;
  assert.equal(map.systems.length,70);assert.equal(map.free,68);assert.equal(map.wholeRoomBooked,false);
  const by=n=>map.systems.find(s=>s.number===n).status;
  assert.deepEqual([by(7),by(8),by(9)],['yours','booked','free']);
  assert.ok(!JSON.stringify(map).match(/user|Sam|Alex|purpose|email/i));
  assert.equal((await req(`/rooms/${arvr.id}/systems${q}`,'GET',undefined,a)).data.systems.length,40);
  const adjacent=`?start=${encodeURIComponent(at('11:00','12:00').start)}&end=${encodeURIComponent(at('11:00','12:00').end)}`;
  assert.equal((await req(`/rooms/${cs.id}/systems${adjacent}`,'GET',undefined,a)).data.free,70);
  db.prepare("UPDATE bookings SET status='cancelled' WHERE system_number=7").run();
  assert.equal((await req(`/rooms/${cs.id}/systems${q}`,'GET',undefined,a)).data.systems[6].status,'free');
  assert.equal((await req(`/rooms/${cs.id}/systems?start=nope&end=nope`,'GET',undefined,a)).status,400);
  assert.equal((await req(`/rooms/99999/systems${q}`,'GET',undefined,a)).status,404);
  const ee=room('EEE');assert.deepEqual((await req(`/rooms/${ee.id}/systems${q}`,'GET',undefined,a)).data.systems,[]);
 });
});

test('a whole-room booking or maintenance shows every system as blocked',async()=>{
 await withApp(async({req,db,login,room})=>{
  const a=await login('researcher@lab.test'),admin=await login('manager@lab.test'),cs=room('CS-5');
  const range=at('10:00','12:00'),q=`?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`;
  await req('/bookings','POST',{equipment_id:cs.id,...range,purpose:'Whole class practical session',access_type:'lab',student_count:30},a);
  const blocked=(await req(`/rooms/${cs.id}/systems${q}`,'GET',undefined,a)).data;
  assert.ok(blocked.wholeRoomBooked&&blocked.free===0&&blocked.systems.every(s=>s.status==='blocked'));
  db.prepare("UPDATE bookings SET status='cancelled'").run();db.prepare("UPDATE equipment SET status='maintenance' WHERE id=?").run(cs.id);
  assert.ok((await req(`/rooms/${cs.id}/systems${q}`,'GET',undefined,a)).data.systems.every(s=>s.status==='blocked'));
  assert.equal((await req('/bookings','POST',seat(cs.id,1),a)).status,409);
  assert.equal(admin.length>0,true);
 });
});

test('room finder keeps partly booked labs and drops fully booked ones',async()=>{
 await withApp(async({req,db,login,room})=>{
  const a=await login('researcher@lab.test'),cs=room('CS-1'),arvr=room('ARVR'),mac=room('MAC');
  const range=at('10:00','11:00'),q=`?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`;
  await req('/bookings','POST',seat(cs.id,1),a);
  let rooms=(await req('/rooms/available'+q,'GET',undefined,a)).data.rooms;
  const found=rooms.find(r=>r.id===cs.id);
  assert.deepEqual([found.whole_room_free,found.free_systems],[false,69]);
  assert.deepEqual([rooms.find(r=>r.id===mac.id).whole_room_free,rooms.find(r=>r.id===mac.id).free_systems],[true,40]);
  assert.equal(rooms.find(r=>r.model==='EEE').free_systems,0);
  const insert=db.prepare("INSERT INTO bookings(user_id,equipment_id,start,end,purpose,status,created_at,purpose_category,access_type,student_count,project_title,system_number) VALUES(1,?,?,?,'Seeded system booking','approved',?,'Other','individual',1,'',?)");
  for(let n=1;n<=40;n++)insert.run(arvr.id,new Date(range.start).toISOString(),new Date(range.end).toISOString(),new Date().toISOString(),n);
  rooms=(await req('/rooms/available'+q,'GET',undefined,a)).data.rooms;
  assert.ok(!rooms.some(r=>r.id===arvr.id),'a lab with every system booked is not offered');
 });
});

test('approval rechecks system conflicts and cancelling releases the system',async()=>{
 await withApp(async({req,db,login,room})=>{
  const a=await login('researcher@lab.test'),b=await login('sam@lab.test'),admin=await login('manager@lab.test'),cs=room('CS-6');
  const first=await req('/bookings','POST',seat(cs.id,9),a);
  const range=at('10:00','11:00');
  assert.equal((await req(`/admin/bookings/${first.data.id}/approve`,'PATCH',{},admin)).status,200);
  const injected=db.prepare("INSERT INTO bookings(user_id,equipment_id,start,end,purpose,status,created_at,purpose_category,access_type,student_count,project_title,system_number) VALUES(3,?,?,?,'Injected legacy conflict','pending',?,'Other','individual',1,'',9)").run(cs.id,new Date(range.start).toISOString(),new Date(range.end).toISOString(),new Date().toISOString());
  assert.equal((await req(`/admin/bookings/${injected.lastInsertRowid}/approve`,'PATCH',{},admin)).status,409);
  assert.equal((await req(`/bookings/${first.data.id}/cancel`,'PATCH',{},a)).status,200);
  assert.equal((await req('/bookings','POST',seat(cs.id,9),b)).status,409,'the injected pending request still holds system 9');
  db.prepare("UPDATE bookings SET status='rejected' WHERE id=?").run(injected.lastInsertRowid);
  assert.equal((await req('/bookings','POST',seat(cs.id,9),b)).status,201,'a released system can be booked again');
  assert.equal((await req('/bookings/'+first.data.id,'GET',undefined,a)).data.system_number,9);
 });
});

test('coordinators set system counts but cannot shrink below an active booking',async()=>{
 await withApp(async({req,login,room})=>{
  const a=await login('researcher@lab.test'),admin=await login('manager@lab.test'),eee=room('EEE'),cs=room('CS-1');
  const form=r=>({name:r.name,category:r.category,location:r.location,model:r.model,description:r.description,quantity:1,status:'available',specialization:r.specialization});
  assert.equal((await req('/rooms/'+eee.id,'PUT',{...form(eee),systems:30},a)).status,403);
  assert.equal((await req('/rooms/'+eee.id,'PUT',{...form(eee),systems:30},admin)).status,200);
  assert.equal((await req('/rooms','GET',undefined,a)).data.find(r=>r.id===eee.id).systems,30);
  for(const value of [-1,501,2.5,'9'])assert.equal((await req('/rooms/'+eee.id,'PUT',{...form(eee),systems:value},admin)).status,400);
  const created=await req('/rooms','POST',{...form(eee),name:'Systems Test Lab',model:'TEST-1',systems:12},admin);
  assert.equal(created.status,201);
  assert.equal((await req('/rooms','GET',undefined,a)).data.find(r=>r.id===created.data.id).systems,12);
  assert.equal((await req('/rooms/'+cs.id,'PUT',{...form(cs)},admin)).status,200,'omitting systems sets none; allowed while nothing is booked');
  assert.equal((await req('/rooms/'+cs.id,'PUT',{...form(cs),systems:70},admin)).status,200);
  await req('/bookings','POST',seat(cs.id,55),a);
  const shrink=await req('/rooms/'+cs.id,'PUT',{...form(cs),systems:50},admin);assert.equal(shrink.status,409);assert.match(shrink.data.error,/System 55/);
  assert.equal((await req('/rooms/'+cs.id,'PUT',{...form(cs),systems:55},admin)).status,200);
  const equipment=(await req('/equipment','GET',undefined,a)).data[0];
  assert.equal((await req('/equipment/'+equipment.id,'PUT',{name:equipment.name,category:equipment.category,location:equipment.location,model:equipment.model,description:equipment.description,quantity:1,status:'available',systems:9},admin)).status,200);
  assert.equal((await req('/equipment','GET',undefined,a)).data[0].systems,0,'instruments never get systems');
 });
});

test('lab capacity follows the supplied system count and the CSV carries the system number',async()=>{
 await withApp(async({req,login})=>{
  const a=await login('researcher@lab.test');
  const profiles=(await req('/practical/profiles','GET',undefined,a)).data.rooms;
  assert.deepEqual(profiles.filter(r=>r.profile.source==='systems').map(r=>[r.model,r.profile.capacity]).sort(),[['ARVR',40],['CS-1',70],['CS-2',70],['CS-3',70],['CS-4',70],['CS-5',70],['CS-6',70],['MAC',40]]);
  assert.equal(profiles.find(r=>r.model==='EEE').profile.source,'demo');
 });
 const csv=bookingsCsv([{id:1,equipment_name:'CS Lab 1',resource_kind:'room',user_name:'A',start:'2035-01-01T10:00:00Z',end:'2035-01-01T11:00:00Z',purpose:'x',status:'pending',created_at:'2035-01-01T00:00:00Z',access_type:'individual',student_count:1,project_title:'',system_number:23},{id:2,equipment_name:'EEE Lab',resource_kind:'room',user_name:'B',start:'2035-01-01T10:00:00Z',end:'2035-01-01T11:00:00Z',purpose:'x',status:'pending',created_at:'2035-01-01T00:00:00Z'}]);
 assert.ok(csv.includes('"Duration (minutes)","System number"'));
 const [, one, two]=csv.split('\r\n');assert.ok(one.endsWith('"60","23"'));assert.ok(two.endsWith('"60",""'));
});
