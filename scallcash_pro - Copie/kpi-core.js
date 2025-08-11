// kpi-core.js — pont propre Comptage <-> Dashboard + correctifs
(function(){
  const EUR = v => new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(Number(v||0));
  const toISO = d => { const x = new Date(d); x.setHours(0,0,0,0); return x.toISOString().slice(0,10); };
  if (!window.StoreBySite) {
    window.StoreBySite = {
      KEY:'caisseDaysBySite',
      get all(){ try { return JSON.parse(localStorage.getItem(this.KEY)||'{}'); } catch(e){ return {}; } },
      set all(v){ localStorage.setItem(this.KEY, JSON.stringify(v||{})); },
      read(site, dateISO){ const all=this.all; return (all[site]&&all[site][dateISO])? all[site][dateISO]:{rows:[],vlp:0}; },
      write(site, dateISO, data){ const all=this.all; if(!all[site]) all[site]={}; all[site][dateISO]=data; this.all=all; },
      clear(site, dateISO){ const all=this.all; if(all[site]){ delete all[site][dateISO]; if(!Object.keys(all[site]).length) delete all[site]; } this.all=all; },
      list(){ const out=[]; const all=this.all; Object.keys(all).forEach(s=>Object.keys(all[s]).forEach(d=>{ const v=all[s][d]||{}; out.push({site:s,date:d,rows:v.rows||[],vlp:v.vlp||0}); })); return out.sort((a,b)=>a.date>b.date?-1:1); }
    };
  }
  if (!window.DailyCash) window.DailyCash = {};
  Object.assign(window.DailyCash, {
    KEY:'dailyCash',
    _all(){ try { return JSON.parse(localStorage.getItem(this.KEY)||'{}'); } catch { return {}; } },
    _save(obj){ localStorage.setItem(this.KEY, JSON.stringify(obj||{})); },
    write(site, dateISO, payload){
      const all = this._all();
      if (!all[site]) all[site] = {};
      all[site][dateISO] = { ...(payload||{}), ts: Date.now() };
      this._save(all);
      try { window.dispatchEvent(new CustomEvent('kpi:refresh')); } catch(e){}
    },
    byDate(dateISO){
      const all = this._all(), out=[];
      Object.keys(all).forEach(site=>{
        if (all[site][dateISO]) out.push({ site, ...(all[site][dateISO]) });
      });
      return out;
    },
    today(){
      const d = new Date(); d.setHours(0,0,0,0);
      return this.byDate(d.toISOString().slice(0,10));
    }
  });
  function renderKpiCaisse(){
    const todayISO = toISO(new Date());
    let rows = window.DailyCash.byDate(todayISO);
    let usedDate = todayISO;
    if (!rows.length){
      const list = window.StoreBySite.list();
      if (list.length){
        usedDate = list[0].date;
        const map = {};
        list.filter(x=>x.date===usedDate).forEach(x=>{
          const counted = (x.rows||[]).reduce((s,r)=> s + Number(r.value)*Number(r.qty), 0);
          const vlp = Number(x.vlp||0);
          map[x.site] = { site:x.site, counted, vlp, diff: counted - vlp };
        });
        rows = Object.values(map);
      }
    }
    const sumCounted = rows.reduce((s,x)=> s + (x.counted||0), 0);
    const sumVlp     = rows.reduce((s,x)=> s + (x.vlp||0), 0);
    const sumDiff    = sumCounted - sumVlp;
    const enc = document.getElementById('kpiEncaissementsJour');
    const dif = document.getElementById('kpiDiffJour');
    const body = document.getElementById('kpiSitesBody');
    if (enc) enc.textContent = EUR(sumCounted);
    if (dif){
      dif.textContent = `Diff: ${EUR(sumDiff)}${usedDate!==todayISO ? ' (sur '+usedDate+')' : ''}`;
      dif.style.color = sumDiff < 0 ? 'var(--color-danger)' : 'var(--color-success)';
    }
    if (body){
      body.innerHTML = '';
      if (!rows.length){ body.innerHTML = `<tr><td colspan="4" class="muted">Aucun comptage</td></tr>`; }
      else {
        rows.forEach(r=>{
          const tr = document.createElement('tr');
          tr.innerHTML = `<td>${r.site}</td>\n            <td class="right">${EUR(r.counted||0)}</td>\n            <td class="right">${EUR(r.vlp||0)}</td>\n            <td class="right" style="color:${(r.diff||0)<0?'var(--color-danger)':'var(--color-success)'}">${EUR(r.diff||0)}</td>`;
          body.appendChild(tr);
        });
      }
    }
  }
  window.renderKpiCaisse = renderKpiCaisse;
  function attachComptageV2(){
    const DENOMS=[500,200,100,50,20,10,5,2,1,0.5,0.2,0.1,0.05];
    const tbody = document.getElementById('tbody');
    const subtotalEl = document.getElementById('subtotal');
    const sumEl = document.getElementById('sumCounted');
    const diffEl = document.getElementById('diffVal');
    const vlpInput = document.getElementById('vlp');
    const dateInput = document.getElementById('caisseDate');
    const siteSelect= document.getElementById('siteSelect');
    const chips = document.getElementById('chips');
    const histBody = document.getElementById('histBody');
    const searchDate = document.getElementById('searchDate');
    if (!tbody) return;
    function optList(sel){ return DENOMS.map(v=>`<option value="${v}" ${Number(sel)===Number(v)?'selected':''}>${v>=1?v+' €':String(v).replace('.',',')+' €'}</option>`).join(''); }
    function addRow(val=50, qty=0){
      const tr = document.createElement('tr');
      tr.innerHTML = `\n        <td><select class="denom-select">${optList(val)}</select></td>\n        <td><input type="number" class="qty-input" min="0" step="1" value="${qty}" style="width:140px"></td>\n        <td class="right comptage-line-total">0,00 €</td>\n        <td class="right"><button class="btn link btn-del">Suppr</button></td>`;
      tbody.appendChild(tr);
    }
    function recalc(){
      let subtotal=0;
      [...tbody.querySelectorAll('tr')].forEach(tr=>{
        const v = Number(tr.querySelector('.denom-select').value||0);
        const q = Number(tr.querySelector('.qty-input').value||0);
        const line = v*q; subtotal += line;
        tr.querySelector('.comptage-line-total').textContent = EUR(line);
      });
      subtotalEl.textContent = EUR(subtotal);
      const vlp = Number(vlpInput.value||0);
      const diff = subtotal - vlp;
      sumEl.textContent = EUR(subtotal);
      diffEl.textContent = EUR(diff);
      diffEl.style.color = diff<0 ? 'var(--color-danger)' : 'var(--color-success)';
    }
    function loadDay(site, iso){
      const d = window.StoreBySite.read(site, iso);
      tbody.innerHTML='';
      (d.rows||[]).forEach(r=> addRow(Number(r.value), Number(r.qty)));
      vlpInput.value = Number(d.vlp||0);
      recalc();
    }
    let currentISO = toISO(new Date());
    let currentSite = (siteSelect && siteSelect.value) || 'Vitry';
    if (dateInput) dateInput.value = currentISO;
    function saveDay(){
      const rows = [...tbody.querySelectorAll('tr')].map(tr=>({
        value:Number(tr.querySelector('.denom-select').value||0),
        qty:Number(tr.querySelector('.qty-input').value||0)
      }));
      const vlp = Number(vlpInput.value||0);
      window.StoreBySite.write(currentSite, currentISO, { rows, vlp });
      const counted = rows.reduce((s,r)=> s + r.value*r.qty, 0);
      window.DailyCash.write(currentSite, currentISO, { counted, vlp, diff: counted - vlp });
      populateHistory();
      recalc();
      alert('Comptage enregistré.');
    }
    function clearDay(){
      window.StoreBySite.clear(currentSite, currentISO);
      populateHistory();
      loadDay(currentSite, currentISO);
    }
    function populateHistory(filterISO=null){
      const list = window.StoreBySite.list();
      const rows = filterISO ? list.filter(x=>x.date===filterISO) : list;
      histBody.innerHTML='';
      if (!rows.length){ histBody.innerHTML = `<tr><td colspan="6" class="muted">Aucun comptage.</td></tr>`; return; }
      rows.forEach(x=>{
        const total = (x.rows||[]).reduce((s,r)=> s + Number(r.value)*Number(r.qty), 0);
        const diff  = total - Number(x.vlp||0);
        const tr = document.createElement('tr');
        tr.innerHTML = `\n          <td>${x.date}</td>\n          <td>${x.site}</td>\n          <td class="right">${EUR(total)}</td>\n          <td class="right">${EUR(x.vlp||0)}</td>\n          <td class="right" style="color:${diff<0?'var(--color-danger)':'var(--color-success)'}">${EUR(diff)}</td>\n          <td>\n            <button class="btn secondary btn-load" data-date="${x.date}" data-site="${x.site}">Ouvrir</button>\n            <button class="btn danger btn-del-h" data-date="${x.date}" data-site="${x.site}">Supprimer</button>\n          </td>`;
        histBody.appendChild(tr);
      });
    }
    document.getElementById('addLine')?.addEventListener('click', ()=>{ addRow(50,0); recalc(); });
    document.getElementById('save')?.addEventListener('click', saveDay);
    document.getElementById('clear')?.addEventListener('click', clearDay);
    document.getElementById('print')?.addEventListener('click', ()=>window.print());
    document.getElementById('btnToday')?.addEventListener('click', ()=>{ currentISO=toISO(new Date()); dateInput.value=currentISO; loadDay(currentSite, currentISO); });
    dateInput?.addEventListener('change', ()=>{ currentISO = toISO(dateInput.value); loadDay(currentSite, currentISO); });
    siteSelect?.addEventListener('change', ()=>{ currentSite = siteSelect.value; loadDay(currentSite, currentISO); });
    tbody.addEventListener('input', e=>{ if(e.target.matches('.qty-input')) recalc(); });
    tbody.addEventListener('change', e=>{ if(e.target.matches('.denom-select')) recalc(); });
    tbody.addEventListener('click',  e=>{ if(e.target.closest('.btn-del')){ e.target.closest('tr').remove(); recalc(); } });
    document.getElementById('backup')?.addEventListener('click', ()=>{
      const blob=new Blob([JSON.stringify(window.StoreBySite.all,null,2)],{type:'application/json'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='comptages.json'; a.click(); URL.revokeObjectURL(a.href);
    });
    document.getElementById('restore')?.addEventListener('click', async ()=>{
      const f=document.getElementById('restoreFile'); if(!f.files||!f.files[0]) return alert('Sélectionne un fichier .json');
      try{ const parsed=JSON.parse(await f.files[0].text()); window.StoreBySite.all = parsed||{}; populateHistory(); loadDay(currentSite, currentISO); alert('Restauration terminée.'); }
      catch(e){ alert('Fichier invalide.'); }
    });
    document.getElementById('btnSearch')?.addEventListener('click', ()=>{ const iso=searchDate.value? toISO(searchDate.value): null; populateHistory(iso); });
    document.getElementById('btnReset')?.addEventListener('click', ()=>{ searchDate.value=''; populateHistory(null); });
    histBody.addEventListener('click', e=>{
      const open=e.target.closest('.btn-load'); const del=e.target.closest('.btn-del-h');
      if (open){
        currentISO=open.dataset.date; currentSite=open.dataset.site;
        document.querySelector('.tab[data-tab="comptage"]')?.click();
        dateInput.value=currentISO; if (siteSelect) siteSelect.value=currentSite;
        loadDay(currentSite, currentISO);
      }
      if (del){
        window.StoreBySite.clear(del.dataset.site, del.dataset.date);
        populateHistory(searchDate.value? toISO(searchDate.value) : null);
        if (del.dataset.date===currentISO && del.dataset.site===currentSite) loadDay(currentSite, currentISO);
      }
    });
    chips && (chips.innerHTML = DENOMS.map(v=>`<button class="chip" data-v="${v}">${v>=1?v+' €':String(v).replace('.',',')+' €'}</button>`).join(''));
    chips?.addEventListener('click', e=>{ const b=e.target.closest('.chip'); if(!b) return; addRow(Number(b.dataset.v),0); recalc(); });
    loadDay(currentSite, currentISO);
    populateHistory();
  }
  window.attachComptageListeners = window.attachComptageListeners || attachComptageV2;
  function safeRenderDashboard(){
    try {
      if (typeof window.renderDashboard === 'function'){
        const expenses = (window.DemoData && DemoData.load)? DemoData.load() : [];
        const incomes  = (window.IncomesData && IncomesData.load)? IncomesData.load() : [];
        renderDashboard(expenses, incomes);
      }
    } catch(e){}
    renderKpiCaisse();
  }
  document.addEventListener('DOMContentLoaded', ()=>{
    const page = document.body.dataset.page || 'dashboard';
    if (page==='comptage') attachComptageV2();
    if (page==='dashboard') {
      safeRenderDashboard();
      window.addEventListener('kpi:refresh', renderKpiCaisse);
    }
  });
})();