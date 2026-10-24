export const ACCESS_LABELS={individual:'Individual access',lab:'Lab / group access'};
export const accessLabel=value=>ACCESS_LABELS[value]||'Not recorded';
export function durationMinutes(start,end){
 const value=(Date.parse(end)-Date.parse(start))/60000;
 return Number.isFinite(value)&&value>0?Math.round(value):0;
}
export function durationLabel(start,end){
 const minutes=durationMinutes(start,end);
 if(!minutes)return 'Choose a valid time range';
 const hours=Math.floor(minutes/60),remaining=minutes%60;
 return [hours?`${hours} h`:'',remaining?`${remaining} min`:''].filter(Boolean).join(' ');
}
export function validateAccess(body,resource){
 const fail=message=>{throw Object.assign(new Error(message),{status:400});};
 // Older API clients can omit the new fields; do not invent attendance for them.
 const supplied=['access_type','student_count','project_title'].some(key=>Object.hasOwn(body,key));
 if(!supplied&&!body.practical)return {access_type:null,student_count:null,project_title:''};
 const type=body.access_type??(body.practical?'lab':null);
 const count=body.student_count??body.practical?.students;
 if(!['individual','lab'].includes(type))fail('Choose individual or lab / group access');
 if(!Number.isInteger(count)||count<1||count>200)fail('Student count must be a whole number between 1 and 200');
 if(type==='individual'&&count!==1)fail('Individual access is for exactly one student');
 if(type==='lab'&&resource.kind!=='room')fail('Lab / group access requires a lab room or workshop');
 if(body.practical&&(type!=='lab'||count!==body.practical.students))fail('Student count and lab access must match the practical rescue plan');
 const project=body.project_title??'';
 if(typeof project!=='string'||project.length>120)fail('Project title must be at most 120 characters');
 if(body.purpose_category==='Project work'&&project.trim().length<3)fail('Enter a project title of at least 3 characters');
 return {access_type:type,student_count:count,project_title:body.purpose_category==='Project work'?project.trim():''};
}
// Individual access in a lab with numbered systems books exactly one system; everything else books no system.
export function validateSystem(body,resource,access){
 const fail=message=>{throw Object.assign(new Error(message),{status:400});};
 const value=body.system_number;
 if(!(resource.kind==='room'&&resource.systems>0&&access.access_type==='individual')){
  if(value!==undefined&&value!==null)fail('System numbers apply only to individual access in a lab with numbered systems');
  return null;
 }
 if(!Number.isInteger(value)||value<1||value>resource.systems)fail(`Choose one of the ${resource.systems} systems in this lab`);
 return value;
}
export function summarizeAccess(rows){
 const summarize=items=>({requests:items.length,requesters:new Set(items.map(b=>b.user_id).filter(id=>id!=null)).size,
  students:items.reduce((n,b)=>n+(b.student_count??0),0),unknownStudents:items.filter(b=>b.student_count==null).length,
  pending:items.filter(b=>b.status==='pending').length,
  minutes:items.reduce((n,b)=>n+durationMinutes(b.start,b.end),0),
  approvedMinutes:items.filter(b=>b.status==='approved').reduce((n,b)=>n+durationMinutes(b.start,b.end),0)});
 return {individual:summarize(rows.filter(b=>b.access_type==='individual')),lab:summarize(rows.filter(b=>b.access_type==='lab')),
  project:summarize(rows.filter(b=>b.purpose_category==='Project work')),unclassified:rows.filter(b=>!b.access_type).length};
}
