import {refreshMarkets} from './market-data.mjs';
import {checkSources} from './watch-monitor.mjs';
import {RESEARCH} from './research-data.js';
import {MARKET_SEED} from './market-seed.js';
const reply=(data,status=200)=>Response.json(data,{status});
const sourceIds=new Set(RESEARCH.rows.map(r=>r.id));
export function validReview(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||!body.accepted||typeof body.accepted!=='object'||Array.isArray(body.accepted))return false;
 return Object.keys(body).every(k=>k==='accepted')&&Object.keys(body.accepted).length<=2000&&Object.entries(body.accepted).every(([id,v])=>sourceIds.has(id)&&v&&typeof v==='object'&&!Array.isArray(v)&&typeof v.variant==='string'&&/^[\w-]{0,40}$/.test(v.variant)&&typeof v.validatedAt==='string'&&Number.isFinite(Date.parse(v.validatedAt)));
}
async function read(env,key,fallback){const raw=await env.DATA.get(key);if(!raw)return fallback;try{return JSON.parse(raw)}catch{return fallback}}
export async function refreshWatchMarkets(env){
 const result=await refreshMarkets(await read(env,'watch_markets',MARKET_SEED));
 await env.DATA.put('watch_markets',JSON.stringify(result));return result;
}
export async function refreshWatchPages(env){
 const previous=await read(env,'watch_daily_status',{}),products=[...new Set(RESEARCH.sources.map(s=>s.product))];
 const results=await Promise.all(products.map(async product=>{const values=await checkSources(RESEARCH,product,previous);return Object.fromEntries(Object.entries(values).filter(([id])=>RESEARCH.sources.some(s=>s.product===product&&s.id===id)))}));
 const merged=Object.assign({},...results);await env.DATA.put('watch_daily_status',JSON.stringify(merged));return merged;
}
export async function commerceRoutes(request,env,url){
 if(!['/api/research','/api/market-live','/api/market-refresh','/api/watch-status','/api/watch-check'].includes(url.pathname))return null;
 try{
  if(request.method==='GET'){
   if(url.pathname==='/api/research')return reply(RESEARCH);
   if(url.pathname==='/api/market-live')return reply(await read(env,'watch_markets',MARKET_SEED));
   if(url.pathname==='/api/watch-status'){const daily=await read(env,'watch_daily_status',{}),product=url.searchParams.get('product');if(!product)return reply(daily);if(!RESEARCH.sources.some(s=>s.product===product))return reply({error:'produit'},400);const manual=await read(env,'watch_product_'+product,{});for(const [id,value]of Object.entries(manual))if(!daily[id]||value.checkedAt>daily[id].checkedAt)daily[id]=value;return reply(daily)}
  }
  if(request.method!=='POST'||!['/api/market-refresh','/api/watch-check'].includes(url.pathname))return reply({error:'méthode'},405);
  if(request.headers.get('Origin')!==url.origin||request.headers.get('X-SK')!=='1')return reply({error:'origine refusée'},403);
  if(url.pathname==='/api/market-refresh'){
   const last=Number(await env.DATA.get('watch_market_refresh_at')||0);if(Date.now()-last<60000)return reply({error:'Patientez une minute avant de relancer.'},429);
   await env.DATA.put('watch_market_refresh_at',String(Date.now()),{expirationTtl:120});
   return reply(await refreshWatchMarkets(env));
  }
  if(!(request.headers.get('Content-Type')||'').startsWith('application/json'))return reply({error:'type JSON requis'},415);
  const body=await request.text();if(new TextEncoder().encode(body).byteLength>200)return reply({error:'trop gros'},413);
  let value;try{value=JSON.parse(body)}catch{return reply({error:'JSON invalide'},400)}
  if(!value||typeof value.product!=='string'||!RESEARCH.sources.some(s=>s.product===value.product))return reply({error:'produit inconnu'},400);
  const rateKey='watch_check_at_'+value.product,last=Number(await env.DATA.get(rateKey)||0);
  if(Date.now()-last<60000)return reply({error:'Patientez une minute avant de relancer.'},429);
  await env.DATA.put(rateKey,String(Date.now()),{expirationTtl:120});
  // Une clé par produit évite que deux contrôles de produits écrasent leurs résultats.
  const key='watch_product_'+value.product,previous={...await read(env,'watch_daily_status',{}),...await read(env,key,{})};
  const result=await checkSources(RESEARCH,value.product,previous);
  await env.DATA.put(key,JSON.stringify(result));return reply(result);
 }catch{ return reply({error:'Service temporairement indisponible. Réessayez sans modifier vos tarifs.'},503) }
}
