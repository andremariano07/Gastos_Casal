const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SHORT_MONTHS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

const GROUPS = [
  { id: "income", type: "income", title: "Receitas", icon: "↗", color: "#2f6557", items: ["Salário", "13º salário / férias"] },
  { id: "investment", type: "investment", title: "Investimentos", icon: "◇", color: "#c69a52", items: ["Reserva de Emergência", "Títulos de Renda Fixa", "Fundos de investimento"] },
  { id: "housing", type: "expense", title: "Moradia", icon: "⌂", color: "#607f94", items: ["Aluguel", "Condomínio", "IPTU", "Financiamento da casa", "Seguro Residencial", "Diarista/Mensalista", "Streamings", "Luz", "Água", "Telefone/Celular", "Gás", "Internet/TV"] },
  { id: "transport", type: "expense", title: "Transporte", icon: "↠", color: "#8b7968", items: ["Financiamento do Carro", "Seguro Automotivo", "IPVA", "Transporte Público", "Táxi/Uber/99", "Estacionamento", "Combustível"] },
  { id: "health", type: "expense", title: "Saúde", icon: "+", color: "#c96f69", items: ["Plano de Saúde", "Plano odontológico", "Seguro de Vida", "Dentista", "Terapias diversas", "Consultas", "Medicamentos/Farmácia", "Tratamentos/Procedimentos", "Exames"] },
  { id: "education", type: "expense", title: "Educação", icon: "⌁", color: "#7c75a8", items: ["Creche/Escola/Colégio", "Faculdade/Universidade", "Material Escolar", "Cursos Extras"] },
  { id: "food", type: "expense", title: "Alimentação", icon: "♢", color: "#d08f4a", items: ["Supermercado/Feira", "Cafés e Restaurantes", "Delivery"] },
  { id: "leisure", type: "expense", title: "Pessoais e entretenimento", icon: "☆", color: "#9a6f81", items: ["Roupas e Acessórios", "Presentes", "Viagens", "Shows/Teatro", "Cinema", "Bares/Restaurantes/Vida Noturna", "Hobby"] },
  { id: "beauty", type: "expense", title: "Beleza e bem-estar", icon: "✦", color: "#c17e91", items: ["Manicure/Pedicure", "Cuidados com Cabelo e/ou Barba", "Depilação/Estética", "Academia", "Procedimento estético"] },
  { id: "pets", type: "expense", title: "Pets", icon: "●", color: "#73917e", items: ["Veterinário/Medicamentos", "Plano de Saúde", "Petshop", "Creche"] }
];

const PAYROLL_DEFAULTS = ["INSS", "Cartão Alimentação", "Cartão Refeição", "CoopVale Sicoob", "Valiaprev", "AMS Titular"];
const STORAGE_KEY = "nosso-plano-v1";
const REMOVED_OTHER_INDEXES = {
  income: [2, 3],
  investment: [3],
  housing: [12],
  transport: [7],
  health: [9],
  education: [4],
  food: [3],
  leisure: [7],
  beauty: [5],
  pets: [4]
};
const now = new Date();
const FIREBASE_VERSION = "12.15.0";
const firebaseConfig = {
  apiKey: "AIzaSyDfWVD0flGmgQ-B_cbm8ns01oGofBsNiNw",
  authDomain: "orcamentocasal-ed0fa.firebaseapp.com",
  projectId: "orcamentocasal-ed0fa",
  storageBucket: "orcamentocasal-ed0fa.firebasestorage.app",
  messagingSenderId: "786893710602",
  appId: "1:786893710602:web:9eed847bc5a3942eefc6f3",
  measurementId: "G-ZNLVF48D3D"
};

const cloud = {
  services: null,
  auth: null,
  db: null,
  user: null,
  ready: false,
  unsubscribe: null,
  saveTimer: null
};

let state = loadState();
let selectedMonth = now.getMonth();
let selectedYear = now.getFullYear();
let activeView = "overview";
let pendingPhotos = { person1: "", person2: "" };

function initialState() {
  return {
    version: 3,
    settings: { person1: "Você", person2: "Noiva", goal: 0, photo1: "", photo2: "" },
    customItems: {},
    values: {},
    owners: {},
    payroll: {}
  };
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return normalizeState(parsed);
  } catch {
    return initialState();
  }
}

function normalizeState(parsed = {}) {
  const saved = { ...initialState(), ...parsed };
  const version = parsed.version || 1;
  if (version < 2) migrateRemovedOtherCategories(saved, REMOVED_OTHER_INDEXES);
  else if (version < 3) migrateRemovedOtherCategories(saved, { income: [2] });
  saved.version = 3;
  return saved;
}

