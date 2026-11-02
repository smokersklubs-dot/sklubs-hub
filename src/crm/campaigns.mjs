export const PRODUCT_IDS=['mylar','stk','badge','pin','bottle','pen','lanyard','patch','tshirt','cap','beanie','bucket','sock','tote'];
export function createCampaignTools(){
 const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
 const today=(now=new Date())=>{const p=Object.fromEntries(new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));return p.year+'-'+p.month+'-'+p.day};
 function valid(doc){if(!doc||doc.schema!==1||!Array.isArray(doc.list)||doc.list.length>300)return false;
  if(!doc.list.every(c=>c&&/^[\w-]{1,60}$/.test(c.id)&&typeof c.title==='string'&&c.title.length>0&&c.title.length<=120&&PRODUCT_IDS.includes(c.product)&&date(c.start)&&date(c.end)&&c.end>=c.start&&['percent','amount'].includes(c.kind)&&Number.isFinite(c.value)&&c.value>0&&c.value<=(c.kind==='percent'?90:100000)&&c.scope==='default'&&c.sites&&typeof c.sites.com==='boolean'&&typeof c.sites.fr==='boolean'&&(!c.posts||Array.isArray(c.posts)&&c.posts.length<=10&&c.posts.every(p=>p&&typeof p.text==='string'&&p.text.length<=5000))))return false;
  if(new Set(doc.list.map(c=>c.id)).size!==doc.list.length)return false;
  for(const site of ['com','fr'])for(let i=0;i<doc.list.length;i++)for(let j=i+1;j<doc.list.length;j++){const a=doc.list[i],b=doc.list[j];if(a.sites[site]&&b.sites[site]&&a.product===b.product&&a.scope===b.scope&&a.start<=b.end&&b.start<=a.end)return false}
  return true;
 }
 function discount(campaign,result){const requested=campaign.kind==='percent'?result.price*(1-campaign.value/100):result.price-campaign.value;const price=Math.max(.001,Math.ceil(((result.floor||0)-1e-12)*1000)/1000,Math.round(requested*1000)/1000);return {...result,price,total:price*result.q,promotion:campaign.id,promotionTitle:campaign.title}}
 const active=(doc,site,product,now=new Date())=>(doc?.list||[]).find(c=>c.sites[site]&&c.product===product&&c.scope==='default'&&c.start<=today(now)&&c.end>=today(now));
 function drafts(c,name){const reduction=c.kind==='percent'?c.value+' %':c.value+' € par pièce';const facts=name+' : jusqu’à '+reduction+' de remise du '+c.start+' au '+c.end+'.';return [{kind:'story',text:facts+' Découvrez les options et les tarifs sur notre site.'},{kind:'post',text:c.title+'\n\n'+facts+' Consultez les formats et quantités concernés sur notre site. Les conditions de l’offre s’appliquent.'},{kind:'reminder',text:'Rappel : '+facts+' Fin de l’offre le '+c.end+'.'}]}
 return {valid,today,active,discount,drafts,empty:()=>({schema:1,list:[]})};
}
