const K_ITEMS='base-inv-v6', K_CATS='base-inv-cats-v6', K_LANG='base-inv-lang';
let items=[], cats=[], filter='all', locFilter='', catFilter='', openPanel=null, editingId=null, sLoc='';

// ── LOAD / SAVE ──────────────────────────────────────────────────────────────
function load(){
  cats  = JSON.parse(localStorage.getItem(K_CATS)||'[]');
  const saved = localStorage.getItem(K_ITEMS);
  if(saved){ items=JSON.parse(saved); }
  else {
    // migrate older versions
    for(const key of ['base-inv-v5','base-inventory-v4','base-inventory-v5']){
      const old=localStorage.getItem(key);
      if(old){ items=JSON.parse(old).map(i=>({...i,location:i.bag||''})); break; }
    }
  }
}
function save(){
  localStorage.setItem(K_ITEMS,JSON.stringify(items));
  localStorage.setItem(K_CATS,JSON.stringify(cats));
}

// ── SEARCH ───────────────────────────────────────────────────────────────────
let searchOpen=false;
function toggleSearch(){
  searchOpen=!searchOpen;
  document.getElementById('searchBar').classList.toggle('open',searchOpen);
  document.getElementById('searchBtn').classList.toggle('active',searchOpen);
  if(searchOpen) setTimeout(()=>document.getElementById('searchInput').focus(),260);
  else { document.getElementById('searchInput').value=''; render(); }
}

// ── FILTERS ──────────────────────────────────────────────────────────────────
function setFilter(f){
  filter=f; locFilter=''; catFilter='';
  document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
  document.getElementById('chip'+f.charAt(0).toUpperCase()+f.slice(1)).classList.add('active');
  render();
}
function setLocFilter(l){
  locFilter = locFilter===l?'':l;
  filter='all'; catFilter='';
  document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
  if(locFilter) document.getElementById(l==='bag'?'chipBag':'chipCloset').classList.add('active');
  else document.getElementById('chipAll').classList.add('active');
  render();
}

// ── ADD LOCATION TOGGLE ───────────────────────────────────────────────────────
function setSLoc(v){
  sLoc=v;
  ['sLoc0','sLoc1','sLoc2'].forEach(id=>{
    const el=document.getElementById(id);
    el.classList.remove('active','bag','clos');
  });
  if(v===''){    const b=document.getElementById('sLoc0'); b.classList.add('active'); }
  else if(v==='bag'){ const b=document.getElementById('sLoc1'); b.classList.add('active','bag'); }
  else { const b=document.getElementById('sLoc2'); b.classList.add('active','clos'); }
}

// ── CATEGORIES ───────────────────────────────────────────────────────────────
function refreshCatUI(){
  document.getElementById('catList').innerHTML = cats.map((c,i)=>`
    <div class="tag-pill">${esc(c)}<button class="tag-del" onclick="delCat(${i})">✕</button></div>`).join('');
  const wrap=document.getElementById('chipsWrap');
  wrap.querySelectorAll('.cat-chip').forEach(e=>e.remove());
  cats.forEach(c=>{
    const el=document.createElement('div');
    el.className='chip cat-chip'+(catFilter===c?' active':'');
    el.textContent=c;
    el.onclick=()=>{ catFilter=catFilter===c?'':c; locFilter=''; filter='all';
      document.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));
      if(catFilter) el.classList.add('active'); else document.getElementById('chipAll').classList.add('active');
      render(); };
    // insert before the loc chips
    document.getElementById('chipBag').before(el);
  });
  const sc=document.getElementById('sCat');
  if(sc){ const cur=sc.value; sc.innerHTML=cats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join(''); if(cats.includes(cur)) sc.value=cur; }
}
function addCat(){
  const inp=document.getElementById('newCat'); const v=inp.value.trim();
  if(!v||cats.includes(v)) return;
  cats.push(v); inp.value=''; save(); refreshCatUI();
}
async function delCat(i){
  const c=cats[i]; if(!c) return;
  const ok=await showConfirm(t().cat_del_confirm(c),'',lang==='he'?'מחק':'Delete');
  if(!ok) return;
  cats.splice(i,1);
  items.forEach(it=>{ if(it.cat===c) it.cat=cats[0]||''; });
  save(); refreshCatUI(); render();
}

