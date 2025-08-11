
// ===== Store par site + date =====
const StoreBySite = {
  KEY: 'caisseDaysBySite',
  get all(){ try { return JSON.parse(localStorage.getItem(this.KEY)||'{}'); } catch(e){ return {}; } },
  set all(v){ localStorage.setItem(this.KEY, JSON.stringify(v||{})); },
  read(site, dateISO){ const all=this.all; return (all[site] && all[site][dateISO]) ? all[site][dateISO] : {rows:[], vlp:0}; },
  write(site, dateISO, data){ const all=this.all; if(!all[site]) all[site]={}; all[site][dateISO]=data; this.all=all; },
  clear(site, dateISO){ const all=this.all; if(all[site]){ delete all[site][dateISO]; if(Object.keys(all[site]).length===0) delete all[site]; } this.all=all; },
  list(){ const out=[]; const all=this.all; Object.keys(all).forEach(site=>{ Object.keys(all[site]).forEach(date=>{ const d=all[site][date]; out.push({site,date,rows:d.rows||[],vlp:d.vlp||0}); }); }); return out.sort((a,b)=> a.date>b.date?-1:1); }
};
// Migration : ancien Store 'caisseDays' (sans site) -> site 'Default'
(function migrateOldComptage(){
  try{
    const raw = localStorage.getItem('caisseDays');
    if(!raw) return;
    const old = JSON.parse(raw||'{}');
    if(Object.keys(StoreBySite.all||{}).length>0) return; // ne pas écraser si déjà migré
    const all={}; Object.keys(old).forEach(date=>{ if(!all.Default) all.Default={}; all.Default[date]=old[date]; });
    StoreBySite.all = all;
  }catch(e){}
})();

// ===== DailyCash Store (site + date) =====
window.DailyCash = window.DailyCash || {
  KEY: 'dailyCash',
  _all() { try { return JSON.parse(localStorage.getItem(this.KEY) || '{}'); } catch { return {}; } },
  _save(obj) { localStorage.setItem(this.KEY, JSON.stringify(obj || {})); },
  write(site, dateISO, payload) {
    const all = this._all();
    if (!all[site]) all[site] = {};
    // merge payload safely and attach a timestamp
    all[site][dateISO] = { ...(payload || {}), ts: Date.now() };
    this._save(all);
    // notify listeners (dashboard listens for kpi refresh)
    try { window.dispatchEvent(new CustomEvent('kpi:refresh')); } catch(e) {}
  },
  byDate(dateISO) {
    const all = this._all();
    const out = [];
    Object.keys(all).forEach(site => {
      if (all[site] && all[site][dateISO]) {
        const record = all[site][dateISO] || {};
        out.push({ site, ...record });
      }
    });
    return out; // [{site, counted, vlp, diff, ts}]
  },
  today() {
    const d = new Date(); d.setHours(0,0,0,0);
    return this.byDate(d.toISOString().slice(0,10));
  }
};

// Main script for SCALLCASH demo

// Initialise the appropriate page when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page || 'dashboard';
  // Load base datasets up front. Each module handles its own persistence.
  const expenses = DemoData.load();
  const incomes = IncomesData ? IncomesData.load() : [];
  const invoices = InvoicesData ? InvoicesData.load() : [];
  const transactions = TransactionsData ? TransactionsData.load() : [];

  switch (page) {
    case 'dashboard':
      // Render base dashboard (KPIs from DailyCash are handled by kpi-core)
      renderDashboard(expenses, incomes);
      break;
    case 'expenses':
      renderExpenses(expenses);
      break;
    case 'comptage':
      // Attach comptage listeners
      // Use kpi-core to attach comptage listeners if available
      if (window.attachComptageListeners) window.attachComptageListeners();
      break;
    case 'incomes':
      renderIncomes(incomes);
      break;
    case 'invoices':
      renderInvoices(invoices);
      break;
    case 'transactions':
      renderTransactions(transactions);
      break;
    case 'tva':
      renderTVA(incomes, expenses);
      break;
    default:
      break;
  }
});

// ---------------- Dashboard -----------------
function renderDashboard(expenses, incomes = []) {
  // Compute metrics for dashboard summary
  const bankBalance = 15342.55; // static for demo
  const today = new Date();
  // Encaissements du jour: sum of incomes with today's date and status ENCAISSÉ
  const encaissementsDuJour = incomes
    .filter(i => i.status === 'ENCAISSÉ' && sameDate(new Date(i.date + 'T00:00:00'), today))
    .reduce((sum, i) => sum + i.amountTTC, 0);
  // Dépenses du jour: sum of expenses with today's invoiceDate
  const depensesDuJour = expenses
    .filter(e => sameDate(new Date(e.invoiceDate + 'T00:00:00'), today))
    .reduce((sum, e) => sum + e.amountTTC, 0);
  // TVA collectée/déductible: for demo we show net difference: TVA due (collected - deductible)
  const tvaCollectee = incomes
    .filter(i => i.status !== 'ANNULÉ')
    .reduce((sum, i) => sum + i.amountTVA, 0);
  const tvaDeductible = expenses
    .filter(e => e.status !== 'PAYÉ')
    .reduce((sum, e) => sum + e.amountTVA, 0);
  const tvaNet = tvaCollectee - tvaDeductible;
  // Cash runway based on bank balance and average daily net outflow over next 30 days
  const outflow30 = totalOutflow30(expenses);
  const inflow30 = totalInflow30(incomes);
  const net30 = outflow30 - inflow30;
  const cashRunway = net30 > 0 ? Math.round(bankBalance / (net30 / 30)) : 999;

  // Render metrics
  setValue('#bankBalance', bankBalance);
  setValue('#encaissementsJour', encaissementsDuJour);
  setValue('#depensesJour', depensesDuJour);
  document.getElementById('cashRunway').textContent = cashRunway + ' j';
  setValue('#tvaCollecte', tvaNet);

  // Render simple line chart representing cash flows over the last 7 days
  drawLineChart('cashFlowChart', buildCashFlowSeriesDashboard(expenses, incomes));
  // Render alerts (demo static)
  const alerts = [
    '2 factures clients en retard',
    'Clôture caisse Vitry manquante',
    'Dépense inhabituelle détectée',
  ];
  const alertsList = document.getElementById('alertsList');
  if (alertsList) {
    alertsList.innerHTML = '';
    alerts.forEach(text => {
      const li = document.createElement('li');
      li.textContent = text;
      alertsList.appendChild(li);
    });
  }
}

function totalOutflow30(expenses) {
  const today = new Date();
  const end = new Date();
  end.setDate(today.getDate() + 30);
  return expenses
    .filter(e => new Date(e.dueDate) <= end)
    .reduce((sum, e) => sum + e.amountTTC, 0);
}

// Compute total inflow for next 30 days from incomes
function totalInflow30(incomes) {
  const today = new Date();
  const end = new Date();
  end.setDate(today.getDate() + 30);
  return incomes
    .filter(
      i => i.status !== 'ANNULÉ' && new Date(i.expectedDate + 'T00:00:00') <= end
    )
    .reduce((sum, i) => sum + i.amountTTC, 0);
}

// Build a combined cash flow series for dashboard: negative outflows (expenses) and positive inflows (incomes)
function buildCashFlowSeriesDashboard(expenses, incomes) {
  const today = new Date();
  const series = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const out = expenses
      .filter(e => sameDate(new Date(e.invoiceDate + 'T00:00:00'), date))
      .reduce((sum, e) => sum + e.amountTTC, 0);
    const inc = incomes
      .filter(i => sameDate(new Date(i.date + 'T00:00:00'), date) && i.status === 'ENCAISSÉ')
      .reduce((sum, i) => sum + i.amountTTC, 0);
    series.push(inc - out);
  }
  return series;
}

