// Couche explicite de prix fixes : les formules natives restent le calcul de base.
// Paliers personnalisés (doc.tiers) : quantités ajoutées librement dans le tableau, par variante ou par format.
// Entre deux prix fixés d'une même série, le prix est la formule native × un coefficient interpolé en log(quantité).
export function createPriceRules(){
 const round=n=>Math.round((n+Number.EPSILON)*1000)/1000;
 const QPOS={mylar:6,stk:4};
 // Mylar hors catalogue (matière cotée sans format) : clé ["mylar","hors-catalogue",<réf>,<quantité>], quantité au rang 3.
 const qIndex=(product,a)=>product==='mylar'&&Array.isArray(a)&&a[1]==='hors-catalogue'?3:(QPOS[product]??2);
 const key=(product,c)=>JSON.stringify(product==='mylar'?(c.off?['mylar','hors-catalogue',String(c.off),Number(c.q)]:['mylar',c.t,Number(c.th),Number(c.L),Number(c.H),Number(c.G||0),Number(c.q)]):product==='stk'?['stk',c.sh,Number(c.w),Number(c.sh==='rond'?c.w:c.h),Number(c.q),c.mat||'vin',c.fin||'mat',c.cond||'unit']:[product,c.v,Number(c.q)]);
 const validPrice=p=>typeof p==='number'&&Number.isFinite(p)&&p>=.001&&p<=100000;
 const validQuantity=q=>Number.isInteger(q)&&q>=1&&q<=1e7;
 // Série d'un palier : la clé sans sa quantité (même variante, même format et même configuration).
 function split(product,k){try{const a=JSON.parse(k);if(!Array.isArray(a)||a[0]!==product)return null;const i=qIndex(product,a),q=a[i];if(!validQuantity(q))return null;const s=a.slice();s[i]=null;return {series:JSON.stringify(s),q}}catch{return null}}
 function withQuantity(product,k,q){const a=JSON.parse(k);a[qIndex(product,a)]=q;return JSON.stringify(a)}
 function apply(result,price,vat){
  if(!validPrice(price))return result;
  const value=Math.max(round(price),Math.ceil(((result.floor||0)-1e-12)*1000)/1000),cost=result.known===false?null:result.cout??result.cb??null;
  return {...result,basePrice:result.price,manual:true,requestedPrice:price,price:value,ttc:value*(1+vat),total:value*result.q,
   ...(result.rendu!=null?{rendu:value+result.tr}:{}),...(result.gap!=null?{gap:value/(result.mk||result.mkt||result.price/(1+result.gap))-1}:{}),
   ...(result.remise!=null?{remise:1-value/(result.price/(1-result.remise))}:{}),
   ...(result.perM2!=null?{perM2:value*10000/result.A}:{}),marge:cost==null?null:(value-cost)/value,margeEur:cost==null?null:(value-cost)*result.q};
 }
 // Prix fixé exact → appliqué tel quel. Entre deux paliers fixés de la même série, coefficient (prix fixé / formule)
 // interpolé linéairement en log(quantité). Hors des paliers fixés (sous le plus petit, au-dessus du plus grand) ou sans
 // palier : formule native inchangée (décision de Lemexx du 2/11/2026 : « limiter aux paliers »).
 // nativeAt(q) renvoie le prix de la formule native à la quantité q (null si non calculable).
 function resolve(product,rules,k,result,nativeAt,vat){
  const exact=rules?rules[k]:undefined;if(validPrice(exact))return apply(result,exact,vat);
  const me=split(product,k);if(!me||!rules||typeof nativeAt!=='function')return result;
  const points=[];
  for(const [rk,p] of Object.entries(rules)){
   if(!validPrice(p))continue;const other=split(product,rk);if(!other||other.series!==me.series||other.q===me.q)continue;
   let base=null;try{base=nativeAt(other.q)}catch{base=null}
   if(!(typeof base==='number'&&Number.isFinite(base)&&base>0))continue;
   points.push({q:other.q,c:p/base});
  }
  if(!points.length)return result;
  points.sort((a,b)=>a.q-b.q);
  if(me.q<points[0].q||me.q>points[points.length-1].q)return result;// hors des paliers fixés : formule native
  const i=points.findIndex(x=>x.q>=me.q),a=points[i-1],b=points[i],r=(Math.log(me.q)-Math.log(a.q))/(Math.log(b.q)-Math.log(a.q)),c=a.c+(b.c-a.c)*r;
  return {...apply(result,result.price*c,vat),interpolated:true,coefficient:c};
 }
 const validKeyFor=product=>k=>{try{const a=JSON.parse(k);return k.length<=400&&Array.isArray(a)&&a[0]===product&&a.every(v=>typeof v==='string'||typeof v==='number'&&Number.isFinite(v))}catch{return false}};
 function validTier(product,t){if(!t||typeof t!=='object'||typeof t.key!=='string'||!validKeyFor(product)(t.key)||!validQuantity(t.q))return false;const s=split(product,t.key);return !!s&&s.q===t.q}
 const validTierList=(product,list)=>Array.isArray(list)&&list.length<=2000&&list.every(t=>validTier(product,t))&&new Set(list.map(t=>t.key)).size===list.length;
 function validDocument(product,doc){
  if(!doc||doc.schema!==1||doc.scope!=='default'||!doc.rules||typeof doc.rules!=='object'||Array.isArray(doc.rules)||Object.keys(doc.rules).length>2000||!Array.isArray(doc.history)||doc.history.length>12)return false;
  const validKey=validKeyFor(product);
  if(!Object.entries(doc.rules).every(([k,p])=>validKey(k)&&validPrice(p)))return false;
  if(doc.tiers!==undefined&&!validTierList(product,doc.tiers))return false;// anciens documents sans paliers : toujours valides
  return doc.history.every(h=>h&&typeof h.at==='string'&&typeof h.label==='string'&&h.label.length<200&&Array.isArray(h.changes)&&h.changes.length<=2000&&h.changes.every(c=>validKey(c.key)&&(c.before===null||validPrice(c.before))&&(c.after===null||validPrice(c.after)))&&
   (h.tiers===undefined||(h.tiers&&typeof h.tiers==='object'&&!Array.isArray(h.tiers)&&['added','removed'].every(f=>h.tiers[f]===undefined||validTierList(product,h.tiers[f])))));
 }
 const tierOrder=product=>(a,b)=>{const x=split(product,a.key),y=split(product,b.key);return x.series<y.series?-1:x.series>y.series?1:x.q-y.q};
 // Nouvelle version du document : prix modifiés (null = retour à la formule) et, si fournie, nouvelle liste de paliers.
 function change(document,changes,label,now=new Date(),tiers,product){
  const doc=JSON.parse(JSON.stringify(document)),diff=[];
  for(const [key,after]of Object.entries(changes)){const before=doc.rules[key]??null;if(before===after)continue;if(after===null)delete doc.rules[key];else {if(!validPrice(after))throw new Error('Prix invalide');doc.rules[key]=round(after)}diff.push({key,before,after})}
  let tierDiff=null;
  if(Array.isArray(tiers)){
   const before=Array.isArray(doc.tiers)?doc.tiers:[],beforeKeys=new Set(before.map(t=>t.key)),afterKeys=new Set(tiers.map(t=>t.key));
   const added=tiers.filter(t=>!beforeKeys.has(t.key)).map(t=>({key:t.key,q:t.q})),removed=before.filter(t=>!afterKeys.has(t.key)).map(t=>({key:t.key,q:t.q}));
   if(added.length||removed.length){tierDiff={added,removed};doc.tiers=tiers.map(t=>({key:t.key,q:t.q}));if(product&&doc.tiers.every(t=>split(product,t.key)))doc.tiers.sort(tierOrder(product))}
  }
  if(!diff.length&&!tierDiff)return doc;
  doc.history.push({at:now.toISOString(),label,changes:diff,...(tierDiff?{tiers:tierDiff}:{})});while(doc.history.length>12||JSON.stringify(doc.history).length>300000)doc.history.shift();return doc;
 }
 return {key,apply,resolve,split,withQuantity,validPrice,validQuantity,validTier,validDocument,change,empty:()=>({schema:1,scope:'default',rules:{},history:[],tiers:[]})};
}
