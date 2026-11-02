import { telemetry } from './telemetry.js';
import { BehavioralCharts } from './charts.js';

// Application State
const state = {
  mode: 'survey', // 'survey' | 'analytics'
  sessionId: null,
  cohort: null, // 'Alpha' (Gain/High) | 'Beta' (Loss/Low)
  currentStepIndex: 0,
  isSubmitted: false,
  personalMetrics: null,
  
  // Responses
  responses: {
    framing_job_choice: null, // 'A' | 'B'
    anchoring_valuation_estimate: null, // number ($ in thousands)
    framing_discount_choice: null, // 'cash' | 'credit'
    loss_aversion_gambles: [null, null, null, null, null],
    loss_aversion_sunk_choice: null, // 'sell_and_reallocate' | 'hold_for_breakeven'
    delay_growth_estimate: null, // number ($)
    real_option_choice: null, // 'invest_now' | 'wait_for_information'
    option_switch_threshold: 15000, // number ($)
    confidence_rating: 4
  },

  analyticsData: null,
  activeFilterCohort: 'all'
};

const STEPS = [
  { id: 'welcome', name: 'Start' },
  { id: 'framing_jobs', name: 'Rescue Plan' },
  { id: 'anchoring_quote', name: 'House Value' },
  { id: 'framing_discount', name: 'Store Checkout' },
  { id: 'loss_lotteries', name: 'Coin Tosses' },
  { id: 'loss_sunk', name: 'Selling Dilemma' },
  { id: 'rule72_delay', name: 'Waiting Cost' },
  { id: 'real_options', name: 'Bakery Decision' },
  { id: 'debrief', name: 'Your Results' }
];

function showToast(msg) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerText = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Session Initializer
async function initSession() {
  try {
    const res = await fetch('/api/session/start', { method: 'POST' });
    const data = await res.json();
    state.sessionId = data.sessionId;
    state.cohort = data.cohort;
    telemetry.initSession(state.sessionId, state.cohort);
    updatePulseText();
    render();
  } catch (err) {
    console.error('Session init error:', err);
    state.sessionId = 'session-' + Date.now();
    state.cohort = Math.random() < 0.5 ? 'Alpha' : 'Beta';
    telemetry.initSession(state.sessionId, state.cohort);
    render();
  }
}

function updatePulseText() {
  const el = document.getElementById('telemetryStatus');
  if (el) {
    el.innerHTML = `
      <span class="pulse-dot"></span>
      Ready • Cohort ${state.cohort || 'Alpha'}
    `;
  }
}

// Keyboard shortcuts (1 and 2)
window.addEventListener('keydown', (e) => {
  if (state.mode !== 'survey' || state.currentStepIndex === 0 || state.currentStepIndex >= STEPS.length - 1) return;
  if (e.key === '1') handleKeySelection(1);
  if (e.key === '2') handleKeySelection(2);
});

function handleKeySelection(num) {
  const stepId = STEPS[state.currentStepIndex].id;
  if (stepId === 'framing_jobs') selectJobChoice(num === 1 ? 'A' : 'B');
  if (stepId === 'framing_discount') selectDiscountChoice(num === 1 ? 'cash' : 'credit');
  if (stepId === 'loss_sunk') selectSunkChoice(num === 1 ? 'sell_and_reallocate' : 'hold_for_breakeven');
  if (stepId === 'real_options') selectRealOptionChoice(num === 1 ? 'invest_now' : 'wait_for_information');
}