function drawLineChart(containerId, series) {
  const canvas = document.getElementById(containerId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  const max = Math.max(...series);
  const min = Math.min(...series);
  const pad = 20;
  series.forEach((v, i) => {
    const x = (i / (series.length - 1)) * (width - 2 * pad) + pad;
    const y = height - pad - ((v - min) / (max - min || 1)) * (height - 2 * pad);
    if (i === 0) {
      ctx.beginPath();
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.strokeStyle = '#4b7bec';
  ctx.lineWidth = 2;
  ctx.stroke();
  // draw axis line
  ctx.strokeStyle = '#e6eaf2';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, height - pad);
  ctx.lineTo(width - pad, height - pad);
  ctx.stroke();
}

function buildCashFlowSeries(expenses) {
  // Build a simple series for 7 points representing net cash flow over the
  // last 7 days. Negative values correspond to expenses.
  const today = new Date();
  const series = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const out = expenses
      .filter(e => sameDate(new Date(e.invoiceDate + 'T00:00:00'), date))
      .reduce((sum, e) => sum + e.amountTTC, 0);
    // assume no revenues for demo; we just plot negative outflows
    series.push(-out);
  }
  return series;
}

function setValue(selector, value) {
  const el = document.querySelector(selector);
  if (el) {
    el.textContent = formatCurrency(value);
  }
}

// ---------------- Expenses page -----------------
function renderExpenses(expenses) {
  // Keep internal reference so that updates reflect in the view
  let data = [...expenses];
  let filteredData = [...data];

  // Render KPIs initially
  function renderKpis() {
    const today = new Date();
    const seven = new Date();
    seven.setDate(today.getDate() + 7);
    const thirty = new Date();
    thirty.setDate(today.getDate() + 30);
    const totalTtc = data.reduce((sum, e) => sum + e.amountTTC, 0);
    const toPay7 = data
      .filter(
        e => e.status !== 'PAYÉ' && new Date(e.dueDate + 'T00:00:00') <= seven
      )
      .reduce((sum, e) => sum + e.amountTTC, 0);
    const toPay30 = data
      .filter(
        e => e.status !== 'PAYÉ' && new Date(e.dueDate + 'T00:00:00') <= thirty
      )
      .reduce((sum, e) => sum + e.amountTTC, 0);
    const depensesJour = data
      .filter(e => sameDate(new Date(e.invoiceDate + 'T00:00:00'), today))
      .reduce((sum, e) => sum + e.amountTTC, 0);
    const tvaAVenir = data
      .filter(e => e.status !== 'PAYÉ')
      .reduce((sum, e) => sum + e.amountTVA, 0);
    document.getElementById('kpi_total_ttc').textContent = formatCurrency(totalTtc);
    document.getElementById('kpi_to_pay').textContent =
      formatCurrency(toPay7) + ' / ' + formatCurrency(toPay30);
    document.getElementById('kpi_depenses_jour').textContent = formatCurrency(depensesJour);
    document.getElementById('kpi_tva_av').textContent = formatCurrency(tvaAVenir);
  }

  function renderTable() {
    const tbody = document.querySelector('#expensesTable tbody');
    tbody.innerHTML = '';
    filteredData.forEach(exp => {
      const tr = document.createElement('tr');
      tr.dataset.id = exp.id;
      // Date
      const dateTd = document.createElement('td');
      dateTd.textContent = formatDate(exp.invoiceDate);
      tr.appendChild(dateTd);
      // Fournisseur
      const vendorTd = document.createElement('td');
      vendorTd.textContent = exp.vendor;
      tr.appendChild(vendorTd);
      // N° facture
      const invTd = document.createElement('td');
      invTd.textContent = exp.invoiceNumber;
      tr.appendChild(invTd);
      // Site
      const siteTd = document.createElement('td');
      siteTd.textContent = exp.site;
      tr.appendChild(siteTd);
      // Montants
      const montTd = document.createElement('td');
      montTd.innerHTML = `${formatCurrency(exp.amountHT)} / ${formatCurrency(
        exp.amountTVA
      )} / <strong>${formatCurrency(exp.amountTTC)}</strong>`;
      tr.appendChild(montTd);
      // Catégorie
      const catTd = document.createElement('td');
      catTd.textContent = exp.category;
      tr.appendChild(catTd);
      // Échéance
      const dueTd = document.createElement('td');
      dueTd.textContent = formatDate(exp.dueDate);
      tr.appendChild(dueTd);
      // Statut
      const statusTd = document.createElement('td');
      statusTd.classList.add('status');
      const span = document.createElement('span');
      span.className = 'status-badge';
      span.textContent = exp.status;
      // Apply dynamic background color based on status
      const statusColour = (status => {
        switch (status) {
          case 'À VALIDER':
          case 'À PAYER':
            return getComputedStyle(document.documentElement).getPropertyValue(
              '--color-warning'
            );
          case 'PAYÉ':
            return getComputedStyle(document.documentElement).getPropertyValue(
              '--color-success'
            );
          case 'PLANIFIÉ':
            return getComputedStyle(document.documentElement).getPropertyValue(
              '--color-info'
            );
          case 'PARTIEL':
            return getComputedStyle(document.documentElement).getPropertyValue(
              '--color-primary'
            );
          case 'LITIGE':
            return getComputedStyle(document.documentElement).getPropertyValue(
              '--color-danger'
            );
          default:
            return getComputedStyle(document.documentElement).getPropertyValue(
              '--color-muted'
            );
        }
      })(exp.status);
      span.style.backgroundColor = statusColour.trim();
      span.style.color = '#fff';
      statusTd.appendChild(span);
      tr.appendChild(statusTd);
      // Moyen de paiement
      const pmTd = document.createElement('td');
      pmTd.textContent = exp.paymentMethod;
      tr.appendChild(pmTd);
      // Match bancaire
      const matchTd = document.createElement('td');
      const matchDiv = document.createElement('span');
      matchDiv.className = 'match-indicator' + (exp.matchedBank ? ' matched' : '');
      const dot = document.createElement('span');
      dot.className = 'dot';
      const text = document.createElement('span');
      text.textContent = exp.matchedBank ? 'Oui' : 'Non';
      matchDiv.appendChild(dot);
      matchDiv.appendChild(text);
      matchTd.appendChild(matchDiv);
      tr.appendChild(matchTd);
      // Notes
      const notesTd = document.createElement('td');
      notesTd.textContent = exp.notes || '';
      tr.appendChild(notesTd);
      // Pièces
      const attTd = document.createElement('td');
      attTd.textContent = exp.attachments;
      tr.appendChild(attTd);
      tbody.appendChild(tr);
    });
    // Append total row
    const trTotal = document.createElement('tr');
    trTotal.className = 'totals-row';
    const tdTotal = document.createElement('td');
    tdTotal.colSpan = 4;
    tdTotal.style.textAlign = 'right';
    tdTotal.textContent = 'Total TTC (vue)';
    trTotal.appendChild(tdTotal);
    const totalValTd = document.createElement('td');
    const totalTTC = filteredData.reduce((sum, e) => sum + e.amountTTC, 0);
    totalValTd.innerHTML = `<strong>${formatCurrency(totalTTC)}</strong>`;
    trTotal.appendChild(totalValTd);
    // Fill empty cells to align with columns
    for (let i = 0; i < 6; i++) {
      const empty = document.createElement('td');
      trTotal.appendChild(empty);
    }
    tbody.appendChild(trTotal);
  }

  function filterData() {
    const siteFilter = document.getElementById('filter_site').value;
    const statusFilter = document.getElementById('filter_status').value;
    const search = document.getElementById('search_input').value.toLowerCase().trim();
    filteredData = data.filter(exp => {
      const matchSite = siteFilter ? exp.site === siteFilter : true;
      const matchStatus = statusFilter ? exp.status === statusFilter : true;
      const matchSearch =
        search === '' ||
        exp.vendor.toLowerCase().includes(search) ||
        exp.invoiceNumber.toLowerCase().includes(search);
      return matchSite && matchStatus && matchSearch;
    });
    renderTable();
  }

  function handleRowClick(ev) {
    const tr = ev.target.closest('tr');
    if (!tr || !tr.dataset.id) return;
    const exp = data.find(e => e.id === Number(tr.dataset.id));
    if (!exp) return;
    showSidebar(exp);
  }

  function showSidebar(expense) {
    const sidebar = document.querySelector('.expenses-sidebar');
    // Fill fields
    document.getElementById('detail_vendor').value = expense.vendor;
    document.getElementById('detail_invoiceNumber').value = expense.invoiceNumber;
    document.getElementById('detail_invoiceDate').value = expense.invoiceDate;
    document.getElementById('detail_dueDate').value = expense.dueDate;
    document.getElementById('detail_site').value = expense.site;
    document.getElementById('detail_category').value = expense.category;
    document.getElementById('detail_vatRate').value = expense.vatRate;
    document.getElementById('detail_paymentMethod').value = expense.paymentMethod;
    document.getElementById('detail_status').value = expense.status;
    document.getElementById('detail_ht').textContent = formatCurrency(expense.amountHT);
    document.getElementById('detail_tva').textContent = formatCurrency(expense.amountTVA);
    document.getElementById('detail_ttc').textContent = formatCurrency(expense.amountTTC);
    // Save reference on element
    sidebar.dataset.currentId = expense.id;
    sidebar.classList.add('open');
    const overlay = document.querySelector('.overlay');
    if (overlay) overlay.style.display = 'block';
    // Build preview chart for future cash (just copy expenses summary)
    drawPreviewChart(expense);
  }

  function hideSidebar() {
    const sidebar = document.querySelector('.expenses-sidebar');
    sidebar.classList.remove('open');
    const overlay = document.querySelector('.overlay');
    if (overlay) overlay.style.display = 'none';
  }

  function drawPreviewChart(expense) {
    const canvas = document.getElementById('previewChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    // Data: 7/30/90 days to pay this invoice; if due within 7 days, full amount in first bar,
    // within 30 days second bar, otherwise third bar
    const today = new Date();
    const due = new Date(expense.dueDate + 'T00:00:00');
    const val7 = due <= new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7) ? expense.amountTTC : 0;
    const val30 =
      due > new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7) &&
      due <= new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30)
        ? expense.amountTTC
        : 0;
    const val90 = val7 === 0 && val30 === 0 ? expense.amountTTC : 0;
    const series = [val7, val30, val90];
    const max = Math.max(...series);
    const barWidth = width / 5;
    series.forEach((val, i) => {
      const x = (i + 1) * barWidth;
      const h = (val / (max || 1)) * (height - 20);
      ctx.fillStyle = '#4b7bec';
      ctx.fillRect(x, height - h, barWidth * 0.6, h);
    });
  }

  function updateCurrentExpense(updates) {
    const sidebar = document.querySelector('.expenses-sidebar');
    const id = Number(sidebar.dataset.currentId);
    const idx = data.findIndex(e => e.id === id);
    if (idx === -1) return;
    data[idx] = { ...data[idx], ...updates };
    DemoData.save(data);
    filterData();
    renderKpis();
  }

  // Bind filter elements
  document.getElementById('filter_site').addEventListener('change', filterData);
  document.getElementById('filter_status').addEventListener('change', filterData);
  document.getElementById('search_input').addEventListener('input', filterData);

  // New expense stub
  document.getElementById('newExpenseBtn').addEventListener('click', () => {
    alert('Simulation: cette fonction déclencherait un scan et OCR pour créer une nouvelle dépense.');
  });

  // Import stub
  document.getElementById('importBtn').addEventListener('click', () => {
    alert('Simulation: import de factures via CSV/UBL/Factur-X non implémenté dans cette démonstration.');
  });

  // Export CSV
  document.getElementById('exportBtn').addEventListener('click', () => {
    exportToCsv('expenses.csv', filteredData);
  });

  // Save view stub
  document.getElementById('saveViewBtn').addEventListener('click', () => {
    alert('Vue sauvegardée (simulation).');
  });

  // Table click
  document.getElementById('expensesTable').addEventListener('click', handleRowClick);

  // Sidebar overlay click to close
  const overlay = document.querySelector('.overlay');
  if (overlay) {
    overlay.addEventListener('click', hideSidebar);
  }

  // Sidebar action buttons
  // Expose validation functions globally so inline onclick handlers work
  window.validateCurrent = function () {
    const sidebar = document.querySelector('.expenses-sidebar');
    const id = Number(sidebar.dataset.currentId);
    const expense = data.find(e => e.id === id);
    if (!expense) return;
    let newStatus = expense.status;
    switch (expense.status) {
      case 'À VALIDER':
        newStatus = 'À PAYER';
        break;
      case 'À PAYER':
        newStatus = 'PAYÉ';
        break;
      case 'PLANIFIÉ':
        newStatus = 'À PAYER';
        break;
      case 'PARTIEL':
        newStatus = 'PAYÉ';
        break;
    }
    updateCurrentExpense({ status: newStatus });
    hideSidebar();
  };
  window.markPaid = function () {
    // Mark invoice as paid and matched
    const sidebar = document.querySelector('.expenses-sidebar');
    const id = Number(sidebar.dataset.currentId);
    if (!id) return;
    updateCurrentExpense({ status: 'PAYÉ', matchedBank: true });
    hideSidebar();
  };

  // Populate filter dropdowns
  const sites = [...new Set(data.map(e => e.site))];
  const siteSelect = document.getElementById('filter_site');
  sites.forEach(site => {
    const opt = document.createElement('option');
    opt.value = site;
    opt.textContent = site;
    siteSelect.appendChild(opt);
  });
  const statuses = [...new Set(data.map(e => e.status))];
  const statusSelect = document.getElementById('filter_status');
  statuses.forEach(st => {
    const opt = document.createElement('option');
    opt.value = st;
    opt.textContent = st;
    statusSelect.appendChild(opt);
  });

  // Initial render
  renderKpis();
  renderTable();
}

