// Isolated, in-memory data for presentation screenshots; never edits the live database.
import {createApp} from '../server.js';
const {server,db}=createApp();
const day=new Date(Date.now()+86400000+19800000).toISOString().slice(0,10);
for(const [code,from,to,status,purpose,category] of [
 ['CS-1','09:00','11:00','approved','Database practical · CSE Section A','Practical class'],
 ['CS-2','11:00','12:30','approved','Final-year project demonstration','Project work'],
 ['BIO-1','10:00','12:00','pending','Molecular biology project session · Team A','Project work'],
 ['BIO-6','14:00','16:00','pending','Bioinformatics analysis workshop','Workshop'],
 ['ARVR','13:00','15:00','approved','Immersive learning prototype review','Research'],
 ['CHEM-1','09:00','10:00','cancelled','Chemistry practical rescheduled','Practical class']
]){
 const room=db.prepare('SELECT id FROM equipment WHERE model=?').get(code);
 const start=new Date(`${day}T${from}:00+05:30`).toISOString(),end=new Date(`${day}T${to}:00+05:30`).toISOString();
 const row=db.prepare('INSERT INTO bookings(user_id,equipment_id,start,end,purpose,status,created_at,purpose_category) VALUES(1,?,?,?,?,?,?,?)').run(room.id,start,end,purpose,status,new Date().toISOString(),category);
 db.prepare("INSERT INTO events(booking_id,actor_id,action,note,created_at) VALUES(?,1,'created','Presentation demonstration data',?)").run(row.lastInsertRowid,new Date().toISOString());
 if(status!=='pending')db.prepare('INSERT INTO events(booking_id,actor_id,action,note,created_at) VALUES(?,2,?,?,?)').run(row.lastInsertRowid,status,status==='cancelled'?'Class rescheduled':'Coordinator reviewed the session',new Date().toISOString());
}
server.listen(3001,'127.0.0.1',()=>console.log('Presentation-only demo: http://localhost:3001'));
