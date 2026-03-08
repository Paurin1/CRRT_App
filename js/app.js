/**
 * app.js – Main application logic for CRRT App
 */

'use strict';

/* ============================================================
   Configuration
   ============================================================ */
const CONFIG_KEY = 'crrt_app_config';

function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

/* ============================================================
   State
   ============================================================ */
const state = {
  selectedPatient: null,
  patients: [],
  patientData: [],
  isSignedIn: false,
  gapiReady: false,
  gisReady: false,
  tokenClient: null
};

/* ============================================================
   DOM References
   ============================================================ */
const $ = (id) => document.getElementById(id);

const dom = {
  // Auth
  signInBtn:        $('sign-in-btn'),
  signOutBtn:       $('sign-out-btn'),
  userInfo:         $('user-info'),
  userAvatar:       $('user-avatar'),
  userName:         $('user-name'),
  // Config modal
  configModal:      $('config-modal'),
  spreadsheetInput: $('spreadsheet-id-input'),
  clientIdInput:    $('client-id-input'),
  apiKeyInput:      $('api-key-input'),
  saveConfigBtn:    $('save-config-btn'),
  configError:      $('config-error'),
  // Banner
  patientBanner:    $('patient-banner'),
  bannerName:       $('banner-patient-name'),
  changePatientBtn: $('change-patient-btn'),
  // Main / Nav
  mainContent:      $('main-content'),
  bottomNav:        $('bottom-nav'),
  // Tab 1
  patientSearch:    $('patient-search'),
  patientList:      $('patient-list'),
  patientsLoading:  $('patients-loading'),
  patientsEmpty:    $('patients-empty'),
  refreshPatientsBtn: $('refresh-patients-btn'),
  // Tab 2
  noPatientSelected: $('no-patient-selected'),
  crrtForm:          $('crrt-form'),
  entryDate:         $('entry-date'),
  entryTime:         $('entry-time'),
  replacementMode:   $('replacement-mode'),
  prePostFields:     $('pre-post-fields'),
  anticoagType:      $('anticoag-type'),
  anticoagDoseGroup: $('anticoag-dose-group'),
  clearFormBtn:      $('clear-form-btn'),
  submitBtn:         $('submit-btn'),
  formError:         $('form-error'),
  formSuccess:       $('form-success'),
  // Tab 3
  noPatientSelectedView: $('no-patient-selected-view'),
  dataLoading:       $('data-loading'),
  dataEmpty:         $('data-empty'),
  dataContainer:     $('data-container'),
  summaryCards:      $('summary-cards'),
  dataTableBody:     $('data-table-body'),
  refreshDataBtn:    $('refresh-data-btn'),
  addFirstEntryBtn:  $('add-first-entry-btn'),
  // Toast
  toast:             $('toast')
};

/* ============================================================
   Toast Utility
   ============================================================ */
let _toastTimer = null;

function showToast(message, type = '', duration = 3000) {
  if (_toastTimer) clearTimeout(_toastTimer);
  dom.toast.textContent = message;
  dom.toast.className = `toast${type ? ` ${type}` : ''} show`;
  _toastTimer = setTimeout(() => {
    dom.toast.classList.remove('show');
  }, duration);
}

/* ============================================================
   Navigation / Tabs
   ============================================================ */
function switchTab(tabName) {
  document.querySelectorAll('.tab-content').forEach((el) => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach((el) => el.classList.remove('active'));

  $(`tab-${tabName}`).classList.add('active');
  document.querySelector(`.nav-item[data-tab="${tabName}"]`).classList.add('active');

  // Trigger data refresh when switching to view tab
  if (tabName === 'view' && state.selectedPatient) {
    loadPatientData();
  }
}

document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

/* ============================================================
   Google API Initialisation
   ============================================================ */
async function initGapiClient(apiKey) {
  await new Promise((resolve, reject) => {
    gapi.load('client', { callback: resolve, onerror: reject });
  });

  await gapi.client.init({
    apiKey,
    discoveryDocs: [SHEETS_API_DISCOVERY]
  });

  state.gapiReady = true;
}

function initGisClient(clientId) {
  state.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: (tokenResponse) => {
      if (tokenResponse.error) {
        showToast('Authentication failed: ' + tokenResponse.error, 'error');
        return;
      }
      state.isSignedIn = true;
      updateAuthUI();
      onSignedIn();
    }
  });
  state.gisReady = true;
}

