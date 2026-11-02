// Couche explicite de prix fixes : les formules natives restent le calcul de base.
export function createPriceRules(){
 const round=n=>Math.round((n+Number.EPSILON)*1000)/1000;
 const key=(product,c)=>JSON.stringify(product==='mylar'?['mylar',c.t,Number(c.th),Number(c.L),Number(c.H),Number(c.G||0),Number(c.q)]:product==='stk'?['stk',c.sh,Number(c.w),Number(c.sh==='rond'?c.w:c.h),Number(c.q),c.mat||'vin',c.fin||'mat',c.cond||'unit']:[product,c.v,Number(c.q)]);
 const validPrice=p=>typeof p==='number'&&Number.isFinite(p)&&p>=.001&&p<=100000;
 function apply(result,price,vat){
  if(!validPrice(price))return result;
  const value=Math.max(round(price),Math.ceil(((result.floor||0)-1e-12)*1000)/1000),cost=result.known===false?null:result.cout??result.cb??null;
  return {...result,basePrice:result.price,manual:true,requestedPrice:price,price:value,ttc:value*(1+vat),total:value*result.q,
   ...(result.rendu!=null?{rendu:value+result.tr}:{}),...(result.gap!=null?{gap:value/(result.mk||result.mkt||result.price/(1+result.gap))-1}:{}),
   ...(result.remise!=null?{remise:1-value/(result.price/(1-result.remise))}:{}),
   ...(result.perM2!=null?{perM2:value*10000/result.A}:{}),marge:cost==null?null:(value-cost)/value,margeEur:cost==null?null:(value-cost)*result.q};
 }
 function validDocument(product,doc){
  if(!doc||doc.schema!==1||doc.scope!=='default'||!doc.rules||typeof doc.rules!=='object'||Array.isArray(doc.rules)||Object.keys(doc.rules).length>2000||!Array.isArray(doc.history)||doc.history.length>12)return false;
  const validKey=k=>{try{const a=JSON.parse(k);return k.length<=400&&Array.isArray(a)&&a[0]===product&&a.every(v=>typeof v==='string'||typeof v==='number'&&Number.isFinite(v))}catch{return false}};
  if(!Object.entries(doc.rules).every(([k,p])=>validKey(k)&&validPrice(p)))return false;
  return doc.history.every(h=>h&&typeof h.at==='string'&&typeof h.label==='string'&&h.label.length<200&&Array.isArray(h.changes)&&h.changes.length<=2000&&h.changes.every(c=>validKey(c.key)&&(c.before===null||validPrice(c.before))&&(c.after===null||validPrice(c.after))));
 }
 function change(document,changes,label,now=new Date()){
  const doc=JSON.parse(JSON.stringify(document)),diff=[];
  for(const [key,after]of Object.entries(changes)){const before=doc.rules[key]??null;if(before===after)continue;if(after===null)delete doc.rules[key];else {if(!validPrice(after))throw new Error('Prix invalide');doc.rules[key]=round(after)}diff.push({key,before,after})}
  if(!diff.length)return doc;
  doc.history.push({at:now.toISOString(),label,changes:diff});while(doc.history.length>12||JSON.stringify(doc.history).length>300000)doc.history.shift();return doc;
 }
 return {key,apply,validPrice,validDocument,change,empty:()=>({schema:1,scope:'default',rules:{},history:[]})};
}
