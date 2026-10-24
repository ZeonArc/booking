import React from 'react';
import {ArrowUp} from 'lucide-react';
import './footer.css';

export function Footer({admin,navigate}){
 const go=page=>{navigate(page);window.scrollTo({top:0});};
 const links=['Dashboard','Lab rooms','Save My Practical',admin?'All bookings':'My bookings','Reports',...(admin?['Approvals','Manage labs']:[])];
 return <footer className="site-footer">
  <div className="footer-grid">
   <section><h2>SRM LabReserve</h2><p>Reserve lab rooms, workshops and instruments at SRM Institute of Science and Technology, Trichy, with coordinator approval and a permanent action history.</p></section>
   <nav aria-label="Footer"><h3>Quick links</h3><ul>{links.map(label=><li key={label}><button type="button" onClick={()=>go(label)}>{label}</button></li>)}</ul></nav>
   <section><h3>Good to know</h3><ul className="footer-notes"><li>All times are Indian Standard Time (IST).</li><li>Bookings are same-day, up to 8 hours, and pending requests hold the slot.</li><li>Room inventory was supplied by the campus user; building numbers and capacities are not verified.</li></ul></section>
  </div>
  <div className="footer-bar">
   <span>© {new Date().getFullYear()} SRM LabReserve · Academic prototype, not an official SRM service</span>
   <button type="button" onClick={()=>window.scrollTo({top:0,behavior:'smooth'})}>Back to top<ArrowUp size={14} aria-hidden="true"/></button>
  </div>
 </footer>;
}