// ── ADD SHEET ─────────────────────────────────────────────────────────────────
function showAddSheet(){
  refreshCatUI(); sLoc=''; setSLoc('');
  document.getElementById('addSheet').style.display='flex';
  setTimeout(()=>document.getElementById('sName').focus(),300);
}
function hideAddSheet(){ document.getElementById('addSheet').style.display='none'; }
function submitAdd(){
  const name=document.getElementById('sName').value.trim();
  const qty=parseInt(document.getElementById('sQty').value)||1;
  const cat=document.getElementById('sCat').value||'';
  if(!name){ document.getElementById('sName').focus(); return; }
  items.push({id:Date.now(),name,target:qty,qty:0,cat,location:sLoc});
  document.getElementById('sName').value='';
  document.getElementById('sQty').value='';
  setSLoc('');
  const msg=document.getElementById('addSuccess');
  msg.textContent=(lang==='he'?'✓ נוסף: ':'✓ Added: ')+name;
  setTimeout(()=>msg.textContent='',1800);
  save(); render();
  document.getElementById('sName').focus();
}

// ── SETTINGS ─────────────────────────────────────────────────────────────────
function showSettings(){ refreshCatUI(); document.getElementById('settingsSheet').style.display='flex'; }
function hideSettings(){ document.getElementById('settingsSheet').style.display='none'; }

async function resetAllQty(){
  const ok=await showConfirm(t().reset_confirm,'');
  if(!ok) return;
  items.forEach(i=>i.qty=0);
  save(); render(); hideSettings();
}

// ── BRING SHEET ───────────────────────────────────────────────────────────────
function showBring(){
  const missing=[...items].filter(i=>i.qty<i.target)
    .sort((a,b)=>(a.cat||'').localeCompare(b.cat||'','he')||a.name.localeCompare(b.name,'he'));
  const el=document.getElementById('bringList');
  if(!missing.length){ el.innerHTML=`<div class="bring-empty">${t().bring_empty}</div>`; }
  else { el.innerHTML=missing.map(item=>`
    <div class="bring-item" id="bi-${item.id}" onclick="toggleBringDone(${item.id})">
      <div class="bring-check" id="bc-${item.id}"></div>
      <div class="bring-info">
        <div class="bring-name">${esc(item.name)}</div>
        <div class="bring-sub">${esc(item.cat||'')}${locLabel(item.location,' · ')}</div>
      </div>
      <span class="bring-need" id="bn-${item.id}">${t().bring_miss(item.target-item.qty)}</span>
    </div>`).join(''); }
  document.getElementById('bringSheet').style.display='flex';
}
function hideBring(){ document.getElementById('bringSheet').style.display='none'; }
function toggleBringDone(id){
  const item=items.find(i=>i.id===id); if(!item) return;
  const el=document.getElementById('bi-'+id); if(!el) return;
  const done=el.classList.contains('done');
  if(done){ item.qty=item._bp??item.qty; delete item._bp; el.classList.remove('done'); document.getElementById('bc-'+id).textContent=''; document.getElementById('bn-'+id).textContent=t().bring_miss(item.target-item.qty); }
  else { item._bp=item.qty; item.qty=item.target; el.classList.add('done'); document.getElementById('bc-'+id).textContent='✓'; document.getElementById('bn-'+id).textContent='✓'; }
  save(); updateStats();
}

// ── STEPPER ───────────────────────────────────────────────────────────────────
function chQty(id,d){
  const it=items.find(i=>i.id===id); if(!it) return;
  it.qty=Math.max(0,Math.min(it.target,it.qty+d));
  save(); refreshItem(id); updateStats();
}
function startEdit(id){
  if(editingId!==null) finishEdit(editingId);
  editingId=id;
  const el=document.getElementById('sn-'+id); if(!el) return;
  el.classList.add('editing');
  const inp=el.querySelector('input');
  inp.value=items.find(i=>i.id===id)?.qty??0; inp.focus(); inp.select();
}
function finishEdit(id){
  if(editingId!==id) return; editingId=null;
  const it=items.find(i=>i.id===id); const el=document.getElementById('sn-'+id);
  if(!it||!el) return;
  const v=parseInt(el.querySelector('input').value);
  if(!isNaN(v)&&v>=0) it.qty=Math.min(it.target,v);
  el.classList.remove('editing'); refreshItem(id); save(); updateStats();
}

