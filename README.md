# CRRT App

A Progressive Web App (PWA) for managing **Continuous Renal Replacement Therapy (CRRT)** patient data, backed by Google Sheets.

## Features

- **3 Tabs:**
  1. **Patients** – Browse and select a patient from your Google Sheets patient list
  2. **Entry** – Record CRRT machine parameters (Blood flow, Dialysate flow, Substitute flow, pressures, anticoagulation, etc.)
  3. **View** – Review all recorded CRRT data entries for the selected patient in a table with summary cards

- Installable as a PWA (works on mobile and desktop)
- Offline support via Service Worker
- Secure OAuth 2.0 authentication via Google Identity Services

---

## Google Sheets Structure

The app expects (and will auto-create if missing) two sheets in your spreadsheet:

### `Patients` sheet
| PatientID | Name | DateOfBirth | Ward | Diagnosis | AdmissionDate | Notes |
|-----------|------|-------------|------|-----------|---------------|-------|
| P001 | John Doe | 1965-04-12 | ICU | AKI | 2024-01-10 | |

### `CRRT_Data` sheet
| PatientID | Date | Time | BloodFlow | DialysateFlow | SubstituteFlow | EffluentRate | NetFluidRemoval | ReplacementMode | PreFraction | PostFraction | AnticoagType | AnticoagDose | AccessPressure | ReturnPressure | FilterPressure | EffluentPressure | TMP | Notes |
|-----------|------|------|-----------|---------------|----------------|--------------|-----------------|-----------------|-------------|--------------|--------------|--------------|----------------|----------------|----------------|------------------|-----|-------|

---

## Setup

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Enable the **Google Sheets API**:
   *APIs & Services → Library → Google Sheets API → Enable*

### 2. Create OAuth 2.0 Credentials

1. Go to *APIs & Services → Credentials → Create Credentials → OAuth client ID*
2. Application type: **Web application**
3. Add your app's URL to **Authorised JavaScript origins** (e.g. `https://your-domain.com` or `http://localhost:8080` for development)
4. Copy the **Client ID**

### 3. Create an API Key

1. Go to *APIs & Services → Credentials → Create Credentials → API Key*
2. Restrict it to the **Google Sheets API**
3. Copy the **API Key**

### 4. Create / Use a Google Spreadsheet

1. Create a new Google Spreadsheet (or use an existing one)
2. Copy the **Spreadsheet ID** from the URL:
   `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`

### 5. Open the App

1. Open `index.html` in a browser (serve it via a local or remote HTTPS server)
2. Enter your **Spreadsheet ID**, **Client ID**, and **API Key** in the configuration screen
3. Click **Save Configuration** and then **Sign In**

> **Note:** The OAuth consent screen requires HTTPS except for `localhost`.

### Running Locally

```bash
# Using Python
python3 -m http.server 8080

# Using Node.js npx
npx serve .
```

Then open http://localhost:8080

---

## Parameters Recorded

| Parameter | Unit | Description |
|-----------|------|-------------|
| Blood Flow Rate (Qb) | mL/min | Speed of blood through the circuit |
| Dialysate Flow Rate (Qd) | mL/h | Dialysate delivery rate |
| Substitute Flow Rate (Qs) | mL/h | Replacement fluid rate |
| Effluent Rate | mL/h | Total effluent produced |
| Net Fluid Removal | mL/h | Fluid balance target |
| Replacement Mode | — | Pre / Post / Pre+Post filter |
| Anticoagulation Type | — | Heparin, Citrate, etc. |
| Anticoagulation Dose | units/h | Anticoagulant infusion rate |
| Access Pressure | mmHg | Arterial line pressure |
| Return Pressure | mmHg | Venous line pressure |
| Filter Pressure | mmHg | Inlet pressure |
| Effluent Pressure | mmHg | Effluent outlet pressure |
| TMP | mmHg | Transmembrane pressure |
| Notes | — | Free-text clinical observations |

---

## PWA Installation

On mobile (Chrome/Edge): tap **Add to Home Screen** from the browser menu.
On desktop: click the install icon in the address bar.