/* ============================================================
   Auth UI
   ============================================================ */
function updateAuthUI() {
  if (state.isSignedIn) {
    dom.signInBtn.style.display = 'none';
    dom.userInfo.style.display = 'flex';
    dom.userInfo.style.alignItems = 'center';
    dom.userInfo.style.gap = '8px';
    dom.userAvatar.style.display = 'none';
    dom.userName.textContent = 'Signed In';
  } else {
    dom.signInBtn.style.display = '';
    dom.userInfo.style.display = 'none';
  }
}

dom.signInBtn.addEventListener('click', () => {
  if (!state.gisReady) {
    showToast('Authentication not ready yet. Please wait.', 'error');
    return;
  }
  state.tokenClient.requestAccessToken({ prompt: 'consent' });
});

dom.signOutBtn.addEventListener('click', () => {
  const token = gapi.client.getToken();
  if (token) {
    google.accounts.oauth2.revoke(token.access_token, () => {
      gapi.client.setToken(null);
      state.isSignedIn = false;
      state.selectedPatient = null;
      state.patients = [];
      state.patientData = [];
      updateAuthUI();
      updatePatientBanner();
      dom.mainContent.style.display = 'none';
      dom.bottomNav.style.display = 'none';
      showToast('Signed out successfully.');
    });
  }
});

/* ============================================================
   After Sign-in
   ============================================================ */
async function onSignedIn() {
  dom.mainContent.style.display = 'block';
  dom.bottomNav.style.display = 'flex';
  showToast('Signed in successfully!', 'success');

  const cfg = loadConfig();
  SheetsService.setSpreadsheetId(cfg.spreadsheetId);

  try {
    await SheetsService.ensureSheets();
  } catch (err) {
    console.error('ensureSheets error:', err);
  }

  await loadPatients();
}

/* ============================================================
   Patient Banner
   ============================================================ */
function updatePatientBanner() {
  if (state.selectedPatient) {
    dom.bannerName.textContent = state.selectedPatient.name;
    dom.patientBanner.style.display = 'flex';
    dom.mainContent.classList.add('has-banner');
  } else {
    dom.patientBanner.style.display = 'none';
    dom.mainContent.classList.remove('has-banner');
  }
}

dom.changePatientBtn.addEventListener('click', () => switchTab('patients'));

/* ============================================================
   Tab 1 – Patient List
   ============================================================ */
async function loadPatients() {
  dom.patientsLoading.style.display = 'flex';
  dom.patientsEmpty.style.display = 'none';
  dom.patientList.innerHTML = '';

  try {
    state.patients = await SheetsService.getPatients();
    renderPatients(state.patients);
  } catch (err) {
    console.error('loadPatients error:', err);
    showToast('Error loading patients: ' + (err.result?.error?.message || err.message || 'Unknown error'), 'error', 5000);
    dom.patientsLoading.style.display = 'none';
    dom.patientsEmpty.style.display = 'flex';
  }
}

function renderPatients(patients) {
  dom.patientsLoading.style.display = 'none';
  dom.patientList.innerHTML = '';

  if (!patients.length) {
    dom.patientsEmpty.style.display = 'flex';
    return;
  }
  dom.patientsEmpty.style.display = 'none';

  const fragment = document.createDocumentFragment();
  patients.forEach((patient) => {
    const li = document.createElement('li');
    li.className = 'patient-item' + (state.selectedPatient?.id === patient.id ? ' selected' : '');
    li.setAttribute('tabindex', '0');
    li.setAttribute('role', 'button');
    li.setAttribute('aria-label', `Select patient ${patient.name}`);

    const initials = patient.name
      .split(' ')
      .map((w) => w[0] || '')
      .slice(0, 2)
      .join('')
      .toUpperCase();

    li.innerHTML = `
      <div class="patient-avatar">${escapeHtml(initials)}</div>
      <div class="patient-info">
        <div class="patient-name">${escapeHtml(patient.name)}</div>
        <div class="patient-meta">
          ${patient.ward ? `Ward: ${escapeHtml(patient.ward)}` : ''}
          ${patient.dateOfBirth ? ` · DOB: ${escapeHtml(patient.dateOfBirth)}` : ''}
          ${patient.diagnosis ? ` · ${escapeHtml(patient.diagnosis)}` : ''}
        </div>
      </div>
      <div class="patient-chevron">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </div>
    `;

    const selectPatient = () => {
      state.selectedPatient = patient;
      updatePatientBanner();
      updateEntryTabVisibility();
      updateViewTabVisibility();
      renderPatients(filterPatients(dom.patientSearch.value));
      showToast(`Patient selected: ${patient.name}`, 'success');
      setTimeout(() => switchTab('entry'), 400);
    };

    li.addEventListener('click', selectPatient);
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectPatient();
      }
    });

    fragment.appendChild(li);
  });

  dom.patientList.appendChild(fragment);
}

