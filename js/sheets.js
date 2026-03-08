/**
 * sheets.js – Google Sheets API integration for CRRT App
 *
 * Expected spreadsheet structure:
 *
 *  Sheet: "Patients"
 *  Columns: PatientID | Name | DateOfBirth | Ward | Diagnosis | AdmissionDate | Notes
 *
 *  Sheet: "CRRT_Data"
 *  Columns: PatientID | Date | Time | BloodFlow | DialysateFlow | SubstituteFlow |
 *           EffluentRate | NetFluidRemoval | ReplacementMode | PreFraction | PostFraction |
 *           AnticoagType | AnticoagDose | AccessPressure | ReturnPressure |
 *           FilterPressure | EffluentPressure | TMP | Notes
 */

const SHEETS_API_DISCOVERY = 'https://sheets.googleapis.com/$discovery/rest?version=v4';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

/** Sheets service exposed globally for use by app.js */
const SheetsService = (() => {
  // Sheet / range constants
  const PATIENTS_RANGE = 'Patients!A2:G';
  const CRRT_DATA_RANGE = 'CRRT_Data!A2:S';
  const CRRT_DATA_APPEND_RANGE = 'CRRT_Data!A:S';

  const PATIENTS_HEADERS = ['PatientID', 'Name', 'DateOfBirth', 'Ward', 'Diagnosis', 'AdmissionDate', 'Notes'];
  const CRRT_HEADERS = [
    'PatientID', 'Date', 'Time', 'BloodFlow', 'DialysateFlow', 'SubstituteFlow',
    'EffluentRate', 'NetFluidRemoval', 'ReplacementMode', 'PreFraction', 'PostFraction',
    'AnticoagType', 'AnticoagDose', 'AccessPressure', 'ReturnPressure',
    'FilterPressure', 'EffluentPressure', 'TMP', 'Notes'
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
      .filter((row) => row[0] && row[1]) // must have ID and Name
      .map((row) => ({
        id: row[0] || '',
        name: row[1] || '',
        dateOfBirth: row[2] || '',
        ward: row[3] || '',
        diagnosis: row[4] || '',
        admissionDate: row[5] || '',
        notes: row[6] || ''
      }));
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
        dialysateFlow:   row[4]  || '',
        substituteFlow:  row[5]  || '',
        effluentRate:    row[6]  || '',
        netFluidRemoval: row[7]  || '',
        replacementMode: row[8]  || '',
        preFraction:     row[9]  || '',
        postFraction:    row[10] || '',
        anticoagType:    row[11] || '',
        anticoagDose:    row[12] || '',
        accessPressure:  row[13] || '',
        returnPressure:  row[14] || '',
        filterPressure:  row[15] || '',
        effluentPressure:row[16] || '',
        tmp:             row[17] || '',
        notes:           row[18] || ''
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
      entry.dialysateFlow   || '',
      entry.substituteFlow  || '',
      entry.effluentRate    || '',
      entry.netFluidRemoval || '',
      entry.replacementMode || '',
      entry.preFraction     || '',
      entry.postFraction    || '',
      entry.anticoagType    || '',
      entry.anticoagDose    || '',
      entry.accessPressure  || '',
      entry.returnPressure  || '',
      entry.filterPressure  || '',
      entry.effluentPressure|| '',
      entry.tmp             || '',
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
    getPatients,
    getPatientData,
    appendCRRTEntry
  };
})();
