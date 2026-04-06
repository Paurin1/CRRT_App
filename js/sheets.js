/**
 * sheets.js – Google Sheets API integration for CRRT App
 *
 * Expected spreadsheet structure:
 *
 *  Sheet: "Patients"
 *  Columns: PatientID | FirstName | LastName | DateOfBirth | PESEL | Sex |
 *           WeightKg | HeightCm | CaseNumber | Machine | Set | Scheme | CvcAccessSite | Notes
 *
 *  Sheet: "CRRT_Data"
 *  Columns: PatientID | Date | Time | BloodFlow | SubstituteFlow | DialysateFlow |
 *           CitrateDose | CalciumDose | Ultrafiltration | PostFilterCa | PatientCa |
 *           DialysisDose | BE | HCO3 | pH | EnteredBy | Notes
 */

const SHEETS_API_DISCOVERY = 'https://sheets.googleapis.com/$discovery/rest?version=v4';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

/** Sheets service exposed globally for use by app.js */
const SheetsService = (() => {
  // Sheet / range constants
  const PATIENTS_RANGE = 'Patients!A2:N';
  const PATIENTS_APPEND_RANGE = 'Patients!A:N';
  const CRRT_DATA_RANGE = 'CRRT_Data!A2:Q';
  const CRRT_DATA_APPEND_RANGE = 'CRRT_Data!A:Q';

  const PATIENTS_HEADERS = [
    'PatientID', 'FirstName', 'LastName', 'DateOfBirth', 'PESEL', 'Sex',
    'WeightKg', 'HeightCm', 'CaseNumber', 'Machine', 'Set', 'Scheme', 'CvcAccessSite', 'Notes'
  ];
  const CRRT_HEADERS = [
    'PatientID', 'Date', 'Time', 'BloodFlow', 'SubstituteFlow', 'DialysateFlow',
    'CitrateDose', 'CalciumDose', 'Ultrafiltration', 'PostFilterCa', 'PatientCa',
    'DialysisDose', 'BE', 'HCO3', 'pH', 'EnteredBy', 'Notes'
  ];

  let _spreadsheetId = null;

  /** Set the spreadsheet ID */
  function setSpreadsheetId(id) {
    _spreadsheetId = id;
  }

  /** Get the current spreadsheet ID */
  function getSpreadsheetId() {
    return _spreadsheetId;
  }

  /**
   * Ensure both sheets exist; create them with header rows if missing.
   */
  async function ensureSheets() {
    if (!_spreadsheetId) throw new Error('Spreadsheet ID not configured.');

    // Fetch existing sheet names
    const meta = await gapi.client.sheets.spreadsheets.get({
      spreadsheetId: _spreadsheetId,
      fields: 'sheets.properties.title'
    });

    const existingTitles = meta.result.sheets.map((s) => s.properties.title);
    const requests = [];

    if (!existingTitles.includes('Patients')) {
      requests.push({ addSheet: { properties: { title: 'Patients' } } });
    }
    if (!existingTitles.includes('CRRT_Data')) {
      requests.push({ addSheet: { properties: { title: 'CRRT_Data' } } });
    }

    if (requests.length > 0) {
      await gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: _spreadsheetId,
        resource: { requests }
      });
    }

    // Write headers to any newly created sheets
    const valueUpdates = [];

    if (!existingTitles.includes('Patients')) {
      valueUpdates.push({
        range: 'Patients!A1',
        values: [PATIENTS_HEADERS]
      });
    }
    if (!existingTitles.includes('CRRT_Data')) {
      valueUpdates.push({
        range: 'CRRT_Data!A1',
        values: [CRRT_HEADERS]
      });
    }

    if (valueUpdates.length > 0) {
      await gapi.client.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: _spreadsheetId,
        resource: {
          valueInputOption: 'RAW',
          data: valueUpdates
        }
      });
    }
  }

  /**
   * Fetch all patients from the Patients sheet.
   * @returns {Promise<Array<{id, name, dateOfBirth, ward, diagnosis, admissionDate, notes}>>}
   */
  async function getPatients() {
    if (!_spreadsheetId) throw new Error('Spreadsheet ID not configured.');

    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: _spreadsheetId,
      range: PATIENTS_RANGE
    });

    const rows = response.result.values || [];
    return rows
      .filter((row) => row[0])
      .map((row) => {
        // Backward compatibility: old rows had [PatientID, Name, DateOfBirth, Ward, Diagnosis, AdmissionDate, Notes]
        const isLegacyShape = row.length <= 7;
        if (isLegacyShape) {
          return {
            id: row[0] || '',
            firstName: row[1] || '',
            lastName: '',
            name: row[1] || '',
            dateOfBirth: row[2] || '',
            pesel: '',
            sex: '',
            weightKg: '',
            heightCm: '',
            caseNumber: '',
            machine: '',
            set: '',
            scheme: '',
            cvcAccessSite: '',
            notes: row[6] || ''
          };
        }

        const firstName = row[1] || '';
        const lastName = row[2] || '';
        return {
          id: row[0] || '',
          firstName,
          lastName,
          name: `${firstName} ${lastName}`.trim(),
          dateOfBirth: row[3] || '',
          pesel: row[4] || '',
          sex: row[5] || '',
          weightKg: row[6] || '',
          heightCm: row[7] || '',
          caseNumber: row[8] || '',
          machine: row[9] || '',
          set: row[10] || '',
          scheme: row[11] || '',
          cvcAccessSite: row[12] || '',
          notes: row[13] || ''
        };
      });
  }

  /**
   * Append a new patient row.
   * @param {Object} patient
   * @returns {Promise<void>}
   */
  async function addPatient(patient) {
    if (!_spreadsheetId) throw new Error('Spreadsheet ID not configured.');

    const row = [
      patient.id || '',
      patient.firstName || '',
      patient.lastName || '',
      patient.dateOfBirth || '',
      patient.pesel || '',
      patient.sex || '',
      patient.weightKg || '',
      patient.heightCm || '',
      patient.caseNumber || '',
      patient.machine || '',
      patient.set || '',
      patient.scheme || '',
      patient.cvcAccessSite || '',
      patient.notes || ''
    ];

    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: _spreadsheetId,
      range: PATIENTS_APPEND_RANGE,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: [row] }
    });
  }

  /**
   * Fetch CRRT data rows for a specific patient.
   * @param {string} patientId
   * @returns {Promise<Array<Object>>}
   */
  async function getPatientData(patientId) {
    if (!_spreadsheetId) throw new Error('Spreadsheet ID not configured.');

    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: _spreadsheetId,
      range: CRRT_DATA_RANGE
    });

    const rows = response.result.values || [];
    return rows
      .filter((row) => row[0] === patientId)
      .map((row) => ({
        patientId:       row[0]  || '',
        date:            row[1]  || '',
        time:            row[2]  || '',
        bloodFlow:       row[3]  || '',
        substituteFlow:  row[4]  || '',
        dialysateFlow:   row[5]  || '',
        citrateDose:     row[6]  || '',
        calciumDose:     row[7]  || '',
        ultrafiltration: row[8]  || '',
        postFilterCa:    row[9]  || '',
        patientCa:       row[10] || '',
        dialysisDose:    row[11] || '',
        be:              row[12] || '',
        hco3:            row[13] || '',
        ph:              row[14] || '',
        enteredBy:       row[15] || '',
        notes:           row[16] || ''
      }))
      // Sort by date + time descending (most recent first)
      .sort((a, b) => {
        const dtA = `${a.date}T${a.time}`;
        const dtB = `${b.date}T${b.time}`;
        return dtB.localeCompare(dtA);
      });
  }

  /**
   * Append a new CRRT data entry for a patient.
   * @param {string} patientId
   * @param {Object} entry  – form values from app.js
   * @returns {Promise<void>}
   */
  async function appendCRRTEntry(patientId, entry) {
    if (!_spreadsheetId) throw new Error('Spreadsheet ID not configured.');

    const row = [
      patientId,
      entry.date            || '',
      entry.time            || '',
      entry.bloodFlow       || '',
      entry.substituteFlow  || '',
      entry.dialysateFlow   || '',
      entry.citrateDose     || '',
      entry.calciumDose     || '',
      entry.ultrafiltration || '',
      entry.postFilterCa    || '',
      entry.patientCa       || '',
      entry.dialysisDose    || '',
      entry.be              || '',
      entry.hco3            || '',
      entry.ph              || '',
      entry.enteredBy       || '',
      entry.notes           || ''
    ];

    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: _spreadsheetId,
      range: CRRT_DATA_APPEND_RANGE,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: [row] }
    });
  }

  return {
    setSpreadsheetId,
    getSpreadsheetId,
    ensureSheets,
    addPatient,
    getPatients,
    getPatientData,
    appendCRRTEntry
  };
})();
