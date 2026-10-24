// Isolated browser + in-memory database: never changes the presenter's live bookings.
// Usage: node presentation/check-practical.mjs <absolute playwright package directory>
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {createApp} from '../server.js';
const require=createRequire(import.meta.url);
const {chromium}=require(process.argv[2]||'playwright');
const {server,db}=createApp();
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByRole('button',{name:'Save My Practical',exact:true}).click();
 await page.getByRole('button',{name:'Load demo example'}).click();
 await page.getByRole('button',{name:'Save my practical',exact:true}).last().click();
 await page.getByRole('heading',{name:'Your practical has options.'}).waitFor();
 assert.match(await page.locator('.rescue-verdict').innerText(),/30 demo seats/);
 assert.match(await page.locator('.rescue-option').first().innerText(),/CS Lab 2/);
 await page.screenshot({path:'docs/save-my-practical-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Review & request this lab'}).first().click();
 await page.locator('dialog[open]').waitFor();
 assert.match(await page.locator('textarea[name="purpose"]').inputValue(),/Python programming for 40 students/);
 assert.equal(await page.locator('input[name="start"]').inputValue(),'14:00');
 assert.equal(await page.locator('input[name="end"]').inputValue(),'16:00');
 await page.getByRole('button',{name:'Request booking',exact:true}).click();
 await page.locator('dialog').waitFor({state:'detached'});
 const saved=db.prepare("SELECT * FROM bookings WHERE purpose LIKE 'Save My Practical:%'").get();
 assert.equal(saved.status,'pending');
 await page.getByLabel('Preferred lab (optional)').selectOption(String(saved.equipment_id));
 assert.equal(await page.locator('.rescue-option').count(),0);
 await page.getByRole('button',{name:'Save my practical',exact:true}).last().click();
 await page.getByRole('heading',{name:'Your practical has options.'}).waitFor();
 assert.match(await page.locator('.rescue-verdict').innerText(),/occupied/);
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'docs/save-my-practical-mobile.png',fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'No mobile page overflow');
 await page.getByLabel('Number of students').fill('200');
 await page.getByRole('button',{name:'Save my practical',exact:true}).last().click();
 await page.getByRole('heading',{name:'Let’s adjust the plan.'}).waitFor();
 assert.match(await page.locator('.rescue-empty').innerText(),/No compatible room has enough demo seats/);
 assert.deepEqual(errors,[]);
 console.log('PASS: desktop + mobile UI, demo example, reason/time handoff, pending booking, conflict alternatives, stale-result clearing, empty state, zero console errors.');
}finally{await browser?.close();await new Promise(r=>server.close(r));db.close();}
