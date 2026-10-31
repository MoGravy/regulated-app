import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, extname, sep } from 'node:path'
const root=resolve('dist')
const browser=await chromium.launch({headless:true})
try {
 const page=await browser.newPage({viewport:{width:390,height:844}})
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url())
  if(url.origin!=='http://fixture.test') return route.abort()
  const file=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname))
  if(!file.startsWith(root+sep)||!existsSync(file)) return route.fulfill({status:404,body:''})
  const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.woff2':'font/woff2','.json':'application/json'}[extname(file)]||'application/octet-stream'
  return route.fulfill({status:200,contentType:mime,body:readFileSync(file)})
 })
 for(const look of ['classic','night','admiralty']){
  await page.goto(`http://fixture.test/?look=${look}`,{waitUntil:'domcontentloaded'})
  assert.equal(await page.locator('html').getAttribute('data-look'),look)
  const results=await page.evaluate(async()=>{
   const declarations=['400 16px Newsreader','600 16px Archivo','400 16px Literata','italic 400 16px Literata','600 16px "Atkinson Hyperlegible Next"']
   return Promise.all(declarations.map(async f=>({font:f,loaded:(await document.fonts.load(f,'Regulated test')).length>0})))
  })
  assert.ok(results.every(x=>x.loaded),`${look} requested fonts load offline`)
  console.log(`PASS ${look}: four local families and Literata italic load without network`)
 }
} finally { await browser.close() }