function filterPatients(query) {
  const q = query.trim().toLowerCase();
  if (!q) return state.patients;
  return state.patients.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.ward.toLowerCase().includes(q) ||
      p.diagnosis.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q)
  );
}

dom.patientSearch.addEventListener('input', () => {
  renderPatients(filterPatients(dom.patientSearch.value));
});

dom.refreshPatientsBtn.addEventListener('click', loadPatients);

/* ============================================================
   Tab 2 – CRRT Entry Form
   ============================================================ */
function updateEntryTabVisibility() {
  if (state.selectedPatient) {
    dom.noPatientSelected.style.display = 'none';
    dom.crrtForm.style.display = 'flex';
    prefillDateTime();
  } else {
    dom.noPatientSelected.style.display = 'flex';
    dom.crrtForm.style.display = 'none';
  }
}

function prefillDateTime() {
  const now = new Date();
  dom.entryDate.value = now.toISOString().split('T')[0];
  dom.entryTime.value = now.toTimeString().slice(0, 5);
}

// Show/hide pre+post fraction fields
dom.replacementMode.addEventListener('change', () => {
  dom.prePostFields.style.display =
    dom.replacementMode.value === 'pre-post' ? 'block' : 'none';
});

// Show/hide anticoag dose
dom.anticoagType.addEventListener('change', () => {
  dom.anticoagDoseGroup.style.display =
    dom.anticoagType.value ? 'block' : 'none';
});

dom.clearFormBtn.addEventListener('click', () => {
  dom.crrtForm.reset();
  prefillDateTime();
  dom.prePostFields.style.display = 'none';
  dom.anticoagDoseGroup.style.display = 'none';
  dom.formError.style.display = 'none';
  dom.formSuccess.style.display = 'none';
  clearFormErrors();
});

dom.crrtForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  dom.formError.style.display = 'none';
  dom.formSuccess.style.display = 'none';
  clearFormErrors();

  if (!state.selectedPatient) {
    showAlert(dom.formError, 'Please select a patient first.');
    return;
  }

  // Basic validation
  if (!dom.entryDate.value) {
    markInvalid(dom.entryDate, dom.formError, 'Date is required.');
    return;
  }
  if (!dom.entryTime.value) {
    markInvalid(dom.entryTime, dom.formError, 'Time is required.');
    return;
  }

  const entry = {
    date:             dom.entryDate.value,
    time:             dom.entryTime.value,
    bloodFlow:        $('blood-flow').value,
    dialysateFlow:    $('dialysate-flow').value,
    substituteFlow:   $('substitute-flow').value,
    effluentRate:     $('effluent-rate').value,
    netFluidRemoval:  $('net-fluid-removal').value,
    replacementMode:  dom.replacementMode.value,
    preFraction:      $('pre-fraction').value,
    postFraction:     $('post-fraction').value,
    anticoagType:     dom.anticoagType.value,
    anticoagDose:     $('anticoag-dose').value,
    accessPressure:   $('access-pressure').value,
    returnPressure:   $('return-pressure').value,
    filterPressure:   $('filter-pressure').value,
    effluentPressure: $('effluent-pressure').value,
    tmp:              $('tmp').value,
    notes:            $('notes').value
  };

  // Show loading state
  dom.submitBtn.disabled = true;
  dom.submitBtn.querySelector('.btn-text').style.display = 'none';
  dom.submitBtn.querySelector('.btn-spinner').style.display = 'inline-flex';

  try {
    await SheetsService.appendCRRTEntry(state.selectedPatient.id, entry);
    showAlert(dom.formSuccess, 'Entry saved successfully!');
    showToast('Entry saved!', 'success');
    // Clear the form except date/time
    dom.crrtForm.reset();
    prefillDateTime();
    dom.prePostFields.style.display = 'none';
    dom.anticoagDoseGroup.style.display = 'none';
  } catch (err) {
    console.error('appendCRRTEntry error:', err);
    showAlert(dom.formError, 'Error saving entry: ' + (err.result?.error?.message || err.message || 'Unknown error'));
  } finally {
    dom.submitBtn.disabled = false;
    dom.submitBtn.querySelector('.btn-text').style.display = '';
    dom.submitBtn.querySelector('.btn-spinner').style.display = 'none';
  }
});