function migrateRemovedOtherCategories(saved, removedByGroup) {
  const shiftIndexes = collection => {
    Object.values(collection || {}).forEach(month => {
      const migrated = {};
      Object.entries(month).forEach(([entryKey, value]) => {
        const [groupId, rawIndex] = entryKey.split(":");
        const removedIndexes = removedByGroup[groupId] || [];
        const index = Number(rawIndex);
        if (removedIndexes.includes(index)) return;
        const shift = removedIndexes.filter(removedIndex => removedIndex < index).length;
        migrated[`${groupId}:${index - shift}`] = value;
      });
      Object.keys(month).forEach(entryKey => delete month[entryKey]);
      Object.assign(month, migrated);
    });
  };

  shiftIndexes(saved.values);
  shiftIndexes(saved.owners);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  setSaveStatus("saving");
  if (cloud.user && cloud.ready) {
    queueCloudSave();
  } else {
    clearTimeout(saveState.timer);
    saveState.timer = setTimeout(() => setSaveStatus("local"), 450);
  }
}

function setSaveStatus(mode) {
  const status = document.querySelector(".save-status");
  if (!status) return;
  status.className = `save-status ${mode === "error" ? "error" : mode === "local" ? "local" : ""}`;
  const labels = {
    saving: "Salvando…",
    cloud: "Salvo na nuvem",
    local: "Salvo neste aparelho",
    error: "Sem sincronização"
  };
  status.innerHTML = `<i></i> ${labels[mode] || labels.local}`;
}

function queueCloudSave(delay = 550) {
  if (!cloud.user || !cloud.ready || !cloud.services) return;
  clearTimeout(cloud.saveTimer);
  cloud.saveTimer = setTimeout(async () => {
    const { doc, setDoc, serverTimestamp } = cloud.services;
    setSaveStatus("saving");
    try {
      await setDoc(doc(cloud.db, "users", cloud.user.uid), {
        state,
        updatedAt: serverTimestamp()
      });
      setSaveStatus("cloud");
    } catch (error) {
      console.error("Falha ao salvar no Firebase:", error);
      setSaveStatus("error");
    }
  }, delay);
}

const key = (year = selectedYear, month = selectedMonth) => `${year}-${String(month + 1).padStart(2, "0")}`;
const itemKey = (groupId, index) => `${groupId}:${index}`;
const money = value => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
const compactMoney = value => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(value || 0);
const parseMoney = value => Number(String(value).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "")) || 0;
const inputMoney = value => value ? Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
const capitalize = value => value.charAt(0).toUpperCase() + value.slice(1);

function getItems(group) {
  return [...group.items, ...(state.customItems[group.id] || [])];
}

function getValue(groupId, index, year = selectedYear, month = selectedMonth) {
  return Number(state.values[key(year, month)]?.[itemKey(groupId, index)] || 0);
}

function setValue(groupId, index, value) {
  state.values[key()] ||= {};
  state.values[key()][itemKey(groupId, index)] = Math.max(0, value);
  saveState();
  renderAll();
}

function totals(year = selectedYear, month = selectedMonth) {
  const result = { income: 0, expense: 0, investment: 0, payroll: 0, groups: {} };
  GROUPS.forEach(group => {
    const total = getItems(group).reduce((sum, _, index) => sum + getValue(group.id, index, year, month), 0);
    result[group.type] += total;
    result.groups[group.id] = total;
  });
  result.payroll = (state.payroll[key(year, month)] || []).reduce((sum, row) => sum + Number(row.value || 0), 0);
  result.balance = result.income - result.expense - result.investment;
  return result;
}

function renderAll() {
  renderHeader();
  renderOverview();
  renderPlanning();
  renderAnnual();
  renderPayroll();
}

function renderHeader() {
  const names = `${state.settings.person1} & ${state.settings.person2}`;
  document.getElementById("currentMonthLabel").textContent = `${capitalize(MONTHS[selectedMonth])} ${selectedYear}`;
  document.getElementById("sidebarNames").textContent = names;
  document.getElementById("welcomeNames").textContent = selectedMonth === now.getMonth() && selectedYear === now.getFullYear() ? names : names;
  document.getElementById("entryOwner").innerHTML = `<option value="couple">Casal</option><option value="person1">${escapeHtml(state.settings.person1)}</option><option value="person2">${escapeHtml(state.settings.person2)}</option>`;
  const avatars = document.querySelectorAll(".avatar-stack span");
  renderPhoto(avatars[0], state.settings.photo1, state.settings.person1, "V");
  renderPhoto(avatars[1], state.settings.photo2, state.settings.person2, "N");
  renderMonthMenu();
}

