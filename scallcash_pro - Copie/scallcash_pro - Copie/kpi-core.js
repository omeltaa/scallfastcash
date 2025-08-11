// kpi-core.js — Comptage v2 (sessions), Historique filtrable, Popup détails, pont Dashboard
// Idempotent: peut être chargé plusieurs fois sans casser l’existant.
(function(){
  // ========= utils (équivalents "import re") =========
  const re = (pat, flags) => new RegExp(pat, flags);            // alias RegExp
  const EUR = v => new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(Number(v||0));
  const toISO = d => { const x = new Date(d); x.setHours(0,0,0,0); return x.toISOString().slice(0,10); };
  const throttle = (fn, ms=80) => { let t=0, id=null,lastArgs=null;
    return function(...args){ const now=Date.now(); lastArgs=args;
      if (!t || now-t>=ms){ t=now; fn.apply(this,args); }
      else { clearTimeout(id); id=setTimeout(()=>{ t=Date.now(); fn.apply(this,lastArgs); }, ms-(now-t)); }
    };
  };
  // parse "fr" money like "2 109,50 €" -> 2109.50
  function parseMoney(x){
    if (x==null) return 0;
    const s = String(x).trim().replace(re('[€\\s]','g'),'').replace(re('\\.','g'),'').replace(',','.');
    const m = s.match(re('^-?\\d+(?:\\.\\d+)?$'));
    return m ? Number(s) : 0;
  }

  // ========= Store par site + date + sessions =========
  if (!window.StoreBySite) window.StoreBySite = {};
  Object.assign(window.StoreBySite, {
    KEY:'caisseDaysBySite',
    get all(){ try { return JSON.parse(localStorage.getItem(this.KEY)||'{}'); } catch(e){ return {}; } },
    set all(v){ localStorage.setItem(this.KEY, JSON.stringify(v||{})); },
    _ensureDay(site, iso){
      const all=this.all; if(!all[site]) all[site]={}; if(!all[site][iso]) all[site][iso]={sessions:[]};
      // migration (ancienne structure {rows,vlp})
      const d=all[site][iso];
      if (!Array.isArray(d.sessions)){
        const rows = d.rows||[], vlp = Number(d.vlp||0);
        all[site][iso]={sessions:[{id:Date.now(), label:'Session 1', ts:Date.now(), rows, vlp, cashOut:0}]};
      }
      this.all = all; return this.all[site][iso];
    },
    readDay(site, iso){ return this._ensureDay(site, iso); },
    readSession(site, iso, sid){
      const day=this._ensureDay(site, iso); return (day.sessions||[]).find(s=>String(s.id)===String(sid))||null;
    },
    writeSession(site, iso, sess){
      const all=this.all; const day=this._ensureDay(site, iso); const arr=day.sessions||[];
      const i = arr.findIndex(s=>String(s.id)===String(sess.id));
      if (i>=0) arr[i] = {...arr[i], ...sess, ts:Date.now()};
      else arr.push({...sess, id: sess.id||Date.now(), ts:Date.now()});
      day.sessions = arr;
      all[site][iso]=day; this.all=all;
    },
    deleteSession(site, iso, sid){
      const all=this.all; const day=this._ensureDay(site, iso);
      day.sessions = (day.sessions||[]).filter(s=>String(s.id)!==String(sid));
      // si journée vide, on nettoie
      if (!day.sessions.length) { delete all[site][iso]; if (!Object.keys(all[site]||{}).length) delete all[site]; }
      this.all = all;
    },
    listSessions(filterSite=null, filterISO=null){
      const out=[]; const all=this.all;
      Object.keys(all).forEach(site=>{
        if (filterSite && site!==filterSite) return;
        Object.keys(all[site]).forEach(date=>{
          if (filterISO && date!==filterISO) return;
          (all[site][date].sessions||[]).forEach(s=>{
            // compute counted
            const counted=(s.rows||[]).reduce((sum,r)=> sum + Number(r.value)*Number(r.qty),0);
            const vlp=Number(s.vlp||0), cashOut=Number(s.cashOut||0);
            out.push({site, date, id:s.id, label:s.label||('Session '+s.id), rows:s.rows||[], vlp, cashOut, counted, diff: counted - vlp - cashOut, ts:s.ts||0});
          });
        });
      });
      return out.sort((a,b)=> a.date===b.date ? (b.ts-a.ts) : (a.date>b.date?-1:1));
    }
  });

  // ========= DailyCash agrégé (somme des sessions) =========
  if (!window.DailyCash) window.DailyCash = {};
  Object.assign(window.DailyCash, {
    KEY:'dailyCash',
    _all(){ try { return JSON.parse(localStorage.getItem(this.KEY)||'{}'); } catch { return {}; } },
    _save(o){ localStorage.setItem(this.KEY, JSON.stringify(o||{})); },
    // écrit un agrégat par site+date (somme des sessions)
    writeAggregate(site, iso){
      const day = window.StoreBySite.readDay(site, iso);
      const counted = (day.sessions||[]).reduce((s,x)=> s + (x.rows||[]).reduce((ss,r)=> ss + Number(r.value)*Number(r.qty),0), 0);
      const vlp     = (day.sessions||[]).reduce((s,x)=> s + Number(x.vlp||0), 0);
      const cashOut = (day.sessions||[]).reduce((s,x)=> s + Number(x.cashOut||0), 0);
      const diff    = counted - vlp - cashOut;

      const all=this._all(); if(!all[site]) all[site]={};
      all[site][iso] = { counted, vlp, cashOut, diff, ts: Date.now() };
      this._save(all);
      try { window.dispatchEvent(new CustomEvent('kpi:refresh')); } catch(e){}
    },
    byDate(iso){
      const all=this._all(), out=[];
      Object.keys(all).forEach(site=>{ if(all[site][iso]) out.push({site, ...all[site][iso]}); });
      return out;
    },
    today(){ return this.byDate(toISO(new Date())); }
  });

  // ========= Rendu KPI caisse (Dashboard) =========
  function renderKpiCaisse(){
    const todayISO = toISO(new Date());
    const rows = window.DailyCash.byDate(todayISO);
    const sumCounted = rows.reduce((s,x)=> s + (x.counted||0), 0);
    const sumVlp     = rows.reduce((s,x)=> s + (x.vlp||0), 0);
    const sumCashOut = rows.reduce((s,x)=> s + (x.cashOut||0), 0);
    const sumDiff    = sumCounted - sumVlp - sumCashOut;

    const enc = document.getElementById('kpiEncaissementsJour');
    const dif = document.getElementById('kpiDiffJour');
    const body= document.getElementById('kpiSitesBody');
    if (enc) enc.textContent = EUR(sumCounted);
    if (dif){
      dif.textContent = `Diff: ${EUR(sumDiff)}`;
      dif.style.color = sumDiff < 0 ? 'var(--color-danger)' : 'var(--color-success)';
    }
    if (body){
      body.innerHTML = '';
      if (!rows.length){ body.innerHTML = `<tr><td colspan="4" class="muted">Aucun comptage</td></tr>`; return; }
      rows.forEach(r=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${r.site}</td>
          <td class="right">${EUR(r.counted||0)}</td>
          <td class="right">${EUR(r.vlp||0)}</td>
          <td class="right" style="color:${(r.diff||0)<0?'var(--color-danger)':'var(--color-success)'}">${EUR(r.diff||0)}</td>`;
        body.appendChild(tr);
      });
    }
  }
  window.renderKpiCaisse = renderKpiCaisse;

  // ========= Popup détail session =========
  function showSessionModal(s){
    let modal = document.getElementById('sessionModal');
    if (!modal){
      modal = document.createElement('div');
      modal.id='sessionModal';
      modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:9999';
      modal.innerHTML = `
        <div style="background:#fff;border-radius:12px;max-width:640px;width:96%;box-shadow:var(--box-shadow);padding:1rem">
          <h3 style="margin:0 0 .5rem 0;color:#6b7280">Détail du comptage</h3>
          <div id="modalContent" style="max-height:60vh;overflow:auto"></div>
          <div style="display:flex;gap:.5rem;justify-content:flex-end;margin-top:.75rem">
            <button id="modalPrint" class="btn secondary">Imprimer</button>
            <button id="modalClose" class="btn danger">Fermer</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', e=>{ if(e.target.id==='modalClose') modal.remove(); });
      modal.querySelector('#modalPrint').addEventListener('click', ()=>window.print());
      modal.addEventListener('click', e=>{ if(e.target===modal) modal.remove(); });
    }
    const box = modal.querySelector('#modalContent');
    const lines = (s.rows||[]).map(r=>`<tr><td>${r.value>=1? r.value+' €' : String(r.value).replace('.',',')+' €'}</td><td class="right">${r.qty}</td><td class="right">${EUR(Number(r.value)*Number(r.qty))}</td></tr>`).join('');
    box.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem">
        <div><strong>Site</strong><div>${s.site}</div></div>
        <div><strong>Date</strong><div>${s.date}</div></div>
        <div><strong>Session</strong><div>${s.label||('#'+s.id)}</div></div>
        <div><strong>Horodatage</strong><div>${new Date(s.ts||Date.now()).toLocaleString('fr-FR')}</div></div>
      </div>
      <div class="expenses-table-container" style="margin-top:.75rem">
        <table class="expenses-table">
          <thead><tr><th>Valeur</th><th class="right">Qté</th><th class="right">Total</th></tr></thead>
          <tbody>${lines||'<tr><td colspan="3" class="muted">Aucune ligne</td></tr>'}</tbody>
          <tfoot>
            <tr><td></td><td class="right"><strong>Compté</strong></td><td class="right"><strong>${EUR(s.counted||0)}</strong></td></tr>
            <tr><td></td><td class="right">VLP</td><td class="right">${EUR(s.vlp||0)}</td></tr>
            <tr><td></td><td class="right">Retrait espèces</td><td class="right">${EUR(s.cashOut||0)}</td></tr>
            <tr><td></td><td class="right"><strong>Différence</strong></td>
                <td class="right" style="color:${(s.diff||0)<0?'var(--color-danger)':'var(--color-success)'}"><strong>${EUR(s.diff||0)}</strong></td></tr>
          </tfoot>
        </table>
      </div>`;
    modal.style.display='flex';
  }

  // ========= Comptage (v2) =========
  function attachComptageV2(){
    const DENOMS=[500,200,100,50,20,10,5,2,1,0.5,0.2,0.1,0.05];
    const tbody = document.getElementById('tbody');
    if (!tbody) return;

    const subtotalEl = document.getElementById('subtotal');
    const sumEl = document.getElementById('sumCounted');
    const diffEl = document.getElementById('diffVal');
    const vlpInput = document.getElementById('vlp');
    const dateInput = document.getElementById('caisseDate');
    const siteSelect= document.getElementById('siteSelect');
    const chips = document.getElementById('chips');
    const histBody = document.getElementById('histBody');
    const searchDate = document.getElementById('searchDate');

    // === Tabs (fix: accès Historique) ===
    document.querySelectorAll('.tab').forEach(b=>{
      b.addEventListener('click', ()=>{
        document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
        b.classList.add('active');
        document.getElementById('tab-comptage').style.display = b.dataset.tab==='comptage'?'grid':'none';
        document.getElementById('tab-historique').style.display = b.dataset.tab==='historique'?'block':'none';
      });
    });

    // === UI: Session + Retrait espèces + filtre site historique ===
    // Session controls
    const rowTop = document.querySelector('.row.gap');
    const sessWrap = document.createElement('div'); sessWrap.className='row gap';
    sessWrap.innerHTML = `
      <label for="sessionLabel"><strong>Session :</strong></label>
      <input id="sessionLabel" class="input" placeholder="Matin / Soir / Libellé…" style="max-width:220px">
      <select id="sessionSelect" class="input" style="max-width:220px"><option value="">(nouvelle session)</option></select>
      <button id="btnNewSession" class="btn">+ Nouvelle session</button>`;
    rowTop.parentNode.insertBefore(sessWrap, rowTop.nextSibling);

    // Retrait espèces card
    const cards3 = document.querySelector('.cards-3');
    const cashCard = document.createElement('div'); cashCard.className='card';
    cashCard.innerHTML = `<h3>Retrait espèces (€)</h3><input type="number" id="cashOut" step="0.01" placeholder="0" class="input" />`;
    cards3.appendChild(cashCard);

    // Historique: filtre site (injection)
    const histToolbar = document.querySelector('#tab-historique .row.gap');
    const siteFilterLabel = document.createElement('label'); siteFilterLabel.innerHTML='<strong>Site :</strong>';
    const siteFilter = document.createElement('select'); siteFilter.id='filterSite'; siteFilter.className='input';
    histToolbar.insertBefore(siteFilterLabel, histToolbar.children[2]);
    histToolbar.insertBefore(siteFilter, siteFilterLabel.nextSibling);

    // === State ===
    let currentISO = toISO(new Date());
    let currentSite = (siteSelect && siteSelect.value) || 'vitry';
    let currentSessionId = null;

    if (dateInput) dateInput.value = currentISO;

    // === Helpers ===
    function options(sel){ return DENOMS.map(v=>`<option value="${v}" ${Number(sel)===Number(v)?'selected':''}>${v>=1?v+' €':String(v).replace('.',',')+' €'}</option>`).join(''); }
    function addRow(val=50, qty=0){
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><select class="denom-select">${options(val)}</select></td>
        <td><input type="number" class="qty-input" min="0" step="1" value="${qty}" style="width:140px"></td>
        <td class="right comptage-line-total">0,00 €</td>
        <td class="right"><button class="btn link btn-del">Suppr</button></td>`;
      tbody.appendChild(tr);
    }
    const recalc = throttle(()=>{
      let subtotal=0;
      [...tbody.querySelectorAll('tr')].forEach(tr=>{
        const v = Number(tr.querySelector('.denom-select').value||0);
        const q = Number(tr.querySelector('.qty-input').value||0);
        const line = v*q; subtotal += line;
        tr.querySelector('.comptage-line-total').textContent = EUR(line);
      });
      subtotalEl.textContent = EUR(subtotal);
      const vlp = parseMoney(vlpInput.value||0);
      const cash = parseMoney(document.getElementById('cashOut').value||0);
      const diff = subtotal - vlp - cash;
      sumEl.textContent = EUR(subtotal);
      diffEl.textContent = EUR(diff);
      diffEl.style.color = diff<0 ? 'var(--color-danger)' : 'var(--color-success)';
    }, 80);

    function refreshSessionSelect(){
      const day = window.StoreBySite.readDay(currentSite, currentISO);
      const sel = document.getElementById('sessionSelect');
      sel.innerHTML = `<option value="">(nouvelle session)</option>` + (day.sessions||[])
        .sort((a,b)=> (a.ts||0)-(b.ts||0))
        .map(s=>`<option value="${s.id}">${s.label||('Session '+s.id)}</option>`).join('');
      if (currentSessionId) sel.value = String(currentSessionId);
    }

    function loadSession(site, iso, sid){
      const s = sid ? window.StoreBySite.readSession(site, iso, sid) : null;
      tbody.innerHTML='';
      if (s){
        (s.rows||[]).forEach(r=> addRow(Number(r.value), Number(r.qty)));
        document.getElementById('sessionLabel').value = s.label||'';
        vlpInput.value = s.vlp||0;
        document.getElementById('cashOut').value = s.cashOut||0;
      } else {
        document.getElementById('sessionLabel').value = '';
        vlpInput.value = 0;
        document.getElementById('cashOut').value = 0;
      }
      recalc();
    }

    function saveSession(){
      const rows = [...tbody.querySelectorAll('tr')].map(tr=>({
        value:Number(tr.querySelector('.denom-select').value||0),
        qty:Number(tr.querySelector('.qty-input').value||0)
      }));
      const label = document.getElementById('sessionLabel').value.trim() || null;
      const vlp = parseMoney(vlpInput.value||0);
      const cashOut = parseMoney(document.getElementById('cashOut').value||0);
      const counted = rows.reduce((s,r)=> s + r.value*r.qty, 0);
      const payload = { id: currentSessionId || Date.now(), label, rows, vlp, cashOut };
      window.StoreBySite.writeSession(currentSite, currentISO, payload);
      // agrégat vers Dashboard
      window.DailyCash.writeAggregate(currentSite, currentISO);
      // UI/Hist
      populateHistory(getFilterISO(), getFilterSite());
      refreshSessionSelect();
      alert('Comptage enregistré.');
    }

    function clearDay(){
      // supprime seulement la session active si elle existe, sinon nettoie la journée
      if (currentSessionId){
        window.StoreBySite.deleteSession(currentSite, currentISO, currentSessionId);
        currentSessionId = null;
      } else {
        // supprime toutes les sessions de la journée pour le site
        const day = window.StoreBySite.readDay(currentSite, currentISO);
        (day.sessions||[]).forEach(s=> window.StoreBySite.deleteSession(currentSite, currentISO, s.id));
      }
      window.DailyCash.writeAggregate(currentSite, currentISO);
      populateHistory(getFilterISO(), getFilterSite());
      loadSession(currentSite, currentISO, currentSessionId);
      refreshSessionSelect();
    }

    function getFilterISO(){ return searchDate && searchDate.value ? toISO(searchDate.value) : null; }
    function getFilterSite(){ const s = document.getElementById('filterSite'); return s && s.value ? s.value : null; }

    function populateHistory(filterISO=null, filterSite=null){
      const rows = window.StoreBySite.listSessions(filterSite, filterISO);
      // remplir options site
      const selSite = document.getElementById('filterSite');
      const sites = Array.from(new Set(Object.keys(window.StoreBySite.all)));
      selSite.innerHTML = `<option value="">Tous</option>` + sites.map(x=>`<option value="${x}">${x}</option>`).join('');
      const tb = histBody; tb.innerHTML='';
      if (!rows.length){ tb.innerHTML = `<tr><td colspan="6" class="muted">Aucun comptage.</td></tr>`; return; }
      rows.forEach(x=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${x.date}</td>
          <td>${x.site} — ${x.label||('#'+x.id)}</td>
          <td class="right">${EUR(x.counted)}</td>
          <td class="right">${EUR(x.vlp)}</td>
          <td class="right" style="color:${x.diff<0?'var(--color-danger)':'var(--color-success)'}">${EUR(x.diff)}</td>
          <td>
            <button class="btn secondary btn-details" data-date="${x.date}" data-site="${x.site}" data-id="${x.id}">Détails</button>
            <button class="btn btn-load" data-date="${x.date}" data-site="${x.site}" data-id="${x.id}">Charger</button>
            <button class="btn danger btn-del-h" data-date="${x.date}" data-site="${x.site}" data-id="${x.id}">Supprimer</button>
          </td>`;
        tb.appendChild(tr);
      });
    }

    // === Events ===
    document.getElementById('addLine')?.addEventListener('click', ()=>{ addRow(50,0); recalc(); });
    document.getElementById('save')?.addEventListener('click', saveSession);
    document.getElementById('clear')?.addEventListener('click', clearDay);
    document.getElementById('print')?.addEventListener('click', ()=>window.print());
    document.getElementById('btnToday')?.addEventListener('click', ()=>{ currentISO=toISO(new Date()); dateInput.value=currentISO; currentSessionId=null; loadSession(currentSite, currentISO, null); refreshSessionSelect(); });

    dateInput?.addEventListener('change', ()=>{ currentISO = toISO(dateInput.value); currentSessionId=null; loadSession(currentSite, currentISO, null); refreshSessionSelect(); });
    siteSelect?.addEventListener('change', ()=>{ currentSite = siteSelect.value; currentSessionId=null; loadSession(currentSite, currentISO, null); refreshSessionSelect(); });

    document.getElementById('btnNewSession')?.addEventListener('click', ()=>{ currentSessionId=null; document.getElementById('sessionLabel').value=''; tbody.innerHTML=''; vlpInput.value=0; document.getElementById('cashOut').value=0; recalc(); refreshSessionSelect(); });
    document.getElementById('sessionSelect')?.addEventListener('change', e=>{ currentSessionId = e.target.value||null; loadSession(currentSite, currentISO, currentSessionId); });

    tbody.addEventListener('input', e=>{ if(e.target.matches('.qty-input')) recalc(); });
    tbody.addEventListener('change', e=>{ if(e.target.matches('.denom-select')) recalc(); });
    tbody.addEventListener('click',  e=>{ if(e.target.closest('.btn-del')){ e.target.closest('tr').remove(); recalc(); } });

    const chipsEl = document.getElementById('chips');
    chipsEl && (chipsEl.innerHTML = DENOMS.map(v=>`<button class="chip" data-v="${v}">${v>=1?v+' €':String(v).replace('.',',')+' €'}</button>`).join(''));
    chipsEl?.addEventListener('click', e=>{ const b=e.target.closest('.chip'); if(!b) return; addRow(Number(b.dataset.v),0); recalc(); });

    document.getElementById('backup')?.addEventListener('click', ()=>{
      const blob=new Blob([JSON.stringify(window.StoreBySite.all,null,2)],{type:'application/json'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='comptages.json'; a.click(); URL.revokeObjectURL(a.href);
    });
    document.getElementById('restore')?.addEventListener('click', async ()=>{
      const f=document.getElementById('restoreFile'); if(!f.files||!f.files[0]) return alert('Sélectionne un fichier .json');
      try{ const parsed=JSON.parse(await f.files[0].text()); window.StoreBySite.all = parsed||{}; populateHistory(getFilterISO(), getFilterSite()); loadSession(currentSite, currentISO, currentSessionId); alert('Restauration terminée.'); }
      catch(e){ alert('Fichier invalide.'); }
    });

    document.getElementById('btnSearch')?.addEventListener('click', ()=>{ populateHistory(getFilterISO(), getFilterSite()); });
    document.getElementById('btnReset')?.addEventListener('click', ()=>{ searchDate.value=''; document.getElementById('filterSite').value=''; populateHistory(null, null); });
    document.getElementById('tab-historique')?.addEventListener('click', e=>{
      const d=e.target.closest('.btn-del-h'), o=e.target.closest('.btn-load'), info=e.target.closest('.btn-details');
      if (info){
        const iso=info.dataset.date, site=info.dataset.site, sid=info.dataset.id;
        const s = window.StoreBySite.readSession(site, iso, sid);
        if (s){ const calcCounted=(s.rows||[]).reduce((ss,r)=> ss + Number(r.value)*Number(r.qty),0);
          showSessionModal({site, date:iso, id:s.id, label:s.label, rows:s.rows, vlp:Number(s.vlp||0), cashOut:Number(s.cashOut||0), counted:calcCounted, diff: calcCounted - Number(s.vlp||0) - Number(s.cashOut||0), ts:s.ts});
        }
      }
      if (o){
        currentISO=o.dataset.date; currentSite=o.dataset.site; currentSessionId=o.dataset.id;
        // va sur l’onglet comptage et charge
        document.querySelector('.tab[data-tab="comptage"]')?.click();
        dateInput.value=currentISO; if (siteSelect) siteSelect.value=currentSite;
        refreshSessionSelect(); loadSession(currentSite, currentISO, currentSessionId);
      }
      if (d){
        window.StoreBySite.deleteSession(d.dataset.site, d.dataset.date, d.dataset.id);
        window.DailyCash.writeAggregate(d.dataset.site, d.dataset.date);
        populateHistory(getFilterISO(), getFilterSite());
      }
    });

    // init
    loadSession(currentSite, currentISO, currentSessionId);
    refreshSessionSelect();
    populateHistory();
  }
  window.attachComptageListeners = window.attachComptageListeners || attachComptageV2;

  // ========= Boot =========
  document.addEventListener('DOMContentLoaded', ()=>{
    const page = document.body.dataset.page || 'dashboard';
    if (page==='comptage') attachComptageV2();
    if (page==='dashboard') {
      try {
        if (typeof window.renderDashboard === 'function'){
          const expenses = (window.DemoData && DemoData.load)? DemoData.load() : [];
          const incomes  = (window.IncomesData && IncomesData.load)? IncomesData.load() : [];
          renderDashboard(expenses, incomes);
        }
      } catch(e){}
      renderKpiCaisse();
      window.addEventListener('kpi:refresh', renderKpiCaisse);
    }
  });
})();