function handleNextStep() {
  const currentStep = STEPS[state.currentStepIndex];
  
  if (currentStep.id === 'framing_jobs' && !state.responses.framing_job_choice) {
    showToast('Please pick Plan A or Plan B to continue.');
    return;
  }
  if (currentStep.id === 'anchoring_quote' && (!state.responses.anchoring_valuation_estimate || state.responses.anchoring_valuation_estimate <= 0)) {
    showToast('Please type your guess for what the house is worth.');
    return;
  }
  if (currentStep.id === 'framing_discount' && !state.responses.framing_discount_choice) {
    showToast('Please select Cash or Card.');
    return;
  }
  if (currentStep.id === 'loss_lotteries') {
    const uncompleted = state.responses.loss_aversion_gambles.some(v => v === null);
    if (uncompleted) {
      showToast('Please choose Flip or Pass for all 5 coin tosses.');
      return;
    }
  }
  if (currentStep.id === 'loss_sunk' && !state.responses.loss_aversion_sunk_choice) {
    showToast('Please pick what you would do with the item.');
    return;
  }
  if (currentStep.id === 'rule72_delay' && (!state.responses.delay_growth_estimate || state.responses.delay_growth_estimate <= 0)) {
    showToast('Please enter your gut guess in dollars.');
    return;
  }
  if (currentStep.id === 'real_options' && !state.responses.real_option_choice) {
    showToast('Please pick Choice 1 or Choice 2.');
    return;
  }

  telemetry.finishStep(currentStep.id);

  if (currentStep.id === 'real_options') {
    submitSurvey();
    return;
  }

  state.currentStepIndex++;
  telemetry.startStep(STEPS[state.currentStepIndex].id);
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function handlePrevStep() {
  if (state.currentStepIndex > 1) {
    state.currentStepIndex--;
    telemetry.startStep(STEPS[state.currentStepIndex].id);
    render();
  }
}

async function submitSurvey() {
  try {
    const telemetryPayload = telemetry.getPayload();
    const payload = {
      sessionId: state.sessionId,
      cohort: state.cohort,
      responses: state.responses,
      telemetry: telemetryPayload
    };

    const res = await fetch('/api/survey/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    state.isSubmitted = true;
    state.personalMetrics = data.personalMetrics;
    state.currentStepIndex = STEPS.length - 1; // Debrief screen
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('Calculated your personal decision profile!');
  } catch (err) {
    console.error('Submission failed:', err);
    showToast('Network error, please retry.');
  }
}

// User Action Bindings
window.selectJobChoice = (choice) => {
  telemetry.recordOptionSelection(choice);
  state.responses.framing_job_choice = choice;
  render();
};

window.selectDiscountChoice = (choice) => {
  telemetry.recordOptionSelection(choice);
  state.responses.framing_discount_choice = choice;
  render();
};

window.toggleGambleChoice = (index, accept) => {
  telemetry.recordOptionSelection(`gamble_${index}_${accept}`);
  state.responses.loss_aversion_gambles[index] = accept;
  render();
};

window.selectSunkChoice = (choice) => {
  telemetry.recordOptionSelection(choice);
  state.responses.loss_aversion_sunk_choice = choice;
  render();
};

window.selectRealOptionChoice = (choice) => {
  telemetry.recordOptionSelection(choice);
  state.responses.real_option_choice = choice;
  render();
};

window.setConfidenceRating = (rating) => {
  state.responses.confidence_rating = rating;
  render();
};

function render() {
  const container = document.getElementById('mainApp');
  if (!container) return;

  if (state.mode === 'analytics') {
    renderAnalyticsPortal(container);
  } else {
    renderSurveyView(container);
  }
}

// -------------------------------------------------------------
// USER-FRIENDLY SURVEY VIEWS (EVERYDAY LANGUAGE, NO JARGON)
// -------------------------------------------------------------
function renderSurveyView(container) {
  const step = STEPS[state.currentStepIndex];
  const progressPct = ((state.currentStepIndex) / (STEPS.length - 1)) * 100;
  const isAlpha = state.cohort === 'Alpha';

  let stepHtml = '';

  // 1. WELCOME
  if (step.id === 'welcome') {
    stepHtml = `
      <div class="survey-card">
        <span class="badge-tag cyan">2-Minute Decision Challenge</span>
        <h1 class="survey-title">The Everyday Decision Game</h1>
        <p class="survey-description">
          Welcome! You are about to face 7 quick, everyday choices involving money, gut instincts, and risk.
        </p>

        <div class="scenario-box">
          <p style="margin-bottom: 0.5rem;"><strong>How it works:</strong></p>
          <ul style="padding-left: 1.25rem; line-height: 1.7; font-size: 0.95rem; color: #cbd5e1;">
            <li><strong>No math or finance skills required:</strong> Anyone can do this.</li>
            <li><strong>Takes 2–3 minutes:</strong> Quick and straightforward questions.</li>
            <li><strong>Go with your gut:</strong> There are no wrong answers—just how your brain naturally reacts.</li>
            <li><strong>Instant Personal Breakdown:</strong> Right after the last question, you will see your own unique <strong>Decision Personality</strong>!</li>
          </ul>
        </div>

        <div style="display: flex; justify-content: flex-end; margin-top: 1.5rem;">
          <button class="btn-primary" onclick="window.advanceStep()">
            Start Challenge (2 Mins) →
          </button>
        </div>
      </div>
    `;
  }

  // 2. QUESTION 1: RESCUE PLAN (FRAMING EFFECT)
  else if (step.id === 'framing_jobs') {
    const isGain = isAlpha;
    stepHtml = `
      <div class="survey-card">
        <span class="badge-tag ${isGain ? 'cyan' : 'rose'}">
          Scenario 1 of 7
        </span>
        <h2 class="survey-title">The Factory Emergency</h2>
        <p class="survey-description">
          A local manufacturing company with <strong>600 employees</strong> is in danger of closing down completely. 
          The town leaders must choose between two emergency rescue plans:
        </p>

        <div class="scenario-box ${isGain ? '' : 'loss'}">
          ${isGain ? `
            <strong>Gain Frame:</strong> If enacted:
            <ul style="margin-top: 0.5rem; padding-left: 1.25rem;">
              <li><strong>Plan A:</strong> Guaranteed to <strong>save 200 jobs</strong> for certain.</li>
              <li><strong>Plan B:</strong> A <strong>1-in-3 chance</strong> that all 600 jobs are saved, but a <strong>2-in-3 chance</strong> that no jobs are saved.</li>
            </ul>
          ` : `
            <strong>Loss Frame:</strong> If enacted:
            <ul style="margin-top: 0.5rem; padding-left: 1.25rem;">
              <li><strong>Plan A:</strong> Exactly <strong>400 people will definitely lose their jobs</strong>.</li>
              <li><strong>Plan B:</strong> A <strong>1-in-3 chance</strong> that nobody loses their job, but a <strong>2-in-3 chance</strong> that all 600 people will lose their jobs.</li>
            </ul>
          `}
        </div>

        <div class="choice-grid two-col">
          <div class="choice-card ${state.responses.framing_job_choice === 'A' ? 'selected' : ''}" 
               onclick="window.selectJobChoice('A')"
               onmouseenter="window.hoverStart('plan_A')"
               onmouseleave="window.hoverEnd('plan_A')">
            <div class="choice-header">
              <span class="choice-tag">Plan A</span>
              <span class="key-pill">Key [1]</span>
            </div>
            <div class="choice-name">Safe Guarantee</div>
            <div class="choice-details">
              ${isGain ? 'Definitely save 200 people with 100% certainty.' : 'Accept that 400 people lose their jobs with 100% certainty.'}
            </div>
          </div>

          <div class="choice-card ${state.responses.framing_job_choice === 'B' ? 'selected' : ''}" 
               onclick="window.selectJobChoice('B')"
               onmouseenter="window.hoverStart('plan_B')"
               onmouseleave="window.hoverEnd('plan_B')">
            <div class="choice-header">
              <span class="choice-tag">Plan B</span>
              <span class="key-pill">Key [2]</span>
            </div>
            <div class="choice-name">Take the Gamble</div>
            <div class="choice-details">
              ${isGain ? '1-in-3 chance all 600 saved; 2-in-3 chance none saved.' : '1-in-3 chance nobody loses jobs; 2-in-3 chance everyone loses.'}
            </div>
          </div>
        </div>

        ${renderConfidencePicker()}

        <div class="survey-footer">
          <button class="btn-secondary" onclick="window.prevStep()">← Previous</button>
          <button class="btn-primary" onclick="window.advanceStep()" ${!state.responses.framing_job_choice ? 'disabled' : ''}>
            Next Question →
          </button>
        </div>
      </div>
    `;
  }

  // 3. QUESTION 2: HOUSE PRICE (PRICE ANCHORING)
  else if (step.id === 'anchoring_quote') {
    const isHigh = isAlpha;
    const anchorVal = isHigh ? 850 : 350; // In thousands ($850k vs $350k)

    stepHtml = `
      <div class="survey-card">
        <span class="badge-tag amber">Scenario 2 of 7</span>
        <h2 class="survey-title">What is This House Worth?</h2>
        <p class="survey-description">
          A newly built modern 4-bedroom house with a big backyard, pool, and solar panels is being put on the market in a quiet suburban town.
        </p>

        <div class="scenario-box amber">
          <strong>The Agent's Quick Mention:</strong>
          <p style="margin-top: 0.35rem;">
            A local real estate agent took a quick look and remarked: 
            <em style="color: #fff; font-size: 1.05rem;">"Hmm, I could see this listing for around <strong>$${anchorVal},000</strong>."</em>
          </p>
        </div>

        <div class="input-estimation-box">
          <div class="input-label-row">
            <span style="font-weight: 600; color: #fff;">Based on your gut, what do you think it is really worth?</span>
            <span style="color: var(--accent-amber); font-family: var(--font-mono); font-size: 0.85rem;">(In Thousands of Dollars)</span>
          </div>
          <div class="currency-input-wrap">
            <span class="currency-symbol">$</span>
            <input type="number" 
                   class="text-number-input" 
                   placeholder="e.g. 500 (for $500,000)" 
                   min="50" 
                   max="2000" 
                   step="25"
                   value="${state.responses.anchoring_valuation_estimate || ''}"
                   oninput="window.updateAnchoringEstimate(this.value)" />
            <span style="position: absolute; right: 1.25rem; color: var(--text-dim); font-family: var(--font-mono);">,000</span>
          </div>
        </div>

        <div class="survey-footer">
          <button class="btn-secondary" onclick="window.prevStep()">← Previous</button>
          <button class="btn-primary" onclick="window.advanceStep()" ${!state.responses.anchoring_valuation_estimate ? 'disabled' : ''}>
            Next Question →
          </button>
        </div>
      </div>
    `;
  }

  // 4. QUESTION 3: STORE CHECKOUT (PAYMENT FRAMING)
  else if (step.id === 'framing_discount') {
    const isDiscount = isAlpha;
    stepHtml = `
      <div class="survey-card">
        <span class="badge-tag cyan">Scenario 3 of 7</span>
        <h2 class="survey-title">The Store Checkout</h2>
        <p class="survey-description">
          You are at the register paying for a cart of supplies.
        </p>

        <div class="scenario-box">
          ${isDiscount ? `
            The regular price tag is <strong>$100</strong>. 
            The cashier says: <em>"If you pay with <strong>Cash</strong> today, we give you a <strong>$5 Cash Discount</strong> (total is $95)!"</em>
          ` : `
            The regular price tag is <strong>$95</strong>. 
            The cashier says: <em>"If you pay with a <strong>Credit Card</strong> today, there is a <strong>$5 Card Fee</strong> (total is $100)!"</em>
          `}
        </div>

        <div class="choice-grid two-col">
          <div class="choice-card ${state.responses.framing_discount_choice === 'cash' ? 'selected' : ''}" 
               onclick="window.selectDiscountChoice('cash')"
               onmouseenter="window.hoverStart('pay_cash')"
               onmouseleave="window.hoverEnd('pay_cash')">
            <div class="choice-header">
              <span class="choice-tag">Option 1</span>
              <span class="key-pill">Key [1]</span>
            </div>
            <div class="choice-name">Pay $95 with Cash</div>
            <div class="choice-details">
              ${isDiscount ? 'Get the $5 discount.' : 'Avoid paying the $5 card fee.'}
            </div>
          </div>

          <div class="choice-card ${state.responses.framing_discount_choice === 'credit' ? 'selected' : ''}" 
               onclick="window.selectDiscountChoice('credit')"
               onmouseenter="window.hoverStart('pay_credit')"
               onmouseleave="window.hoverEnd('pay_credit')">
            <div class="choice-header">
              <span class="choice-tag">Option 2</span>
              <span class="key-pill">Key [2]</span>
            </div>
            <div class="choice-name">Pay $100 with Card</div>
            <div class="choice-details">
              Use card for convenience, paying the higher price.
            </div>
          </div>
        </div>

        <div class="survey-footer">
          <button class="btn-secondary" onclick="window.prevStep()">← Previous</button>
          <button class="btn-primary" onclick="window.advanceStep()" ${!state.responses.framing_discount_choice ? 'disabled' : ''}>
            Next Question →
          </button>
        </div>
      </div>
    `;
  }

  // 5. QUESTION 4: COIN TOSS GAMBLE LADDER (LOSS AVERSION)
  else if (step.id === 'loss_lotteries') {
    const lotteries = [
      { loss: 30, ev: 'You win +$35 on average' },
      { loss: 50, ev: 'You win +$25 on average' },
      { loss: 70, ev: 'You win +$15 on average' },
      { loss: 90, ev: 'You win +$5 on average' },
      { loss: 110, ev: 'You lose -$5 on average' }
    ];

    let rowsHtml = '';
    lotteries.forEach((lot, i) => {
      const choice = state.responses.loss_aversion_gambles[i];
      rowsHtml += `
        <div class="lottery-row">
          <div class="gamble-desc">
            Coin #${i + 1}: Heads <span class="win-text">WIN $100</span> | Tails <span class="loss-text">LOSE $${lot.loss}</span>
          </div>
          <div class="gamble-ev">
            ${lot.ev}
          </div>
          <div class="gamble-actions">
            <button class="btn-gamble accept ${choice === true ? 'selected' : ''}" 
                    onclick="window.toggleGambleChoice(${i}, true)">
              I'd Flip!
            </button>
            <button class="btn-gamble reject ${choice === false ? 'selected' : ''}" 
                    onclick="window.toggleGambleChoice(${i}, false)">
              Pass (No Way)
            </button>
          </div>
        </div>
      `;
    });

    stepHtml = `
      <div class="survey-card">
        <span class="badge-tag emerald">Scenario 4 of 7</span>
        <h2 class="survey-title">The 50/50 Coin Flip Challenge</h2>
        <p class="survey-description">
          Imagine someone hands you a real coin right now.
          If it lands on <strong>HEADS, you WIN $100 cash</strong>.
          If it lands on <strong>TAILS, you have to pay out of your own wallet</strong>.
          Would you agree to flip for each of these?
        </p>

        <div class="lottery-table-wrap">
          <div class="lottery-row header">
            <div>Coin Toss Deal</div>
            <div>Average Result</div>
            <div style="text-align: right;">Your Decision</div>
          </div>
          ${rowsHtml}
        </div>

        <div class="survey-footer">
          <button class="btn-secondary" onclick="window.prevStep()">← Previous</button>
          <button class="btn-primary" onclick="window.advanceStep()">
            Next Question →
          </button>
        </div>
      </div>
    `;
  }

  // 6. QUESTION 5: SELLING THE LOSING ITEM (SUNK COST)
  else if (step.id === 'loss_sunk') {
    stepHtml = `
      <div class="survey-card">
        <span class="badge-tag emerald">Scenario 5 of 7</span>
        <h2 class="survey-title">The Depreciated Item</h2>
        <p class="survey-description">
          A few months ago, you spent <strong>$100</strong> on a collectible item (or event ticket).
          Its value has unexpectedly dropped to <strong>$65</strong> (you are down $35).
        </p>

        <div class="scenario-box">
          A trustworthy friend offers you a spot in a hot new deal that is almost guaranteed to make you <strong>+$25 clean profit</strong>, but you only have enough cash if you sell your original item today for $65.
          <br/><br/>
          Meanwhile, experts say your original item will probably never get back to $100 anytime soon.
        </div>

        <div class="choice-grid two-col">
          <div class="choice-card ${state.responses.loss_aversion_sunk_choice === 'sell_and_reallocate' ? 'selected' : ''}" 
               onclick="window.selectSunkChoice('sell_and_reallocate')"
               onmouseenter="window.hoverStart('sell_reallocate')"
               onmouseleave="window.hoverEnd('sell_reallocate')">
            <div class="choice-header">
              <span class="choice-tag">Choice 1</span>
              <span class="key-pill">Key [1]</span>
            </div>
            <div class="choice-name">Sell for $65 & Move On</div>
            <div class="choice-details">
              Accept the $35 loss now. Use the $65 to enter the new deal and make the +$25 profit.
            </div>
          </div>

          <div class="choice-card ${state.responses.loss_aversion_sunk_choice === 'hold_for_breakeven' ? 'selected' : ''}" 
               onclick="window.selectSunkChoice('hold_for_breakeven')"
               onmouseenter="window.hoverStart('hold_breakeven')"
               onmouseleave="window.hoverEnd('hold_breakeven')">
            <div class="choice-header">
              <span class="choice-tag">Choice 2</span>
              <span class="key-pill">Key [2]</span>
            </div>
            <div class="choice-name">Keep Holding It</div>
            <div class="choice-details">
              Refuse to sell until you get your original $100 back, because you really hate 'locking in' the $35 loss.
            </div>
          </div>
        </div>

        <div class="survey-footer">
          <button class="btn-secondary" onclick="window.prevStep()">← Previous</button>
          <button class="btn-primary" onclick="window.advanceStep()" ${!state.responses.loss_aversion_sunk_choice ? 'disabled' : ''}>
            Next Question →
          </button>
        </div>
      </div>
    `;
  }

  // 7. QUESTION 6: COST OF DELAY & RULE OF 72
  else if (step.id === 'rule72_delay') {
    stepHtml = `
      <div class="survey-card">
        <span class="badge-tag violet">Scenario 6 of 7</span>
        <h2 class="survey-title">The Magic Doubling Trick (Rule of 72)</h2>
        <p class="survey-description">
          There is a famous math trick called the <strong>Rule of 72</strong>:
          If savings grow by 9% each year, your money <strong>DOUBLES every 8 years</strong> ($72 ÷ 9 = 8 years).
          <br/>
          <em>($10,000 doubles to $20,000 after 8 years... then doubles to $40,000 after 16 years... and so on!)</em>
        </p>

        <div class="scenario-box violet">
          <strong>Two friends save for retirement over a 24-year period:</strong>
          <ul style="margin-top: 0.5rem; padding-left: 1.25rem;">
            <li><strong>Alex:</strong> Puts in <strong>$10,000 today</strong> and leaves it for all 24 years (it doubles 3 times: 8 × 3 = 24).</li>
            <li><strong>Sam:</strong> Waits <strong>8 years</strong> before starting, leaving $10,000 for only 16 years (it doubles only 2 times).</li>
          </ul>
          <p style="margin-top: 0.85rem; font-weight: 700; color: #fff;">
            Based purely on your gut feeling: How many total DOLLARS did Sam lose out on at the end of the 24 years, solely by waiting 8 years to start?
          </p>
        </div>

        <div class="input-estimation-box">
          <div class="input-label-row">
            <span style="font-weight: 600; color: #fff;">Your Gut Guess (Dollars Lost by Waiting):</span>
            <span style="color: var(--accent-violet); font-family: var(--font-mono); font-size: 0.85rem;">(USD $)</span>
          </div>
          <div class="currency-input-wrap">
            <span class="currency-symbol">$</span>
            <input type="number" 
                   class="text-number-input" 
                   placeholder="e.g. 10000" 
                   min="1" 
                   max="150000" 
                   step="500"
                   value="${state.responses.delay_growth_estimate || ''}"
                   oninput="window.updateDelayEstimate(this.value)" />
          </div>
        </div>

        <div class="survey-footer">
          <button class="btn-secondary" onclick="window.prevStep()">← Previous</button>
          <button class="btn-primary" onclick="window.advanceStep()" ${!state.responses.delay_growth_estimate ? 'disabled' : ''}>
            Next Question (Final!) →
          </button>
        </div>
      </div>
    `;
  }

  // 8. QUESTION 7: REAL OPTIONS & COST OF WAITING (THE BAKERY CAFE)
  else if (step.id === 'real_options') {
    stepHtml = `
      <div class="survey-card">
        <span class="badge-tag violet">Scenario 7 of 7 (Final Question!)</span>
        <h2 class="survey-title">The Bakery & The Subway Station</h2>
        <p class="survey-description">
          You have an opportunity to open a brand-new specialty bakery cafe in a busy new shopping plaza. 
          Building the kitchen costs <strong>$50,000</strong> (non-refundable).
        </p>

        <div class="scenario-box violet">
          The city is voting in 12 months on whether to build a new subway station right in front of your shop:
          <ul style="margin-top: 0.5rem; padding-left: 1.25rem;">
            <li><strong>If Subway Station Passes (50% chance):</strong> Foot traffic explodes. The shop makes a huge <strong>$140,000</strong> payoff (+$90,000 profit!).</li>
            <li><strong>If Subway Station Fails (50% chance):</strong> Foot traffic is dead. The shop only makes <strong>$20,000</strong> (-$30,000 loss).</li>
          </ul>
          <p style="margin-top: 0.75rem; color: #fff;">
            <strong>Your Options:</strong>
            <br/>• <strong>Choice 1 (Open Now):</strong> Expected average profit is <strong>+$30,000</strong>, but you take the risk right now.
            <br/>• <strong>Choice 2 (Pay to Reserve & Wait 1 Year):</strong> Wait until the city vote is 100% decided. If it passes, you build and make the big $90k profit. If it fails, you walk away and spend $0. 
            <br/><em>The Catch:</em> Reserving the spot for a year costs <strong>$18,000 in waiting fees</strong>. After the fee, your expected average profit drops to <strong>+$27,000</strong>.
          </p>
        </div>

        <div class="choice-grid two-col">
          <div class="choice-card ${state.responses.real_option_choice === 'invest_now' ? 'selected' : ''}" 
               onclick="window.selectRealOptionChoice('invest_now')"
               onmouseenter="window.hoverStart('opt_invest_now')"
               onmouseleave="window.hoverEnd('opt_invest_now')">
            <div class="choice-header">
              <span class="choice-tag">Choice 1</span>
              <span class="key-pill">Key [1]</span>
            </div>
            <div class="choice-name">Open Right Now ($50k)</div>
            <div class="choice-details">
              Don't waste $18,000 on waiting fees. Take the risk now for a higher average profit (+$30k).
            </div>
          </div>

          <div class="choice-card ${state.responses.real_option_choice === 'wait_for_information' ? 'selected' : ''}" 
               onclick="window.selectRealOptionChoice('wait_for_information')"
               onmouseenter="window.hoverStart('opt_wait')"
               onmouseleave="window.hoverEnd('opt_wait')">
            <div class="choice-header">
              <span class="choice-tag">Choice 2</span>
              <span class="key-pill">Key [2]</span>
            </div>
            <div class="choice-name">Pay $18,000 to Wait</div>
            <div class="choice-details">
              Buy 100% certainty so you never risk losing your shirt, even if the fee reduces profits (+$27k).
            </div>
          </div>
        </div>

        <div class="input-estimation-box" style="margin-top: 1.5rem;">
          <div class="input-label-row">
            <span style="font-weight: 600; color: #fff;">How much would you be willing to pay for certainty?</span>
            <span style="color: var(--accent-cyan); font-family: var(--font-mono); font-weight: 700;">
              $${state.responses.option_switch_threshold.toLocaleString()}
            </span>
          </div>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.75rem;">
            What is the maximum holding fee you would pay to wait for 100% certainty instead of risking it today?
          </p>
          <input type="range" 
                 min="1000" 
                 max="35000" 
                 step="1000" 
                 value="${state.responses.option_switch_threshold}"
                 style="width: 100%; accent-color: var(--accent-cyan);"
                 oninput="window.updateOptionThreshold(this.value)" />
        </div>

        <div class="survey-footer">
          <button class="btn-secondary" onclick="window.prevStep()">← Previous</button>
          <button class="btn-primary" onclick="window.advanceStep()" ${!state.responses.real_option_choice ? 'disabled' : ''}>
            Finish & See My Results →
          </button>
        </div>
      </div>
    `;
  }

  // 9. SCREEN 9: FRIENDLY DEBRIEF & BEHAVIORAL PROFILE
  else if (step.id === 'debrief') {
    const m = state.personalMetrics || {};
    const lambda = m.lambda || 2.0;
    const est = m.userEstimate || 0;
    const trueCost = m.trueCostOfDelay || 39408;

    let lambdaLabel = 'Normal Sensitivity';
    let lambdaDesc = `Losses sting you about <strong>${lambda}x</strong> more than wins feel good (which is right in line with most human beings!).`;
    if (lambda <= 1.0) {
      lambdaLabel = 'Bold & Unfazed by Losses';
      lambdaDesc = `You treat $100 won exactly the same as $100 lost. You don't let fear of loss hold you back.`;
    } else if (lambda >= 2.5) {
      lambdaLabel = 'Careful & Loss-Protective';
      lambdaDesc = `Losses sting you heavily (<strong>${lambda}x</strong> more than gains). You strongly prioritize not losing what you already have.`;
    }

    stepHtml = `
      <div class="survey-card" style="padding-top: 2.5rem;">
        <div class="debrief-hero">
          <div class="debrief-avatar-badge">🧠</div>
          <span class="badge-tag cyan">Challenge Complete!</span>
          <h1 class="survey-title" style="font-size: 2rem;">Your Decision Personality</h1>
          <p class="survey-description" style="max-width: 620px; margin: 0 auto 1.5rem;">
            Here is what your gut choices reveal about how your brain handles risk, money, and time:
          </p>
        </div>

        <div class="debrief-grid">
          <!-- Card 1: Loss Sensitivity -->
          <div class="debrief-card">
            <div class="debrief-metric-header">
              <span class="badge-tag emerald">Loss Sensitivity</span>
              <span style="font-size: 1.2rem;">⚖️</span>
            </div>
            <div class="debrief-metric-value">
              ${lambda}x
            </div>
            <div class="debrief-metric-title">${lambdaLabel}</div>
            <div class="debrief-metric-body">
              ${lambdaDesc}
            </div>
          </div>

          <!-- Card 2: Compounding Trick -->
          <div class="debrief-card">
            <div class="debrief-metric-header">
              <span class="badge-tag violet">Waiting Cost</span>
              <span style="font-size: 1.2rem;">⏳</span>
            </div>
            <div class="debrief-metric-value" style="color: ${est < 25000 ? 'var(--accent-rose)' : 'var(--accent-emerald)'};">
              $${est.toLocaleString()}
            </div>
            <div class="debrief-metric-title">${m.egbCategory || 'Exponential Effect'}</div>
            <div class="debrief-metric-body">
              You guessed that waiting 8 years lost <strong>$${est.toLocaleString()}</strong>.
              In reality, waiting cost a massive <strong>$${trueCost.toLocaleString()}</strong>! Because of compounding, waiting 8 years cut final wealth in half.
            </div>
          </div>

          <!-- Card 3: Real Options -->
          <div class="debrief-card">
            <div class="debrief-metric-header">
              <span class="badge-tag cyan">Certainty Value</span>
              <span style="font-size: 1.2rem;">🎯</span>
            </div>
            <div class="debrief-metric-value">
              $${state.responses.option_switch_threshold.toLocaleString()}
            </div>
            <div class="debrief-metric-title">Price of Certainty</div>
            <div class="debrief-metric-body">
              ${m.optionInsight || 'You balanced the cost of waiting against the risk.'}
            </div>
          </div>
        </div>

        <div style="background: rgba(15,23,42,0.8); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
          <div>
            <h4 style="color: #fff; margin-bottom: 0.25rem;">Thanks for participating!</h4>
            <p style="font-size: 0.85rem; color: var(--text-muted);">
              Your anonymous response has been saved and added to the research study.
            </p>
          </div>
          <button class="btn-primary" onclick="window.switchMode('analytics')">
            View Live Results Dashboard →
          </button>
        </div>
      </div>
    `;
  }

  // Progress Bar
  if (step.id !== 'welcome' && step.id !== 'debrief') {
    container.innerHTML = `
      <div class="survey-wrapper">
        <div class="survey-progress-bar-container">
          <div class="progress-meta">
            <span class="step-name">${step.name}</span>
            <span style="font-family: var(--font-mono);">${state.currentStepIndex} of ${STEPS.length - 2}</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width: ${progressPct}%;"></div>
          </div>
        </div>
        ${stepHtml}
      </div>
    `;
  } else {
    container.innerHTML = `<div class="survey-wrapper">${stepHtml}</div>`;
  }
}

function renderConfidencePicker() {
  const current = state.responses.confidence_rating || 4;
  let starsHtml = '';
  for (let i = 1; i <= 5; i++) {
    starsHtml += `
      <button class="star-btn ${i <= current ? 'active' : ''}" onclick="window.setConfidenceRating(${i})">
        ★
      </button>
    `;
  }
  return `
    <div class="confidence-box">
      <span style="font-size: 0.88rem; color: var(--text-muted);">How confident do you feel in this choice?</span>
      <div class="confidence-stars">${starsHtml}</div>
    </div>
  `;
}

// -------------------------------------------------------------
// RESEARCHER ANALYTICS PORTAL
// -------------------------------------------------------------
async function fetchAnalytics() {
  try {
    const res = await fetch('/api/survey/analytics');
    const json = await res.json();
    state.analyticsData = json.data;
  } catch (err) {
    console.error('Failed to fetch analytics:', err);
  }
}

async function renderAnalyticsPortal(container) {
  await fetchAnalytics();
  const d = state.analyticsData || {};
  const sum = d.summary || {};
  const fr = d.framing || {};
  const anc = d.anchoring || {};
  const loss = d.lossAversion || {};
  const delay = d.delayAndRealOptions || {};
  const tele = d.telemetry || {};

  container.innerHTML = `
    <div class="analytics-wrapper">
      <div class="analytics-header-row">
        <div>
          <span class="badge-tag cyan">Live Research Dashboard</span>
          <h1 style="font-size: 1.85rem; font-weight: 800; color: #fff;">Behavioral Analytics</h1>
          <p style="font-size: 0.9rem; color: var(--text-muted);">
            Immediate statistical synthesis of Framing Effects, Loss Aversion, and Cost of Delay.
          </p>
        </div>

        <div class="analytics-actions">
          <button class="btn-action-sm" onclick="window.seedBenchmarkData()">
            ⚡ Seed 50 Demo Responses
          </button>
          <button class="btn-action-sm" onclick="window.exportCsv()">
            📥 Download CSV
          </button>
          <button class="btn-action-sm" onclick="window.exportJson()">
            💾 Download JSON
          </button>
          <button class="btn-action-sm danger" onclick="window.resetData()">
            🗑️ Clear Responses
          </button>
        </div>
      </div>

      <!-- KPI Cards -->
      <div class="kpi-row">
        <div class="kpi-card">
          <div class="kpi-title">Total Participants</div>
          <div class="kpi-number">${sum.total || 0}</div>
          <div class="kpi-subtext">Cohort α: ${sum.alphaCount || 0} | Cohort β: ${sum.betaCount || 0}</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-title">Framing Shift (Δ%)</div>
          <div class="kpi-number" style="color: var(--accent-cyan);">+${fr.framingShiftDelta || 0}%</div>
          <div class="kpi-subtext">χ² = ${fr.chiSquare || 0} (p = ${fr.pValue ?? 1})</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-title">Avg Loss Sensitivity (λ)</div>
          <div class="kpi-number" style="color: var(--accent-emerald);">${loss.meanLambda || 0}x</div>
          <div class="kpi-subtext">Benchmark: 2.25x | Median: ${loss.medianLambda || 0}x</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-title">Linear Growth Bias</div>
          <div class="kpi-number" style="color: var(--accent-rose);">${delay.linearBiasProportion || 0}%</div>
          <div class="kpi-subtext">Underestimate Cost of Waiting</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-title">Median Time to Complete</div>
          <div class="kpi-number" style="color: var(--accent-amber);">${Math.round((tele.medianLatencyMs || 0) / 1000)}s</div>
          <div class="kpi-subtext">Fast 2-3 minute survey</div>
        </div>
      </div>

      <!-- Dynamic Visual Charts -->
      <div class="charts-grid two-col">
        <div class="chart-card">
          <div class="chart-card-header">
            <div>
              <div class="chart-title">Framing Effect: Gain vs Loss Frame</div>
              <div class="chart-subtitle">Risk-seeking shift when choices are framed as losses</div>
            </div>
            <span class="badge-tag cyan">Study 1</span>
          </div>
          <div class="chart-container" id="chartFraming"></div>
        </div>

        <div class="chart-card">
          <div class="chart-card-header">
            <div>
              <div class="chart-title">Loss Aversion (λ) Distribution</div>
              <div class="chart-subtitle">How many times harder losses sting than wins</div>
            </div>
            <span class="badge-tag emerald">Study 2</span>
          </div>
          <div class="chart-container" id="chartLambda"></div>
        </div>

        <div class="chart-card">
          <div class="chart-card-header">
            <div>
              <div class="chart-title">House Price Anchoring: $850k vs $350k</div>
              <div class="chart-subtitle">How the suggested number pulled guesses</div>
            </div>
            <span class="badge-tag amber">Study 1</span>
          </div>
          <div class="chart-container" id="chartAnchoring"></div>
        </div>

        <div class="chart-card">
          <div class="chart-card-header">
            <div>
              <div class="chart-title">Rule of 72: Real Delay Cost vs Guesses</div>
              <div class="chart-subtitle">True Cost ($39,408) vs participant estimates</div>
            </div>
            <span class="badge-tag violet">Study 3</span>
          </div>
          <div class="chart-container" id="chartDelay"></div>
        </div>

        <div class="chart-card" style="grid-column: 1 / -1;">
          <div class="chart-card-header">
            <div>
              <div class="chart-title">Bakery Dilemma: Pay $18k to Wait vs Open Now</div>
              <div class="chart-subtitle">Certainty bias vs recognizing the cost of delay</div>
            </div>
            <span class="badge-tag violet">Study 3</span>
          </div>
          <div class="chart-container" id="chartOptions" style="height: 220px;"></div>
        </div>
      </div>

      <!-- Participant Table -->
      <div class="data-table-card">
        <div class="table-header-row">
          <div>
            <h3 style="color: #fff; font-size: 1.15rem; font-weight: 700;">Participant Responses</h3>
            <p style="font-size: 0.82rem; color: var(--text-muted);">
              Anonymous records with sub-second decision latencies
            </p>
          </div>
          <select id="cohortFilterSelect" 
                  style="background: var(--bg-secondary); border: 1px solid var(--border-color); color: #fff; padding: 0.4rem 0.75rem; border-radius: 6px; font-size: 0.85rem;"
                  onchange="window.filterTable(this.value)">
            <option value="all">All Cohorts (α & β)</option>
            <option value="Alpha">Cohort Alpha (Gain/High)</option>
            <option value="Beta">Cohort Beta (Loss/Low)</option>
          </select>
        </div>

        <div class="table-responsive" id="tableContainer">
          <p style="color: var(--text-muted); font-size: 0.9rem;">Loading...</p>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    BehavioralCharts.renderFramingChart('chartFraming', fr);
    BehavioralCharts.renderLambdaDistribution('chartLambda', loss);
    BehavioralCharts.renderAnchoringChart('chartAnchoring', anc);
    BehavioralCharts.renderDelayCompoundingChart('chartDelay', delay);
    BehavioralCharts.renderRealOptionsChart('chartOptions', delay);
  }, 50);

  loadResponsesTable();
}

async function loadResponsesTable() {
  try {
    let url = '/api/survey/responses';
    if (state.activeFilterCohort && state.activeFilterCohort !== 'all') {
      url += `?cohort=${state.activeFilterCohort}`;
    }
    const res = await fetch(url);
    const data = await res.json();
    const rows = data.responses || [];
    const container = document.getElementById('tableContainer');
    if (!container) return;

    if (rows.length === 0) {
      container.innerHTML = `
        <div style="padding: 2rem; text-align: center; color: var(--text-muted);">
          No participant records yet. Take the survey or click "Seed 50 Demo Responses"!
        </div>
      `;
      return;
    }

    let tbody = '';
    rows.slice(0, 30).forEach(r => {
      const isAlpha = r.cohort === 'Alpha';
      const m = r.metrics || {};
      const latencySec = ((r.telemetry?.totalReactionTimeMs || 0) / 1000).toFixed(1);
      
      tbody += `
        <tr>
          <td style="font-family: var(--font-mono); font-size: 0.78rem; color: var(--text-dim);">
            ${(r.sessionId || '').substring(0, 8)}...
          </td>
          <td>
            <span class="badge-tag ${isAlpha ? 'cyan' : 'rose'}" style="margin: 0; padding: 0.15rem 0.4rem; font-size: 0.65rem;">
              ${r.cohort}
            </span>
          </td>
          <td style="font-weight: 600;">
            Plan ${r.responses?.framing_job_choice || '-'}
          </td>
          <td>
            $${r.responses?.anchoring_valuation_estimate || '-'}k
          </td>
          <td style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-emerald);">
            ${m.lambda ?? '-'}x
          </td>
          <td>
            $${Number(r.responses?.delay_growth_estimate || 0).toLocaleString()}
          </td>
          <td>
            ${r.responses?.real_option_choice === 'invest_now' 
              ? '<span style="color: var(--accent-cyan); font-weight: 600;">Open Now</span>' 
              : '<span style="color: var(--accent-violet); font-weight: 600;">Pay & Wait</span>'}
          </td>
          <td style="font-family: var(--font-mono); font-size: 0.8rem;">
            ${latencySec}s
          </td>
          <td>
            <button class="btn-action-sm" style="padding: 0.2rem 0.5rem; font-size: 0.72rem;" onclick="window.inspectTelemetry('${r.sessionId}')">
              Inspect
            </button>
          </td>
        </tr>
      `;
    });

    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Session</th>
            <th>Cohort</th>
            <th>Rescue Plan</th>
            <th>House Est ($k)</th>
            <th>Loss λ</th>
            <th>Delay Guess ($)</th>
            <th>Bakery Choice</th>
            <th>Time</th>
            <th>Audit</th>
          </tr>
        </thead>
        <tbody>
          ${tbody}
        </tbody>
      </table>
    `;
  } catch (err) {
    console.error('Failed to load table:', err);
  }
}