function renderPhoto(element, photo, name, fallback) {
  if (!element) return;
  element.style.backgroundImage = photo ? `url("${photo}")` : "";
  element.textContent = photo ? "" : (name?.[0] || fallback).toUpperCase();
}

function renderSettingsPhotos() {
  renderPhoto(document.getElementById("person1PhotoPreview"), pendingPhotos.person1, document.getElementById("person1Name").value || state.settings.person1, "V");
  renderPhoto(document.getElementById("person2PhotoPreview"), pendingPhotos.person2, document.getElementById("person2Name").value || state.settings.person2, "N");
}

function renderOverview() {
  const t = totals();
  document.getElementById("summaryIncome").textContent = money(t.income);
  document.getElementById("summaryExpenses").textContent = money(t.expense);
  document.getElementById("summaryInvestments").textContent = money(t.investment);
  document.getElementById("summaryBalance").textContent = money(t.balance);
  document.querySelector(".summary-card.balance").classList.toggle("negative", t.balance < 0);
  document.getElementById("investmentHint").textContent = `${t.income ? Math.round(t.investment / t.income * 100) : 0}% da receita`;
  document.getElementById("expenseHint").textContent = `${t.income ? Math.round(t.expense / t.income * 100) : 0}% da receita`;
  const goalPct = state.settings.goal ? Math.min(999, Math.round(t.investment / state.settings.goal * 100)) : 0;
  document.getElementById("goalProgress").textContent = `${goalPct}%`;
  document.getElementById("monthGoal").title = state.settings.goal ? `Meta: ${money(state.settings.goal)}` : "Defina uma meta nos ajustes";

  renderQuickList();
  renderDistribution(t);
  drawCashflowChart();
  renderInsight(t);
}

function renderQuickList() {
  const targets = [
    ["income", 0, "Salário"],
    ["housing", 0, "Aluguel"],
    ["food", 0, "Supermercado/Feira"],
    ["transport", 6, "Combustível"]
  ];
  document.getElementById("quickList").innerHTML = targets.map(([group, index, label]) => `
    <div class="quick-row">
      <label>${label}</label>
      <div class="money-input"><span>R$</span><input inputmode="decimal" data-quick="${group}:${index}" value="${inputMoney(getValue(group, index))}" placeholder="0,00"></div>
    </div>`).join("");
}

function renderDistribution(t) {
  const expenseGroups = GROUPS.filter(g => g.type === "expense").map(g => ({ ...g, total: t.groups[g.id] })).filter(g => g.total > 0).sort((a, b) => b.total - a.total);
  const colors = expenseGroups.map(g => g.color);
  let cursor = 0;
  const slices = expenseGroups.map(g => {
    const start = cursor;
    cursor += t.expense ? g.total / t.expense * 100 : 0;
    return `${g.color} ${start}% ${cursor}%`;
  });
  document.getElementById("expenseDonut").style.background = slices.length ? `conic-gradient(${slices.join(",")})` : "conic-gradient(#e5e1d8 0 100%)";
  document.getElementById("donutTotal").textContent = compactMoney(t.expense);
  document.getElementById("distributionList").innerHTML = expenseGroups.length
    ? expenseGroups.slice(0, 6).map((g, i) => `<div class="distribution-item"><i style="background:${colors[i]}"></i><span>${g.title}</span><strong>${Math.round(g.total / t.expense * 100)}%</strong></div>`).join("")
    : `<div class="empty-state">As categorias aparecem aqui quando vocês adicionarem despesas.</div>`;
}

function drawCashflowChart() {
  const canvas = document.getElementById("cashflowChart");
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const w = rect.width, h = rect.height, pad = { top: 12, right: 10, bottom: 26, left: 12 };
  const data = MONTHS.map((_, month) => totals(selectedYear, month));
  const max = Math.max(1, ...data.flatMap(d => [d.income, d.expense + d.investment]));
  const baseY = h - pad.bottom;
  const chartH = h - pad.top - pad.bottom;
  ctx.strokeStyle = "#e9e5dd";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const y = pad.top + chartH / 3 * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
  }
  const slot = (w - pad.left - pad.right) / 12;
  data.forEach((d, i) => {
    const groupX = pad.left + i * slot;
    const barW = Math.min(10, slot * .25);
    const incomeH = d.income / max * chartH;
    const outgoingH = (d.expense + d.investment) / max * chartH;
    roundRect(ctx, groupX + slot * .28 - barW / 2, baseY - incomeH, barW, incomeH, 4, "#2f6557");
    roundRect(ctx, groupX + slot * .62 - barW / 2, baseY - outgoingH, barW, outgoingH, 4, "#db806b");
    ctx.fillStyle = "#8c9692";
    ctx.font = "9px DM Sans";
    ctx.textAlign = "center";
    ctx.fillText(SHORT_MONTHS[i], groupX + slot / 2, h - 7);
  });
}

