# The Everyday Decision Game
### User-Friendly Behavioral Economics Experiment & Live Synthesis Platform

This platform investigates three foundational behavioral economics phenomena using **everyday, accessible scenarios** designed for people with **zero financial or mathematical background**:

1. **Framing Effect & Price Anchoring** (Gain vs Loss Framing, Arbitrary Numerical Anchoring)
2. **Loss Aversion & Prospect Theory** (Kahneman-Tversky 50/50 Coin Flips, Sunk Cost)
3. **The Triad: Cost of Delay Equation, Rule of 72, & Real Options Theory** (Compounding intuition vs linear bias, Option to Defer vs delay costs)

---

## 🚀 How to Host This Online (So You Can Send It to People)

You have two easy ways to get a link you can text or email to people:

### Option A: Free Permanent Cloud Hosting on Render.com (Recommended)
This gives you a permanent link (e.g. `https://my-decision-study.onrender.com`) that stays online 24/7 for free.

1. Create a free account at [Render.com](https://render.com) and [GitHub.com](https://github.com).
2. Create a new GitHub repo (e.g. `behavioral-economics-survey`).
3. In your Mac terminal:
   ```bash
   cd ~/Desktop/Project_BE
   git remote add origin https://github.com/YOUR_USERNAME/behavioral-economics-survey.git
   git branch -M main
   git push -u origin main
   ```
4. On Render.com:
   - Click **New +** > **Web Service**.
   - Connect your GitHub repository.
   - Set **Build Command**: *(leave empty)*
   - Set **Start Command**: `node server.js`
   - Plan: **Free**
5. Click **Create Web Service**. Within 2 minutes, Render will give you a public URL (e.g. `https://behavioral-survey.onrender.com`) that you can send to anyone!

---

### Option B: Instant 10-Second Temporary Share Link (Localtunnel)
If you want to send a link to someone **right now** while your computer is on, run:

```bash
cd ~/Desktop/Project_BE
node server.js
```

Then open a **second terminal tab** and run:
```bash
npx localtunnel --port 3000
```
It will instantly print a public web address like `https://funny-tiger-42.loca.lt` that anyone on their phone or laptop anywhere in the world can open immediately!

---

### Option C: Share on the Same Wi-Fi Network
If people are in the same house, classroom, or office:
1. Find your Mac's IP address: `ipconfig getifaddr en0` (e.g. `192.168.1.45`)
2. Anyone on the same Wi-Fi can open: `http://192.168.1.45:3000`

---

## 🎯 The 7 Simplified Scenarios (No Finance Knowledge Needed)

1. **The Factory Emergency (Framing Effect):**
   - 600 workers facing layoffs. 
   - Gain frame: *Save 200 jobs for sure* vs *1-in-3 chance to save all 600*.
   - Loss frame: *400 lose jobs for sure* vs *1-in-3 chance nobody loses jobs*.
2. **What is This House Worth? (Price Anchoring):**
   - 4-bedroom house with pool and solar panels. 
   - An agent off-handedly mentions **$850,000** (High Anchor) vs **$350,000** (Low Anchor). Tests how arbitrary initial numbers anchor human valuations.
3. **The Store Checkout (Payment Framing):**
   - $100 grocery bill with **$5 cash discount** ($95 total) vs $95 bill with **$5 card fee** ($100 total). Tests psychological pain of penalties vs foregone gains.
4. **The 50/50 Coin Flip Challenge (Loss Aversion $\lambda$):**
   - Fair coin: Heads you win $100 cash. Tails you lose $30, $50, $70, $90, $110.
   - Calculates their exact individual Loss Aversion coefficient $\lambda = 100 / L^*$.
5. **The Depreciated Item (Sunk Cost & Loss Avoidance):**
   - Bought item for $100, now worth $65. Do you sell to enter a new deal that profits +$25, or hold forever to avoid officially taking the -$35 loss?
6. **The Magic Doubling Trick (Rule of 72 & Cost of Delay):**
   - Explains that at 9% growth, money doubles every 8 years ($72 / 9 = 8$).
   - Alex starts today ($10,000 grows for 24 years, 3 doublings).
   - Sam waits 8 years ($10,000 grows for 16 years, 2 doublings).
   - Respondents guess how much money Sam lost by waiting 8 years. Reveals human **Exponential Growth Bias** (linear brains guess $7k, when the true mathematical loss is **$39,408**!).
7. **The Bakery & The Subway Station (Real Options Theory & Cost of Delay):**
   - Open a bakery for $50k before or after the city votes on a subway station.
   - Choice 1: Open now. Expected profit = +$30k, but take the risk.
   - Choice 2: Pay $18,000 in holding fees to wait 1 year for 100% certainty. Expected profit after fee = +$27k.
   - Tests if people overpay for certainty or optimize the Cost of Delay.

---

## 📊 Live Researcher Portal & Exports

- **Switch to "Results & Data"** in the top navigation bar to see live charts, Chi-Square significance values, $\lambda$ distributions, and reaction times.
- **One-Click CSV Export:** Click "Download CSV" for a clean spreadsheet ready for Excel, Google Sheets, Python, or R.