// ---------------- Incomes page -----------------
function renderIncomes(incomes) {
  // local copy to allow modifications
  let data = [...incomes];
  let filteredData = [...data];

  // Render KPIs for incomes page
  function renderKpis() {
    const today = new Date();
    const seven = new Date();
    seven.setDate(today.getDate() + 7);
    const thirty = new Date();
    thirty.setDate(today.getDate() + 30);
    const totalTtc = data.reduce((sum, i) => sum + i.amountTTC, 0);
    const toReceive7 = data
      .filter(
        i => i.status !== 'ENCAISSÉ' && new Date(i.expectedDate + 'T00:00:00') <= seven
      )
      .reduce((sum, i) => sum + i.amountTTC, 0);
    const toReceive30 = data
      .filter(
        i => i.status !== 'ENCAISSÉ' && new Date(i.expectedDate + 'T00:00:00') <= thirty
      )
      .reduce((sum, i) => sum + i.amountTTC, 0);
    const encaissementsJour = data
      .filter(
        i => i.status === 'ENCAISSÉ' && sameDate(new Date(i.date + 'T00:00:00'), today)
      )
      .reduce((sum, i) => sum + i.amountTTC, 0);
    const tvaCollecte = data
      .filter(i => i.status !== 'ANNULÉ')
      .reduce((sum, i) => sum + i.amountTVA, 0);
    document.getElementById('kpi_income_total_ttc').textContent = formatCurrency(totalTtc);
    document.getElementById('kpi_income_to_receive').textContent =
      formatCurrency(toReceive7) + ' / ' + formatCurrency(toReceive30);
    document.getElementById('kpi_income_day').textContent = formatCurrency(encaissementsJour);
    document.getElementById('kpi_income_tva').textContent = formatCurrency(tvaCollecte);
  }

  function renderTable() {
    const tbody = document.querySelector('#incomesTable tbody');
    tbody.innerHTML = '';
    filteredData.forEach(inc => {
      const tr = document.createElement('tr');
      tr.dataset.id = inc.id;
      // Date
      const dateTd = document.createElement('td');
      dateTd.textContent = formatDate(inc.date);
      tr.appendChild(dateTd);
      // Client
      const clientTd = document.createElement('td');
      clientTd.textContent = inc.client;
      tr.appendChild(clientTd);
      // N° commande
      const orderTd = document.createElement('td');
      orderTd.textContent = inc.orderNumber;
      tr.appendChild(orderTd);
      // Site
      const siteTd = document.createElement('td');
      siteTd.textContent = inc.site;
      tr.appendChild(siteTd);
      // Montants
      const montTd = document.createElement('td');
      montTd.innerHTML = `${formatCurrency(inc.amountHT)} / ${formatCurrency(
        inc.amountTVA
      )} / <strong>${formatCurrency(inc.amountTTC)}</strong>`;
      tr.appendChild(montTd);
      // Canal
      const channelTd = document.createElement('td');
      channelTd.textContent = inc.channel;
      tr.appendChild(channelTd);
      // Échéance
      const dueTd = document.createElement('td');
      dueTd.textContent = formatDate(inc.expectedDate);
      tr.appendChild(dueTd);
      // Statut
      const statusTd = document.createElement('td');
      const span = document.createElement('span');
      span.className = 'status-badge';
      span.textContent = inc.status;
      const color = (status => {
        switch (status) {
          case 'À ENCAISSER':
            return getComputedStyle(document.documentElement).getPropertyValue(
              '--color-warning'
            );
          case 'ENCAISSÉ':
            return getComputedStyle(document.documentElement).getPropertyValue(
              '--color-success'
            );
          case 'ANNULÉ':
            return getComputedStyle(document.documentElement).getPropertyValue(
              '--color-danger'
            );
          default:
            return getComputedStyle(document.documentElement).getPropertyValue(
              '--color-muted'
            );
        }
      })(inc.status);
      span.style.backgroundColor = color.trim();
      span.style.color = '#fff';
      statusTd.appendChild(span);
      tr.appendChild(statusTd);
      // Notes
      const notesTd = document.createElement('td');
      notesTd.textContent = inc.notes || '';
      tr.appendChild(notesTd);
      // Pièces
      const attTd = document.createElement('td');
      attTd.textContent = inc.attachments;
      tr.appendChild(attTd);
      tbody.appendChild(tr);
    });
    // Append total row
    const trTotal = document.createElement('tr');
    trTotal.className = 'totals-row';
    const tdLabel = document.createElement('td');
    tdLabel.colSpan = 4;
    tdLabel.style.textAlign = 'right';
    tdLabel.textContent = 'Total TTC (vue)';
    trTotal.appendChild(tdLabel);
    const valTd = document.createElement('td');
    const totalTTC = filteredData.reduce((sum, i) => sum + i.amountTTC, 0);
    valTd.innerHTML = `<strong>${formatCurrency(totalTTC)}</strong>`;
    trTotal.appendChild(valTd);
    // Fill remaining cells for alignment (canal, échéance, statut, notes, pièces)
    for (let i = 0; i < 5; i++) {
      const empty = document.createElement('td');
      trTotal.appendChild(empty);
    }
    tbody.appendChild(trTotal);
  }

  function filterData() {
    const siteFilter = document.getElementById('filter_income_site').value;
    const statusFilter = document.getElementById('filter_income_status').value;
    const search = document
      .getElementById('search_income_input')
      .value.toLowerCase()
      .trim();
    filteredData = data.filter(inc => {
      const matchSite = siteFilter ? inc.site === siteFilter : true;
      const matchStatus = statusFilter ? inc.status === statusFilter : true;
      const matchSearch =
        search === '' ||
        inc.client.toLowerCase().includes(search) ||
        inc.orderNumber.toLowerCase().includes(search);
      return matchSite && matchStatus && matchSearch;
    });
    renderTable();
  }

  function handleRowClick(ev) {
    const tr = ev.target.closest('tr');
    if (!tr || !tr.dataset.id) return;
    const inc = data.find(i => i.id === Number(tr.dataset.id));
    if (!inc) return;
    showSidebar(inc);
  }

  function showSidebar(inc) {
    const sidebar = document.querySelector('.incomes-sidebar');
    document.getElementById('income_detail_client').value = inc.client;
    document.getElementById('income_detail_orderNumber').value = inc.orderNumber;
    document.getElementById('income_detail_date').value = inc.date;
    document.getElementById('income_detail_expectedDate').value = inc.expectedDate;
    document.getElementById('income_detail_site').value = inc.site;
    document.getElementById('income_detail_channel').value = inc.channel;
    document.getElementById('income_detail_vatRate').value = inc.vatRate;
    document.getElementById('income_detail_status').value = inc.status;
    document.getElementById('income_detail_ht').textContent = formatCurrency(inc.amountHT);
    document.getElementById('income_detail_tva').textContent = formatCurrency(inc.amountTVA);
    document.getElementById('income_detail_ttc').textContent = formatCurrency(inc.amountTTC);
    sidebar.dataset.currentId = inc.id;
    sidebar.classList.add('open');
    const overlay = document.querySelector('.overlay');
    if (overlay) overlay.style.display = 'block';
  }

  function hideSidebar() {
    const sidebar = document.querySelector('.incomes-sidebar');
    sidebar.classList.remove('open');
    const overlay = document.querySelector('.overlay');
    if (overlay) overlay.style.display = 'none';
  }

  function updateCurrentIncome(updates) {
    const sidebar = document.querySelector('.incomes-sidebar');
    const id = Number(sidebar.dataset.currentId);
    const idx = data.findIndex(i => i.id === id);
    if (idx === -1) return;
    data[idx] = { ...data[idx], ...updates };
    IncomesData.save(data);
    filterData();
    renderKpis();
  }

  // Global handlers for inline buttons
  window.validateIncome = function () {
    const sidebar = document.querySelector('.incomes-sidebar');
    const id = Number(sidebar.dataset.currentId);
    const inc = data.find(i => i.id === id);
    if (!inc) return;
    let newStatus = inc.status;
    switch (inc.status) {
      case 'À ENCAISSER':
        newStatus = 'ENCAISSÉ';
        break;
      default:
        newStatus = inc.status;
    }
    updateCurrentIncome({ status: newStatus });
    hideSidebar();
  };
  window.markReceived = function () {
    const sidebar = document.querySelector('.incomes-sidebar');
    const id = Number(sidebar.dataset.currentId);
    if (!id) return;
    updateCurrentIncome({ status: 'ENCAISSÉ' });
    hideSidebar();
  };

  // Bind filter events
  document.getElementById('filter_income_site').addEventListener('change', filterData);
  document.getElementById('filter_income_status').addEventListener('change', filterData);
  document
    .getElementById('search_income_input')
    .addEventListener('input', filterData);

  // Toolbar actions
  document.getElementById('newIncomeBtn').addEventListener('click', () => {
    alert('Simulation: cette fonction déclencherait un encaissement ou POS pour créer un nouveau revenu.');
  });
  document.getElementById('importIncomeBtn').addEventListener('click', () => {
    alert('Simulation: import de ventes via CSV/JSON non implémenté dans cette démonstration.');
  });
  document.getElementById('exportIncomeBtn').addEventListener('click', () => {
    exportIncomesCsv('incomes.csv', filteredData);
  });
  document.getElementById('saveIncomeViewBtn').addEventListener('click', () => {
    alert('Vue sauvegardée (simulation).');
  });

  // Table click
  document.getElementById('incomesTable').addEventListener('click', handleRowClick);
  // Overlay click to close
  const overlay = document.querySelector('.overlay');
  if (overlay) {
    overlay.addEventListener('click', hideSidebar);
  }

  // Populate filter dropdowns
  const sites = [...new Set(data.map(i => i.site))];
  const siteSelect = document.getElementById('filter_income_site');
  sites.forEach(site => {
    const opt = document.createElement('option');
    opt.value = site;
    opt.textContent = site;
    siteSelect.appendChild(opt);
  });
  const statuses = [...new Set(data.map(i => i.status))];
  const statusSelect = document.getElementById('filter_income_status');
  statuses.forEach(st => {
    const opt = document.createElement('option');
    opt.value = st;
    opt.textContent = st;
    statusSelect.appendChild(opt);
  });
  // Initial render
  renderKpis();
  renderTable();
}