function roundRect(ctx, x, y, w, h, r, color) {
  if (h <= 0) return;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, [r, r, 0, 0]);
  ctx.fillStyle = color;
  ctx.fill();
}

function renderInsight(t) {
  let title = "Comecem pelo primeiro lançamento.";
  let text = "Ao preencher receitas e despesas, o plano mostra como o dinheiro de vocês está se distribuindo.";
  if (t.income > 0 && t.balance >= 0) {
    const available = Math.round(t.balance / t.income * 100);
    title = `Vocês ainda têm ${money(t.balance)} livres neste mês.`;
    text = `${available}% da renda está disponível depois das despesas e dos investimentos planejados.`;
  } else if (t.balance < 0) {
    title = `O planejamento ultrapassou a receita em ${money(Math.abs(t.balance))}.`;
    text = "Vale revisar as maiores categorias de despesa antes de fechar o mês.";
  } else if (t.expense > 0) {
    title = "Falta incluir as receitas do mês.";
    text = "As despesas já estão registradas. Agora adicionem a renda para enxergar o saldo real.";
  }
  document.getElementById("insightTitle").textContent = title;
  document.getElementById("insightText").textContent = text;
}

function renderPlanning() {
  const t = totals();
  document.getElementById("planningSummary").innerHTML = [
    ["Receitas", t.income], ["Investimentos", t.investment], ["Despesas", t.expense], ["Saldo", t.balance]
  ].map(([label, value]) => `<div class="plan-stat"><span>${label}</span><strong>${money(value)}</strong></div>`).join("");

  document.getElementById("planningSections").innerHTML = GROUPS.map(group => {
    const items = getItems(group);
    const total = t.groups[group.id];
    return `<article class="budget-group" style="--group-color:${group.color}" data-group="${group.id}">
      <button class="group-header" type="button">
        <span class="group-icon">${group.icon}</span>
        <span class="group-title"><strong>${group.title}</strong><small>${items.length} categorias</small></span>
        <span class="group-total">${money(total)}</span>
        <svg class="chevron" viewBox="0 0 24 24"><path d="m7 10 5 5 5-5"/></svg>
      </button>
      <div class="group-body">
        ${items.map((name, index) => budgetRow(group, name, index)).join("")}
        <button class="add-row-button" data-add-row="${group.id}">+ Adicionar categoria</button>
      </div>
    </article>`;
  }).join("");
}

function budgetRow(group, name, index) {
  const owner = state.owners[key()]?.[itemKey(group.id, index)] || "couple";
  return `<div class="budget-row">
    <input class="category-name" value="${escapeAttr(name)}" data-category-name="${group.id}:${index}" ${index < group.items.length ? "readonly" : ""}>
    <select class="owner-select" data-owner="${group.id}:${index}">
      <option value="couple" ${owner === "couple" ? "selected" : ""}>Casal</option>
      <option value="person1" ${owner === "person1" ? "selected" : ""}>${escapeHtml(state.settings.person1)}</option>
      <option value="person2" ${owner === "person2" ? "selected" : ""}>${escapeHtml(state.settings.person2)}</option>
    </select>
    <div class="money-input"><span>R$</span><input inputmode="decimal" data-budget="${group.id}:${index}" value="${inputMoney(getValue(group.id, index))}" placeholder="0,00"></div>
    ${index >= group.items.length ? `<button class="remove-row" data-remove-row="${group.id}:${index}" aria-label="Remover">×</button>` : "<span></span>"}
  </div>`;
}

