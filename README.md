# TIPS Outcome Risk Analyzer — GitHub Pages version

This is a static browser-based version of the TIPS Outcome Risk Analyzer that can be hosted on GitHub Pages.

## Files
- `index.html`
- `styles.css`
- `script.js`

## What it does
- Uploads a CSV of patient-level pre-TIPS variables and outcomes
- Classifies diastolic dysfunction using the default 3-of-4 rule
- Compares DD vs non-DD outcomes
- Runs a browser-based exploratory logistic regression
- Exports the analyzed dataset

## Deploy on GitHub Pages
1. Push these files to your repository root, or to a `/docs` folder.
2. In GitHub, go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select your branch and the folder that contains `index.html`.
5. Save.

GitHub Pages will then publish the site.