// Global Actions
window.advanceStep = handleNextStep;
window.prevStep = handlePrevStep;

window.switchMode = (mode) => {
  state.mode = mode;
  const surveyBtn = document.getElementById('btnModeSurvey');
  const analyticsBtn = document.getElementById('btnModeAnalytics');
  if (surveyBtn && analyticsBtn) {
    if (mode === 'survey') {
      surveyBtn.classList.add('active');
      analyticsBtn.classList.remove('active');
    } else {
      analyticsBtn.classList.add('active');
      surveyBtn.classList.remove('active');
    }
  }
  render();
};

window.hoverStart = (optId) => telemetry.recordHoverStart(optId);
window.hoverEnd = (optId) => telemetry.recordHoverEnd(optId);

window.updateAnchoringEstimate = (val) => {
  state.responses.anchoring_valuation_estimate = Number(val);
  telemetry.recordRevision();
};

window.updateDelayEstimate = (val) => {
  state.responses.delay_growth_estimate = Number(val);
  telemetry.recordRevision();
};

window.updateOptionThreshold = (val) => {
  state.responses.option_switch_threshold = Number(val);
  render();
};

window.filterTable = (cohort) => {
  state.activeFilterCohort = cohort;
  loadResponsesTable();
};

window.seedBenchmarkData = async () => {
  try {
    const res = await fetch('/api/survey/seed-demo', { method: 'POST' });
    const json = await res.json();
    showToast(json.message);
    render();
  } catch (err) {
    showToast('Failed to seed benchmark data.');
  }
};