function renderAnnual() {
  document.getElementById("yearLabel").textContent = selectedYear;
  document.getElementById("annualSubtitle").textContent = `Acompanhem a evolução de ${selectedYear} mês a mês.`;
  const months = MONTHS.map((_, month) => totals(selectedYear, month));
  const annual = months.reduce((sum, t) => {
    sum.income += t.income; sum.expense += t.expense; sum.investment += t.investment; sum.balance += t.balance; return sum;
  }, { income: 0, expense: 0, investment: 0, balance: 0 });
  const cards = [
    ["Receitas no ano", annual.income, "Tudo que entrou"],
    ["Despesas no ano", annual.expense, "Sem contar investimentos"],
    ["Investido no ano", annual.investment, `${annual.income ? Math.round(annual.investment / annual.income * 100) : 0}% das receitas`],
    ["Saldo acumulado", annual.balance, "Depois de todas as saídas"]
  ];
  document.getElementById("annualCards").innerHTML = cards.map(([label, value, hint]) => `<div class="annual-stat"><span>${label}</span><strong>${money(value)}</strong><small>${hint}</small></div>`).join("");
  const rows = [
    ["Receitas", "income"], ["Investimentos", "investment"], ["Despesas", "expense"], ["Saldo", "balance"]
  ];
  document.getElementById("annualTable").innerHTML = `<thead><tr><th>Movimentação</th>${SHORT_MONTHS.map(m => `<th>${m}</th>`).join("")}<th>Total</th></tr></thead>
    <tbody>${rows.map(([label, field]) => {
      const total = months.reduce((sum, m) => sum + m[field], 0);
      return `<tr><td>${label}</td>${months.map(m => `<td class="${field === "balance" ? (m[field] < 0 ? "negative" : "positive") : ""}">${compactMoney(m[field])}</td>`).join("")}<td class="${field === "balance" ? (total < 0 ? "negative" : "positive") : ""}">${compactMoney(total)}</td></tr>`;
    }).join("")}</tbody>`;
}

function payrollRows() {
  if (!state.payroll[key()]) state.payroll[key()] = PAYROLL_DEFAULTS.map(name => ({ name, value: 0 }));
  return state.payroll[key()];
}

function renderPayroll() {
  const rows = payrollRows();
  document.getElementById("payrollMonth").textContent = `${capitalize(MONTHS[selectedMonth])} de ${selectedYear}`;
  document.getElementById("payrollTotal").textContent = money(rows.reduce((sum, row) => sum + Number(row.value || 0), 0));
  document.getElementById("payrollRows").innerHTML = rows.map((row, index) => `<div class="payroll-row">
    <input value="${escapeAttr(row.name)}" data-payroll-name="${index}" aria-label="Nome do desconto">
    <div class="money-input"><span>R$</span><input inputmode="decimal" value="${inputMoney(row.value)}" data-payroll-value="${index}" placeholder="0,00"></div>
    <button class="remove-row" data-payroll-remove="${index}" aria-label="Remover">×</button>
  </div>`).join("");
}

function renderMonthMenu() {
  const menu = document.getElementById("monthMenu");
  menu.innerHTML = MONTHS.map((month, i) => `<button class="${i === selectedMonth ? "active" : ""}" data-month="${i}">${month.slice(0, 3)}</button>`).join("");
}

function setMonth(delta) {
  selectedMonth += delta;
  if (selectedMonth < 0) { selectedMonth = 11; selectedYear--; }
  if (selectedMonth > 11) { selectedMonth = 0; selectedYear++; }
  renderAll();
}

function switchView(view) {
  activeView = view;
  document.querySelectorAll(".view").forEach(el => el.classList.toggle("active", el.id === `view-${view}`));
  document.querySelectorAll(".nav-item[data-view]").forEach(el => el.classList.toggle("active", el.dataset.view === view));
  document.getElementById("sidebar").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (view === "overview") setTimeout(drawCashflowChart, 20);
}

function openEntry(type = "income") {
  document.getElementById("entryType").value = type;
  fillEntryCategories();
  document.getElementById("entryModal").hidden = false;
  setTimeout(() => document.getElementById("entryValue").focus(), 50);
}

function fillEntryCategories() {
  const type = document.getElementById("entryType").value;
  const groups = GROUPS.filter(g => g.type === type);
  document.getElementById("entryCategory").innerHTML = groups.map(group =>
    `<optgroup label="${group.title}">${getItems(group).map((name, index) => `<option value="${group.id}:${index}">${escapeHtml(name)}</option>`).join("")}</optgroup>`
  ).join("");
}

function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2200);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}
function escapeAttr(value) { return escapeHtml(value); }

async function initFirebase() {
  try {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
    const [appModule, authModule, firestoreModule] = await Promise.all([
      import(`${base}/firebase-app.js`),
      import(`${base}/firebase-auth.js`),
      import(`${base}/firebase-firestore.js`)
    ]);

    const firebaseApp = appModule.initializeApp(firebaseConfig);
    cloud.auth = authModule.getAuth(firebaseApp);
    cloud.db = firestoreModule.getFirestore(firebaseApp);
    cloud.services = {
      doc: firestoreModule.doc,
      getDoc: firestoreModule.getDoc,
      setDoc: firestoreModule.setDoc,
      serverTimestamp: firestoreModule.serverTimestamp,
      onSnapshot: firestoreModule.onSnapshot,
      createUserWithEmailAndPassword: authModule.createUserWithEmailAndPassword,
      signInWithEmailAndPassword: authModule.signInWithEmailAndPassword,
      signOut: authModule.signOut
    };

    authModule.onAuthStateChanged(cloud.auth, handleAuthChange);
  } catch (error) {
    console.error("Não foi possível carregar o Firebase:", error);
    setSaveStatus("local");
    document.getElementById("authMessage").textContent = "Não foi possível conectar ao Firebase. Verifique a internet.";
  }
}