function markInvalid(input, errorEl, msg) {
  input.classList.add('invalid');
  showAlert(errorEl, msg);
  input.focus();
}

function clearFormErrors() {
  document.querySelectorAll('.form-control.invalid').forEach((el) => el.classList.remove('invalid'));
}

function showAlert(el, msg) {
  el.textContent = msg;
  el.style.display = 'block';
}

/* ============================================================
   Tab 3 – View Patient Data
   ============================================================ */
function updateViewTabVisibility() {
  if (state.selectedPatient) {
    dom.noPatientSelectedView.style.display = 'none';
  } else {
    dom.noPatientSelectedView.style.display = 'flex';
    dom.dataLoading.style.display = 'none';
    dom.dataEmpty.style.display = 'none';
    dom.dataContainer.style.display = 'none';
  }
}

async function loadPatientData() {
  if (!state.selectedPatient) return;

  dom.dataLoading.style.display = 'flex';
  dom.dataEmpty.style.display = 'none';
  dom.dataContainer.style.display = 'none';

  try {
    state.patientData = await SheetsService.getPatientData(state.selectedPatient.id);
    renderPatientData(state.patientData);
  } catch (err) {
    console.error('loadPatientData error:', err);
    showToast('Error loading data: ' + (err.result?.error?.message || err.message || 'Unknown error'), 'error', 5000);
    dom.dataLoading.style.display = 'none';
    dom.dataEmpty.style.display = 'flex';
  }
}

function renderPatientData(data) {
  dom.dataLoading.style.display = 'none';

  if (!data.length) {
    dom.dataEmpty.style.display = 'flex';
    dom.dataContainer.style.display = 'none';
    return;
  }

  dom.dataEmpty.style.display = 'none';
  dom.dataContainer.style.display = 'block';

  renderSummaryCards(data);
  renderDataTable(data);
}

function renderSummaryCards(data) {
  // Show latest values for key metrics
  const latest = data[0]; // already sorted descending

  const metrics = [
    { label: 'Blood Flow (mL/min)', value: latest.bloodFlow, unit: '' },
    { label: 'Dialysate Flow (mL/h)', value: latest.dialysateFlow, unit: '' },
    { label: 'Substitute Flow (mL/h)', value: latest.substituteFlow, unit: '' },
    { label: 'Effluent Rate (mL/h)', value: latest.effluentRate, unit: '' },
    { label: 'Net Fluid (mL/h)', value: latest.netFluidRemoval, unit: '' },
    { label: 'TMP (mmHg)', value: latest.tmp, unit: '' }
  ];

  dom.summaryCards.innerHTML = metrics
    .map(
      (m) => `
      <div class="summary-card">
        <div class="summary-card-value">${escapeHtml(m.value || '—')}</div>
        <div class="summary-card-label">${escapeHtml(m.label)}</div>
      </div>`
    )
    .join('');
}