// ── EDIT PANEL ────────────────────────────────────────────────────────────────
function togglePanel(id){
  const p=document.getElementById('ep-'+id); if(!p) return;
  if(openPanel===id){ p.classList.remove('open'); openPanel=null; return; }
  if(openPanel!==null){ const pp=document.getElementById('ep-'+openPanel); if(pp) pp.classList.remove('open'); }
  openPanel=id; p.classList.add('open');
  const it=items.find(i=>i.id===id);
  document.getElementById('epn-'+id).value=it.name;
  document.getElementById('ept-'+id).value=it.target;
  // sync category dropdown with current categories and item's saved value
  const sel=document.getElementById('epc-'+id);
  if(sel){ sel.innerHTML=cats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join(''); sel.value=it.cat; }
  // set location seg
  ['','bag','closet'].forEach((v,idx)=>{
    const b=document.getElementById(`epl-${id}-${idx}`);
    if(b){ b.classList.toggle('active',it.location===v); b.classList.remove('bag','clos');
      if(it.location===v){ if(v==='bag') b.classList.add('bag'); else if(v==='closet') b.classList.add('clos'); } }
  });
}
function setEpLoc(id,v){
  const it=items.find(i=>i.id===id); if(!it) return;
  ['','bag','closet'].forEach((lv,idx)=>{
    const b=document.getElementById(`epl-${id}-${idx}`);
    if(b){ b.classList.remove('active','bag','clos');
      if(lv===v){ b.classList.add('active'); if(v==='bag') b.classList.add('bag'); else if(v==='closet') b.classList.add('clos'); } }
  });
  it.location=v; save();
}
function applyEdit(id){
  const it=items.find(i=>i.id===id); if(!it) return;
  const name=document.getElementById('epn-'+id).value.trim();
  const target=parseInt(document.getElementById('ept-'+id).value);
  const cat=document.getElementById('epc-'+id).value;
  if(name) it.name=name;
  if(!isNaN(target)&&target>=1){ it.target=target; it.qty=Math.min(it.qty,it.target); }
  it.cat=cat;
  const p=document.getElementById('ep-'+id); if(p) p.classList.remove('open'); openPanel=null;
  save(); render();
}
async function delItem(id){
  const it=items.find(i=>i.id===id);
  const ok=await showConfirm(t().del_confirm,it?esc(it.name):'');
  if(!ok) return; items=items.filter(i=>i.id!==id); save(); render();
}

// ── STATS ─────────────────────────────────────────────────────────────────────
function updateStats(){
  const total=items.length, full=items.filter(i=>i.qty>=i.target).length, miss=total-full;
  const pct=total?Math.round(full/total*100):0;
  document.getElementById('sTotal').textContent=total;
  document.getElementById('sFull').textContent=full;
  document.getElementById('sMiss').textContent=miss;
  document.getElementById('sPct').textContent=pct+'%';
  const bar=document.getElementById('sBar'); bar.style.width=pct+'%';
  bar.classList.toggle('done',pct===100);
  document.getElementById('topbarSub').textContent=total?t().sub_full(full,total):t().sub_empty;
}

// ── REFRESH SINGLE ────────────────────────────────────────────────────────────
function qc(it){ return it.qty===0?'zero':it.qty<it.target?'low':'ok'; }
function refreshItem(id){
  const it=items.find(i=>i.id===id); if(!it) return;
  const el=document.getElementById('item-'+id); if(!el) return;
  el.className='item '+(it.qty>=it.target?'full':'missing');
  const fb=document.getElementById('fb-'+id);
  if(fb){ fb.querySelector('.frac-txt').textContent=it.qty+'/'+it.target; fb.className='frac '+qc(it); }
  const sn=document.getElementById('sn-'+id);
  if(sn){ sn.querySelector('span').textContent=it.qty; sn.className='step-num '+qc(it); }
}

// ── RENDER ────────────────────────────────────────────────────────────────────
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function locLabel(loc,prefix=''){
  if(loc==='bag')    return prefix+(lang==='he'?'🎒 תיק':'🎒 Bag');
  if(loc==='closet') return prefix+(lang==='he'?'🗄️ ארון':'🗄️ Closet');
  return '';
}