async function handleAuthChange(user) {
  if (cloud.unsubscribe) {
    cloud.unsubscribe();
    cloud.unsubscribe = null;
  }
  cloud.user = user;
  cloud.ready = false;
  updateAuthUI();

  if (!user) {
    document.getElementById("authModal").hidden = false;
    setSaveStatus("local");
    return;
  }

  document.getElementById("authModal").hidden = true;
  const { doc, getDoc, onSnapshot } = cloud.services;
  const userDocument = doc(cloud.db, "users", user.uid);

  try {
    const snapshot = await getDoc(userDocument);
    if (snapshot.exists() && snapshot.data().state) {
      applyRemoteState(snapshot.data().state);
    }
    cloud.ready = true;
    if (!snapshot.exists()) queueCloudSave(0);
    else setSaveStatus("cloud");

    cloud.unsubscribe = onSnapshot(userDocument, remoteSnapshot => {
      if (!remoteSnapshot.exists() || !remoteSnapshot.data().state) return;
      const remoteState = normalizeState(remoteSnapshot.data().state);
      if (JSON.stringify(remoteState) !== JSON.stringify(state)) {
        state = remoteState;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        renderAll();
        toast("Dados atualizados pela nuvem.");
      }
      setSaveStatus("cloud");
    }, error => {
      console.error("Falha ao acompanhar dados do Firebase:", error);
      setSaveStatus("error");
    });
  } catch (error) {
    console.error("Falha ao carregar dados do Firebase:", error);
    cloud.ready = true;
    setSaveStatus("error");
  }
}

function applyRemoteState(remoteState) {
  state = normalizeState(remoteState);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderAll();
}

function updateAuthUI() {
  const signedIn = Boolean(cloud.user);
  document.body.classList.toggle("auth-locked", !signedIn);
  document.getElementById("authSignedOut").hidden = signedIn;
  document.getElementById("authSignedIn").hidden = !signedIn;
  document.getElementById("authCloseButton").hidden = !signedIn;
  document.getElementById("authTitle").textContent = signedIn ? "Conta do casal" : "Acesse o plano de vocês";
  document.getElementById("signedInEmail").textContent = cloud.user?.email || "";
  document.querySelector("#authButton span").textContent = signedIn ? "Sincronizado" : "Entrar";
  document.getElementById("authMessage").textContent = "";
  if (signedIn) setTimeout(drawCashflowChart, 20);
}

function authFields() {
  const emailInput = document.getElementById("authEmail");
  const passwordInput = document.getElementById("authPassword");
  if (!emailInput.reportValidity() || !passwordInput.reportValidity()) return null;
  return { email: emailInput.value.trim(), password: passwordInput.value };
}

function authErrorMessage(error) {
  const messages = {
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/email-already-in-use": "Este e-mail já possui uma conta. Use o botão Entrar.",
    "auth/invalid-email": "Digite um endereço de e-mail válido.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente novamente.",
    "auth/network-request-failed": "Sem conexão com a internet."
  };
  return messages[error?.code] || "Não foi possível concluir. Confira os dados e tente novamente.";
}

function optimizePhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const size = Math.min(image.naturalWidth, image.naturalHeight);
        const sourceX = (image.naturalWidth - size) / 2;
        // Em fotos verticais, prioriza a parte superior, onde normalmente está o rosto.
        const sourceY = image.naturalHeight > image.naturalWidth
          ? (image.naturalHeight - size) * 0.28
          : (image.naturalHeight - size) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 320;
        const context = canvas.getContext("2d");
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(image, sourceX, sourceY, size, size, 0, 0, 320, 320);
        resolve(canvas.toDataURL("image/jpeg", 0.84));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handlePhotoUpload(input, person) {
  const file = input.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) return toast("Escolha um arquivo de imagem.");
  if (file.size > 10 * 1024 * 1024) return toast("A imagem deve ter no máximo 10 MB.");
  try {
    pendingPhotos[person] = await optimizePhoto(file);
    renderSettingsPhotos();
    toast("Foto pronta. Clique em Salvar ajustes.");
  } catch {
    toast("Não foi possível processar esta imagem.");
  } finally {
    input.value = "";
  }
}