function renderDataTable(data) {
  dom.dataTableBody.innerHTML = '';
  const fragment = document.createDocumentFragment();

  data.forEach((row) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="sticky-col">${escapeHtml(row.date)}<br/><small>${escapeHtml(row.time)}</small></td>
      <td>${escapeHtml(row.bloodFlow)}</td>
      <td>${escapeHtml(row.dialysateFlow)}</td>
      <td>${escapeHtml(row.substituteFlow)}</td>
      <td>${escapeHtml(row.effluentRate)}</td>
      <td>${escapeHtml(row.netFluidRemoval)}</td>
      <td>${escapeHtml(row.replacementMode)}</td>
      <td>${escapeHtml(row.anticoagType)}</td>
      <td>${escapeHtml(row.anticoagDose)}</td>
      <td>${escapeHtml(row.accessPressure)}</td>
      <td>${escapeHtml(row.returnPressure)}</td>
      <td>${escapeHtml(row.filterPressure)}</td>
      <td>${escapeHtml(row.tmp)}</td>
      <td class="notes-cell">${escapeHtml(row.notes)}</td>
    `;
    fragment.appendChild(tr);
  });

  dom.dataTableBody.appendChild(fragment);
}

dom.refreshDataBtn.addEventListener('click', loadPatientData);

dom.addFirstEntryBtn.addEventListener('click', () => switchTab('entry'));

/* ============================================================
   Configuration Modal
   ============================================================ */
function showConfigModal() {
  const cfg = loadConfig();
  if (cfg.spreadsheetId) dom.spreadsheetInput.value = cfg.spreadsheetId;
  if (cfg.clientId) dom.clientIdInput.value = cfg.clientId;
  if (cfg.apiKey) dom.apiKeyInput.value = cfg.apiKey;
  dom.configModal.style.display = 'flex';
}

dom.saveConfigBtn.addEventListener('click', async () => {
  dom.configError.style.display = 'none';

  const spreadsheetId = dom.spreadsheetInput.value.trim();
  const clientId      = dom.clientIdInput.value.trim();
  const apiKey        = dom.apiKeyInput.value.trim();

  if (!spreadsheetId || !clientId || !apiKey) {
    dom.configError.textContent = 'All fields are required.';
    dom.configError.style.display = 'block';
    return;
  }

  saveConfig({ spreadsheetId, clientId, apiKey });
  SheetsService.setSpreadsheetId(spreadsheetId);
  dom.configModal.style.display = 'none';

  // Initialise APIs with the new config
  await bootApis(clientId, apiKey);
});

/* ============================================================
   Boot Sequence
   ============================================================ */
async function bootApis(clientId, apiKey) {
  try {
    await initGapiClient(apiKey);
  } catch (err) {
    console.error('gapi init error:', err);
    showToast('Failed to initialise Google API. Check your API Key.', 'error', 6000);
    return;
  }

  // Wait for GIS script to be available (with 10-second timeout)
  try {
    if (!window.google?.accounts?.oauth2) {
      await new Promise((resolve, reject) => {
        const maxWaitMs = 10000;
        const intervalMs = 100;
        let elapsed = 0;
        const check = setInterval(() => {
          if (window.google?.accounts?.oauth2) {
            clearInterval(check);
            resolve();
          } else {
            elapsed += intervalMs;
            if (elapsed >= maxWaitMs) {
              clearInterval(check);
              reject(new Error('Google Identity Services library failed to load.'));
            }
          }
        }, intervalMs);
      });
    }
  } catch (err) {
    console.error('GIS load error:', err);
    showToast('Failed to load Google Identity Services. Check your network connection.', 'error', 6000);
    return;
  }

  initGisClient(clientId);
  dom.signInBtn.style.display = '';
  showToast('Ready! Please sign in to continue.', '', 4000);
}

async function init() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/service-worker.js');
    } catch (err) {
      console.warn('Service Worker registration failed:', err);
    }
  }

  const cfg = loadConfig();

  if (!cfg.spreadsheetId || !cfg.clientId || !cfg.apiKey) {
    // First run – show config modal
    showConfigModal();
    return;
  }

  SheetsService.setSpreadsheetId(cfg.spreadsheetId);

  // Wait for Google API script to load (check synchronously first to avoid race condition)
  if (!window.gapiLoaded && !window.gapi) {
    await new Promise((resolve) => window.addEventListener('gapiloaded', resolve, { once: true }));
  }

  await bootApis(cfg.clientId, cfg.apiKey);
}

/* ============================================================
   Utility: HTML escaping
   ============================================================ */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/* ============================================================
   Kick off
   ============================================================ */
document.addEventListener('DOMContentLoaded', init);
