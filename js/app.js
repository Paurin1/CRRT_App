/**
 * app.js – Main application logic for CRRT App
 */

'use strict';

/* ============================================================
   Configuration
   ============================================================ */
const CONFIG_KEY = 'crrt_app_config';
const AUTH_TOKEN_KEY = 'crrt_auth_token';
const DEMO_MODE = false;
const APP_CONFIG = {
  // Opcjonalnie wpisz stale wartosci; jesli puste, uzyte zostana wartosci zapisane lokalnie.
  spreadsheetId: '1hsWeExrncj8VzlBs5JGnLNjq1lGp0ZgGt8rP4qkMUCo',
  clientId: '960349410634-eq43gumars9iulh99nc1bud6jnldifuo.apps.googleusercontent.com',
  apiKey: 'AIzaSyC9yniKMo_Kks_-TUgQN0oXt9Swnx-RwcU'
};

const DEMO_PATIENTS = [
  {
    id: 'P-001',
    name: 'Anna Kowalska',
    dateOfBirth: '1978-04-12',
    ward: 'ICU',
    diagnosis: 'Septic shock',
    admissionDate: '2026-03-30',
    notes: ''
  },
  {
    id: 'P-002',
    name: 'Jan Nowak',
    dateOfBirth: '1965-11-02',
    ward: 'Nephrology',
    diagnosis: 'AKI',
    admissionDate: '2026-04-01',
    notes: ''
  },
  {
    id: 'P-003',
    name: 'Maria Wisniewska',
    dateOfBirth: '1959-08-19',
    ward: 'ICU',
    diagnosis: 'Cardiogenic shock',
    admissionDate: '2026-04-02',
    notes: ''
  }
];

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

function getRuntimeConfig() {
  const stored = loadConfig();
  return {
    spreadsheetId: APP_CONFIG.spreadsheetId || stored.spreadsheetId || '',
    clientId: APP_CONFIG.clientId || stored.clientId || '',
    apiKey: APP_CONFIG.apiKey || stored.apiKey || ''
  };
}

function getDemoEntriesKey(patientId) {
  return `crrt_demo_entries_${patientId}`;
}

function loadDemoEntries(patientId) {
  try {
    const raw = localStorage.getItem(getDemoEntriesKey(patientId));
    const entries = raw ? JSON.parse(raw) : [];
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

function saveDemoEntries(patientId, entries) {
  localStorage.setItem(getDemoEntriesKey(patientId), JSON.stringify(entries));
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
  tokenClient: null,
  tokenRefreshTimer: null
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
  addPatientBtn:    $('add-patient-btn'),
  addFirstPatientBtn: $('add-first-patient-btn'),
  refreshPatientsBtn: $('refresh-patients-btn'),
  addPatientModal:  $('add-patient-modal'),
  addPatientForm:   $('add-patient-form'),
  newFirstName:     $('new-first-name'),
  newLastName:      $('new-last-name'),
  newDob:           $('new-dob'),
  newPesel:         $('new-pesel'),
  newSex:           $('new-sex'),
  newWeight:        $('new-weight'),
  newHeight:        $('new-height'),
  newCaseNumber:    $('new-case-number'),
  newMachine:       $('new-machine'),
  newSet:           $('new-set'),
  newScheme:        $('new-scheme'),
  newCvcSite:       $('new-cvc-site'),
  addPatientError:  $('add-patient-error'),
  cancelAddPatientBtn: $('cancel-add-patient-btn'),
  savePatientBtn:   $('save-patient-btn'),
  // Tab 2
  noPatientSelected: $('no-patient-selected'),
  crrtForm:          $('crrt-form'),
  entryDate:         $('entry-date'),
  entryTime:         $('entry-time'),
  bloodFlow:         $('blood-flow'),
  substituteFlow:    $('substitute-flow'),
  dialysateFlow:     $('dialysate-flow'),
  ultrafiltration:   $('ultrafiltration'),
  dialysisDose:      $('dialysis-dose'),
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
    callback: () => {}
  });
  state.gisReady = true;
}

