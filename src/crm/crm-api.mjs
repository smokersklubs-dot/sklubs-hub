// API privée serveur-à-serveur pour le CRM SKLUBS OS (lecture seule).
// - Prix servis : les prix « en cours » du hub (documents enregistrés, voir current-snapshots.mjs), sans étape de
//   publication ni de validation, indépendants de cfg_publications. Les brouillons non enregistrés ne sont jamais lus.
// - Authentification : « Authorization: Bearer <CRM_API_TOKEN> », comparée à durée constante, AVANT la porte Basic Auth.
// - Aucune écriture : ni document de tarif, ni KV, ni stockage de l'acteur (lecture stricte via readOnlyDocument).
// - Aucun calcul dupliqué : le prix vient de priceSnapshot() (même moteur que /api/public/quote).
import {priceSnapshot,readOnlyDocument} from './public-pricing.mjs';
import {crmCatalogEntries} from './crm-catalog.mjs';
import {currentSnapshots} from './current-snapshots.mjs';
import {createCampaignTools,PRODUCT_IDS} from './campaigns.mjs';

const campaigns=createCampaignTools(),SITES=['fr','com'],PREFIX='/api/crm/v1/';
const MAX_BODY=4000,RATE_WINDOW_MS=60000,RATE_MAX=60,FAIL_WINDOW_MS=900000,FAIL_MAX=10;
// Limiteur best effort, en mémoire de l'isolat (aucune écriture KV). Un binding Cloudflare Rate Limiting
// optionnel (env.CRM_RATE_LIMITER) est utilisé en plus s'il est configuré.
const hits=new Map(),fails=new Map();
function bump(map,key,windowMs,now){const e=map.get(key);if(!e||now-e.start>=windowMs){const n={start:now,count:1};map.set(key,n);if(map.size>5000)map.delete(map.keys().next().value);return n.count}e.count++;return e.count}
function blocked(map,key,windowMs,max,now){const e=map.get(key);return !!e&&now-e.start<windowMs&&e.count>=max}
export function resetCrmRateLimits(){hits.clear();fails.clear()}

async function safeEqual(a,b){
 const enc=new TextEncoder(),[ha,hb]=await Promise.all([crypto.subtle.digest('SHA-256',enc.encode(a)),crypto.subtle.digest('SHA-256',enc.encode(b))]);
 const x=new Uint8Array(ha),y=new Uint8Array(hb);let d=0;for(let i=0;i<x.length;i++)d|=x[i]^y[i];return d===0;
}
const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow, noarchive','Referrer-Policy':'no-referrer'};
const json=(value,status=200,extra={})=>new Response(JSON.stringify(value),{status,headers:{...HEADERS,...extra}});

const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function validConfiguration(c){
 if(!plain(c))return 'configuration doit être un objet';
 const entries=Object.entries(c);if(entries.length>20)return 'configuration : 20 champs maximum';
 for(const [k,v] of entries){
  if(!/^[A-Za-z][A-Za-z0-9_]{0,30}$/.test(k))return 'configuration : nom de champ invalide';
  if(k==='rate')return 'Le tarif de transport personnalisé est réservé au dashboard.';
  if(!(typeof v==='string'&&v.length<=100)&&!(typeof v==='number'&&Number.isFinite(v)))return 'configuration : valeur invalide ('+k+')';
 }
 return null;
}
export function validatePriceInput(body){
 if(!plain(body))return {error:'JSON objet attendu'};
 const allowed=['productId','configuration','quantity','site','includeInternal'];
 const extra=Object.keys(body).filter(k=>!allowed.includes(k));if(extra.length)return {error:'champ inconnu : '+extra.join(', ')};
 if(!PRODUCT_IDS.includes(body.productId))return {error:'productId inconnu'};
 if(!SITES.includes(body.site))return {error:'site requis (fr ou com)'};
 if(!Number.isInteger(body.quantity)||body.quantity<1||body.quantity>1e7)return {error:'quantity : entier entre 1 et 10 000 000'};
 const configuration=body.configuration===undefined?{}:body.configuration,problem=validConfiguration(configuration);if(problem)return {error:problem};
 if(body.includeInternal!==undefined&&typeof body.includeInternal!=='boolean')return {error:'includeInternal : booléen'};
 return {value:{productId:body.productId,site:body.site,quantity:body.quantity,configuration:{...configuration,q:body.quantity},includeInternal:body.includeInternal===true}};
}

async function authorize(request,env,ip,now){
 const secret=env.CRM_API_TOKEN;
 if(typeof secret!=='string'||secret.length<32)return json({error:'API CRM fermée : secret CRM_API_TOKEN absent ou trop court.'},503);
 if(blocked(fails,ip,FAIL_WINDOW_MS,FAIL_MAX,now))return json({error:'Trop d’essais refusés. Réessayez plus tard.'},429,{'Retry-After':'900'});
 const h=request.headers.get('Authorization')||'',token=h.startsWith('Bearer ')?h.slice(7):'';
 if(!token||!(await safeEqual(token,secret))){bump(fails,ip,FAIL_WINDOW_MS,now);return json({error:'Jeton CRM requis.'},401,{'WWW-Authenticate':'Bearer realm="sklubs-crm"'})}
 return null;
}