function render(){
  updateStats();
  const q=document.getElementById('searchInput')?.value.toLowerCase()||'';
  const list=document.getElementById('itemList');
  let filtered=[...items];
  if(filter==='full')    filtered=filtered.filter(i=>i.qty>=i.target);
  if(filter==='missing') filtered=filtered.filter(i=>i.qty<i.target);
  if(locFilter)          filtered=filtered.filter(i=>i.location===locFilter);
  if(catFilter)          filtered=filtered.filter(i=>i.cat===catFilter);
  if(q)                  filtered=filtered.filter(i=>i.name.toLowerCase().includes(q));

  filtered.sort((a,b)=>{
    const af=a.qty>=a.target,bf=b.qty>=b.target;
    if(!af&&bf) return -1; if(af&&!bf) return 1;
    const cc=(a.cat||'').localeCompare(b.cat||'','he');
    return cc!==0?cc:a.name.localeCompare(b.name,'he');
  });

  if(!filtered.length){
    list.innerHTML=items.length===0
      ?`<div class="empty"><div class="empty-icon">📦</div>${t().empty_list}<br><small>${t().empty_hint}</small></div>`
      :`<div class="empty"><div class="empty-icon">✅</div>${t().empty_filter}</div>`;
    return;
  }

  const groups={};
  filtered.forEach(it=>{ const g=it.cat||'—'; (groups[g]=groups[g]||[]).push(it); });
  let html='';
  for(const [cat,gItems] of Object.entries(groups)){
    const gMiss=gItems.filter(i=>i.qty<i.target).length;
    html+=`<div class="cat-group"><div class="cat-label">${esc(cat)}<span class="cat-status ${gMiss?'bad':'ok'}">${gMiss?gMiss+' '+t().stat_miss:'✓ '+t().chip_full}</span></div>`;
    gItems.forEach(it=>{
      const cls=qc(it), isOpen=openPanel===it.id;
      const locBadge=it.location?`<span class="loc-badge ${it.location}">${locLabel(it.location)}</span>`:'';
      html+=`<div class="item ${it.qty>=it.target?'full':'missing'}" id="item-${it.id}">
        <div class="item-row">
          <div class="item-info">
            <div class="item-name">${esc(it.name)}</div>
            <div class="item-meta">${esc(it.cat||'')}${locBadge}</div>
          </div>
          <button class="frac ${cls}" id="fb-${it.id}" onclick="togglePanel(${it.id})">
            <span class="frac-txt">${it.qty}/${it.target}</span><span class="edit-hint">✎</span>
          </button>
          <div class="stepper">
            <button class="step-btn minus" onclick="chQty(${it.id},-1)">−</button>
            <div class="step-num ${cls}" id="sn-${it.id}" onclick="startEdit(${it.id})">
              <span>${it.qty}</span>
              <input type="number" min="0" max="${it.target}" onclick="event.stopPropagation()"
                onblur="finishEdit(${it.id})"
                onkeydown="if(event.key==='Enter'||event.key==='Tab'){event.preventDefault();finishEdit(${it.id});}if(event.key==='Escape'){editingId=null;document.getElementById('sn-${it.id}').classList.remove('editing');}">
            </div>
            <button class="step-btn plus" onclick="chQty(${it.id},1)">+</button>
          </div>
        </div>
        <div class="edit-panel ${isOpen?'open':''}" id="ep-${it.id}">
          <div class="edit-panel-inner">
            <div class="ep-row">
              <span class="ep-label">${t().ep_name}</span>
              <input class="ep-input" id="epn-${it.id}" type="text" value="${esc(it.name)}" onkeydown="if(event.key==='Enter')applyEdit(${it.id})">
              <span class="ep-label">${t().ep_target}</span>
              <input class="ep-input ep-num" id="ept-${it.id}" type="number" value="${it.target}" min="1" onkeydown="if(event.key==='Enter')applyEdit(${it.id})">
            </div>
            <div class="ep-row">
              <span class="ep-label">${t().ep_cat}</span>
              <select class="ep-select" id="epc-${it.id}">${cats.map(c=>`<option value="${esc(c)}"${it.cat===c?' selected':''}>${esc(c)}</option>`).join('')}</select>
            </div>
            <div class="ep-row">
              <span class="ep-label">${t().ep_loc}</span>
              <div class="seg">
                <button class="seg-btn ${it.location===''?'active':''}"        id="epl-${it.id}-0" onclick="setEpLoc(${it.id},'')">—</button>
                <button class="seg-btn ${it.location==='bag'?'active bag':''}" id="epl-${it.id}-1" onclick="setEpLoc(${it.id},'bag')">🎒 ${lang==='he'?'תיק':'Bag'}</button>
                <button class="seg-btn ${it.location==='closet'?'active clos':''}" id="epl-${it.id}-2" onclick="setEpLoc(${it.id},'closet')">🗄️ ${lang==='he'?'ארון':'Closet'}</button>
              </div>
            </div>
            <div class="ep-row">
              <button class="ep-save" onclick="applyEdit(${it.id})">${t().ep_save}</button>
              <button class="ep-delete" onclick="delItem(${it.id})">${t().ep_del}</button>
            </div>
          </div>
        </div>
      </div>`;
    });
    html+='</div>';
  }
  list.innerHTML=html;
}

