import crypto from 'node:crypto';
export function priceFingerprint(html){
 const text=html.replace(/<script\b[\s\S]*?<\/script>/gi,'').replace(/<style\b[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/\s+/g,' ');
 const prices=text.match(/\d[\d\s.,]{0,18}\s*(?:€|EUR|HT|TTC)/gi)||[];
 return prices.length?crypto.createHash('sha256').update(prices.join('|')).digest('hex'):null;
}
export async function checkSources(manifest,product,previous={},fetcher=fetch,now=new Date()){
 const sources=manifest.sources.filter(s=>s.product===product),results={...previous};
 const grouped=new Map();for(const source of sources){if(!grouped.has(source.url))grouped.set(source.url,[]);grouped.get(source.url).push(source)}
 for(const [url,group]of grouped){
  let info;
  try{
   const response=await fetcher(url,{signal:AbortSignal.timeout(12000),headers:{'User-Agent':'SKLUBS-price-monitor/1.0 (manual review; public pricing pages)'}});
   if(!response.ok)throw new Error('HTTP '+response.status);
   const html=await response.text();if(html.length>4e6)throw new Error('Page trop volumineuse');
   const fingerprint=priceFingerprint(html),old=previous[group[0].id];
   const changed=old?.status==='changed_review_required'||old?.needsReview===true||!!(old?.fingerprint&&fingerprint&&old.fingerprint!==fingerprint);
   info={status:changed?'changed_review_required':!fingerprint?'manual_required':'page_available',needsReview:changed,fingerprint:fingerprint||old?.fingerprint||null,checkedAt:now.toISOString(),url,pricesRevalidated:false};
  }catch(error){info={...previous[group[0].id],status:'unavailable',checkedAt:now.toISOString(),url,error:String(error.message),pricesRevalidated:false}}
  for(const source of group)results[source.id]=info;
 }
 return results;
}
