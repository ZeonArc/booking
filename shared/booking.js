import {accessLabel,durationMinutes} from './access.js';
export const PURPOSE_CATEGORIES=['Practical class','Project work','Research','Workshop','Training','Assessment','Other'];

export function validateInterval(startValue,endValue,now=Date.now()) {
  const fail=message=>{throw Object.assign(new Error(message),{status:400});};
  const iso=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{3})?)?(Z|[+-]\d{2}:\d{2})$/;
  if(typeof startValue!=='string'||typeof endValue!=='string'||!iso.test(startValue)||!iso.test(endValue)) fail('Use ISO timestamps with a timezone');
  const start=new Date(startValue),end=new Date(endValue);
  if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start)fail('Enter a valid start and end time');
  for(const value of [startValue,endValue]) if(new Date(value.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)!==value.slice(0,10))fail('Enter a valid calendar date');
  const labDate=d=>new Date(+d+19800000).toISOString().slice(0,10);
  if(labDate(start)!==labDate(end))fail('Start and end must be on the same laboratory date (IST)');
  if(+start<now)fail('Bookings must start in the future');
  if(end-start>8*3600000)fail('A booking can be at most 8 hours');
  return {start:start.toISOString(),end:end.toISOString()};
}

// Quote all fields and neutralize spreadsheet formula prefixes in untrusted text.
export function bookingsCsv(rows){
  const cell=value=>{let text=String(value??'');if(/^[\s]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
  const fields=['Booking ID','Resource','Type','Requester','Start (UTC)','End (UTC)','Purpose category','Booking reason','Status','Created (UTC)','Access type','Student count','Project title','Duration (minutes)'];
  const data=rows.map(b=>[b.id,b.equipment_name,b.resource_kind,b.user_name,b.start,b.end,b.purpose_category||'Other',b.purpose,b.status,b.created_at,accessLabel(b.access_type),b.student_count??'Not recorded',b.project_title||'',durationMinutes(b.start,b.end)]);
  return '\uFEFF'+[fields,...data].map(row=>row.map(cell).join(',')).join('\r\n');
}
