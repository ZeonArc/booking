import http from 'node:http';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {PURPOSE_CATEGORIES,validateInterval} from './shared/booking.js';
import {validateAccess} from './shared/access.js';
import {ACTIVITIES,profileFor,planPractical,validatePracticalRoom} from './shared/practical.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const hash = (password, salt) => scryptSync(password, salt, 64).toString('hex');
export function createApp(dbPath = ':memory:') {
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,role TEXT NOT NULL CHECK(role IN ('researcher','manager')),salt TEXT NOT NULL,password TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS equipment(id INTEGER PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,location TEXT NOT NULL,model TEXT NOT NULL,description TEXT NOT NULL,quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity>0),status TEXT NOT NULL CHECK(status IN ('available','maintenance','unavailable')));
    CREATE TABLE IF NOT EXISTS bookings(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),equipment_id INTEGER NOT NULL REFERENCES equipment(id),start TEXT NOT NULL,end TEXT NOT NULL,purpose TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','cancelled')),created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,booking_id INTEGER NOT NULL REFERENCES bookings(id),actor_id INTEGER NOT NULL REFERENCES users(id),action TEXT NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS booking_slots ON bookings(equipment_id,status,start,end);`);
  if (!db.prepare('SELECT id FROM users LIMIT 1').get()) {
    for (const [name,email,role] of [['Alex Morgan','researcher@lab.test','researcher'],['Dr. Maya Chen','manager@lab.test','manager'],['Sam Rivera','sam@lab.test','researcher']]) {
      const salt = randomBytes(16).toString('hex');
      db.prepare('INSERT INTO users(name,email,role,salt,password) VALUES(?,?,?,?,?)').run(name,email,role,salt,hash('LabDemo123!',salt));
    }
    const insert = db.prepare('INSERT INTO equipment(name,category,location,model,description,status) VALUES(?,?,?,?,?,?)');
    for(const row of [
      ['Optical microscope','Microscopy','Lab A · Room 101','OM-400','High-resolution brightfield imaging with 40×–1000× magnification.','available'],
      ['Refrigerated centrifuge','Sample preparation','Lab B · Room 203','RC-16','Temperature-controlled separation for sensitive biological samples.','available'],
      ['UV–Vis spectrophotometer','Spectroscopy','Lab A · Room 104','UV-2600','Measure absorbance and concentration across the UV–visible spectrum.','available'],
      ['Thermal cycler','Molecular biology','Lab C · Room 302','PCR-96','96-well programmable thermal cycling for DNA amplification.','available'],
      ['Analytical balance','Measurement','Lab B · Room 201','AB-220','Precision weighing with 0.1 mg readability and draft protection.','available'],
      ['Orbital incubator','Sample preparation','Lab C · Room 305','OI-200','Controlled incubation and agitation for cell culture workflows.','maintenance'],
      ['Digital oscilloscope','Electronics','Lab D · Room 401','DS-100','Four-channel signal analysis with 100 MHz bandwidth.','available'],
      ['Laboratory oven','Sample preparation','Lab B · Room 202','LO-80','Uniform drying and heat treatment for laboratory samples.','available'],
      ['Benchtop pH meter','Measurement','Lab A · Room 102','PH-700','Accurate pH measurement with automatic temperature compensation.','available'],
      ['FDM 3D printer','Fabrication','Lab D · Room 402','FDM-250','Rapid prototyping with PLA and PETG materials.','unavailable']]) insert.run(...row);
    const day = new Date(Date.now()+86400000).toISOString().slice(0,10);
    for(const [u,e,s,t,status,purpose] of [[1,1,'09:00','10:30','approved','Cell morphology study'],[3,2,'11:00','12:00','approved','Protein sample preparation'],[1,3,'14:00','15:30','pending','Absorbance calibration'],[3,4,'10:00','12:00','pending','DNA amplification'],[1,5,'09:00','10:00','cancelled','Mass measurement'],[3,7,'13:00','14:00','rejected','Signal analysis']]) {
      const result = db.prepare('INSERT INTO bookings(user_id,equipment_id,start,end,purpose,status,created_at) VALUES(?,?,?,?,?,?,?)').run(u,e,`${day}T${s}:00+05:30`,`${day}T${t}:00+05:30`,purpose,status,new Date().toISOString());
      // Normalize timestamps to UTC for reliable interval comparisons.
      db.prepare('UPDATE bookings SET start=?,end=? WHERE id=?').run(new Date(`${day}T${s}:00+05:30`).toISOString(),new Date(`${day}T${t}:00+05:30`).toISOString(),result.lastInsertRowid);
      db.prepare('INSERT INTO events(booking_id,actor_id,action,note,created_at) VALUES(?,?,?,?,?)').run(result.lastInsertRowid,u,'created','Demo booking',new Date().toISOString());
      if(status!=='pending') db.prepare('INSERT INTO events(booking_id,actor_id,action,note,created_at) VALUES(?,?,?,?,?)').run(result.lastInsertRowid,2,status,status==='rejected'?'Training required before use':'Demo action',new Date().toISOString());
    }
  }
  // Preserve existing reservations and edits while upgrading the original demo locations.
  db.exec('CREATE TABLE IF NOT EXISTS migrations(name TEXT PRIMARY KEY)');
  if(!db.prepare('SELECT name FROM migrations WHERE name=?').get('srm-demo-locations-v1')) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const locations=[['Lab A · Room 101','Biotechnology · Microscopy Lab'],['Lab B · Room 203','Biotechnology · Sample Preparation Lab'],['Lab A · Room 104','Chemistry · Instrumentation Lab'],['Lab C · Room 302','Biotechnology · Molecular Biology Lab'],['Lab B · Room 201','Chemistry · Analytical Lab'],['Lab C · Room 305','Biotechnology · Culture Lab'],['Lab D · Room 401','ECE · Electronics Lab'],['Lab B · Room 202','Chemistry · Materials Lab'],['Lab A · Room 102','Chemistry · Wet Lab'],['Lab D · Room 402','Mechanical · Prototyping Lab']];
      for(const [oldLocation,newLocation] of locations) db.prepare('UPDATE equipment SET location=? WHERE location=?').run(newLocation,oldLocation);
      db.prepare('INSERT INTO migrations VALUES(?)').run('srm-demo-locations-v1');db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
  }
  const failures = new Map();
  // Rooms share the transactional resource-booking engine without altering existing IDs.
  if(!db.prepare('PRAGMA table_info(equipment)').all().some(c=>c.name==='kind')) db.exec("ALTER TABLE equipment ADD COLUMN kind TEXT NOT NULL DEFAULT 'equipment' CHECK(kind IN ('equipment','room'))");
  if(!db.prepare('SELECT name FROM migrations WHERE name=?').get('trichy-rooms-v1')) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const rooms=[...Array.from({length:6},(_,i)=>[`CS Lab ${i+1}`,'Computer Science',`CS-${i+1}`]),['AR/VR Lab','Immersive Technology','ARVR'],['Mac Lab','Computer Science','MAC'],['EEE Lab','Electrical & Electronics','EEE'],['ECE Lab','Electronics & Communication','ECE'],['IoT Lab','Internet of Things','IOT'],['Mechanical Workshop','Mechanical Engineering','MECH'],['Woodworking Workshop','Workshop','WOOD'],['Physics Lab','Physics','PHY'],['Chemistry Lab 1','Chemistry','CHEM-1'],['Chemistry Lab 2','Chemistry','CHEM-2']];
      const insert=db.prepare("INSERT INTO equipment(name,category,location,model,description,quantity,status,kind) VALUES(?,?,'SRM Trichy',?,?,1,'available','room')");
      for(const [name,department,code] of rooms) insert.run(name,department,code,`${name} at SRM Trichy. Reserve the whole room for practicals, project work, research or approved group sessions.`);
      db.prepare('INSERT INTO migrations VALUES(?)').run('trichy-rooms-v1');db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
  }
  if(!db.prepare('PRAGMA table_info(equipment)').all().some(c=>c.name==='specialization')) db.exec("ALTER TABLE equipment ADD COLUMN specialization TEXT NOT NULL DEFAULT ''");
  if(!db.prepare('PRAGMA table_info(bookings)').all().some(c=>c.name==='purpose_category')) db.exec("ALTER TABLE bookings ADD COLUMN purpose_category TEXT NOT NULL DEFAULT 'Other' CHECK(purpose_category IN ('Practical class','Project work','Research','Workshop','Training','Assessment','Other'))");
  if(!db.prepare('SELECT name FROM migrations WHERE name=?').get('trichy-biotech-v1')) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const specializations=['Molecular Biology','Microbiology','Biochemistry','Cell Culture','Genetics','Bioinformatics'];
      const insert=db.prepare("INSERT INTO equipment(name,category,location,model,description,quantity,status,kind,specialization) VALUES(?,'Biotechnology','SRM Trichy',?,?,1,'available','room',?)");
      specializations.forEach((specialization,i)=>insert.run(`Biotech Lab ${i+1} · ${specialization}`,`BIO-${i+1}`,`${specialization} teaching and project sessions. Specialization is a configurable presentation label; confirm the official allocation with the department.`,specialization));
      db.prepare('INSERT INTO migrations VALUES(?)').run('trichy-biotech-v1');db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
  }
  // Additive migration: unknown historical counts stay NULL, not fabricated as one.
  const bookingColumns=db.prepare('PRAGMA table_info(bookings)').all().map(c=>c.name);
  if(!bookingColumns.includes('access_type'))db.exec("ALTER TABLE bookings ADD COLUMN access_type TEXT CHECK(access_type IN ('individual','lab'))");
  if(!bookingColumns.includes('student_count'))db.exec('ALTER TABLE bookings ADD COLUMN student_count INTEGER CHECK(student_count BETWEEN 1 AND 200)');
  if(!bookingColumns.includes('project_title'))db.exec("ALTER TABLE bookings ADD COLUMN project_title TEXT NOT NULL DEFAULT ''");
  const fail = (status,message) => { throw Object.assign(new Error(message),{status}); };
  const transaction = fn => { db.exec('BEGIN IMMEDIATE'); try { const result=fn(); db.exec('COMMIT'); return result; } catch(e) { db.exec('ROLLBACK'); throw e; } };
  const conflict = (equipment,start,end,exclude=0) => db.prepare("SELECT id FROM bookings WHERE equipment_id=? AND status IN ('pending','approved') AND start < ? AND end > ? AND id != ?").get(equipment,end,start,exclude);
  const event = (id,actor,action,note='') => db.prepare('INSERT INTO events(booking_id,actor_id,action,note,created_at) VALUES(?,?,?,?,?)').run(id,actor,action,note,new Date().toISOString());
  const app=express();
  app.disable('x-powered-by');
  app.get('/srm-logo.svg',(req,res)=>res.sendFile(path.join(root,'public','srm-logo.svg')));
  app.use('/assets',express.static(path.join(root,'dist','assets')));
  app.use(async(req,res)=>{
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const url=new URL(req.url,'http://localhost'); let route=url.pathname.replace('/api/auth/','/api/');
      const roomRoute=/^\/api\/rooms(?:\/\d+)?$/.test(route);
      if(roomRoute) route=route.replace('/api/rooms','/api/equipment');
      const actionRoute=route.match(/^\/api\/(?:admin\/)?bookings\/(\d+)\/(approve|reject|cancel)$/);
      if(actionRoute) route=`/api/bookings/${actionRoute[1]}`;
      if(!route.startsWith('/api/')) {
        if(req.method!=='GET') return send(405,{error:'Method not allowed'});
        const files={'/':'index.html'};
        if(!files[route]) return send(404,{error:'Not found'});
        res.setHeader('Content-Type',route.endsWith('.js')?'text/javascript':route.endsWith('.css')?'text/css':'text/html');
        return res.end(readFileSync(path.join(root,'dist',files[route])));
      }
      if(!['GET','HEAD'].includes(req.method) && req.headers.origin && req.headers.origin!==`http://${req.headers.host}` && req.headers.origin!==`https://${req.headers.host}`) fail(403,'Cross-origin request blocked');
      let body={};
      if(['POST','PATCH','PUT'].includes(req.method)) {
        let raw=''; for await(const chunk of req){ raw+=chunk; if(raw.length>12000) fail(413,'Request too large'); }
        try { body=JSON.parse(raw||'{}'); }catch { fail(400,'Invalid JSON'); }
        if(!body || typeof body!=='object' || Array.isArray(body)) fail(400,'Invalid request');
      }
      if(actionRoute) body.status={approve:'approved',reject:'rejected',cancel:'cancelled'}[actionRoute[2]];
      if(route==='/api/register' && req.method==='POST') {
        if(typeof body.name!=='string'||body.name.trim().length<2||body.name.length>80) fail(400,'Name must be 2–80 characters');
        if(typeof body.email!=='string'||body.email.length>200||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) fail(400,'Enter a valid email');
        if(typeof body.password!=='string'||body.password.length<10||body.password.length>200) fail(400,'Password must be 10–200 characters');
        const email=body.email.trim().toLowerCase();
        if(db.prepare('SELECT id FROM users WHERE email=?').get(email)) fail(409,'An account with this email already exists');
        const salt=randomBytes(16).toString('hex');
        const result=db.prepare("INSERT INTO users(name,email,role,salt,password) VALUES(?,?,'researcher',?,?)").run(body.name.trim(),email,salt,hash(body.password,salt));
        return send(201,{id:Number(result.lastInsertRowid),message:'Account created. Please sign in.'});
      }
      if(route==='/api/login' && req.method==='POST') {
        const key=req.socket.remoteAddress; const attempts=failures.get(key);
        if(attempts && attempts.until>Date.now() && attempts.count>=10) fail(429,'Too many login attempts. Try again in 15 minutes.');
        const user=typeof body.email==='string'?db.prepare('SELECT * FROM users WHERE email=?').get(body.email.trim().toLowerCase()):null;
        if(!user || typeof body.password!=='string' || body.password.length>200 || !timingSafeEqual(Buffer.from(user.password,'hex'),Buffer.from(hash(body.password,user.salt),'hex'))) {
          failures.set(key,{count:attempts?.until>Date.now()?attempts.count+1:1,until:attempts?.until>Date.now()?attempts.until:Date.now()+900000}); fail(401,'Email or password is incorrect');
        }
        failures.delete(key); const token=randomBytes(32).toString('hex');
        db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
        db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(token,user.id,Date.now()+28800000);
        res.setHeader('Set-Cookie',`session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.COOKIE_SECURE==='1'?'; Secure':''}`);
        return send(200,{user:{id:user.id,name:user.name,email:user.email,role:user.role}});
      }
      const token=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('session='))?.slice(8)||'';
      const user=db.prepare('SELECT u.id,u.name,u.email,u.role FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?').get(token,Date.now());
      if(!user) fail(401,'Please sign in to continue');
      if(route.startsWith('/api/admin/') && user.role!=='manager') fail(403,'Administrator access required');
      if(route==='/api/me') return send(200,{user});
      if(route==='/api/practical/profiles' && req.method==='GET') {
        const rooms=db.prepare("SELECT * FROM equipment WHERE kind='room'").all();
        return send(200,{source:'demo',activities:ACTIVITIES,rooms:rooms.map(room=>({...room,profile:profileFor(room)}))});
      }
      if(route==='/api/practical/plan' && req.method==='POST') {
        const rooms=db.prepare("SELECT * FROM equipment WHERE kind='room'").all();
        const bookings=db.prepare("SELECT equipment_id,start,end,status FROM bookings WHERE status IN ('pending','approved')").all();
        return send(200,planPractical(rooms,bookings,body));
      }
      if(route==='/api/rooms/available' && req.method==='GET') {
        const {start,end}=validateInterval(url.searchParams.get('start'),url.searchParams.get('end'));
        const rooms=db.prepare("SELECT e.* FROM equipment e WHERE e.kind='room' AND e.status='available' AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.equipment_id=e.id AND b.status IN ('pending','approved') AND b.start < ? AND b.end > ?) ORDER BY e.id").all(end,start);
        return send(200,{start,end,rooms});
      }
      if(route==='/api/logout' && req.method==='POST') { db.prepare('DELETE FROM sessions WHERE token=?').run(token);res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return send(200,{ok:true}); }
      if(route==='/api/equipment' && req.method==='GET') return send(200,db.prepare('SELECT * FROM equipment WHERE kind=?').all(roomRoute?'room':'equipment'));
      if((route==='/api/equipment' && req.method==='POST') || (/^\/api\/equipment\/\d+$/.test(route) && req.method==='PUT')) {
        if(user.role!=='manager') fail(403,'Only administrators can manage equipment');
        for(const key of ['name','category','location','model','description']) if(typeof body[key]!=='string'||!body[key].trim()||body[key].length>(key==='description'?1000:120)) fail(400,`Enter a valid ${key}`);
        if(!['available','maintenance','unavailable'].includes(body.status)) fail(400,'Invalid equipment status');
        if(!Number.isInteger(body.quantity)||body.quantity<1||body.quantity>1000) fail(400,'Quantity must be between 1 and 1000');
        const values=['name','category','location','model','description'].map(k=>body[k].trim());
        if(roomRoute && body.quantity!==1) fail(400,'A room is one exclusively bookable space');
        const specialization=body.specialization??'';
        if(typeof specialization!=='string'||specialization.length>120)fail(400,'Specialization must be at most 120 characters');
        if(req.method==='POST') {const result=db.prepare('INSERT INTO equipment(name,category,location,model,description,quantity,status,kind,specialization) VALUES(?,?,?,?,?,?,?,?,?)').run(...values,body.quantity,body.status,roomRoute?'room':'equipment',specialization.trim());return send(201,{id:Number(result.lastInsertRowid)});}
        const id=Number(route.split('/').pop());
        if(!db.prepare('SELECT id FROM equipment WHERE id=? AND kind=?').get(id,roomRoute?'room':'equipment')) fail(404,'Resource not found');
        db.prepare('UPDATE equipment SET name=?,category=?,location=?,model=?,description=?,quantity=?,status=?,specialization=? WHERE id=?').run(...values,body.quantity,body.status,specialization.trim(),id);return send(200,{id});
      }
      if(route==='/api/admin/dashboard' && req.method==='GET') return send(200,{totalRooms:db.prepare("SELECT COUNT(*) n FROM equipment WHERE kind='room'").get().n,availableRooms:db.prepare("SELECT COUNT(*) n FROM equipment WHERE kind='room' AND status='available'").get().n,totalEquipment:db.prepare('SELECT COUNT(*) n FROM equipment WHERE kind=\'equipment\'').get().n,availableEquipment:db.prepare("SELECT COUNT(*) n FROM equipment WHERE kind='equipment' AND status='available'").get().n,pending:db.prepare("SELECT COUNT(*) n FROM bookings WHERE status='pending'").get().n,approved:db.prepare("SELECT COUNT(*) n FROM bookings WHERE status='approved'").get().n});
      if(route==='/api/admin/bookings/pending' && req.method==='GET') return send(200,db.prepare("SELECT b.*,e.name equipment_name,e.kind resource_kind,u.name user_name FROM bookings b JOIN equipment e ON e.id=b.equipment_id JOIN users u ON u.id=b.user_id WHERE b.status='pending' ORDER BY b.created_at").all());
      if(route==='/api/bookings' && req.method==='GET') return send(200,db.prepare(`SELECT b.*,e.name equipment_name,e.kind resource_kind,u.name user_name FROM bookings b JOIN equipment e ON e.id=b.equipment_id JOIN users u ON u.id=b.user_id ${user.role==='manager'?'':'WHERE b.user_id=?'} ORDER BY b.start DESC`).all(...(user.role==='manager'?[]:[user.id])));
      if(route==='/api/availability' && req.method==='GET') return send(200,db.prepare("SELECT id,equipment_id,start,end,status FROM bookings WHERE status IN ('pending','approved') ORDER BY start").all());
      if(route==='/api/bookings' && req.method==='POST') {
        if(!Number.isSafeInteger(body.equipment_id)||body.equipment_id<1) fail(400,'Choose valid equipment');
        const equipment=db.prepare('SELECT * FROM equipment WHERE id=?').get(Number(body.equipment_id)||0);
        if(!equipment) fail(400,'Choose valid equipment');
        if(body.practical!==undefined) validatePracticalRoom(equipment,body.practical);
        if(equipment.status!=='available') fail(409,'This resource is not available for booking');
        if(typeof body.purpose!=='string' || body.purpose.trim().length<5 || body.purpose.length>500) fail(400,'Booking reason must be between 5 and 500 characters');
        const {start,end}=validateInterval(body.start,body.end);
        const purposeCategory=body.purpose_category??'Other';
        if(!PURPOSE_CATEGORIES.includes(purposeCategory))fail(400,'Choose a valid purpose category');
        const access=validateAccess(body,equipment);
        const id=transaction(()=>{
          if(conflict(equipment.id,start,end)) fail(409,'This time overlaps an existing booking. Choose another slot.');
          const result=db.prepare("INSERT INTO bookings(user_id,equipment_id,start,end,purpose,status,created_at,purpose_category,access_type,student_count,project_title) VALUES(?,?,?,?,?,'pending',?,?,?,?,?)").run(user.id,equipment.id,start,end,body.purpose.trim(),new Date().toISOString(),purposeCategory,access.access_type,access.student_count,access.project_title);
          event(result.lastInsertRowid,user.id,'created'); return Number(result.lastInsertRowid);
        }); return send(201,{id,status:'pending'});
      }
      const match=route.match(/^\/api\/bookings\/(\d+)(\/events)?$/);
      if(match) {
        const booking=db.prepare('SELECT * FROM bookings WHERE id=?').get(Number(match[1]));
        if(!booking) fail(404,'Booking not found');
        if(user.role!=='manager' && booking.user_id!==user.id) fail(403,'You can only access your own bookings');
        if(!match[2] && req.method==='GET') return send(200,booking);
        if(match[2] && req.method==='GET') return send(200,db.prepare('SELECT e.action,e.note,e.created_at,u.name actor FROM events e JOIN users u ON u.id=e.actor_id WHERE booking_id=? ORDER BY e.id').all(booking.id));
        if(!match[2] && req.method==='PATCH') {
          const status=body.status;
          if(!['approved','rejected','cancelled'].includes(status)) fail(400,'Invalid status');
          if(status!=='cancelled' && user.role!=='manager') fail(403,'Only lab managers can approve or reject requests');
          if(!['pending','approved'].includes(booking.status) || (status!=='cancelled' && booking.status!=='pending')) fail(409,'This booking can no longer be changed');
          if(new Date(booking.end)<Date.now()) fail(409,'Past bookings cannot be changed');
          if(body.note!==undefined && (typeof body.note!=='string'||body.note.length>500)) fail(400,'Note must be at most 500 characters');
          if((status==='rejected'||(status==='cancelled'&&user.role==='manager')) && (!body.note||!body.note.trim())) fail(400,'Provide a reason for this action');
          transaction(()=>{
            if(status==='approved' && db.prepare('SELECT status FROM equipment WHERE id=?').get(booking.equipment_id).status!=='available') fail(409,'Resource is no longer available');
            if(status==='approved' && conflict(booking.equipment_id,booking.start,booking.end,booking.id)) fail(409,'Booking conflicts with another reservation');
            db.prepare('UPDATE bookings SET status=? WHERE id=?').run(status,booking.id);event(booking.id,user.id,status,body.note||'');
          });return send(200,{id:booking.id,status});
        }
      }
      send(404,{error:'Not found'});
    }catch(e){if(!e.status) console.error(e);send(e.status||500,{error:e.status?e.message:'Something went wrong. Please try again.'});}
  });
  const server=http.createServer(app);
  return {server,db,app};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  mkdirSync(path.join(root,'data'),{recursive:true});
  const {server}=createApp(path.join(root,'data','lab.sqlite'));
  server.listen(Number(process.env.PORT)||3000,'127.0.0.1',()=>console.log(`LabReserve is running at http://localhost:${process.env.PORT||3000}`));
}