function saveAuthToken(tokenResponse) {
  if (!tokenResponse?.access_token) return;
  const expiresIn = Number(tokenResponse.expires_in || 3600);
  const expiresAt = Date.now() + expiresIn * 1000;
  localStorage.setItem(
    AUTH_TOKEN_KEY,
    JSON.stringify({
      access_token: tokenResponse.access_token,
      expiresAt
    })
  );
}

function loadAuthToken() {
  try {
    const raw = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!raw) return null;
    const token = JSON.parse(raw);
    if (!token?.access_token || !token?.expiresAt) return null;
    return token;
  } catch {
    return null;
  }
}

function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

function clearTokenRefreshTimer() {
  if (state.tokenRefreshTimer) {
    clearTimeout(state.tokenRefreshTimer);
    state.tokenRefreshTimer = null;
  }
}

function scheduleTokenRefresh(expiresInSeconds) {
  clearTokenRefreshTimer();
  const safeExpiresIn = Number(expiresInSeconds || 3600);
  const refreshInMs = Math.max(30000, (safeExpiresIn - 120) * 1000);
  state.tokenRefreshTimer = setTimeout(async () => {
    try {
      await requestAccessToken('', { silent: true });
    } catch {
      clearAuthToken();
      lockAppForAuth();
      showToast('Sesja wygasla. Zaloguj sie ponownie.', 'error', 6000);
    }
  }, refreshInMs);
}

function lockAppForAuth() {
  clearTokenRefreshTimer();
  state.isSignedIn = false;
  state.selectedPatient = null;
  state.patients = [];
  state.patientData = [];
  try {
    if (window.gapi?.client) {
      gapi.client.setToken(null);
    }
  } catch {
    // Ignore token reset errors.
  }
  updateAuthUI();
  updatePatientBanner();
  updateEntryTabVisibility();
  updateViewTabVisibility();
  dom.mainContent.style.display = 'none';
  dom.bottomNav.style.display = 'none';
}

async function applySignedInSession(tokenResponse, options = {}) {
  const { silent = false } = options;
  gapi.client.setToken({ access_token: tokenResponse.access_token });
  saveAuthToken(tokenResponse);
  scheduleTokenRefresh(tokenResponse.expires_in);
  state.isSignedIn = true;
  updateAuthUI();
  await onSignedIn({ silent });
}

function requestAccessToken(promptValue, options = {}) {
  const { silent = false } = options;
  return new Promise((resolve, reject) => {
    if (!state.gisReady || !state.tokenClient) {
      reject(new Error('GIS not ready'));
      return;
    }

    state.tokenClient.callback = async (tokenResponse) => {
      if (tokenResponse.error) {
        if (!silent) {
          showToast('Logowanie nie powiodlo sie: ' + tokenResponse.error, 'error');
        }
        reject(new Error(tokenResponse.error));
        return;
      }

      try {
        await applySignedInSession(tokenResponse, { silent });
        resolve(tokenResponse);
      } catch (err) {
        reject(err);
      }
    };

    state.tokenClient.requestAccessToken({ prompt: promptValue });
  });
}

async function tryRestoreSession() {
  const storedToken = loadAuthToken();

  if (storedToken && storedToken.expiresAt > Date.now() + 60000) {
    await applySignedInSession(
      {
        access_token: storedToken.access_token,
        expires_in: Math.floor((storedToken.expiresAt - Date.now()) / 1000)
      },
      { silent: true }
    );
    return true;
  }

  clearAuthToken();

  try {
    await requestAccessToken('', { silent: true });
    return true;
  } catch {
    return false;
  }
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
    dom.userName.textContent = 'Zalogowano';
  } else {
    dom.signInBtn.style.display = '';
    dom.userInfo.style.display = 'none';
  }
}

dom.signInBtn.addEventListener('click', () => {
  if (!state.gisReady) {
    showToast('Logowanie nie jest jeszcze gotowe. Poczekaj chwile.', 'error');
    return;
  }

  showToast('Wybierz konto Google, aby sie zalogowac.', '', 3000);
  requestAccessToken('select_account').catch(() => {
    // User might have closed the popup or denied consent.
  });
});

dom.signOutBtn.addEventListener('click', () => {
  const token = gapi.client.getToken() || loadAuthToken();
  const finalizeSignOut = () => {
    clearAuthToken();
    lockAppForAuth();
    showToast('Wylogowano pomyslnie.');
  };

  if (token?.access_token) {
    google.accounts.oauth2.revoke(token.access_token, finalizeSignOut);
    return;
  }

  finalizeSignOut();
});