// Export incomes to CSV
function exportIncomesCsv(filename, rows) {
  const headers = [
    'Date',
    'Client',
    'N° commande',
    'Site',
    'Montant HT',
    'TVA',
    'Montant TTC',
    'Canal',
    'Échéance',
    'Statut',
    'Notes',
    'Pièces',
  ];
  const csv = [headers.join(',')]
    .concat(
      rows.map(inc =>
        [
          formatDate(inc.date),
          inc.client,
          inc.orderNumber,
          inc.site,
          inc.amountHT,
          inc.amountTVA,
          inc.amountTTC,
          inc.channel,
          formatDate(inc.expectedDate),
          inc.status,
          inc.notes,
          inc.attachments,
        ].join(',')
      )
    )
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------- Invoices page -----------------
function renderInvoices(invoices) {
  let data = [...invoices];
  let filteredData = [...data];
  function renderKpis() {
    const today = new Date();
    const seven = new Date();
    seven.setDate(today.getDate() + 7);
    const thirty = new Date();
    thirty.setDate(today.getDate() + 30);
    const totalTtc = data.reduce((sum, inv) => sum + inv.amountTTC, 0);
    const toReceive7 = data
      .filter(
        inv => inv.status !== 'PAYÉ' && new Date(inv.dueDate + 'T00:00:00') <= seven
      )
      .reduce((sum, inv) => sum + inv.amountTTC, 0);
    const toReceive30 = data
      .filter(
        inv => inv.status !== 'PAYÉ' && new Date(inv.dueDate + 'T00:00:00') <= thirty
      )
      .reduce((sum, inv) => sum + inv.amountTTC, 0);
    const invoicesJour = data
      .filter(inv => sameDate(new Date(inv.date + 'T00:00:00'), today))
      .reduce((sum, inv) => sum + inv.amountTTC, 0);
    const tvaCollecte = data
      .filter(inv => inv.status !== 'ANNULÉ')
      .reduce((sum, inv) => sum + inv.amountTVA, 0);
    document.getElementById('kpi_invoice_total_ttc').textContent = formatCurrency(totalTtc);
    document.getElementById('kpi_invoice_to_receive').textContent =
      formatCurrency(toReceive7) + ' / ' + formatCurrency(toReceive30);
    document.getElementById('kpi_invoice_day').textContent = formatCurrency(invoicesJour);
    document.getElementById('kpi_invoice_tva').textContent = formatCurrency(tvaCollecte);
  }
  function renderTable() {
    const tbody = document.querySelector('#invoicesTable tbody');
    tbody.innerHTML = '';
    filteredData.forEach(inv => {
      const tr = document.createElement('tr');
      tr.dataset.id = inv.id;
      // Date facture
      const dateTd = document.createElement('td');
      dateTd.textContent = formatDate(inv.date);
      tr.appendChild(dateTd);
      // Client
      const custTd = document.createElement('td');
      custTd.textContent = inv.customer;
      tr.appendChild(custTd);
      // N° facture
      const noTd = document.createElement('td');
      noTd.textContent = inv.invoiceNumber;
      tr.appendChild(noTd);
      // Site
      const siteTd = document.createElement('td');
      siteTd.textContent = inv.site;
      tr.appendChild(siteTd);
      // Montants
      const montTd = document.createElement('td');
      montTd.innerHTML = `${formatCurrency(inv.amountHT)} / ${formatCurrency(
        inv.amountTVA
      )} / <strong>${formatCurrency(inv.amountTTC)}</strong>`;
      tr.appendChild(montTd);
      // Échéance
      const dueTd = document.createElement('td');
      dueTd.textContent = formatDate(inv.dueDate);
      tr.appendChild(dueTd);
      // Statut
      const statusTd = document.createElement('td');
      const span = document.createElement('span');
      span.className = 'status-badge';
      span.textContent = inv.status;
      const color = (status => {
        switch (status) {
          case 'BROUILLON':
            return getComputedStyle(document.documentElement).getPropertyValue(
              '--color-muted'
            );
          case 'ENVOYÉ':
            return getComputedStyle(document.documentElement).getPropertyValue(
              '--color-info'
            );
          case 'RELANCÉ':
            return getComputedStyle(document.documentElement).getPropertyValue(
              '--color-warning'
            );
          case 'PAYÉ':
            return getComputedStyle(document.documentElement).getPropertyValue(
              '--color-success'
            );
          case 'EN RETARD':
            return getComputedStyle(document.documentElement).getPropertyValue(
              '--color-danger'
            );
          case 'ANNULÉ':
            return getComputedStyle(document.documentElement).getPropertyValue(
              '--color-danger'
            );
          default:
            return getComputedStyle(document.documentElement).getPropertyValue(
              '--color-muted'
            );
        }
      })(inv.status);
      span.style.backgroundColor = color.trim();
      span.style.color = '#fff';
      statusTd.appendChild(span);
      tr.appendChild(statusTd);
      // Notes
      const notesTd = document.createElement('td');
      notesTd.textContent = inv.notes || '';
      tr.appendChild(notesTd);
      tbody.appendChild(tr);
    });
    // total row
    const trTotal = document.createElement('tr');
    trTotal.className = 'totals-row';
    const tdLabel = document.createElement('td');
    tdLabel.colSpan = 3;
    tdLabel.style.textAlign = 'right';
    tdLabel.textContent = 'Total TTC (vue)';
    trTotal.appendChild(tdLabel);
    const valTd = document.createElement('td');
    const totalTTC = filteredData.reduce((sum, inv) => sum + inv.amountTTC, 0);
    valTd.innerHTML = `<strong>${formatCurrency(totalTTC)}</strong>`;
    trTotal.appendChild(valTd);
    // Fill remaining cells (échéance, statut, notes)
    for (let i = 0; i < 3; i++) {
      const empty = document.createElement('td');
      trTotal.appendChild(empty);
    }
    tbody.appendChild(trTotal);
  }
  function filterData() {
    const siteFilter = document.getElementById('filter_invoice_site').value;
    const statusFilter = document.getElementById('filter_invoice_status').value;
    const search = document
      .getElementById('search_invoice_input')
      .value.toLowerCase()
      .trim();
    filteredData = data.filter(inv => {
      const matchSite = siteFilter ? inv.site === siteFilter : true;
      const matchStatus = statusFilter ? inv.status === statusFilter : true;
      const matchSearch =
        search === '' ||
        inv.customer.toLowerCase().includes(search) ||
        inv.invoiceNumber.toLowerCase().includes(search);
      return matchSite && matchStatus && matchSearch;
    });
    renderTable();
  }
  function handleRowClick(ev) {
    const tr = ev.target.closest('tr');
    if (!tr || !tr.dataset.id) return;
    const inv = data.find(i => i.id === Number(tr.dataset.id));
    if (!inv) return;
    showSidebar(inv);
  }
  function showSidebar(inv) {
    const sidebar = document.querySelector('.invoices-sidebar');
    document.getElementById('invoice_detail_customer').value = inv.customer;
    document.getElementById('invoice_detail_number').value = inv.invoiceNumber;
    document.getElementById('invoice_detail_date').value = inv.date;
    document.getElementById('invoice_detail_dueDate').value = inv.dueDate;
    document.getElementById('invoice_detail_site').value = inv.site;
    document.getElementById('invoice_detail_status').value = inv.status;
    document.getElementById('invoice_detail_vatRate').value = inv.vatRate;
    document.getElementById('invoice_detail_ht').textContent = formatCurrency(inv.amountHT);
    document.getElementById('invoice_detail_tva').textContent = formatCurrency(inv.amountTVA);
    document.getElementById('invoice_detail_ttc').textContent = formatCurrency(inv.amountTTC);
    sidebar.dataset.currentId = inv.id;
    sidebar.classList.add('open');
    const overlay = document.querySelector('.overlay');
    if (overlay) overlay.style.display = 'block';
  }
  function hideSidebar() {
    const sidebar = document.querySelector('.invoices-sidebar');
    sidebar.classList.remove('open');
    const overlay = document.querySelector('.overlay');
    if (overlay) overlay.style.display = 'none';
  }
  function updateCurrentInvoice(updates) {
    const sidebar = document.querySelector('.invoices-sidebar');
    const id = Number(sidebar.dataset.currentId);
    const idx = data.findIndex(i => i.id === id);
    if (idx === -1) return;
    data[idx] = { ...data[idx], ...updates };
    InvoicesData.save(data);
    filterData();
    renderKpis();
  }
  window.validateInvoice = function () {
    const sidebar = document.querySelector('.invoices-sidebar');
    const id = Number(sidebar.dataset.currentId);
    const inv = data.find(i => i.id === id);
    if (!inv) return;
    let newStatus = inv.status;
    switch (inv.status) {
      case 'BROUILLON':
        newStatus = 'ENVOYÉ';
        break;
      case 'ENVOYÉ':
        newStatus = 'RELANCÉ';
        break;
      case 'RELANCÉ':
        newStatus = 'PAYÉ';
        break;
      default:
        newStatus = inv.status;
    }
    updateCurrentInvoice({ status: newStatus });
    hideSidebar();
  };
  window.markInvoicePaid = function () {
    const sidebar = document.querySelector('.invoices-sidebar');
    const id = Number(sidebar.dataset.currentId);
    if (!id) return;
    updateCurrentInvoice({ status: 'PAYÉ' });
    hideSidebar();
  };
  // Bind filters
  document.getElementById('filter_invoice_site').addEventListener('change', filterData);
  document.getElementById('filter_invoice_status').addEventListener('change', filterData);
  document
    .getElementById('search_invoice_input')
    .addEventListener('input', filterData);
  // Toolbar actions
  document.getElementById('newInvoiceBtn').addEventListener('click', () => {
    alert('Simulation: cette fonction créerait un nouveau devis/facture.');
  });
  document.getElementById('importInvoiceBtn').addEventListener('click', () => {
    alert('Simulation: import de factures clients via CSV non implémenté.');
  });
  document.getElementById('exportInvoiceBtn').addEventListener('click', () => {
    exportInvoicesCsv('invoices.csv', filteredData);
  });
  document
    .getElementById('saveInvoiceViewBtn')
    .addEventListener('click', () => {
      alert('Vue sauvegardée (simulation).');
    });
  // Table click
  document.getElementById('invoicesTable').addEventListener('click', handleRowClick);
  const overlay = document.querySelector('.overlay');
  if (overlay) {
    overlay.addEventListener('click', hideSidebar);
  }
  // Populate filters
  const sites = [...new Set(data.map(i => i.site))];
  const siteSelect = document.getElementById('filter_invoice_site');
  sites.forEach(site => {
    const opt = document.createElement('option');
    opt.value = site;
    opt.textContent = site;
    siteSelect.appendChild(opt);
  });
  const statuses = [...new Set(data.map(i => i.status))];
  const statusSelect = document.getElementById('filter_invoice_status');
  statuses.forEach(st => {
    const opt = document.createElement('option');
    opt.value = st;
    opt.textContent = st;
    statusSelect.appendChild(opt);
  });
  // initial render
  renderKpis();
  renderTable();
}

function exportInvoicesCsv(filename, rows) {
  const headers = [
    'Date facture',
    'Client',
    'N° facture',
    'Site',
    'Montant HT',
    'TVA',
    'Montant TTC',
    'Échéance',
    'Statut',
    'Notes',
  ];
  const csv = [headers.join(',')]
    .concat(
      rows.map(inv =>
        [
          formatDate(inv.date),
          inv.customer,
          inv.invoiceNumber,
          inv.site,
          inv.amountHT,
          inv.amountTVA,
          inv.amountTTC,
          formatDate(inv.dueDate),
          inv.status,
          inv.notes,
        ].join(',')
      )
    )
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------- Transactions page -----------------
function renderTransactions(transactions) {
  let data = [...transactions];
  let filteredData = [...data];
  function renderKpis() {
    const countCat = data.filter(t => t.status === 'À CATÉGORISER').length;
    const countVal = data.filter(t => t.status === 'À VALIDER').length;
    const totalAmount = data.reduce((sum, t) => sum + t.amount, 0);
    const lineCount = data.length;
    document.getElementById('kpi_trans_categoriser').textContent = countCat;
    document.getElementById('kpi_trans_valider').textContent = countVal;
    document.getElementById('kpi_trans_amount').textContent = formatCurrency(totalAmount);
    document.getElementById('kpi_trans_lines').textContent = lineCount;
  }
  function renderTable() {
    const tbody = document.querySelector('#transactionsTable tbody');
    tbody.innerHTML = '';
    filteredData.forEach(tran => {
      const tr = document.createElement('tr');
      tr.dataset.id = tran.id;
      // Date
      const dateTd = document.createElement('td');
      dateTd.textContent = formatDate(tran.date);
      tr.appendChild(dateTd);
      // Libellé
      const labelTd = document.createElement('td');
      labelTd.textContent = tran.label;
      tr.appendChild(labelTd);
      // Montant
      const amtTd = document.createElement('td');
      amtTd.textContent = formatCurrency(tran.amount);
      tr.appendChild(amtTd);
      // Site
      const siteTd = document.createElement('td');
      siteTd.textContent = tran.site;
      tr.appendChild(siteTd);
      // Statut
      const statusTd = document.createElement('td');
      const span = document.createElement('span');
      span.className = 'status-badge';
      span.textContent = tran.status;
      const color = (status => {
        switch (status) {
          case 'À CATÉGORISER':
            return getComputedStyle(document.documentElement).getPropertyValue(
              '--color-warning'
            );
          case 'À VALIDER':
            return getComputedStyle(document.documentElement).getPropertyValue(
              '--color-info'
            );
          case 'RAPPROCHÉ':
            return getComputedStyle(document.documentElement).getPropertyValue(
              '--color-success'
            );
          default:
            return getComputedStyle(document.documentElement).getPropertyValue(
              '--color-muted'
            );
        }
      })(tran.status);
      span.style.backgroundColor = color.trim();
      span.style.color = '#fff';
      statusTd.appendChild(span);
      tr.appendChild(statusTd);
      // Liens (match count)
      const matchTd = document.createElement('td');
      matchTd.textContent = tran.matchCount || 0;
      tr.appendChild(matchTd);
      tbody.appendChild(tr);
    });
    // total row
    const trTotal = document.createElement('tr');
    trTotal.className = 'totals-row';
    const tdLabel = document.createElement('td');
    tdLabel.colSpan = 2;
    tdLabel.style.textAlign = 'right';
    tdLabel.textContent = 'Total montant (vue)';
    trTotal.appendChild(tdLabel);
    const valTd = document.createElement('td');
    const totalAmount = filteredData.reduce((sum, t) => sum + t.amount, 0);
    valTd.innerHTML = `<strong>${formatCurrency(totalAmount)}</strong>`;
    trTotal.appendChild(valTd);
    // Fill remaining cells (site, statut, liens)
    for (let i = 0; i < 3; i++) {
      const empty = document.createElement('td');
      trTotal.appendChild(empty);
    }
    tbody.appendChild(trTotal);
  }
  function filterData() {
    const siteFilter = document.getElementById('filter_trans_site').value;
    const statusFilter = document.getElementById('filter_trans_status').value;
    const search = document
      .getElementById('search_trans_input')
      .value.toLowerCase()
      .trim();
    filteredData = data.filter(tran => {
      const matchSite = siteFilter ? tran.site === siteFilter : true;
      const matchStatus = statusFilter ? tran.status === statusFilter : true;
      const matchSearch = search === '' || tran.label.toLowerCase().includes(search);
      return matchSite && matchStatus && matchSearch;
    });
    renderTable();
  }
  function handleRowClick(ev) {
    const tr = ev.target.closest('tr');
    if (!tr || !tr.dataset.id) return;
    const tran = data.find(t => t.id === Number(tr.dataset.id));
    if (!tran) return;
    showSidebar(tran);
  }
  function showSidebar(tran) {
    const sidebar = document.querySelector('.transactions-sidebar');
    document.getElementById('trans_detail_label').value = tran.label;
    document.getElementById('trans_detail_date').value = tran.date;
    document.getElementById('trans_detail_amount').textContent = formatCurrency(tran.amount);
    document.getElementById('trans_detail_site').value = tran.site;
    document.getElementById('trans_detail_status').value = tran.status;
    document.getElementById('trans_detail_matches').textContent = tran.matchCount || 0;
    sidebar.dataset.currentId = tran.id;
    sidebar.classList.add('open');
    const overlay = document.querySelector('.overlay');
    if (overlay) overlay.style.display = 'block';
  }
  function hideSidebar() {
    const sidebar = document.querySelector('.transactions-sidebar');
    sidebar.classList.remove('open');
    const overlay = document.querySelector('.overlay');
    if (overlay) overlay.style.display = 'none';
  }
  function updateCurrentTransaction(updates) {
    const sidebar = document.querySelector('.transactions-sidebar');
    const id = Number(sidebar.dataset.currentId);
    const idx = data.findIndex(t => t.id === id);
    if (idx === -1) return;
    data[idx] = { ...data[idx], ...updates };
    TransactionsData.save(data);
    filterData();
    renderKpis();
  }
  window.validateTransaction = function () {
    const sidebar = document.querySelector('.transactions-sidebar');
    const id = Number(sidebar.dataset.currentId);
    const tran = data.find(t => t.id === id);
    if (!tran) return;
    let newStatus = tran.status;
    switch (tran.status) {
      case 'À CATÉGORISER':
        newStatus = 'À VALIDER';
        break;
      case 'À VALIDER':
        newStatus = 'RAPPROCHÉ';
        break;
      default:
        newStatus = tran.status;
    }
    updateCurrentTransaction({ status: newStatus });
    hideSidebar();
  };
  window.markReconciled = function () {
    const sidebar = document.querySelector('.transactions-sidebar');
    const id = Number(sidebar.dataset.currentId);
    if (!id) return;
    updateCurrentTransaction({ status: 'RAPPROCHÉ' });
    hideSidebar();
  };
  document.getElementById('filter_trans_site').addEventListener('change', filterData);
  document.getElementById('filter_trans_status').addEventListener('change', filterData);
  document
    .getElementById('search_trans_input')
    .addEventListener('input', filterData);
  document.getElementById('importTransBtn').addEventListener('click', () => {
    alert('Simulation: import de transactions bancaires non implémenté.');
  });
  document.getElementById('exportTransBtn').addEventListener('click', () => {
    exportTransactionsCsv('transactions.csv', filteredData);
  });
  document.getElementById('saveTransViewBtn').addEventListener('click', () => {
    alert('Vue sauvegardée (simulation).');
  });
  document.getElementById('transactionsTable').addEventListener('click', handleRowClick);
  const overlay = document.querySelector('.overlay');
  if (overlay) {
    overlay.addEventListener('click', hideSidebar);
  }
  const sites = [...new Set(data.map(t => t.site))];
  const siteSelect = document.getElementById('filter_trans_site');
  sites.forEach(site => {
    const opt = document.createElement('option');
    opt.value = site;
    opt.textContent = site;
    siteSelect.appendChild(opt);
  });
  const statuses = [...new Set(data.map(t => t.status))];
  const statusSelect = document.getElementById('filter_trans_status');
  statuses.forEach(st => {
    const opt = document.createElement('option');
    opt.value = st;
    opt.textContent = st;
    statusSelect.appendChild(opt);
  });
  renderKpis();
  renderTable();
}

function exportTransactionsCsv(filename, rows) {
  const headers = [
    'Date',
    'Libellé',
    'Montant',
    'Site',
    'Statut',
    'Liaisons',
  ];
  const csv = [headers.join(',')]
    .concat(
      rows.map(t =>
        [
          formatDate(t.date),
          t.label,
          t.amount,
          t.site,
          t.status,
          t.matchCount || 0,
        ].join(',')
      )
    )
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------- TVA & Exports page -----------------
function renderTVA(incomes, expenses) {
  // Compute VAT summaries
  const totalCollecte = incomes
    .filter(i => i.status !== 'ANNULÉ')
    .reduce((sum, i) => sum + i.amountTVA, 0);
  const totalDeductible = expenses
    .filter(e => e.status !== 'PAYÉ')
    .reduce((sum, e) => sum + e.amountTVA, 0);
  const net = totalCollecte - totalDeductible;
  const incomePieces = incomes.length;
  const expensePieces = expenses.length;
  // Render KPI values
  document.getElementById('kpi_tva_collecte_total').textContent = formatCurrency(totalCollecte);
  document.getElementById('kpi_tva_deductible_total').textContent = formatCurrency(totalDeductible);
  document.getElementById('kpi_tva_net').textContent = formatCurrency(net);
  document.getElementById('kpi_tva_pieces_income').textContent = incomePieces;
  document.getElementById('kpi_tva_pieces_expense').textContent = expensePieces;
  // Build combined list for table: each row with date, type (vente/achat), tiers (client/vendor), description, montant TVA
  const rows = [];
  incomes.forEach(i => {
    rows.push({
      date: i.date,
      type: 'Vente',
      tier: i.client,
      reference: i.orderNumber,
      tva: i.amountTVA,
    });
  });
  expenses.forEach(e => {
    rows.push({
      date: e.invoiceDate,
      type: 'Achat',
      tier: e.vendor,
      reference: e.invoiceNumber,
      tva: e.amountTVA * -1, // negative for deductible
    });
  });
  // Sort by date
  rows.sort((a, b) => new Date(a.date) - new Date(b.date));
  const tbody = document.querySelector('#tvaTable tbody');
  tbody.innerHTML = '';
  rows.forEach(row => {
    const tr = document.createElement('tr');
    const dateTd = document.createElement('td');
    dateTd.textContent = formatDate(row.date);
    tr.appendChild(dateTd);
    const typeTd = document.createElement('td');
    typeTd.textContent = row.type;
    tr.appendChild(typeTd);
    const tierTd = document.createElement('td');
    tierTd.textContent = row.tier;
    tr.appendChild(tierTd);
    const refTd = document.createElement('td');
    refTd.textContent = row.reference;
    tr.appendChild(refTd);
    const tvaTd = document.createElement('td');
    tvaTd.textContent = formatCurrency(row.tva);
    tr.appendChild(tvaTd);
    tbody.appendChild(tr);
  });
  // total row
  const trTotal = document.createElement('tr');
  trTotal.className = 'totals-row';
  const tdLabel = document.createElement('td');
  tdLabel.colSpan = 4;
  tdLabel.style.textAlign = 'right';
  tdLabel.textContent = 'Total TVA nette';
  trTotal.appendChild(tdLabel);
  const valTd = document.createElement('td');
  valTd.innerHTML = `<strong>${formatCurrency(net)}</strong>`;
  trTotal.appendChild(valTd);
  tbody.appendChild(trTotal);
  // Export handlers
  document.getElementById('exportTvaBtn').addEventListener('click', () => {
    exportTvaCsv('tva_export.csv', rows, net);
  });
  document.getElementById('fecExportBtn').addEventListener('click', () => {
    alert('Simulation: export FEC non implémenté dans cette démonstration.');
  });
}

function exportTvaCsv(filename, rows, net) {
  const headers = ['Date', 'Type', 'Tiers', 'Référence', 'Montant TVA'];
  const csvRows = [headers.join(',')];
  rows.forEach(r => {
    csvRows.push([
      formatDate(r.date),
      r.type,
      r.tier,
      r.reference,
      r.tva,
    ].join(','));
  });
  csvRows.push([',,,Total TVA nette', net].join(','));
  const csv = csvRows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Utility functions
function formatCurrency(value) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(dateStr) {
  // Parse ISO date (YYYY-MM-DD) in local time by appending T00:00
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('fr-FR');
}

function sameDate(d1, d2) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function safeStatus(status) {
  // Replace spaces and accents to create valid CSS class names
  return status
    .toUpperCase()
    .normalize('NFD')
    .replace(/[^\w]/g, '-');
}

function exportToCsv(filename, rows) {
  const headers = [
    'Date facture',
    'Fournisseur',
    'N° facture',
    'Site',
    'Montant HT',
    'TVA',
    'Montant TTC',
    'Catégorie',
    'Échéance',
    'Statut',
    'Moyen de paiement',
    'Match bancaire',
    'Notes',
    'Pièces',
  ];
  const csv = [headers.join(',')].concat(
    rows.map(e => [
      formatDate(e.invoiceDate),
      e.vendor,
      e.invoiceNumber,
      e.site,
      e.amountHT,
      e.amountTVA,
      e.amountTTC,
      e.category,
      formatDate(e.dueDate),
      e.status,
      e.paymentMethod,
      e.matchedBank ? 'Oui' : 'Non',
      e.notes,
      e.attachments,
    ].join(','))
  ).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Attach events for comptage page (simple row addition & calculation)
/* function attachComptageListeners() {
  const DENOMS = [500,200,100,50,20,10,5,2,1,0.5,0.2,0.1,0.05];
  const STORE_KEY = 'caisseDays';

  const fmt = (v) => new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(Number(v||0));
  const toISO = (d) => { const x=new Date(d); x.setHours(0,0,0,0); return x.toISOString().slice(0,10); };
  const n = (x) => Number(String(x||'').replace(',','.'))||0;

  const Store = {
    get all(){ try{return JSON.parse(localStorage.getItem(STORE_KEY)||'{}');}catch(e){return {}} },
    set all(v){ localStorage.setItem(STORE_KEY, JSON.stringify(v||{})); },
    read(date){ return this.all[date] || { rows:[], vlp:0 }; },
    write(date, data){ const all=this.all; all[date]=data; this.all=all; },
    clear(date){ const all=this.all; delete all[date]; this.all=all; }
  };

  // DOM refs
  const tbody = document.getElementById('tbody');
  const subtotalEl = document.getElementById('subtotal');
  const sumEl = document.getElementById('sumCounted');
  const diffEl = document.getElementById('diffVal');
  const vlpInput = document.getElementById('vlp');
  const dateInput = document.getElementById('caisseDate');
  const chips = document.getElementById('chips');
  \1
  const siteSelect = document.getElementById('siteSelect');
  const searchDate = document.getElementById('searchDate');

  // Tabs
  document.addEventListener('click', (e)=>{
    const b = e.target.closest('.tab'); if(!b) return;
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    b.classList.add('active');
    document.getElementById('tab-comptage').style.display = b.dataset.tab==='comptage'?'grid':'none';
    document.getElementById('tab-historique').style.display = b.dataset.tab==='historique'?'block':'none';
  });

  // Row template (SELECT + QTY + TOTAL + DEL)
  function optionList(selected){
    return DENOMS.map(v=>`<option value="${v}" ${Number(selected)===Number(v)?'selected':''}>${v>=1?v+' €':String(v).replace('.',',')+' €'}</option>`).join('');
  }
  function addRow(value=50, qty=0){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <select class="denom-select">
          ${optionList(value)}
        </select>
      </td>
      <td>
        <input type="number" class="qty-input" min="0" step="1" value="${qty}" style="width:140px">
      </td>
      <td class="right comptage-line-total">0,00 €</td>
      <td class="right"><button class="btn link btn-del">Suppr</button></td>
    `;
    tbody.appendChild(tr);
  }

  function recalc(){
    let subtotal = 0;
    tbody.querySelectorAll('tr').forEach(tr=>{
      const v = Number(tr.querySelector('.denom-select').value);
      const q = n(tr.querySelector('.qty-input').value);
      const line = v*q;
      subtotal += line;
      tr.querySelector('.comptage-line-total').textContent = fmt(line);
    });
    subtotalEl.textContent = fmt(subtotal);
    sumEl.textContent = fmt(subtotal);
    const diff = subtotal - n(vlpInput.value);
    diffEl.textContent = fmt(diff);
    diffEl.style.color = diff < 0 ? 'var(--color-danger,#dc2626)' : 'var(--color-success,#16a34a)';
  }

  // Save / load day
  \1
  let currentSite = (siteSelect && siteSelect.value) || 'Default';

  function loadDay(iso){
    const data = StoreBySite.read(currentSite, iso);
    tbody.innerHTML='';
    if(!data.rows || data.rows.length===0){ addRow(50,0); } else { data.rows.forEach(r=> addRow(Number(r.value), Number(r.qty))); }
    vlpInput.value = data.vlp || 0;
    recalc();
  }else{
      data.rows.forEach(r=> addRow(Number(r.value), Number(r.qty)));
    }
    vlpInput.value = data.vlp || 0;
    recalc();
  }
  function saveDay(){
    const rows=[];
    tbody.querySelectorAll('tr').forEach(tr=>{
      const value = Number(tr.querySelector('.denom-select')?.value ?? tr.dataset.value);
      const qty   = n(tr.querySelector('.qty-input')?.value ?? tr.querySelector('input')?.value);
      if(qty>0) rows.push({ value, qty });
    });
    const vlp = n(vlpInput.value);
    StoreBySite.write(currentSite, currentISO, { rows, vlp });
    // Bridge vers DailyCash + KPI
    try{
      const counted = rows.reduce((s,r)=> s + Number(r.value)*Number(r.qty), 0);
      const diff = counted - vlp;
      const siteName = currentSite;
      window.DailyCash && window.DailyCash.write(siteName, currentISO, { counted, vlp, diff });
    }catch(e){ console && console.warn('DailyCash write failed', e); }
    populateHistory();
  });
    });
    const vlp = n(vlpInput.value);
    Store.write(currentISO, { rows, vlp });
    // --- Bridge to Dashboard (DailyCash) ---
    try {
      // compute counted total
      const counted = rows.reduce((s,r)=> s + Number(r.value)*Number(r.qty), 0);
      const site = (document.getElementById('siteSelect')?.value || 'default');
      window.DailyCash.write(site, typeof currentISO!=='undefined'? currentISO : currentDateISO, { counted, vlp, diff: counted - vlp });
    } catch (e) { console && console.warn('DailyCash link failed', e); }
    populateHistory();
  }
  function clearDay(){
    StoreBySite.clear(currentSite, currentISO);
    loadDay(currentISO);
    populateHistory();
  }

  // History
  function populateHistory(filterISO = null){
    const list = StoreBySite.list(); // [{site,date,rows,vlp}]
    const rows = filterISO ? list.filter(x=> x.date === filterISO) : list;
    histBody.innerHTML='';
    if(rows.length===0){
      histBody.innerHTML = `<tr><td colspan="6" class="muted">Aucun comptage.</td></tr>`;
      return;
    }
    rows.forEach(x=>{
      const total = (x.rows||[]).reduce((s,r)=> s + Number(r.value)*Number(r.qty),0);
      const diff = total - Number(x.vlp||0);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${x.date}</td>
        <td>${x.site}</td>
        <td class="right">${fmt(total)}</td>
        <td class="right">${fmt(x.vlp||0)}</td>
        <td class="right" style="color:${diff<0?'var(--color-danger)':'var(--color-success)'}">${fmt(diff)}</td>
        <td>
          <button class="btn secondary btn-load" data-date="${x.date}" data-site="${x.site}">Ouvrir</button>
          <button class="btn danger btn-del-h" data-date="${x.date}" data-site="${x.site}">Supprimer</button>
        </td>`;
      histBody.appendChild(tr);
    });
  }
    list.forEach(k=>{
      const d = all[k]||{rows:[],vlp:0};
      const total = (d.rows||[]).reduce((s,r)=> s + Number(r.value)*Number(r.qty), 0);
      const diff = total - Number(d.vlp||0);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${k}</td>
        <td class="right">${fmt(total)}</td>
        <td class="right">${fmt(d.vlp||0)}</td>
        <td class="right" style="color:${diff<0?'var(--color-danger,#dc2626)':'var(--color-success,#16a34a)'}">${fmt(diff)}</td>
        <td>
          <button class="btn secondary btn-load" data-date="${k}">Ouvrir</button>
          <button class="btn danger btn-del-h" data-date="${k}">Supprimer</button>
        </td>
      `;
      histBody.appendChild(tr);
    });
  }

  // Chips
  function renderChips(){
    chips.innerHTML='';
    DENOMS.forEach(v=>{
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = (v>=1 ? v+' €' : String(v).replace('.',',')+' €');
      b.addEventListener('click', ()=>{ addRow(v,0); recalc(); });
      chips.appendChild(b);
    });
  }

  // Events
  document.getElementById('addLine').addEventListener('click', ()=>{ addRow(50,0); recalc(); });
  document.getElementById('save').addEventListener('click', saveDay);
  document.getElementById('clear').addEventListener('click', clearDay);
  document.getElementById('print').addEventListener('click', ()=>window.print());
  \1
  siteSelect && siteSelect.addEventListener('change', ()=>{
    currentSite = siteSelect.value || 'Default';
    loadDay(currentISO);
  });
  dateInput.addEventListener('change', ()=>{
    currentISO = toISO(dateInput.value);
    loadDay(currentISO);
  });

  tbody.addEventListener('input', (e)=>{
    if(e.target.matches('.qty-input')) recalc();
  });
  tbody.addEventListener('change', (e)=>{
    if(e.target.matches('.denom-select')) recalc();
  });
  tbody.addEventListener('click', (e)=>{
    if(e.target.closest('.btn-del')){
      e.target.closest('tr').remove();
      recalc();
    }
  });

  document.getElementById('backup').addEventListener('click', ()=>{
    const blob = new Blob([JSON.stringify(Store.all,null,2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'comptages.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  document.getElementById('restore').addEventListener('click', async ()=>{
    const f = document.getElementById('restoreFile');
    if(!f.files || !f.files[0]) return alert('Sélectionne un fichier .json');
    try{
      const parsed = JSON.parse(await f.files[0].text());
      localStorage.setItem(STORE_KEY, JSON.stringify(parsed||{}));
      populateHistory();
      loadDay(currentISO);
      alert('Restauration terminée.');
    }catch(e){ alert('Fichier invalide.'); }
  });

  document.getElementById('btnSearch').addEventListener('click', ()=>{
    const iso = searchDate.value ? toISO(searchDate.value) : null;
    populateHistory(iso);
  });
  document.getElementById('btnReset').addEventListener('click', ()=>{
    searchDate.value=''; populateHistory(null);
  });
  histBody.addEventListener('click', (e)=>{
    const open = e.target.closest('.btn-load');
    const del  = e.target.closest('.btn-del-h');
    if(open){
      const iso = open.dataset.date;
      const site = open.dataset.site;
      document.querySelector('.tab[data-tab="comptage"]').click();
      if (siteSelect) siteSelect.value = site;
      currentSite = site;
      dateInput.value = iso;
      currentISO = iso;
      loadDay(currentISO);
    }
    if(del){
      const iso = del.dataset.date;
      const site = del.dataset.site;
      StoreBySite.clear(site, iso);
      populateHistory(searchDate.value ? toISO(searchDate.value) : null);
      if(iso===currentISO && site===currentSite) loadDay(currentISO);
    }
  });

  // init
  renderChips();
  loadDay(currentISO);
  populateHistory();
}
);
    document.getElementById('comptage_total').textContent = formatCurrency(total);
    const vlp = Number(document.getElementById('vlp_ref').value || 0);
    const diff = total - vlp;
    document.getElementById('comptage_diff').textContent = formatCurrency(diff);
  }
  inputs.forEach(input => input.addEventListener('input', computeComptage));
  document.getElementById('vlp_ref').addEventListener('input', computeComptage);
  computeComptage();
}

*/
// ===== Robust KPI Caisse (per-site, with fallback date) =====
function renderKpiCaisseStrong(){
  const fmtEUR = (v)=> new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(Number(v||0));
  const todayISO = (d=>{d.setHours(0,0,0,0); return d.toISOString().slice(0,10);})(new Date());
  const bySite = (window.DailyCash && window.DailyCash.byDate) ? window.DailyCash.byDate(todayISO) : [];
  let rows = bySite && bySite.length ? bySite : [];
  // Fallback: pick latest date from StoreBySite if no DailyCash for today
  let usedDate = todayISO;
  if (!rows.length && window.StoreBySite){
    const list = StoreBySite.list(); // [{site,date,rows,vlp}]
    if (list.length){
      usedDate = list[0].date;
      // group by site for that date
      const map = {};
      list.filter(x=>x.date===usedDate).forEach(x=>{
        const counted = (x.rows||[]).reduce((s,r)=> s + Number(r.value)*Number(r.qty),0);
        const vlp = Number(x.vlp||0);
        map[x.site] = {site:x.site, counted, vlp, diff: counted - vlp};
      });
      rows = Object.values(map);
    }
  }
  const sumCounted = rows.reduce((s,x)=> s + (x.counted||0), 0);
  const sumVlp = rows.reduce((s,x)=> s + (x.vlp||0), 0);
  const sumDiff = sumCounted - sumVlp;

  const kEnc = document.getElementById('kpiEncaissementsJour');
  const kDif = document.getElementById('kpiDiffJour');
  if (kEnc) kEnc.textContent = fmtEUR(sumCounted);
  if (kDif) {
    kDif.textContent = `Diff: ${fmtEUR(sumDiff)}${usedDate!==todayISO ? ' (sur '+usedDate+')' : ''}`;
    kDif.style.color = sumDiff < 0 ? 'var(--color-danger)' : 'var(--color-success)';
  }
  const body = document.getElementById('kpiSitesBody');
  if (body){
    body.innerHTML = '';
    if (!rows.length){
      body.innerHTML = `<tr><td colspan="4" class="muted">Aucun comptage</td></tr>`;
    } else {
      rows.forEach(row=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${row.site}</td>
          <td class="right">${fmtEUR(row.counted||0)}</td>
          <td class="right">${fmtEUR(row.vlp||0)}</td>
          <td class="right" style="color:${(row.diff||0)<0?'var(--color-danger)':'var(--color-success)'}">${fmtEUR(row.diff||0)}</td>`;
        body.appendChild(tr);
      });
    }
  }
}
