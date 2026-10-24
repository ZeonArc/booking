// Isolated UI check; never signs out the user's browser or changes live bookings.
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
 for(const [width,height,email] of [[1440,900,'researcher@lab.test'],[390,844,'manager@lab.test'],[320,640,'researcher@lab.test']]){
  const page=await browser.newPage({viewport:{width,height}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  const logout=page.getByRole('button',{name:'Sign out',exact:true});
  await logout.waitFor({state:'visible'});
  const box=await logout.boundingBox();
  assert.ok(box.x>=0&&box.x+box.width<=width&&box.y>=0&&box.y+box.height<=height,JSON.stringify({width,height,box}));
  assert.ok(box.height>=44);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  // A failed request must keep the account signed in and allow retry.
  await page.route('**/api/auth/logout',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Demo connection failure'})}));
  await logout.click();
  await page.getByText('Demo connection failure',{exact:true}).waitFor();
  assert.ok(await logout.isEnabled());
  await page.unroute('**/api/auth/logout');
  await logout.focus();await page.keyboard.press('Enter');
  await page.getByRole('button',{name:'Sign in',exact:true}).waitFor();
  assert.equal((await page.request.get(`http://127.0.0.1:${server.address().port}/api/me`)).status(),401);
  assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log('PASS: visible labelled sign-out at desktop/390px/320px; 44px touch target; failure/retry; keyboard activation; session invalidation; login return; zero page errors.');
}finally{await browser?.close();await new Promise(r=>server.close(r));db.close();}