/* ============================================================
   After Sign-in
   ============================================================ */
async function onSignedIn(options = {}) {
  const { silent = false } = options;
  dom.mainContent.style.display = 'block';
  dom.bottomNav.style.display = 'flex';
  if (!silent) {
    showToast('Zalogowano pomyslnie.', 'success');
  }

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

function showAddPatientModal() {
  if (!dom.addPatientModal) return;
  dom.addPatientForm.reset();
  dom.addPatientError.style.display = 'none';
  dom.addPatientModal.style.display = 'flex';
}

function hideAddPatientModal() {
  if (!dom.addPatientModal) return;
  dom.addPatientModal.style.display = 'none';
}

function validateCaseNumber(value) {
  return /^\d{6}\/\d{4}$/.test(value);
}

async function submitNewPatient(e) {
  e.preventDefault();
  dom.addPatientError.style.display = 'none';

  const firstName = dom.newFirstName.value.trim();
  const lastName = dom.newLastName.value.trim();
  const dateOfBirth = dom.newDob.value;
  const pesel = dom.newPesel.value.trim();
  const sex = dom.newSex.value;
  const weightKg = dom.newWeight.value;
  const heightCm = dom.newHeight.value;
  const caseNumber = dom.newCaseNumber.value.trim();
  const machine = dom.newMachine.value;
  const set = dom.newSet.value.trim();
  const scheme = dom.newScheme.value.trim();
  const cvcAccessSite = dom.newCvcSite.value.trim();

  if (!firstName || !lastName) {
    showAlert(dom.addPatientError, 'Imie i nazwisko sa wymagane.');
    return;
  }

  if (!dateOfBirth && !pesel) {
    showAlert(dom.addPatientError, 'Podaj date urodzenia lub PESEL.');
    return;
  }

  if (pesel && !/^\d{11}$/.test(pesel)) {
    showAlert(dom.addPatientError, 'PESEL musi miec 11 cyfr.');
    return;
  }

  if (!validateCaseNumber(caseNumber)) {
    showAlert(dom.addPatientError, 'Numer historii choroby musi miec format xxxxxx/YYYY.');
    return;
  }

  const patientPayload = {
    id: caseNumber,
    firstName,
    lastName,
    name: `${firstName} ${lastName}`,
    dateOfBirth,
    pesel,
    sex,
    weightKg,
    heightCm,
    caseNumber,
    machine,
    set,
    scheme,
    cvcAccessSite,
    notes: ''
  };

  dom.savePatientBtn.disabled = true;
  try {
    if (DEMO_MODE) {
      state.patients.unshift(patientPayload);
    } else {
      await SheetsService.addPatient(patientPayload);
      await loadPatients();
    }

    const freshPatient = state.patients.find((p) => p.id === patientPayload.id) || patientPayload;
    state.selectedPatient = freshPatient;
    updatePatientBanner();
    updateEntryTabVisibility();
    updateViewTabVisibility();
    renderPatients(filterPatients(dom.patientSearch.value));
    hideAddPatientModal();
    showToast('Dodano nowego pacjenta.', 'success');
    setTimeout(() => switchTab('entry'), 250);
  } catch (err) {
    console.error('addPatient error:', err);
    showAlert(dom.addPatientError, 'Blad zapisu pacjenta: ' + (err.result?.error?.message || err.message || 'Nieznany blad'));
  } finally {
    dom.savePatientBtn.disabled = false;
  }
}

if (dom.addPatientBtn) dom.addPatientBtn.addEventListener('click', showAddPatientModal);
if (dom.addFirstPatientBtn) dom.addFirstPatientBtn.addEventListener('click', showAddPatientModal);
if (dom.cancelAddPatientBtn) dom.cancelAddPatientBtn.addEventListener('click', hideAddPatientModal);
if (dom.addPatientForm) dom.addPatientForm.addEventListener('submit', submitNewPatient);

/* ============================================================
   Tab 1 – Patient List
   ============================================================ */
async function loadPatients() {
  dom.patientsLoading.style.display = 'flex';
  dom.patientsEmpty.style.display = 'none';
  dom.patientList.innerHTML = '';

  try {
    if (DEMO_MODE) {
      state.patients = DEMO_PATIENTS;
    } else {
      state.patients = await SheetsService.getPatients();
    }
    renderPatients(state.patients);
  } catch (err) {
    console.error('loadPatients error:', err);
    showToast('Blad ladowania pacjentow: ' + (err.result?.error?.message || err.message || 'Nieznany blad'), 'error', 5000);
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
          ${patient.caseNumber ? `Nr historii: ${escapeHtml(patient.caseNumber)}` : ''}
          ${patient.pesel ? ` · PESEL: ${escapeHtml(patient.pesel)}` : ''}
          ${patient.dateOfBirth ? ` · ur. ${escapeHtml(patient.dateOfBirth)}` : ''}
          ${patient.sex ? ` · ${escapeHtml(patient.sex)}` : ''}
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
      showToast(`Wybrano pacjenta: ${patient.name}`, 'success');
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
      (p.firstName || '').toLowerCase().includes(q) ||
      (p.lastName || '').toLowerCase().includes(q) ||
      (p.caseNumber || '').toLowerCase().includes(q) ||
      (p.pesel || '').toLowerCase().includes(q) ||
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

function calculateDialysisDose() {
  const substitute = Number(dom.substituteFlow?.value || 0);
  const dialysate = Number(dom.dialysateFlow?.value || 0);
  const uf = Number(dom.ultrafiltration?.value || 0);
  const dose = substitute + dialysate + uf;
  if (dom.dialysisDose) {
    dom.dialysisDose.value = Number.isFinite(dose) ? String(dose) : '';
  }
}

[dom.substituteFlow, dom.dialysateFlow, dom.ultrafiltration].forEach((el) => {
  if (el) {
    el.addEventListener('input', calculateDialysisDose);
  }
});

dom.clearFormBtn.addEventListener('click', () => {
  dom.crrtForm.reset();
  prefillDateTime();
  calculateDialysisDose();
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
    showAlert(dom.formError, 'Najpierw wybierz pacjenta.');
    return;
  }

  // Basic validation
  if (!dom.entryDate.value) {
    markInvalid(dom.entryDate, dom.formError, 'Pole data jest wymagane.');
    return;
  }
  if (!dom.entryTime.value) {
    markInvalid(dom.entryTime, dom.formError, 'Pole godzina jest wymagane.');
    return;
  }

  const entry = {
    date:             dom.entryDate.value,
    time:             dom.entryTime.value,
    substituteFlow:   $('substitute-flow').value,
    bloodFlow:        $('blood-flow').value,
    dialysateFlow:    $('dialysate-flow').value,
    citrateDose:      $('citrate-dose').value,
    calciumDose:      $('calcium-dose').value,
    ultrafiltration:  $('ultrafiltration').value,
    postFilterCa:     $('post-filter-ca').value,
    patientCa:        $('patient-ca').value,
    dialysisDose:     $('dialysis-dose').value,
    be:               $('be').value,
    hco3:             $('hco3').value,
    ph:               $('ph').value,
    enteredBy:        $('entered-by').value,
    notes:            $('notes').value
  };

  // Show loading state
  dom.submitBtn.disabled = true;
  dom.submitBtn.querySelector('.btn-text').style.display = 'none';
  dom.submitBtn.querySelector('.btn-spinner').style.display = 'inline-flex';

  try {
    if (DEMO_MODE) {
      const demoEntries = loadDemoEntries(state.selectedPatient.id);
      demoEntries.unshift({ patientId: state.selectedPatient.id, ...entry });
      saveDemoEntries(state.selectedPatient.id, demoEntries);
    } else {
      await SheetsService.appendCRRTEntry(state.selectedPatient.id, entry);
    }
    showAlert(dom.formSuccess, 'Entry saved successfully!');
    showToast('Wpis zapisany.', 'success');
    // Clear the form except date/time
    dom.crrtForm.reset();
    prefillDateTime();
    calculateDialysisDose();
  } catch (err) {
    console.error('appendCRRTEntry error:', err);
    showAlert(dom.formError, 'Blad zapisu wpisu: ' + (err.result?.error?.message || err.message || 'Nieznany blad'));
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
    if (DEMO_MODE) {
      state.patientData = loadDemoEntries(state.selectedPatient.id)
        .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`));
    } else {
      state.patientData = await SheetsService.getPatientData(state.selectedPatient.id);
    }
    renderPatientData(state.patientData);
  } catch (err) {
    console.error('loadPatientData error:', err);
    showToast('Blad ladowania danych: ' + (err.result?.error?.message || err.message || 'Nieznany blad'), 'error', 5000);
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
    { label: 'Krew (ml/min)', value: latest.bloodFlow, unit: '' },
    { label: 'Substytut (ml/h)', value: latest.substituteFlow, unit: '' },
    { label: 'Dializat (ml/h)', value: latest.dialysateFlow, unit: '' },
    { label: 'UF (ml/h)', value: latest.ultrafiltration, unit: '' },
    { label: 'Dawka dializy (ml/h)', value: latest.dialysisDose, unit: '' },
    { label: 'Ca2+ pacjenta (mmol/l)', value: latest.patientCa, unit: '' }
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
      <td>${escapeHtml(row.substituteFlow)}</td>
      <td>${escapeHtml(row.dialysateFlow)}</td>
      <td>${escapeHtml(row.citrateDose)}</td>
      <td>${escapeHtml(row.calciumDose)}</td>
      <td>${escapeHtml(row.ultrafiltration)}</td>
      <td>${escapeHtml(row.postFilterCa)}</td>
      <td>${escapeHtml(row.patientCa)}</td>
      <td>${escapeHtml(row.dialysisDose)}</td>
      <td>${escapeHtml(row.be)}</td>
      <td>${escapeHtml(row.hco3)}</td>
      <td>${escapeHtml(row.ph)}</td>
      <td>${escapeHtml(row.enteredBy)}</td>
      <td class="notes-cell">${escapeHtml(row.notes)}</td>
    `;
    fragment.appendChild(tr);
  });

  dom.dataTableBody.appendChild(fragment);
}

dom.refreshDataBtn.addEventListener('click', loadPatientData);

dom.addFirstEntryBtn.addEventListener('click', () => switchTab('entry'));

/* ============================================================
   Boot Sequence
   ============================================================ */
async function bootApis(clientId, apiKey) {
  try {
    await initGapiClient(apiKey);
  } catch (err) {
    console.error('gapi init error:', err);
    showToast('Nie udalo sie uruchomic Google API. Sprawdz klucz API.', 'error', 6000);
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
              reject(new Error('Nie udalo sie zaladowac biblioteki Google Identity Services.'));
            }
          }
        }, intervalMs);
      });
    }
  } catch (err) {
    console.error('GIS load error:', err);
    showToast('Nie udalo sie zaladowac Google Identity Services. Sprawdz polaczenie sieciowe.', 'error', 6000);
    return;
  }

  initGisClient(clientId);
  const restored = await tryRestoreSession();
  if (!restored) {
    dom.signInBtn.style.display = '';
    showToast('Gotowe. Zaloguj sie, aby kontynuowac.', '', 4000);
  }
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

  if (DEMO_MODE) {
    // Preview mode: show UI without Google configuration/auth.
    dom.configModal.style.display = 'none';
    dom.signInBtn.style.display = 'none';
    dom.userInfo.style.display = 'none';
    dom.mainContent.style.display = 'block';
    dom.bottomNav.style.display = 'flex';
    prefillDateTime();
    calculateDialysisDose();
    updateEntryTabVisibility();
    updateViewTabVisibility();
    await loadPatients();
    showToast('Tryb podgladu wlaczony. Google Sheets jest tymczasowo wylaczone.', 'success', 4500);
    return;
  }

  if (dom.configModal) {
    dom.configModal.style.display = 'none';
  }

  const cfg = getRuntimeConfig();

  if (!cfg.spreadsheetId || !cfg.clientId || !cfg.apiKey) {
    dom.signInBtn.style.display = 'none';
    showToast('Brak konfiguracji aplikacji (Spreadsheet ID / Client ID / API Key). Ustaw je w APP_CONFIG w js/app.js.', 'error', 10000);
    return;
  }

  saveConfig(cfg);

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