// ── CONFIRM ───────────────────────────────────────────────────────────────────
let _cb=null;
function showConfirm(msg,sub,okLabel){
  return new Promise(resolve=>{
    _cb=resolve;
    document.getElementById('confirmMsg').textContent=msg;
    document.getElementById('confirmSub').textContent=sub||'';
    document.getElementById('confirmOk').textContent=okLabel||(lang==='he'?'אשר':'Confirm');
    document.getElementById('confirmCancel').textContent=lang==='he'?'ביטול':'Cancel';
    document.getElementById('confirmDialog').style.display='flex';
  });
}
function confirmResolve(v){ document.getElementById('confirmDialog').style.display='none'; if(_cb){_cb(v);_cb=null;} }

// ── I18N ──────────────────────────────────────────────────────────────────────
const STRINGS={
  he:{
    title:'ציוד בבסיס',sub_empty:'רשימה ריקה',sub_full:(f,tt)=>`${f}/${tt} מלא`,
    stat_items:'פריטים',stat_full:'מלא',stat_miss:'חסר',prog_label:'כמה מהרשימה מלא',
    chip_all:'הכל',chip_miss:'חסר',chip_full:'מלא',chip_bag:'🎒 תיק',chip_closet:'🗄️ ארון',
    fab:'+ הוסף פריט',sheet_title:'הוספת פריט',sh_name_ph:'שם הפריט...',sh_qty_ph:'יעד',sh_add:'הוסף לרשימה',sh_done:'סגור',
    search_ph:'חפש פריט...',
    bring_title:'📋 מה להביא לבסיס',bring_empty:'🎉 הכל מלא! אין מה להביא.',bring_miss:n=>`חסר ${n}`,
    settings_title:'הגדרות',sec_cats:'קטגוריות',cat_ph:'קטגוריה חדשה...',add_tag:'הוסף',close:'סגור',
    sec_data:'נתונים',export_label:'ייצא רשימה',import_label:'ייבא רשימה',
    sec_danger:'אזור סכנה',reset_btn:'🔄 אפס את כל הכמויות ל-0',reset_confirm:'לאפס את כל הכמויות ל-0?',
    ep_name:'שם',ep_target:'יעד',ep_cat:"קטג'",ep_loc:'מיקום',ep_save:'שמור',ep_del:'מחק פריט',ep_no_bag:'ללא',
    del_confirm:'למחוק פריט זה?',cat_del_confirm:c=>`למחוק "${c}"? הפריטים יועברו לקטגוריה הראשונה`,
    empty_list:'הרשימה ריקה',empty_hint:'לחץ "+ הוסף פריט" כדי להתחיל',empty_filter:'אין פריטים להצגה',
    loc_none:'—',loc_bag:'🎒 תיק',loc_closet:'🗄️ ארון',
    lang_label:'EN',dir:'rtl',
  },
  en:{
    title:'Base Gear',sub_empty:'Empty list',sub_full:(f,tt)=>`${f}/${tt} full`,
    stat_items:'Items',stat_full:'Full',stat_miss:'Missing',prog_label:'List completion',
    chip_all:'All',chip_miss:'Missing',chip_full:'Full',chip_bag:'🎒 Bag',chip_closet:'🗄️ Closet',
    fab:'+ Add Item',sheet_title:'Add Item',sh_name_ph:'Item name...',sh_qty_ph:'Target',sh_add:'Add to list',sh_done:'Done',
    search_ph:'Search items...',
    bring_title:'📋 What to bring',bring_empty:'🎉 All full! Nothing to bring.',bring_miss:n=>`Need ${n}`,
    settings_title:'Settings',sec_cats:'Categories',cat_ph:'New category...',add_tag:'Add',close:'Close',
    sec_data:'Data',export_label:'Export list',import_label:'Import list',
    sec_danger:'Danger zone',reset_btn:'🔄 Reset all quantities to 0',reset_confirm:'Reset all quantities to 0?',
    ep_name:'Name',ep_target:'Target',ep_cat:'Cat',ep_loc:'Location',ep_save:'Save',ep_del:'Delete item',ep_no_bag:'None',
    del_confirm:'Delete this item?',cat_del_confirm:c=>`Delete "${c}"? Items will move to first category`,
    empty_list:'List is empty',empty_hint:'Tap "+ Add Item" to get started',empty_filter:'No items to show',
    loc_none:'—',loc_bag:'🎒 Bag',loc_closet:'🗄️ Closet',
    lang_label:'עב',dir:'ltr',
  }
};
let lang=localStorage.getItem(K_LANG)||'he';
function t(){ return STRINGS[lang]; }

