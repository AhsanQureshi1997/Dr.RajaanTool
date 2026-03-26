# TIPS Outcome Risk Analyzer

A Streamlit prototype based on the study workflow used in pre-TIPS diastolic dysfunction research.

## What it does
- Accepts a CSV of patient-level pre-TIPS variables and outcomes
- Classifies diastolic dysfunction using the core 2020 CCM marker set
- Compares early post-TIPS outcomes in DD vs non-DD cohorts
- Runs simple logistic regression for exploratory analysis
- Exports the analyzed dataset

## Run locally
```bash
pip install -r requirements.txt
streamlit run app.py
```

## Required columns
- patient_id
- age
- sex
- hypertension
- masld
- beta_blocker
- septal_e_prime
- e_over_e_prime
- lavi
- trv
- cv_event
- renal_dysfunction
- liver_dysfunction
- mortality

## Important note
This is a research workflow prototype, not clinical decision support and not validated for patient care.