document.addEventListener("click", event => {
  const nav = event.target.closest("[data-view]");
  if (nav) switchView(nav.dataset.view);
  const viewLink = event.target.closest("[data-view-link]");
  if (viewLink) switchView(viewLink.dataset.viewLink);
  if (event.target.closest("[data-action='add-entry']")) openEntry();
  if (event.target.closest(".group-header")) event.target.closest(".budget-group").classList.toggle("collapsed");

  const add = event.target.closest("[data-add-row]");
  if (add) {
    const groupId = add.dataset.addRow;
    state.customItems[groupId] ||= [];
    state.customItems[groupId].push("Nova categoria");
    const group = GROUPS.find(item => item.id === groupId);
    const newIndex = group.items.length + state.customItems[groupId].length - 1;
    saveState();
    renderAll();

    const input = document.querySelector(`[data-category-name="${groupId}:${newIndex}"]`);
    if (input) {
      input.focus();
      input.select();
      input.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  const remove = event.target.closest("[data-remove-row]");
  if (remove) {
    const [groupId, rawIndex] = remove.dataset.removeRow.split(":");
    const group = GROUPS.find(g => g.id === groupId);
    const customIndex = Number(rawIndex) - group.items.length;
    if (confirm("Remover esta categoria e seus valores?")) {
      state.customItems[groupId].splice(customIndex, 1);
      Object.values(state.values).forEach(month => {
        const old = {};
        Object.entries(month).forEach(([k, v]) => {
          const [g, i] = k.split(":");
          if (g !== groupId) old[k] = v;
          else if (+i < +rawIndex) old[k] = v;
          else if (+i > +rawIndex) old[`${g}:${+i - 1}`] = v;
        });
        Object.keys(month).forEach(k => delete month[k]);
        Object.assign(month, old);
      });
      saveState(); renderAll();
    }
  }

  if (event.target.closest("#prevMonth")) setMonth(-1);
  if (event.target.closest("#nextMonth")) setMonth(1);
  if (event.target.closest("#monthPicker")) document.getElementById("monthMenu").hidden = !document.getElementById("monthMenu").hidden;
  const monthButton = event.target.closest("[data-month]");
  if (monthButton) { selectedMonth = Number(monthButton.dataset.month); document.getElementById("monthMenu").hidden = true; renderAll(); }
  if (event.target.closest("#prevYear")) { selectedYear--; renderAll(); }
  if (event.target.closest("#nextYear")) { selectedYear++; renderAll(); }
  if (event.target.closest("#menuButton")) document.getElementById("sidebar").classList.toggle("open");

  if (event.target.closest("#openSettings")) {
    document.getElementById("person1Name").value = state.settings.person1;
    document.getElementById("person2Name").value = state.settings.person2;
    document.getElementById("goalValue").value = inputMoney(state.settings.goal);
    pendingPhotos = {
      person1: state.settings.photo1 || "",
      person2: state.settings.photo2 || ""
    };
    renderSettingsPhotos();
    document.getElementById("settingsModal").hidden = false;
  }
  if (event.target.closest("#authButton")) {
    updateAuthUI();
    document.getElementById("authModal").hidden = false;
  }
  if (event.target.closest(".close-modal") || event.target.classList.contains("modal-backdrop")) {
    const backdrop = event.target.closest(".modal-backdrop");
    if (backdrop && (backdrop.id !== "authModal" || cloud.user)) backdrop.hidden = true;
  }

  if (event.target.closest("#copyPrevious")) {
    let prevMonth = selectedMonth - 1, prevYear = selectedYear;
    if (prevMonth < 0) { prevMonth = 11; prevYear--; }
    const source = state.values[key(prevYear, prevMonth)];
    if (!source) return toast("O mês anterior ainda não tem valores.");
    if (confirm(`Copiar os valores de ${MONTHS[prevMonth]} para ${MONTHS[selectedMonth]}?`)) {
      state.values[key()] = { ...source };
      saveState(); renderAll(); toast("Mês anterior copiado.");
    }
  }

  if (event.target.closest("#addPayroll")) {
    payrollRows().push({ name: "Novo desconto", value: 0 });
    saveState(); renderPayroll();
  }
  const payrollRemove = event.target.closest("[data-payroll-remove]");
  if (payrollRemove) { payrollRows().splice(Number(payrollRemove.dataset.payrollRemove), 1); saveState(); renderPayroll(); }
});

document.addEventListener("change", event => {
  if (event.target.matches("[data-budget], [data-quick]")) {
    const [group, index] = (event.target.dataset.budget || event.target.dataset.quick).split(":");
    setValue(group, Number(index), parseMoney(event.target.value));
  }
  if (event.target.matches("[data-owner]")) {
    state.owners[key()] ||= {};
    state.owners[key()][event.target.dataset.owner] = event.target.value;
    saveState();
  }
  if (event.target.matches("[data-category-name]")) {
    const [groupId, rawIndex] = event.target.dataset.categoryName.split(":");
    const group = GROUPS.find(g => g.id === groupId);
    state.customItems[groupId][Number(rawIndex) - group.items.length] = event.target.value.trim() || "Sem nome";
    saveState(); renderAll();
  }
  if (event.target.matches("[data-payroll-value]")) {
    payrollRows()[Number(event.target.dataset.payrollValue)].value = parseMoney(event.target.value);
    saveState(); renderPayroll();
  }
  if (event.target.matches("[data-payroll-name]")) {
    payrollRows()[Number(event.target.dataset.payrollName)].name = event.target.value.trim() || "Sem nome";
    saveState();
  }
  if (event.target.id === "entryType") fillEntryCategories();
});

document.getElementById("entryForm").addEventListener("submit", event => {
  event.preventDefault();
  const [group, index] = document.getElementById("entryCategory").value.split(":");
  const value = parseMoney(document.getElementById("entryValue").value);
  if (!value) return;
  setValue(group, Number(index), getValue(group, Number(index)) + value);
  state.owners[key()] ||= {};
  state.owners[key()][itemKey(group, index)] = document.getElementById("entryOwner").value;
  saveState();
  document.getElementById("entryValue").value = "";
  document.getElementById("entryModal").hidden = true;
  toast("Lançamento adicionado.");
});

document.getElementById("settingsForm").addEventListener("submit", event => {
  event.preventDefault();
  state.settings.person1 = document.getElementById("person1Name").value.trim() || "Você";
  state.settings.person2 = document.getElementById("person2Name").value.trim() || "Noiva";
  state.settings.goal = parseMoney(document.getElementById("goalValue").value);
  state.settings.photo1 = pendingPhotos.person1;
  state.settings.photo2 = pendingPhotos.person2;
  saveState(); renderAll();
  document.getElementById("settingsModal").hidden = true;
  toast("Ajustes salvos.");
});

document.getElementById("person1PhotoInput").addEventListener("change", event => handlePhotoUpload(event.target, "person1"));
document.getElementById("person2PhotoInput").addEventListener("change", event => handlePhotoUpload(event.target, "person2"));
document.getElementById("person1Name").addEventListener("input", renderSettingsPhotos);
document.getElementById("person2Name").addEventListener("input", renderSettingsPhotos);

document.getElementById("authForm").addEventListener("submit", async event => {
  event.preventDefault();
  const fields = authFields();
  if (!fields) return;
  const message = document.getElementById("authMessage");
  if (!cloud.services) {
    message.textContent = "A conexão com o Firebase ainda não está disponível.";
    return;
  }
  message.textContent = "Entrando…";
  try {
    await cloud.services.signInWithEmailAndPassword(cloud.auth, fields.email, fields.password);
    document.getElementById("authPassword").value = "";
    document.getElementById("authModal").hidden = true;
    toast("Conta conectada.");
  } catch (error) {
    message.textContent = authErrorMessage(error);
  }
});

document.getElementById("createAccountButton").addEventListener("click", async () => {
  const fields = authFields();
  if (!fields) return;
  const message = document.getElementById("authMessage");
  if (!cloud.services) {
    message.textContent = "A conexão com o Firebase ainda não está disponível.";
    return;
  }
  message.textContent = "Criando a conta…";
  try {
    await cloud.services.createUserWithEmailAndPassword(cloud.auth, fields.email, fields.password);
    document.getElementById("authPassword").value = "";
    document.getElementById("authModal").hidden = true;
    toast("Conta criada e sincronizada.");
  } catch (error) {
    message.textContent = authErrorMessage(error);
  }
});

document.getElementById("signOutButton").addEventListener("click", async () => {
  if (!cloud.services) return;
  await cloud.services.signOut(cloud.auth);
  toast("Você saiu da conta.");
});

document.getElementById("exportData").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `nosso-plano-${key()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

document.getElementById("importData").addEventListener("change", event => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state = { ...initialState(), ...JSON.parse(reader.result) };
      saveState(); renderAll(); toast("Dados importados.");
      document.getElementById("settingsModal").hidden = true;
    } catch { toast("Não foi possível ler este arquivo."); }
  };
  reader.readAsText(file);
});

document.getElementById("resetData").addEventListener("click", () => {
  if (confirm("Apagar todos os valores e ajustes? Esta ação não pode ser desfeita.")) {
    state = initialState(); saveState(); renderAll();
    document.getElementById("settingsModal").hidden = true;
    toast("Todos os dados foram apagados.");
  }
});

window.addEventListener("resize", () => activeView === "overview" && drawCashflowChart());
renderAll();
initFirebase();