function toggleLang(){
  lang=lang==='he'?'en':'he';
  localStorage.setItem(K_LANG,lang);
  applyLang(); render();
}
function applyLang(){
  const s=t();
  document.documentElement.lang=lang; document.documentElement.dir=s.dir;
  document.documentElement.style.setProperty('--fade-dir', lang==='he'?'left':'right');
  document.getElementById('langBtn').textContent=s.lang_label;
  setText('topbarTitle',s.title); setText('fabBtn',s.fab);
  setText('chipAll',s.chip_all); setText('chipMissing',s.chip_miss); setText('chipFull',s.chip_full);
  setText('chipBag',s.chip_bag); setText('chipCloset',s.chip_closet);
  setText('progLabel',s.prog_label);
  setText('statLItems',s.stat_items); setText('statLFull',s.stat_full); setText('statLMiss',s.stat_miss);
  setAttr('sName','placeholder',s.sh_name_ph); setAttr('sQty','placeholder',s.sh_qty_ph);
  setText('sheetTitle',s.sheet_title); setText('sheetAddBtn',s.sh_add); setText('sheetDoneBtn',s.sh_done);
  setAttr('searchInput','placeholder',s.search_ph);
  setText('sLoc1lbl',lang==='he'?'תיק':'Bag'); setText('sLoc2lbl',lang==='he'?'ארון':'Closet');
  setText('bringTitle',s.bring_title); setText('bringCloseBtn',s.close);
  setText('settingsTitle',s.settings_title); setText('secCatsTitle',s.sec_cats);
  setAttr('newCat','placeholder',s.cat_ph); setText('addCatBtn',s.add_tag);
  setText('secDataTitle',s.sec_data); setText('exportLabel',s.export_label); setText('importLabel',s.import_label);
  setText('secDangerTitle',s.sec_danger); setText('resetBtn',s.reset_btn);
  setText('settingsCloseBtn',s.close);
  refreshCatUI();
}
function setText(id,v){ const e=document.getElementById(id); if(e) e.textContent=v; }
function setAttr(id,a,v){ const e=document.getElementById(id); if(e) e.setAttribute(a,v); }

// ── EXPORT / IMPORT ───────────────────────────────────────────────────────────
function exportData(){
  const blob=new Blob([JSON.stringify({version:2,exported:new Date().toISOString(),items,cats},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url; a.download=`base-inventory-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
}
function importData(e){
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=async ev=>{
    try{
      const data=JSON.parse(ev.target.result);
      if(!Array.isArray(data.items)) throw new Error();
      const ok=await showConfirm(lang==='he'?'ייבא רשימה?':'Import list?',
        lang==='he'?`יוחלפו ${items.length} פריטים ב-${data.items.length} חדשים`:`Replace ${items.length} items with ${data.items.length}`,
        lang==='he'?'ייבא':'Import');
      if(!ok){e.target.value='';return;}
      items=data.items; if(Array.isArray(data.cats)) cats=data.cats;
      save(); refreshCatUI(); applyLang(); render();
      const msg=document.getElementById('importMsg');
      msg.textContent=(lang==='he'?`✓ יובאו ${items.length} פריטים`:`✓ Imported ${items.length} items`);
      msg.style.display='block'; setTimeout(()=>msg.style.display='none',3000);
    }catch{
      const msg=document.getElementById('importMsg');
      msg.style.color='var(--danger)'; msg.textContent=lang==='he'?'✗ קובץ לא תקין':'✗ Invalid file';
      msg.style.display='block'; setTimeout(()=>{msg.style.display='none';msg.style.color='var(--ok)';},3000);
    }
    e.target.value='';
  };
  reader.readAsText(file);
}

// ── INIT ──────────────────────────────────────────────────────────────────────
load(); refreshCatUI(); applyLang(); render();
