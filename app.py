import io
from dataclasses import dataclass
from typing import List

import numpy as np
import pandas as pd
import streamlit as st
from scipy.stats import fisher_exact
import statsmodels.api as sm

st.set_page_config(page_title="TIPS Outcome Risk Analyzer", layout="wide")

st.title("TIPS Outcome Risk Analyzer")
st.caption(
    "Prototype research tool based on the workflow in pre-TIPS diastolic dysfunction studies. "
    "It classifies diastolic dysfunction using consensus echo markers, builds cohorts, and runs simple outcome analyses."
)

with st.expander("Clinical / paper basis"):
    st.markdown(
        """
This app is built around the variables repeatedly used in cirrhotic cardiomyopathy / TIPS outcome work:

- The paper **"Pre-TIPS Diastolic Dysfunction as a Predictor of Post-TIPS Outcomes in Patients With Cirrhosis"** reported that patients meeting **2020 CCM diastolic dysfunction criteria** had higher adjusted odds of cardiovascular, renal, and liver complications after TIPS.
- The Cirrhotic Cardiomyopathy Consortium guidance and related liver-transplant outcome work define the core diastolic markers as **septal e′**, **E/e′**, **left atrial volume index (LAVI)**, and **tricuspid regurgitation velocity (TRV)**.
- One published implementation states that diastolic dysfunction is present if **3 of the 4 criteria** are met: **E/e′ > 15**, **LAVI > 34 mL/m²**, **septal e′ < 7 cm/s**, and **TRV > 2.8 m/s**.

This prototype uses that rule so you can reproduce the cohort-building step transparently and export results for further review.
        """
    )

REQUIRED_COLUMNS = {
    "patient_id": "Unique patient identifier",
    "age": "Age in years",
    "sex": "Sex, e.g. Male/Female",
    "hypertension": "0/1 flag",
    "masld": "0/1 flag",
    "beta_blocker": "0/1 flag",
    "septal_e_prime": "Septal e' in cm/s",
    "e_over_e_prime": "E/e' ratio",
    "lavi": "Left atrial volume index, mL/m²",
    "trv": "Tricuspid regurgitation velocity, m/s",
    "cv_event": "0/1 cardiovascular event outcome",
    "renal_dysfunction": "0/1 renal dysfunction outcome",
    "liver_dysfunction": "0/1 liver dysfunction outcome",
    "mortality": "0/1 mortality outcome",
}