window.resetData = async () => {
  if (!confirm('Are you sure you want to clear all responses?')) return;
  try {
    const res = await fetch('/api/survey/reset', { method: 'POST' });
    const json = await res.json();
    showToast(json.message);
    render();
  } catch (err) {
    showToast('Failed to clear data.');
  }
};

window.exportCsv = () => {
  window.location.href = '/api/survey/export.csv';
};

window.exportJson = () => {
  window.location.href = '/api/survey/export.json';
};

window.inspectTelemetry = async (sessionId) => {
  try {
    const res = await fetch('/api/survey/responses');
    const data = await res.json();
    const item = data.responses.find(r => r.sessionId === sessionId);
    if (!item) return;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <div>
            <h3 style="color: #fff; font-size: 1.15rem;">Decision Audit</h3>
            <p style="font-size: 0.8rem; color: var(--text-dim); font-family: var(--font-mono);">${sessionId}</p>
          </div>
          <button class="btn-close-modal" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>

        <div style="background: rgba(15,23,42,0.8); border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem; margin-bottom: 1.25rem;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; font-size: 0.85rem;">
            <div>Cohort: <strong>${item.cohort}</strong></div>
            <div>Total Time: <strong>${((item.telemetry?.totalReactionTimeMs || 0) / 1000).toFixed(1)}s</strong></div>
            <div>Changed Answers: <strong>${item.telemetry?.switchCount || 0} times</strong></div>
            <div>Left Tab: <strong>${item.telemetry?.tabSwitchCount || 0} times</strong></div>
            <div>Loss Sensitivity: <strong>${item.metrics?.lambda || '-'}x</strong></div>
          </div>
        </div>

        <h4 style="color: #fff; font-size: 0.95rem; margin-bottom: 0.5rem;">Time per Question:</h4>
        <div style="max-height: 200px; overflow-y: auto; font-family: var(--font-mono); font-size: 0.78rem; background: #000; border: 1px solid var(--border-color); border-radius: 6px; padding: 0.75rem;">
          ${(item.telemetry?.stepTimes || []).map(st => `
            <div style="margin-bottom: 0.35rem; color: #cbd5e1;">
              • [${st.stepId}]: <strong>${(st.reactionTimeMs / 1000).toFixed(2)}s</strong> | switches: ${st.switches || 0}
            </div>
          `).join('') || '<div style="color: var(--text-dim);">No step latency details recorded.</div>'}
        </div>

        <div style="margin-top: 1.5rem; text-align: right;">
          <button class="btn-primary" style="padding: 0.5rem 1.25rem; font-size: 0.88rem;" onclick="this.closest('.modal-overlay').remove()">
            Close
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  } catch (err) {
    console.error('Modal error:', err);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  initSession();
});