export async function crmApiRoute(request,env,url,now=Date.now()){
 if(!url.pathname.startsWith(PREFIX))return null;
 const ip=(request.headers.get('X-Forwarded-For')||'').split(',').pop().trim()||request.headers.get('CF-Connecting-IP')||'inconnue';// VPS : derrière Caddy, dernière entrée de X-Forwarded-For
 // Serveur à serveur uniquement : un navigateur envoie toujours Origin sur un POST inter-origines.
 if(request.headers.get('Origin'))return json({error:'Appel navigateur refusé : API serveur à serveur.'},403);
 const denied=await authorize(request,env,ip,now);if(denied)return denied;
 if(env.CRM_RATE_LIMITER?.limit){try{const {success}=await env.CRM_RATE_LIMITER.limit({key:ip});if(!success)return json({error:'Trop de requêtes.'},429,{'Retry-After':'60'})}catch{/* binding absent ou indisponible : limiteur mémoire ci-dessous */}}
 if(bump(hits,ip,RATE_WINDOW_MS,now)>RATE_MAX)return json({error:'Trop de requêtes.'},429,{'Retry-After':'60'});
 const route=url.pathname.slice(PREFIX.length);
 try{
  if(route==='catalog'){
   if(request.method!=='GET')return json({error:'méthode'},405,{Allow:'GET'});
   const site=url.searchParams.get('site')||'fr';if(!SITES.includes(site))return json({error:'site requis (fr ou com)'},400);
   const current=await currentSnapshots(env),entries=Object.values(current.products);
   // Catalogue enrichi réservé au CRM (crm-catalog.mjs) : transport et délais, TVA, quantités, images, matières, options.
   const products=crmCatalogEntries(Object.fromEntries(entries.map(e=>[e.snapshot.product,e.snapshot])),env.IMAGE_MANIFEST||null).map(p=>{const e=current.products[p.id];return {...p,documentVersion:e.documentVersion,priceBasis:e.savedDocuments.length?'enregistré dans le hub':'valeurs par défaut du hub'}});
   return json({site,currency:'EUR',scope:{id:'default',currency:'EUR'},source:'hub-prix-en-cours',publication:{documentVersion:current.documentVersion},products,unavailable:current.unreadable});
  }
  // Photos du hub pour le CRM (même jeton) : le CRM ne peut pas lire /img/… protégé par le mot de passe du hub.
  {const m=/^image\/(mylar|produits)\/([a-z0-9_]{1,60})\.jpg$/.exec(route);
   if(m){if(request.method!=='GET')return json({error:'méthode'},405,{Allow:'GET'});
    const bytes=env.IMAGE?await env.IMAGE(m[1],m[2]):null;
    if(!bytes)return json({error:'image introuvable'},404);
    return new Response(bytes,{status:200,headers:{'Content-Type':'image/jpeg','Cache-Control':'private, max-age=86400','X-Content-Type-Options':'nosniff'}});}}
  if(route==='price'){
   if(request.method!=='POST')return json({error:'méthode'},405,{Allow:'POST'});
   if(!(request.headers.get('Content-Type')||'').startsWith('application/json'))return json({error:'Content-Type application/json requis'},415);
   const raw=await request.text();if(new TextEncoder().encode(raw).byteLength>MAX_BODY)return json({error:'taille'},413);
   let body;try{body=JSON.parse(raw)}catch{return json({error:'JSON invalide'},400)}
   const input=validatePriceInput(body);if(input.error)return json({error:input.error},422);
   const {productId,site,quantity,configuration,includeInternal}=input.value;
   const current=await currentSnapshots(env,[productId]),entry=current.products[productId],snapshot=entry?.snapshot;
   if(!snapshot)return json({error:'Tarif du hub illisible pour ce produit (prix fixés invalides).'},503);
   const promotions=await readOnlyDocument(env,'cfg_promotions'),campaign=campaigns.active(promotions.data,site,productId,new Date(now))||null;
   let detail;try{detail=priceSnapshot(snapshot,configuration,campaign)}catch(error){return json({error:error.message||'Prix non calculable'},422)}
   const q=detail.quote,vatAmount=Math.round((q.totalTTC-q.totalHT)*100)/100;
   const out={productId,site,currency:'EUR',quantity:q.quantity,configuration:detail.configuration,
    unitHT:q.unitHT,totalHT:q.totalHT,vatRate:q.vat,vatAmount,totalTTC:q.totalTTC,regularUnitHT:q.regularUnitHT,
    promotion:q.promotion,estimated:q.estimated,
    priceVersion:{id:site+':'+productId+':'+(snapshot.approvedAt||'valeurs-par-defaut'),approvedAt:snapshot.approvedAt,publicationDocumentVersion:entry.documentVersion},
    computedAt:new Date(now).toISOString()};
   if(includeInternal)out.internal=detail.internal;// coût/marge : CRM privé uniquement, jamais exposé par les routes publiques
   return json(out);
  }
  return json({error:'inconnu'},404);
 }catch(error){console.warn('crm-api',String(error).slice(0,200));return json({error:'Hub indisponible'},500)}
}