def build_demo_data(n: int = 120, seed: int = 7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    age = rng.normal(58, 9, n).round().clip(28, 82)
    sex = rng.choice(["Male", "Female"], size=n, p=[0.62, 0.38])
    hypertension = rng.binomial(1, 0.45, n)
    masld = rng.binomial(1, 0.32, n)
    beta_blocker = rng.binomial(1, 0.48, n)

    septal_e_prime = np.clip(rng.normal(7.4 - 0.6 * hypertension, 1.4, n), 3.5, 12.0)
    e_over_e_prime = np.clip(rng.normal(13.2 + 1.6 * hypertension + 1.2 * masld, 3.2, n), 6.5, 28.0)
    lavi = np.clip(rng.normal(32 + 4.5 * hypertension + 3.5 * masld, 7.0, n), 16.0, 65.0)
    trv = np.clip(rng.normal(2.55 + 0.18 * hypertension, 0.33, n), 1.7, 4.2)

    abnormal_count = (
        (septal_e_prime < 7).astype(int)
        + (e_over_e_prime > 15).astype(int)
        + (lavi > 34).astype(int)
        + (trv > 2.8).astype(int)
    )
    dd_2020 = (abnormal_count >= 3).astype(int)

    # Outcomes loosely correlated with DD status to create a realistic demo.
    cv_event = rng.binomial(1, np.clip(0.07 + 0.27 * dd_2020, 0, 0.9))
    renal_dysfunction = rng.binomial(1, np.clip(0.10 + 0.20 * dd_2020, 0, 0.9))
    liver_dysfunction = rng.binomial(1, np.clip(0.11 + 0.24 * dd_2020, 0, 0.9))
    mortality = rng.binomial(1, np.clip(0.04 + 0.05 * dd_2020, 0, 0.9))

    df = pd.DataFrame({
        "patient_id": [f"P{idx:03d}" for idx in range(1, n + 1)],
        "age": age.astype(int),
        "sex": sex,
        "hypertension": hypertension,
        "masld": masld,
        "beta_blocker": beta_blocker,
        "septal_e_prime": np.round(septal_e_prime, 2),
        "e_over_e_prime": np.round(e_over_e_prime, 2),
        "lavi": np.round(lavi, 2),
        "trv": np.round(trv, 2),
        "cv_event": cv_event,
        "renal_dysfunction": renal_dysfunction,
        "liver_dysfunction": liver_dysfunction,
        "mortality": mortality,
    })
    return df


@st.cache_data
def to_csv_bytes(df: pd.DataFrame) -> bytes:
    return df.to_csv(index=False).encode("utf-8")


st.sidebar.header("Data source")
use_demo = st.sidebar.toggle("Use demo dataset", value=True)
uploaded = st.sidebar.file_uploader("Upload CSV", type=["csv"])

if use_demo:
    df = build_demo_data()
else:
    if uploaded is None:
        st.info("Upload a CSV or enable the demo dataset in the sidebar.")
        st.stop()
    df = pd.read_csv(uploaded)

missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
if missing:
    st.error("Your file is missing required columns: " + ", ".join(missing))
    st.markdown("### Required columns")
    st.json(REQUIRED_COLUMNS)
    template = build_demo_data(5)
    st.download_button(
        "Download template CSV",
        data=to_csv_bytes(template),
        file_name="tips_template.csv",
        mime="text/csv",
    )
    st.stop()

thresholds = st.sidebar.expander("DD rule thresholds", expanded=False)
septal_thr = thresholds.number_input("septal e' abnormal if below", value=7.0, step=0.1)
ee_thr = thresholds.number_input("E/e' abnormal if above", value=15.0, step=0.1)
lavi_thr = thresholds.number_input("LAVI abnormal if above", value=34.0, step=0.5)
trv_thr = thresholds.number_input("TRV abnormal if above", value=2.8, step=0.1)
rule_count = thresholds.slider("Classify DD if at least this many criteria are abnormal", 1, 4, 3)

work = df.copy()
work["abn_septal_e_prime"] = (work["septal_e_prime"] < septal_thr).astype(int)
work["abn_e_over_e_prime"] = (work["e_over_e_prime"] > ee_thr).astype(int)
work["abn_lavi"] = (work["lavi"] > lavi_thr).astype(int)
work["abn_trv"] = (work["trv"] > trv_thr).astype(int)
work["dd_2020_count"] = work[[
    "abn_septal_e_prime", "abn_e_over_e_prime", "abn_lavi", "abn_trv"
]].sum(axis=1)
work["dd_2020"] = (work["dd_2020_count"] >= rule_count).astype(int)

st.subheader("Cohort overview")
col1, col2, col3, col4 = st.columns(4)
col1.metric("Patients", len(work))
col2.metric("DD-positive", int(work["dd_2020"].sum()))
col3.metric("DD prevalence", f"{work['dd_2020'].mean()*100:.1f}%")
col4.metric("Median age", f"{work['age'].median():.0f}")

st.dataframe(work.head(20), use_container_width=True)

st.subheader("Marker distribution")
summary = pd.DataFrame({
    "Marker": ["septal e' < threshold", "E/e' > threshold", "LAVI > threshold", "TRV > threshold"],
    "Positive n": [work["abn_septal_e_prime"].sum(), work["abn_e_over_e_prime"].sum(), work["abn_lavi"].sum(), work["abn_trv"].sum()],
    "Positive %": [
        work["abn_septal_e_prime"].mean() * 100,
        work["abn_e_over_e_prime"].mean() * 100,
        work["abn_lavi"].mean() * 100,
        work["abn_trv"].mean() * 100,
    ],
})
st.dataframe(summary, use_container_width=True, hide_index=True)

st.subheader("Outcome comparison: DD vs non-DD")
outcome_map = {
    "Cardiovascular event": "cv_event",
    "Renal dysfunction": "renal_dysfunction",
    "Liver dysfunction": "liver_dysfunction",
    "Mortality": "mortality",
}

rows = []
for label, col in outcome_map.items():
    grp = work.groupby("dd_2020")[col].agg(["sum", "count", "mean"]).reset_index()
    dd0 = grp[grp["dd_2020"] == 0]
    dd1 = grp[grp["dd_2020"] == 1]
    dd0_sum = int(dd0["sum"].iloc[0]) if not dd0.empty else 0
    dd0_n = int(dd0["count"].iloc[0]) if not dd0.empty else 0
    dd1_sum = int(dd1["sum"].iloc[0]) if not dd1.empty else 0
    dd1_n = int(dd1["count"].iloc[0]) if not dd1.empty else 0

    table = np.array([
        [dd1_sum, max(dd1_n - dd1_sum, 0)],
        [dd0_sum, max(dd0_n - dd0_sum, 0)],
    ])

    odds_ratio = np.nan
    p_value = np.nan
    try:
        odds_ratio, p_value = fisher_exact(table)
    except Exception:
        pass

    rows.append({
        "Outcome": label,
        "DD+ events / total": f"{dd1_sum} / {dd1_n}",
        "DD+ rate %": round((dd1_sum / dd1_n * 100), 1) if dd1_n else np.nan,
        "DD- events / total": f"{dd0_sum} / {dd0_n}",
        "DD- rate %": round((dd0_sum / dd0_n * 100), 1) if dd0_n else np.nan,
        "Unadjusted OR": round(float(odds_ratio), 2) if pd.notna(odds_ratio) else np.nan,
        "Fisher p": round(float(p_value), 4) if pd.notna(p_value) else np.nan,
    })

outcome_table = pd.DataFrame(rows)
st.dataframe(outcome_table, use_container_width=True, hide_index=True)

st.subheader("Simple logistic regression")
outcome_choice = st.selectbox("Outcome", list(outcome_map.keys()))
outcome_col = outcome_map[outcome_choice]

candidate_predictors = [
    "dd_2020",
    "age",
    "hypertension",
    "masld",
    "beta_blocker",
    "septal_e_prime",
    "e_over_e_prime",
    "lavi",
    "trv",
]
predictors = st.multiselect(
    "Predictors",
    candidate_predictors,
    default=["dd_2020", "age", "hypertension", "masld", "beta_blocker"],
)

if predictors:
    try:
        model_df = work[[outcome_col] + predictors].dropna().copy()
        X = sm.add_constant(model_df[predictors], has_constant="add")
        y = model_df[outcome_col].astype(int)
        model = sm.Logit(y, X).fit(disp=False)
        params = model.params
        conf = model.conf_int()
        result_table = pd.DataFrame({
            "Variable": params.index,
            "Odds ratio": np.exp(params.values),
            "CI lower": np.exp(conf[0].values),
            "CI upper": np.exp(conf[1].values),
            "p value": model.pvalues.values,
        })
        result_table = result_table.round({"Odds ratio": 3, "CI lower": 3, "CI upper": 3, "p value": 4})
        st.dataframe(result_table, use_container_width=True, hide_index=True)
        st.caption("This is a simple regression module for rapid exploratory analysis. Formal study analysis should still be reviewed and validated by the research team.")
    except Exception as e:
        st.error(f"Model could not be fit with the selected predictors: {e}")
else:
    st.info("Select at least one predictor to run the model.")

st.subheader("Downloads")
col_a, col_b = st.columns(2)
col_a.download_button(
    "Download analyzed dataset",
    data=to_csv_bytes(work),
    file_name="tips_analyzed_dataset.csv",
    mime="text/csv",
)
col_b.download_button(
    "Download demo dataset",
    data=to_csv_bytes(build_demo_data()),
    file_name="tips_demo_dataset.csv",
    mime="text/csv",
)

with st.expander("Template schema"):
    st.json(REQUIRED_COLUMNS)
