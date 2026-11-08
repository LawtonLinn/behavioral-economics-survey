import { telemetry } from './telemetry.js';
import { BehavioralCharts } from './charts.js';
import { ASSETS, analyzePoliticalText, simulateMarketResponse } from './market-predictor.js';

// Application State
const state = {
  mode: 'home', // 'home' | 'dashboard' | 'survey' | 'analytics' | 'market' | 'methodology' | 'about'
  sessionId: null,
  cohort: null, // 'Alpha' (Gain/High) | 'Beta' (Loss/Low)
  currentStepIndex: 0,
  isSubmitted: false,
  personalMetrics: null,
  
  // Researcher Admin Security
  isAdmin: !!sessionStorage.getItem('veritas_admin_pin'),
  adminPin: sessionStorage.getItem('veritas_admin_pin') || '',
  
  // Market Simulation Subsystem State
  market: {
    activeTab: 'text', // 'text' | 'url' | 'upload' | 'preset'
    activeChartView: 'candlestick', // 'candlestick' | 'montecarlo'
    inputText: '',
    inputUrl: '',
    selectedPresetId: 'fed_rate_cut',
    certainty: 75,
    horizonDays: 30,
    manualDirection: 'auto',
    loading: false,
    lastResult: null,
    history: []
  },

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
  { id: 'welcome', name: 'Start', emoji: '🚀' },
  { id: 'framing_jobs', name: 'Rescue Plan', emoji: '🏭' },
  { id: 'anchoring_quote', name: 'House Value', emoji: '🏡' },
  { id: 'framing_discount', name: 'Store Checkout', emoji: '🛒' },
  { id: 'loss_lotteries', name: 'Coin Tosses', emoji: '🪙' },
  { id: 'loss_sunk', name: 'Selling Dilemma', emoji: '📦' },
  { id: 'rule72_delay', name: 'Waiting Cost', emoji: '📈' },
  { id: 'real_options', name: 'Bakery Decision', emoji: '🥐' },
  { id: 'debrief', name: 'Your Results', emoji: '🧠' }
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
    updateMenuState();
    render();
  } catch (err) {
    state.sessionId = 'session-' + Date.now();
    state.cohort = Math.random() < 0.5 ? 'Alpha' : 'Beta';
    telemetry.initSession(state.sessionId, state.cohort);
    updateMenuState();
    render();
  }
}

function updateAdminButton() {
  const icon = document.getElementById('adminLockIcon');
  const text = document.getElementById('adminLockText');
  const btn = document.getElementById('adminLockBtn');
  if (!btn) return;
  
  if (state.isAdmin) {
    btn.classList.add('logged-in');
    if (state.mode === 'analytics') {
      icon.innerText = '←';
      text.innerText = 'Exit Admin';
    } else {
      icon.innerText = '📊';
      text.innerText = 'Researcher Portal';
    }
  } else {
    btn.classList.remove('logged-in');
    icon.innerText = '🔒';
    text.innerText = 'Researcher Access';
  }
}

function triggerHaptic(duration = 10) {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(duration);
    }
  } catch (e) {
    // ignore
  }
}

// Global Keyboard Navigation
window.addEventListener('keydown', (e) => {
  if (state.mode !== 'survey' || state.currentStepIndex === 0 || state.currentStepIndex >= STEPS.length - 1) return;
  const activeTag = document.activeElement ? document.activeElement.tagName : '';
  const targetTag = e.target ? e.target.tagName : '';
  if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || targetTag === 'INPUT' || targetTag === 'TEXTAREA') {
    return;
  }
  if (e.key === '1') handleKeySelection(1);
  if (e.key === '2') handleKeySelection(2);
});

function handleKeySelection(num) {
  const stepId = STEPS[state.currentStepIndex].id;
  if (stepId === 'framing_jobs') window.selectJobChoice(num === 1 ? 'A' : 'B');
  if (stepId === 'framing_discount') window.selectDiscountChoice(num === 1 ? 'cash' : 'credit');
  if (stepId === 'loss_sunk') window.selectSunkChoice(num === 1 ? 'sell_and_reallocate' : 'hold_for_breakeven');
  if (stepId === 'real_options') window.selectRealOptionChoice(num === 1 ? 'invest_now' : 'wait_for_information');
}

let isNavigating = false;

function handleNextStep() {
  if (isNavigating) return;
  const currentStep = STEPS[state.currentStepIndex];
  
  if (currentStep.id === 'framing_jobs' && !state.responses.framing_job_choice) {
    showToast('Please pick Plan A or Plan B to continue.');
    return;
  }
  if (currentStep.id === 'anchoring_quote') {
    const input = document.getElementById('anchoringInput');
    const inputVal = input ? parseFloat(input.value) : NaN;
    const est = !isNaN(inputVal) && inputVal > 0 ? inputVal : state.responses.anchoring_valuation_estimate;
    if (!est || est <= 0) {
      showToast('Please type your guess for what the house is worth.');
      if (input) input.focus();
      return;
    }
    state.responses.anchoring_valuation_estimate = est;
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
  if (currentStep.id === 'rule72_delay') {
    const input = document.getElementById('delayInput');
    const inputVal = input ? parseFloat(input.value) : NaN;
    const est = !isNaN(inputVal) && inputVal > 0 ? inputVal : state.responses.delay_growth_estimate;
    if (!est || est <= 0) {
      showToast('Please enter your gut guess in dollars.');
      if (input) input.focus();
      return;
    }
    state.responses.delay_growth_estimate = est;
  }
  if (currentStep.id === 'real_options' && !state.responses.real_option_choice) {
    showToast('Please pick Choice 1 or Choice 2.');
    return;
  }

  telemetry.finishStep(currentStep.id);
  triggerHaptic(12);

  if (currentStep.id === 'real_options') {
    submitSurvey();
    return;
  }

  isNavigating = true;
  const card = document.querySelector('.survey-card');
  if (card) {
    card.style.opacity = '0';
    card.style.transform = 'translateY(-4px)';
    setTimeout(() => {
      state.currentStepIndex++;
      telemetry.startStep(STEPS[state.currentStepIndex].id);
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      isNavigating = false;
    }, 150);
  } else {
    state.currentStepIndex++;
    telemetry.startStep(STEPS[state.currentStepIndex].id);
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    isNavigating = false;
  }
}

function handlePrevStep() {
  if (isNavigating || state.currentStepIndex <= 1) return;
  triggerHaptic(8);
  isNavigating = true;
  const card = document.querySelector('.survey-card');
  if (card) {
    card.style.opacity = '0';
    card.style.transform = 'translateY(4px)';
    setTimeout(() => {
      state.currentStepIndex--;
      telemetry.startStep(STEPS[state.currentStepIndex].id);
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      isNavigating = false;
    }, 150);
  } else {
    state.currentStepIndex--;
    telemetry.startStep(STEPS[state.currentStepIndex].id);
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    isNavigating = false;
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
    state.currentStepIndex = STEPS.length - 1;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('Results calculated!');
  } catch (err) {
    showToast('Error saving response. Please retry.');
  }
}

// User Actions
window.selectJobChoice = (choice) => {
  triggerHaptic(10);
  telemetry.recordOptionSelection(choice);
  state.responses.framing_job_choice = choice;
  const cards = document.querySelectorAll('.choice-card[data-job-choice]');
  cards.forEach(card => {
    card.classList.toggle('selected', card.getAttribute('data-job-choice') === choice);
  });
  const btn = document.getElementById('surveyNextBtn');
  if (btn) btn.disabled = false;
};

window.selectDiscountChoice = (choice) => {
  triggerHaptic(10);
  telemetry.recordOptionSelection(choice);
  state.responses.framing_discount_choice = choice;
  const cards = document.querySelectorAll('.choice-card[data-discount-choice]');
  cards.forEach(card => {
    card.classList.toggle('selected', card.getAttribute('data-discount-choice') === choice);
  });
  const btn = document.getElementById('surveyNextBtn');
  if (btn) btn.disabled = false;
};

window.toggleGambleChoice = (index, accept) => {
  triggerHaptic(10);
  telemetry.recordOptionSelection(`gamble_${index}_${accept}`);
  state.responses.loss_aversion_gambles[index] = accept;
  const row = document.querySelector(`.lottery-row[data-gamble-index="${index}"]`);
  if (row) {
    const acceptBtn = row.querySelector('.btn-gamble.accept');
    const rejectBtn = row.querySelector('.btn-gamble.reject');
    if (acceptBtn) acceptBtn.classList.toggle('selected', accept === true);
    if (rejectBtn) rejectBtn.classList.toggle('selected', accept === false);
  }
  const allAnswered = !state.responses.loss_aversion_gambles.some(v => v === null);
  const btn = document.getElementById('surveyNextBtn');
  if (btn && allAnswered) btn.disabled = false;
};

window.selectSunkChoice = (choice) => {
  triggerHaptic(10);
  telemetry.recordOptionSelection(choice);
  state.responses.loss_aversion_sunk_choice = choice;
  const cards = document.querySelectorAll('.choice-card[data-sunk-choice]');
  cards.forEach(card => {
    card.classList.toggle('selected', card.getAttribute('data-sunk-choice') === choice);
  });
  const btn = document.getElementById('surveyNextBtn');
  if (btn) btn.disabled = false;
};

window.selectRealOptionChoice = (choice) => {
  triggerHaptic(10);
  telemetry.recordOptionSelection(choice);
  state.responses.real_option_choice = choice;
  const cards = document.querySelectorAll('.choice-card[data-real-option-choice]');
  cards.forEach(card => {
    card.classList.toggle('selected', card.getAttribute('data-real-option-choice') === choice);
  });
  const btn = document.getElementById('surveyNextBtn');
  if (btn) btn.disabled = false;
};

window.setConfidenceRating = (rating) => {
  triggerHaptic(8);
  state.responses.confidence_rating = rating;
  const stars = document.querySelectorAll('.star-btn[data-star-rating]');
  stars.forEach(btn => {
    const starVal = Number(btn.getAttribute('data-star-rating'));
    btn.classList.toggle('active', starVal <= rating);
  });
};

// Left Sidebar Menu Drawer Controls
window.toggleLeftMenu = () => {
  const drawer = document.getElementById('sidebarDrawer');
  if (!drawer) return;
  const isOpen = drawer.classList.contains('open');
  if (isOpen) {
    window.closeLeftMenu();
  } else {
    window.openLeftMenu();
  }
};

window.openLeftMenu = () => {
  const drawer = document.getElementById('sidebarDrawer');
  const backdrop = document.getElementById('menuBackdrop');
  if (drawer) {
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
  }
  if (backdrop) {
    backdrop.classList.add('active');
  }
  updateMenuState();
};

window.closeLeftMenu = () => {
  const drawer = document.getElementById('sidebarDrawer');
  const backdrop = document.getElementById('menuBackdrop');
  if (drawer) {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
  }
  if (backdrop) {
    backdrop.classList.remove('active');
  }
};

// Section Navigation Handler from Menu Bar & Header
window.navigateToSection = (targetMode) => {
  window.closeLeftMenu();
  if (targetMode === 'home' || targetMode === 'dashboard' || targetMode === 'survey' || targetMode === 'methodology' || targetMode === 'about') {
    window.switchMode(targetMode);
    return;
  }
  if (!state.isAdmin) {
    window.promptAdminLogin(targetMode);
    return;
  }
  window.switchMode(targetMode);
};

window.startStudy = () => {
  state.currentStepIndex = 1;
  telemetry.startStep(STEPS[1].id);
  window.switchMode('survey');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.resetSurvey = () => {
  state.currentStepIndex = 0;
  state.isSubmitted = false;
  state.personalMetrics = null;
  state.responses = {
    framing_job_choice: null,
    anchoring_valuation_estimate: null,
    framing_discount_choice: null,
    loss_aversion_gambles: [null, null, null, null, null],
    loss_aversion_sunk_choice: null,
    delay_growth_estimate: null,
    real_option_choice: null,
    option_switch_threshold: 15000,
    confidence_rating: 4
  };
  telemetry.startStep(STEPS[0].id);
  window.switchMode('survey');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  showToast('Study reset to start.');
};

window.drawerAuthAction = () => {
  if (state.isAdmin) {
    state.isAdmin = false;
    state.adminPin = '';
    sessionStorage.removeItem('veritas_admin_pin');
    showToast('Researcher session locked.');
    updateMenuState();
    if (state.mode === 'analytics' || state.mode === 'market') {
      window.switchMode('dashboard');
    }
  } else {
    window.closeLeftMenu();
    window.promptAdminLogin(state.mode === 'market' ? 'market' : 'analytics');
  }
};

function updateMenuState() {
  // Update Active Item in Drawer
  const items = {
    home: document.getElementById('menuItemHome'),
    dashboard: document.getElementById('menuItemDashboard'),
    survey: document.getElementById('menuItemSurvey'),
    analytics: document.getElementById('menuItemAnalytics'),
    market: document.getElementById('menuItemMarket'),
    methodology: document.getElementById('menuItemMethodology'),
    about: document.getElementById('menuItemAbout')
  };
  for (const [key, el] of Object.entries(items)) {
    if (el) el.classList.toggle('active', state.mode === key);
  }

  // Update Desktop Header Nav Buttons
  const navBtns = {
    home: document.getElementById('navBtnHome'),
    dashboard: document.getElementById('navBtnDashboard'),
    survey: document.getElementById('navBtnSurvey'),
    methodology: document.getElementById('navBtnMethodology'),
    about: document.getElementById('navBtnAbout')
  };
  for (const [key, el] of Object.entries(navBtns)) {
    if (el) el.classList.toggle('active', state.mode === key);
  }

  // Update Lock Indicators in Drawer
  const lockAnalytics = document.getElementById('menuLockAnalytics');
  const lockMarket = document.getElementById('menuLockMarket');
  if (lockAnalytics) {
    lockAnalytics.innerText = state.isAdmin ? '🔓' : '🔒';
    lockAnalytics.classList.toggle('unlocked', state.isAdmin);
  }
  if (lockMarket) {
    lockMarket.innerText = state.isAdmin ? '🔓' : '🔒';
    lockMarket.classList.toggle('unlocked', state.isAdmin);
  }

  // Update Status Card in Drawer
  const statusDot = document.getElementById('drawerStatusDot');
  const statusLabel = document.getElementById('drawerStatusLabel');
  const authBtn = document.getElementById('drawerAuthBtn');
  if (statusDot) {
    statusDot.className = `status-dot ${state.isAdmin ? 'unlocked' : 'locked'}`;
  }
  if (statusLabel) {
    statusLabel.innerText = state.isAdmin ? 'Researcher Access: Unlocked' : 'Researcher Access: Locked';
  }
  if (authBtn) {
    authBtn.innerText = state.isAdmin ? '🔒 Lock Session' : 'Unlock Access →';
  }

  // Update Top Header Current Section Badge
  const badge = document.getElementById('currentSectionBadge');
  if (badge) {
    const badgeMap = {
      home: '🏛️ Overview',
      dashboard: '📑 Platform',
      survey: '🧠 Study',
      analytics: '📊 Analytics',
      market: '⚡ Market Predictor',
      methodology: '🔬 Methodology',
      about: '💡 About'
    };
    badge.innerHTML = badgeMap[state.mode] || '🏛️ Overview';
  }

  updateAdminButton();
}

// Admin Password Gate
window.promptAdminLogin = (targetMode = 'analytics') => {
  if (state.isAdmin) {
    window.switchMode(targetMode);
    return;
  }

  // Show PIN entry modal
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'pinModal';
  const title = targetMode === 'market' ? 'Political Market Simulator' : 'Researcher Access';
  const desc = targetMode === 'market' 
    ? 'Enter authorization credentials to unlock the quantitative political estimation model:' 
    : 'Enter researcher credentials to access private aggregate response distributions:';

  modal.innerHTML = `
    <div class="modal-content" style="max-width: 420px; text-align: center;">
      <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">${targetMode === 'market' ? '⚡' : '🔒'}</div>
      <h3 style="color: var(--text-main); font-size: 1.35rem; font-weight: 800; margin-bottom: 0.4rem;">${title}</h3>
      <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 1.5rem; line-height: 1.5;">
        ${desc}
      </p>

      <input type="password" 
             id="adminPinInput" 
             placeholder="••••" 
             style="width: 100%; text-align: center; font-size: 1.5rem; letter-spacing: 0.25em; padding: 0.85rem; border-radius: 12px; background: var(--bg-surface); border: 2px solid var(--border-color); color: var(--text-main); outline: none; margin-bottom: 1.25rem;" 
             autofocus />

      <div style="display: flex; gap: 0.75rem;">
        <button class="btn-secondary" style="flex: 1;" onclick="document.getElementById('pinModal').remove()">
          Cancel
        </button>
        <button class="btn-primary" style="flex: 1; justify-content: center;" onclick="window.submitAdminPin('${targetMode}')">
          Verify Access →
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  setTimeout(() => {
    const input = document.getElementById('adminPinInput');
    if (input) {
      input.focus();
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') window.submitAdminPin(targetMode);
      });
    }
  }, 100);
};

window.submitAdminPin = async (targetMode = 'analytics') => {
  const input = document.getElementById('adminPinInput');
  if (!input) return;
  const pin = input.value.trim();

  try {
    const res = await fetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    const data = await res.json();
    if (data.success) {
      state.isAdmin = true;
      state.adminPin = pin;
      sessionStorage.setItem('veritas_admin_pin', pin);
      document.getElementById('pinModal')?.remove();
      showToast(targetMode === 'market' ? 'Unlocked Market Predictor!' : 'Unlocked Researcher Analytics!');
      window.switchMode(targetMode);
    } else {
      input.style.borderColor = '#f43f5e';
      showToast('Incorrect credentials. Access denied.');
    }
  } catch (err) {
    showToast('Connection error.');
  }
};

window.switchMode = (mode) => {
  if ((mode === 'analytics' || mode === 'market') && !state.isAdmin) {
    window.promptAdminLogin(mode);
    return;
  }
  state.mode = mode;
  updateMenuState();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

function render() {
  const container = document.getElementById('mainApp');
  if (!container) return;

  // Adjust container width classes based on active view
  if (state.mode === 'home') {
    container.className = 'main-content flush';
    renderHomeView(container);
  } else if (state.mode === 'dashboard') {
    container.className = 'main-content wide';
    renderDashboardHub(container);
  } else if (state.mode === 'analytics') {
    container.className = 'main-content wide';
    renderAnalyticsPortal(container);
  } else if (state.mode === 'market') {
    container.className = 'main-content wide';
    renderMarketPredictorView(container);
  } else if (state.mode === 'methodology') {
    container.className = 'main-content wide';
    renderMethodologyView(container);
  } else if (state.mode === 'about') {
    container.className = 'main-content';
    renderAboutView(container);
  } else {
    container.className = 'main-content';
    renderSurveyView(container);
  }
}

// -------------------------------------------------------------
// 1. HOMEPAGE VIEW (INSTITUTIONAL OVERVIEW)
// -------------------------------------------------------------
function renderHomeView(container) {
  container.innerHTML = `
    <!-- Hero Section -->
    <section class="v-hero-section">
      <div class="v-hero-inner">
        <div class="v-institution-pill">
          <span class="pill-dot"></span>
          Behavioral Science & Predictive Analytics Institute
        </div>

        <h1 class="v-hero-headline">
          Advancing Research. Understanding Behavior. Informing Decisions.
        </h1>

        <p class="v-hero-substatement">
          VERITAS Decision Lab integrates behavioral science, political analysis, statistical modeling, and predictive intelligence to transform complex information into meaningful, actionable insights.
        </p>

        <div class="v-hero-actions">
          <button class="btn-primary" style="padding: 0.95rem 2.2rem; font-size: 1rem;" onclick="window.navigateToSection('dashboard')">
            Explore Research Platform →
          </button>
          <button class="btn-secondary" style="padding: 0.95rem 1.8rem; font-size: 1rem;" onclick="window.startStudy()">
            Participate in Decision Study
          </button>
        </div>

        <!-- Institutional Metric Strip -->
        <div class="v-hero-stats-strip">
          <div class="v-stat-block">
            <div class="v-stat-number">4</div>
            <div class="v-stat-label">Core Research Pillars</div>
          </div>
          <div class="v-stat-block">
            <div class="v-stat-number">7</div>
            <div class="v-stat-label">Empirical Decision Scenarios</div>
          </div>
          <div class="v-stat-block">
            <div class="v-stat-number">10</div>
            <div class="v-stat-label">Tracked Asset Classes</div>
          </div>
          <div class="v-stat-block">
            <div class="v-stat-number">100%</div>
            <div class="v-stat-label">Transparent Methodology</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Section 1: Research Areas Grid -->
    <section class="v-section-container">
      <div class="v-section-header">
        <span class="v-section-kicker">Empirical Focus</span>
        <h2 class="v-section-title">Primary Research Disciplines</h2>
        <p class="v-section-desc">
          Our investigative work spans cognitive psychology, computational NLP, econometric time-series, and microeconomic choice under uncertainty.
        </p>
      </div>

      <div class="v-research-grid">
        <!-- Area 1 -->
        <div class="v-research-card">
          <div class="v-card-icon-wrap">🧠</div>
          <h3 class="v-card-title">Behavioral Economics & Prospect Theory</h3>
          <p class="v-card-body">
            Empirical investigation of cognitive biases, reference dependence, framing effects (Tversky & Kahneman), loss aversion parameter estimation (λ), and numerical anchoring in valuation tasks.
          </p>
          <div class="v-card-tags">
            <span class="v-tag">Framing Effects</span>
            <span class="v-tag">Loss Aversion λ</span>
            <span class="v-tag">Anchoring Bias</span>
          </div>
          <button class="btn-secondary" style="font-size: 0.85rem; width: 100%;" onclick="window.navigateToSection('survey')">
            View Behavioral Modules →
          </button>
        </div>

        <!-- Area 2 -->
        <div class="v-research-card">
          <div class="v-card-icon-wrap">⚡</div>
          <h3 class="v-card-title">Political Analysis & Policy Sensitivity</h3>
          <p class="v-card-body">
            Multi-factor natural language processing to categorize legislative, geopolitical, and monetary policy news across structured policy domains and quantify asset class sensitivity.
          </p>
          <div class="v-card-tags">
            <span class="v-tag">NLP Classification</span>
            <span class="v-tag">Policy Shocks</span>
            <span class="v-tag">Sentiment Scoring</span>
          </div>
          <button class="btn-secondary" style="font-size: 0.85rem; width: 100%;" onclick="window.navigateToSection('market')">
            Launch Policy Predictor →
          </button>
        </div>

        <!-- Area 3 -->
        <div class="v-research-card">
          <div class="v-card-icon-wrap">📈</div>
          <h3 class="v-card-title">Statistical Modeling & Decision Intelligence</h3>
          <p class="v-card-body">
            Chi-Square test of independence (2x2 contingency tables), Geometric Brownian Motion Monte Carlo trajectories, compounding growth biases, and real option evaluation under volatility.
          </p>
          <div class="v-card-tags">
            <span class="v-tag">Monte Carlo Engine</span>
            <span class="v-tag">Chi-Square Test</span>
            <span class="v-tag">Real Options</span>
          </div>
          <button class="btn-secondary" style="font-size: 0.85rem; width: 100%;" onclick="window.navigateToSection('methodology')">
            Inspect Methodology →
          </button>
        </div>
      </div>
    </section>

    <!-- Section 2: Platform Callout Banner -->
    <section style="background: var(--bg-navy); color: #ffffff; padding: 4.5rem 1.5rem; border-top: 1px solid var(--border-navy); border-bottom: 1px solid var(--border-navy);">
      <div style="max-width: 1040px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 2rem;">
        <div style="max-width: 640px;">
          <span style="font-family: var(--font-mono); font-size: 0.8rem; font-weight: 700; letter-spacing: 0.1em; color: #38bdf8; text-transform: uppercase; margin-bottom: 0.5rem; display: block;">
            Integrated Research Platform
          </span>
          <h2 style="font-family: var(--font-display); font-size: 2.2rem; font-weight: 800; color: #ffffff; letter-spacing: -0.02em; margin-bottom: 0.85rem;">
            Unified Decision-Intelligence Dashboard
          </h2>
          <p style="color: #94a3b8; font-size: 1.05rem; line-height: 1.65;">
            Explore all analytical tools, live behavioral synthesis charts, predictive simulation engines, and exportable datasets in one integrated environment.
          </p>
        </div>
        <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
          <button class="btn-primary" style="background: #ffffff; color: #0f172a; border-color: #ffffff; font-weight: 800;" onclick="window.navigateToSection('dashboard')">
            Launch Platform Hub →
          </button>
          <button class="btn-secondary" style="background: rgba(255,255,255,0.08); color: #ffffff; border-color: rgba(255,255,255,0.2);" onclick="window.navigateToSection('methodology')">
            Review Framework
          </button>
        </div>
      </div>
    </section>

    <!-- Section 3: Institutional Philosophy & Mission -->
    <section class="v-section-container">
      <div class="v-section-header">
        <span class="v-section-kicker">Institutional Tenets</span>
        <h2 class="v-section-title">The VERITAS Research Philosophy</h2>
        <p class="v-section-desc">
          Traditional neoclassical economics assumes frictionless markets and hyper-rational actors. VERITAS bridges the gap between theoretical models and real human behavior.
        </p>
      </div>

      <div class="v-methodology-grid">
        <div class="v-method-box">
          <h4><span>🔬</span> Empirical Over Theoretical</h4>
          <p>
            We prioritize observed decision telemetry, reaction latency, and choice distributions over idealized assumptions of mathematical equilibrium. Data reveals how individuals make consequential choices under pressure.
          </p>
        </div>

        <div class="v-method-box">
          <h4><span>⚖️</span> Methodological Transparency</h4>
          <p>
            Every analytical formula — from our Fisher-Yates randomized cohort assignment to Chi-Square Yates correction and Monte Carlo drift parameters — is open, documented, and reproducible.
          </p>
        </div>

        <div class="v-method-box">
          <h4><span>🎯</span> Quantitative Multi-Factor Synthesis</h4>
          <p>
            Decision intelligence requires multi-disciplinary lenses. We intersect psychometric loss parameters with macroeconomic asset betas and stochastic simulation to contextualize uncertainty.
          </p>
        </div>

        <div class="v-method-box">
          <h4><span>🔒</span> Absolute Privacy & Anonymity</h4>
          <p>
            Participant data is completely stripped of personally identifiable information. We collect zero tracking cookies, store no biometric metadata, and use private server infrastructure.
          </p>
        </div>
      </div>
    </section>
  `;
}

// -------------------------------------------------------------
// 2. RESEARCH DASHBOARD HUB VIEW
// -------------------------------------------------------------
function renderDashboardHub(container) {
  container.innerHTML = `
    <div style="margin-bottom: 2.5rem;">
      <span class="v-section-kicker">Unified Analytics Platform</span>
      <h1 class="v-section-title">VERITAS Research Dashboard</h1>
      <p class="v-section-desc" style="max-width: 800px;">
        Centralized operational hub connecting all empirical study modules, statistical evaluation engines, and predictive market simulations across the VERITAS ecosystem.
      </p>
    </div>

    <!-- Active Modules Grid -->
    <div class="v-dashboard-hub">
      <!-- Module 1: Behavioral Study -->
      <div class="v-module-card">
        <div class="v-module-card-header">
          <div>
            <div style="font-size: 1.8rem; margin-bottom: 0.4rem;">🧠</div>
            <span class="v-module-badge open">Operational · Public</span>
          </div>
        </div>
        <div class="v-module-card-body">
          <h3 class="v-module-name">Behavioral Decision Lab</h3>
          <p class="v-module-desc">
            Empirical 7-scenario cognitive experiment capturing participant choices across randomized gain/loss frames, numerical anchors, and intertemporal trade-offs.
          </p>
          <ul class="v-capability-list">
            <li>Tversky & Kahneman Framing Divergence</li>
            <li>Real-time telemetry and reaction dwell timing</li>
            <li>Loss Aversion λ parameter estimation</li>
            <li>Rule of 72 Exponential Growth Bias analysis</li>
          </ul>
          <div class="v-module-footer">
            <span style="font-size: 0.8rem; font-weight: 700; color: #047857;">Active Study</span>
            <button class="btn-primary" style="padding: 0.6rem 1.2rem; font-size: 0.88rem;" onclick="window.startStudy()">
              Start Study →
            </button>
          </div>
        </div>
      </div>

      <!-- Module 2: Research Analytics -->
      <div class="v-module-card">
        <div class="v-module-card-header">
          <div>
            <div style="font-size: 1.8rem; margin-bottom: 0.4rem;">📊</div>
            <span class="v-module-badge ${state.isAdmin ? 'open' : 'restricted'}">
              ${state.isAdmin ? 'Unlocked' : 'PIN Restricted'}
            </span>
          </div>
        </div>
        <div class="v-module-card-body">
          <h3 class="v-module-name">Research Analytics Portal</h3>
          <p class="v-module-desc">
            Statistical synthesis dashboard displaying live participant distributions, contingency matrices, odds ratios, and econometric CSV/JSON datasets.
          </p>
          <ul class="v-capability-list">
            <li>Chi-Square test of independence (with p-value)</li>
            <li>Cohort Alpha vs Beta cross-tabulation</li>
            <li>Empirical Lambda (λ) histogram distribution</li>
            <li>Raw dataset export (CSV & JSON format)</li>
          </ul>
          <div class="v-module-footer">
            <span style="font-size: 0.8rem; font-weight: 700; color: ${state.isAdmin ? '#047857' : '#b91c1c'};">
              ${state.isAdmin ? 'Access Granted' : 'Researcher Auth'}
            </span>
            <button class="btn-secondary" style="padding: 0.6rem 1.2rem; font-size: 0.88rem;" onclick="window.navigateToSection('analytics')">
              ${state.isAdmin ? 'Open Dashboard →' : 'Unlock Portal 🔒'}
            </button>
          </div>
        </div>
      </div>

      <!-- Module 3: Political Market Predictor -->
      <div class="v-module-card">
        <div class="v-module-card-header">
          <div>
            <div style="font-size: 1.8rem; margin-bottom: 0.4rem;">⚡</div>
            <span class="v-module-badge ${state.isAdmin ? 'open' : 'restricted'}">
              ${state.isAdmin ? 'Unlocked' : 'PIN Restricted'}
            </span>
          </div>
        </div>
        <div class="v-module-card-body">
          <h3 class="v-module-name">Political Market Predictor</h3>
          <p class="v-module-desc">
            Natural language processing engine that parses policy breaking news, classifies regulatory shock vectors, and runs 30-day Monte Carlo price simulations.
          </p>
          <ul class="v-capability-list">
            <li>Multi-domain policy dictionary classification</li>
            <li>Asset beta matrix across 10 asset classes</li>
            <li>Geometric Brownian Motion drift simulation</li>
            <li>Interactive Candlestick & Volatility band charts</li>
          </ul>
          <div class="v-module-footer">
            <span style="font-size: 0.8rem; font-weight: 700; color: ${state.isAdmin ? '#047857' : '#b91c1c'};">
              ${state.isAdmin ? 'Access Granted' : 'Researcher Auth'}
            </span>
            <button class="btn-secondary" style="padding: 0.6rem 1.2rem; font-size: 0.88rem;" onclick="window.navigateToSection('market')">
              ${state.isAdmin ? 'Launch Simulator →' : 'Unlock Simulator 🔒'}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Overview Stats -->
    <div style="margin-top: 3rem; padding: 2rem; background: #ffffff; border: 1px solid var(--border-color); border-radius: 16px; box-shadow: var(--shadow-sm);">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
        <div>
          <h3 style="font-size: 1.2rem; font-weight: 800; color: var(--text-main); margin-bottom: 0.3rem;">
            Methodological Standards & Data Governance
          </h3>
          <p style="font-size: 0.9rem; color: var(--text-muted); max-width: 650px;">
            VERITAS adheres to strict open research transparency. Review our econometric derivations, model limitations, and behavioral testing protocols.
          </p>
        </div>
        <button class="btn-secondary" onclick="window.navigateToSection('methodology')">
          View Methodology Document →
        </button>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// 3. RESEARCH METHODOLOGY & STANDARDS VIEW
// -------------------------------------------------------------
function renderMethodologyView(container) {
  container.innerHTML = `
    <div style="max-width: 900px; margin: 0 auto; animation: cardFadeIn 0.3s ease;">
      <!-- Header -->
      <div style="margin-bottom: 2.5rem; text-align: left;">
        <span class="v-section-kicker">Methodological Transparency</span>
        <h1 class="v-section-title" style="font-size: 2.4rem;">Research Methodology & Standards</h1>
        <p class="v-section-desc">
          Comprehensive documentation of the empirical protocols, statistical models, natural language classification engines, and known analytical limitations governing the VERITAS platform.
        </p>
      </div>

      <!-- Section A: Behavioral Testing Framework -->
      <div class="scenario-box" style="border-left-color: #0284c7; margin-bottom: 2rem; background: #ffffff;">
        <h3 style="font-size: 1.3rem; font-weight: 800; color: var(--text-main); margin-bottom: 0.75rem;">
          1. Behavioral Testing Framework & Randomized Cohorts
        </h3>
        <p style="color: var(--text-body); font-size: 0.95rem; line-height: 1.8; margin-bottom: 1rem;">
          Participants entering the VERITAS Behavioral Decision Lab are automatically assigned to either <strong>Cohort Alpha</strong> or <strong>Cohort Beta</strong> using a balanced pseudo-random allocation procedure on the backend server.
        </p>
        <ul style="padding-left: 1.25rem; font-size: 0.93rem; color: var(--text-body); line-height: 1.75; margin-bottom: 1rem;">
          <li><strong>Framing Scenario (Asian Disease paradigm adapted to employment):</strong> Cohort Alpha receives the <em>Gain Frame</em> ("Save 200 jobs for sure"), while Cohort Beta receives the <em>Loss Frame</em> ("400 people will lose their jobs for sure"). Both options represent identical mathematical expected value (200 saved, 400 lost).</li>
          <li><strong>Numerical Anchoring Scenario:</strong> Valuation of residential real estate is tested against an arbitrary high anchor ($850,000) for Cohort Alpha versus a low anchor ($350,000) for Cohort Beta to isolate cognitive anchoring elasticity.</li>
          <li><strong>Loss Aversion Series:</strong> A sequence of five 50/50 gambles with asymmetric gain/loss payoffs is presented to compute each participant\'s personal loss sensitivity coefficient (λ).</li>
        </ul>
        <p style="font-size: 0.88rem; color: var(--text-muted); font-style: italic;">
          Mathematical Grounding: Tversky, A., & Kahneman, D. (1981). The framing of decisions and the psychology of choice. Science, 211(4481), 453-458.
        </p>
      </div>

      <!-- Section B: Statistical Testing & Synthesis -->
      <div class="scenario-box" style="border-left-color: #059669; margin-bottom: 2rem; background: #ffffff;">
        <h3 style="font-size: 1.3rem; font-weight: 800; color: var(--text-main); margin-bottom: 0.75rem;">
          2. Statistical Analysis & Significance Testing
        </h3>
        <p style="color: var(--text-body); font-size: 0.95rem; line-height: 1.8; margin-bottom: 1rem;">
          To determine whether framing shifts produce statistically significant divergence between cohorts, VERITAS calculates a 2x2 contingency table Chi-Square statistic with Yates\' continuity correction:
        </p>
        <div style="background: var(--bg-surface); padding: 1rem 1.25rem; border-radius: 8px; font-family: var(--font-mono); font-size: 0.88rem; color: var(--text-main); margin-bottom: 1rem; border: 1px solid var(--border-color);">
          χ² = N · (|ad - bc| - N/2)² / [(a + b)(c + d)(a + c)(b + d)]
        </div>
        <p style="color: var(--text-body); font-size: 0.95rem; line-height: 1.8;">
          Associated p-values are computed from the cumulative chi-square distribution with 1 degree of freedom (df = 1). When p &lt; 0.05, the framing effect is confirmed with 95% statistical confidence.
        </p>
      </div>

      <!-- Section C: Political Market Prediction Model -->
      <div class="scenario-box" style="border-left-color: #d97706; margin-bottom: 2rem; background: #ffffff;">
        <h3 style="font-size: 1.3rem; font-weight: 800; color: var(--text-main); margin-bottom: 0.75rem;">
          3. Political Market NLP & Monte Carlo Simulation
        </h3>
        <p style="color: var(--text-body); font-size: 0.95rem; line-height: 1.8; margin-bottom: 1rem;">
          The Political Market Predictor (PMP) implements a quantitative sentiment and regulatory classification matrix:
        </p>
        <ul style="padding-left: 1.25rem; font-size: 0.93rem; color: var(--text-body); line-height: 1.75; margin-bottom: 1rem;">
          <li><strong>Domain Classification:</strong> Input policy text is scanned against curated lexical dictionaries covering Monetary Policy, Trade & Tariffs, Defense & Geopolitics, Energy & Climate, and Antitrust Regulation.</li>
          <li><strong>Asset Beta Matrix:</strong> Historical sensitivity coefficients translate policy shock magnitudes into expected price trajectory deltas across 10 asset classes (SPY, QQQ, XLE, ICLN, ITA, XLF, TLT, GLD, UUP, BTC).</li>
          <li><strong>Monte Carlo Drift Engine:</strong> Simulates daily price paths using Geometric Brownian Motion with stochastic drift (μ) and annualized volatility (σ).</li>
        </ul>
      </div>

      <!-- Section D: Model Limitations & Academic Transparency -->
      <div class="scenario-box" style="border-left-color: #e11d48; margin-bottom: 2.5rem; background: #ffffff;">
        <h3 style="font-size: 1.3rem; font-weight: 800; color: var(--text-main); margin-bottom: 0.75rem;">
          4. Model Limitations, Uncertainty & Scope
        </h3>
        <p style="color: var(--text-body); font-size: 0.95rem; line-height: 1.8; margin-bottom: 1rem;">
          In accordance with institutional research integrity standards, VERITAS explicitly highlights the following analytical limitations:
        </p>
        <ul style="padding-left: 1.25rem; font-size: 0.93rem; color: var(--text-body); line-height: 1.75;">
          <li><strong>Distinction Between Estimates and Predictions:</strong> PMP forecasts represent statistical simulations conditioned on keyword heuristics and historical sensitivity betas. They do not constitute financial advice or guaranteed market movements.</li>
          <li><strong>Sample Composition:</strong> Web-based behavioral surveys are subject to volunteer self-selection bias and may not perfectly mirror broader demographic populations.</li>
          <li><strong>Unmodeled External Factors:</strong> Exogenous geopolitical events, macro liquidity shifts, and algorithmic market microstructure can override modeled policy impacts.</li>
        </ul>
      </div>

      <!-- Navigation CTAs -->
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; padding-top: 1.5rem; border-top: 1px solid var(--border-color);">
        <button class="btn-secondary" onclick="window.navigateToSection('dashboard')">
          ← Back to Research Platform
        </button>
        <button class="btn-primary" onclick="window.startStudy()">
          Participate in Decision Study →
        </button>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// 4. ABOUT VERITAS VIEW (ORGANIZATIONAL IDENTITY & LEADERSHIP)
// -------------------------------------------------------------
function renderAboutView(container) {
  container.innerHTML = `
    <div class="survey-wrapper" style="max-width: 860px; animation: cardFadeIn 0.3s ease;">
      <div class="survey-card" style="margin-bottom: 1.75rem;">
        <span class="v-section-kicker">Institutional Background</span>
        <h1 class="survey-title" style="font-size: 2.2rem; margin-bottom: 0.5rem;">About VERITAS Decision Lab</h1>
        <p style="font-size: 1.05rem; color: var(--text-muted); margin-bottom: 1.75rem;">
          Advancing behavioral economics, political risk modeling, and decision intelligence through independent research.
        </p>

        <!-- Section 1: The Founder & Mission -->
        <div class="scenario-box" style="border-left-color: #0284c7; margin-bottom: 1.5rem; background: #ffffff;">
          <h3 style="font-size: 1.25rem; font-weight: 800; color: var(--text-main); margin-bottom: 0.6rem;">
            👤 The Researcher & The Vision
          </h3>
          <p style="color: var(--text-body); font-size: 0.98rem; line-height: 1.8; margin-bottom: 0.85rem;">
            My name is <strong>Lawton Linn</strong>, and I attend <strong>The Williams School</strong> in New London, Connecticut. During my junior year, I pursued coursework in Finance, Economics, and AP Computer Science & Programming. 
          </p>
          <p style="color: var(--text-body); font-size: 0.98rem; line-height: 1.8;">
            Since then, I have been independently conducting research in behavioral economics. My central objective is reimagining how we deliver financial education: moving beyond sterile mathematical formulas and frictionless textbook models, and instead understanding how real human beings make decisions under uncertainty, emotional pressure, and cognitive biases. Financial literacy should reflect how people actually think and behave, not just what is expected of them in an academic lecture.
          </p>
        </div>

        <!-- Section 2: Infrastructure & Ownership -->
        <div class="scenario-box" style="border-left-color: #059669; margin-bottom: 1.5rem; background: #ffffff;">
          <h3 style="font-size: 1.25rem; font-weight: 800; color: var(--text-main); margin-bottom: 0.6rem;">
            🖥️ Privately Owned & Managed Infrastructure
          </h3>
          <p style="color: var(--text-body); font-size: 0.98rem; line-height: 1.8; margin-bottom: 0.85rem;">
            The domain name you are currently visiting (<a href="https://www.veritasdecisionlab.com" style="color: var(--text-main); font-weight: 700; text-decoration: underline;">www.veritasdecisionlab.com</a>) is registered and owned exclusively by me. 
          </p>
          <p style="color: var(--text-body); font-size: 0.98rem; line-height: 1.8;">
            Furthermore, the server delivering this web application is a privately managed VPS instance configured and administered directly by me. There are no third-party web builders, proprietary hosting lock-ins, or managed site containers running this platform — making this <strong>100% my own website, codebase, and server infrastructure</strong>.
          </p>
        </div>

        <!-- Section 3: Development Philosophy & Open Source Attribution -->
        <div class="scenario-box" style="border-left-color: #d97706; margin-bottom: 1.5rem; background: #ffffff;">
          <h3 style="font-size: 1.25rem; font-weight: 800; color: var(--text-main); margin-bottom: 0.6rem;">
            🛠️ Development Philosophy & Academic Rigor
          </h3>
          <p style="color: var(--text-body); font-size: 0.98rem; line-height: 1.8; margin-bottom: 0.85rem;">
            Engineering a full-stack platform of this scope — featuring real-time data persistence, telemetry capture, SVG visualization engines, and statistical modeling — requires a broad spectrum of technical disciplines. As a dedicated student researcher, I actively learn from the broader scientific and engineering community.
          </p>
          <p style="color: var(--text-body); font-size: 0.98rem; line-height: 1.8;">
            I study foundational papers by Kahneman, Tversky, and Thaler alongside modern web standards and computational statistics. By combining rigorous economic theory with self-taught full-stack architecture, I aim to turn conceptual research ideas into accessible, empirical software.
          </p>
        </div>

        <!-- Section 4: Academic Integrity & Research Ethics -->
        <div class="scenario-box" style="border-left-color: #7c3aed; margin-bottom: 2rem; background: #ffffff;">
          <h3 style="font-size: 1.25rem; font-weight: 800; color: var(--text-main); margin-bottom: 0.6rem;">
            🔒 Research Transparency & Data Ethics
          </h3>
          <p style="color: var(--text-body); font-size: 0.98rem; line-height: 1.8;">
            Participant privacy is paramount. All decision responses collected through The Decision Lab are completely anonymized, stripped of identifying metadata, and stored securely on our private server for aggregate statistical synthesis (Framing Effect Chi-Square divergence, Loss Aversion λ estimation, and Exponential Growth Bias analysis).
          </p>
        </div>

        <!-- Call to Action -->
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color);">
          <button class="btn-secondary" onclick="window.navigateToSection('dashboard')">
            ← Explore Research Platform
          </button>
          <button class="btn-primary" onclick="window.startStudy()">
            Take The Decision Lab Study →
          </button>
        </div>
      </div>
    </div>
  `;
}
// -------------------------------------------------------------
// USER-FRIENDLY SURVEY VIEWS
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
        <span class="badge-tag cyan">✨ 2-Minute Decision Challenge</span>
        <h1 class="survey-title">The Decision Lab</h1>
        <p class="survey-description">
          Welcome! You are about to face 7 quick real-life choices involving gut instincts, risk, and everyday dilemmas.
        </p>

        <div class="scenario-box">
          <p style="margin-bottom: 0.5rem; font-weight: 700; color: var(--text-main);">What to expect:</p>
          <ul style="padding-left: 1.25rem; line-height: 1.7; font-size: 0.98rem; color: var(--text-body);">
            <li><strong>No finance or math skills required:</strong> Just pick what feels right to you.</li>
            <li><strong>Super quick:</strong> Takes only about 2 minutes.</li>
            <li><strong>100% Anonymous:</strong> Your responses are completely private.</li>
            <li><strong>Your Results at the End:</strong> Immediately after the last question, you will unlock your personal <strong>Decision Personality</strong>!</li>
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

  // 2. RESCUE PLAN (FRAMING)
  else if (step.id === 'framing_jobs') {
    const isGain = isAlpha;
    stepHtml = `
      <div class="survey-card">
        <span class="badge-tag ${isGain ? 'cyan' : 'rose'}">
          ${step.emoji} Scenario 1 of 7
        </span>
        <h2 class="survey-title">The Factory Emergency</h2>
        <p class="survey-description">
          A local manufacturing plant with <strong>600 employees</strong> is in danger of closing down completely. 
          Town leaders must choose between two emergency rescue plans:
        </p>

        <div class="scenario-box ${isGain ? '' : 'loss'}">
          ${isGain ? `
            <strong>The Rescue Options:</strong>
            <ul style="margin-top: 0.5rem; padding-left: 1.25rem;">
              <li><strong>Plan A:</strong> Guaranteed to <strong>save 200 jobs</strong> for certain.</li>
              <li><strong>Plan B:</strong> A <strong>1-in-3 chance</strong> that all 600 jobs are saved, but a <strong>2-in-3 chance</strong> that zero jobs are saved.</li>
            </ul>
          ` : `
            <strong>The Rescue Options:</strong>
            <ul style="margin-top: 0.5rem; padding-left: 1.25rem;">
              <li><strong>Plan A:</strong> Exactly <strong>400 employees will definitely lose their jobs</strong>.</li>
              <li><strong>Plan B:</strong> A <strong>1-in-3 chance</strong> that nobody loses their job, but a <strong>2-in-3 chance</strong> that all 600 people will lose their jobs.</li>
            </ul>
          `}
        </div>

        <div class="choice-grid two-col">
          <div class="choice-card ${state.responses.framing_job_choice === 'A' ? 'selected' : ''}" 
               data-job-choice="A"
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
               data-job-choice="B"
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
          <button class="btn-primary" id="surveyNextBtn" onclick="window.advanceStep()" ${!state.responses.framing_job_choice ? 'disabled' : ''}>
            Next Question →
          </button>
        </div>
      </div>
    `;
  }

  // 3. HOUSE PRICE (ANCHORING)
  else if (step.id === 'anchoring_quote') {
    const isHigh = isAlpha;
    const anchorVal = isHigh ? 850 : 350;

    stepHtml = `
      <div class="survey-card">
        <span class="badge-tag amber">${step.emoji} Scenario 2 of 7</span>
        <h2 class="survey-title">What is This House Worth?</h2>
        <p class="survey-description">
          A newly built modern 4-bedroom house with a big backyard, heated swimming pool, and rooftop solar panels is being put on the market in a desirable coastal Connecticut town. Located just minutes from the Long Island Sound shoreline, local harbor marina, and commuter rail into New York City, the property sits in a quiet, highly sought-after neighborhood known for top-rated schools and coastal community amenities.
        </p>

        <div class="scenario-box amber">
          <strong>The Agent's Comment:</strong>
          <p style="margin-top: 0.35rem;">
            A local real estate agent specializing in coastal Connecticut properties took a tour of the home, reviewed recent neighborhood comps, and remarked: 
            <em style="color: var(--text-main); font-size: 1.05rem;">"Hmm, given this coastal location and features, I could see this listing for around <strong>$${anchorVal},000</strong>."</em>
          </p>
        </div>

        <div class="input-estimation-box">
          <div class="input-label-row">
            <span style="font-weight: 700; color: var(--text-main);">Based on your gut, what do you think this coastal CT home is really worth?</span>
            <span style="color: var(--accent-amber); font-family: var(--font-mono); font-size: 0.85rem; font-weight: 600;">(In Thousands $)</span>
          </div>
          <div class="currency-input-wrap">
            <span class="currency-symbol">$</span>
            <input type="number" 
                   id="anchoringInput"
                   class="text-number-input" 
                   placeholder="e.g. 500" 
                   min="1" 
                   max="10000" 
                   step="25"
                   value="${state.responses.anchoring_valuation_estimate || ''}"
                   oninput="window.updateAnchoringEstimate(this.value)"
                   onkeydown="if(event.key === 'Enter'){ event.preventDefault(); window.advanceStep(); }" />
            <span class="currency-suffix">,000</span>
          </div>
          <div class="input-formatted-preview ${state.responses.anchoring_valuation_estimate ? 'active' : ''}" id="anchoringFormattedPreview">
            ${state.responses.anchoring_valuation_estimate ? `Interpreted value: $${(state.responses.anchoring_valuation_estimate * 1000).toLocaleString()}` : 'Type 500 for $500,000, 750 for $750,000, etc.'}
          </div>
        </div>

        <div class="survey-footer">
          <button class="btn-secondary" onclick="window.prevStep()">← Previous</button>
          <button class="btn-primary" id="surveyNextBtn" onclick="window.advanceStep()">
            Next Question →
          </button>
        </div>
      </div>
    `;
  }

  // 4. STORE CHECKOUT (PAYMENT FRAMING)
  else if (step.id === 'framing_discount') {
    const isDiscount = isAlpha;
    stepHtml = `
      <div class="survey-card">
        <span class="badge-tag cyan">${step.emoji} Scenario 3 of 7</span>
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
               data-discount-choice="cash"
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
               data-discount-choice="credit"
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
          <button class="btn-primary" id="surveyNextBtn" onclick="window.advanceStep()" ${!state.responses.framing_discount_choice ? 'disabled' : ''}>
            Next Question →
          </button>
        </div>
      </div>
    `;
  }

  // 5. COIN TOSS (LOSS AVERSION)
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
        <div class="lottery-row" data-gamble-index="${i}">
          <div class="gamble-desc">
            Coin #${i + 1}: Heads <span class="win-text">WIN $100</span> | Tails <span class="loss-text">LOSE $${lot.loss}</span>
          </div>
          <div class="gamble-ev">
            ${lot.ev}
          </div>
          <div class="gamble-actions">
            <button type="button" 
                    class="btn-gamble accept ${choice === true ? 'selected' : ''}" 
                    onclick="window.toggleGambleChoice(${i}, true)">
              I'd Flip!
            </button>
            <button type="button" 
                    class="btn-gamble reject ${choice === false ? 'selected' : ''}" 
                    onclick="window.toggleGambleChoice(${i}, false)">
              Pass (No)
            </button>
          </div>
        </div>
      `;
    });

    const isAllLotteriesAnswered = !state.responses.loss_aversion_gambles.some(v => v === null);

    stepHtml = `
      <div class="survey-card">
        <span class="badge-tag emerald">${step.emoji} Scenario 4 of 7</span>
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
          <button class="btn-primary" id="surveyNextBtn" onclick="window.advanceStep()" ${!isAllLotteriesAnswered ? 'disabled' : ''}>
            Next Question →
          </button>
        </div>
      </div>
    `;
  }

  // 6. SELLING DILEMMA (SUNK COST)
  else if (step.id === 'loss_sunk') {
    stepHtml = `
      <div class="survey-card">
        <span class="badge-tag emerald">${step.emoji} Scenario 5 of 7</span>
        <h2 class="survey-title">The Depreciated Item</h2>
        <p class="survey-description">
          A few months ago, you spent <strong>$100</strong> on a collectible item (or ticket).
          Its value has unexpectedly dropped to <strong>$65</strong> (you are down $35).
        </p>

        <div class="scenario-box">
          A friend offers you a spot in a hot new deal that is almost guaranteed to make you <strong>+$25 clean profit</strong>, but you only have enough cash if you sell your original item today for $65.
          <br/><br/>
          Meanwhile, experts say your original item will probably never get back to $100 anytime soon.
        </div>

        <div class="choice-grid two-col">
          <div class="choice-card ${state.responses.loss_aversion_sunk_choice === 'sell_and_reallocate' ? 'selected' : ''}" 
               data-sunk-choice="sell_and_reallocate"
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
               data-sunk-choice="hold_for_breakeven"
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
          <button class="btn-primary" id="surveyNextBtn" onclick="window.advanceStep()" ${!state.responses.loss_aversion_sunk_choice ? 'disabled' : ''}>
            Next Question →
          </button>
        </div>
      </div>
    `;
  }

  // 7. WAITING COST (RULE OF 72)
  else if (step.id === 'rule72_delay') {
    stepHtml = `
      <div class="survey-card">
        <span class="badge-tag violet">${step.emoji} Scenario 6 of 7</span>
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
          <p style="margin-top: 0.85rem; font-weight: 700; color: var(--text-main);">
            Based purely on your gut feeling: How many total DOLLARS did Sam lose out on at the end of the 24 years, solely by waiting 8 years to start?
          </p>
        </div>

        <div class="input-estimation-box">
          <div class="input-label-row">
            <span style="font-weight: 700; color: var(--text-main);">Your Gut Guess (Dollars Lost by Waiting):</span>
            <span style="color: var(--accent-violet); font-family: var(--font-mono); font-size: 0.85rem; font-weight: 600;">(USD $)</span>
          </div>
          <div class="currency-input-wrap">
            <span class="currency-symbol">$</span>
            <input type="number" 
                   id="delayInput"
                   class="text-number-input no-suffix" 
                   placeholder="e.g. 15000" 
                   min="1" 
                   max="500000" 
                   step="500"
                   value="${state.responses.delay_growth_estimate || ''}"
                   oninput="window.updateDelayEstimate(this.value)"
                   onkeydown="if(event.key === 'Enter'){ event.preventDefault(); window.advanceStep(); }" />
          </div>
          <div class="input-formatted-preview ${state.responses.delay_growth_estimate ? 'active' : ''}" id="delayFormattedPreview">
            ${state.responses.delay_growth_estimate ? `Interpreted guess: $${state.responses.delay_growth_estimate.toLocaleString()}` : 'Enter your estimate in standard dollars (e.g. 15000)'}
          </div>
        </div>

        <div class="survey-footer">
          <button class="btn-secondary" onclick="window.prevStep()">← Previous</button>
          <button class="btn-primary" id="surveyNextBtn" onclick="window.advanceStep()">
            Final Question! →
          </button>
        </div>
      </div>
    `;
  }

  // 8. BAKERY DILEMMA (REAL OPTIONS)
  else if (step.id === 'real_options') {
    stepHtml = `
      <div class="survey-card">
        <span class="badge-tag violet">${step.emoji} Scenario 7 of 7 (Final Question!)</span>
        <h2 class="survey-title">The Bakery & The Subway Station</h2>
        <p class="survey-description">
          You have an opportunity to open a brand-new specialty bakery cafe in a busy new shopping plaza. 
          Building the kitchen costs <strong>$50,000</strong> (non-refundable).
        </p>

        <div class="scenario-box violet">
          The city is voting in 12 months on whether to build a new subway station right in front of your shop:
          <ul style="margin-top: 0.5rem; padding-left: 1.25rem;">
            <li><strong>If Subway Passes (50% chance):</strong> Foot traffic explodes. The shop makes a huge <strong>$140,000</strong> payoff (+$90,000 profit!).</li>
            <li><strong>If Subway Fails (50% chance):</strong> Foot traffic is dead. The shop only makes <strong>$20,000</strong> (-$30,000 loss).</li>
          </ul>
          <p style="margin-top: 0.75rem; color: var(--text-main);">
            <strong>Your Options:</strong>
            <br/>• <strong>Choice 1 (Open Now):</strong> Expected average profit is <strong>+$30,000</strong>, but you take the risk right now.
            <br/>• <strong>Choice 2 (Pay to Reserve & Wait 1 Year):</strong> Wait until the city vote is 100% decided. If it passes, you build and make the big $90k profit. If it fails, you walk away and spend $0. 
            <br/><em>The Catch:</em> Reserving the spot for a year costs <strong>$18,000 in waiting fees</strong>. After the fee, your expected average profit drops to <strong>+$27,000</strong>.
          </p>
        </div>

        <div class="choice-grid two-col">
          <div class="choice-card ${state.responses.real_option_choice === 'invest_now' ? 'selected' : ''}" 
               data-real-option-choice="invest_now"
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
               data-real-option-choice="wait_for_information"
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
            <span style="font-weight: 700; color: var(--text-main);">How much would you be willing to pay for certainty?</span>
            <span id="optionThresholdDisplay" style="color: var(--accent-cyan); font-family: var(--font-mono); font-weight: 800; font-size: 1.25rem;">
              $${state.responses.option_switch_threshold.toLocaleString()}
            </span>
          </div>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.75rem;">
            What is the maximum holding fee you would pay to wait for 100% certainty instead of risking it today?
          </p>
          <input type="range" 
                 class="custom-range-slider"
                 min="1000" 
                 max="35000" 
                 step="1000" 
                 value="${state.responses.option_switch_threshold}"
                 oninput="window.updateOptionThreshold(this.value)" />
          <div class="slider-scale-row">
            <span>$1,000 (Low fee)</span>
            <span>$18,000 (Scenario fee)</span>
            <span>$35,000 (Max certainty)</span>
          </div>
        </div>

        <div class="survey-footer">
          <button class="btn-secondary" onclick="window.prevStep()">← Previous</button>
          <button class="btn-primary" id="surveyNextBtn" onclick="window.advanceStep()" ${!state.responses.real_option_choice ? 'disabled' : ''}>
            Finish & See My Results →
          </button>
        </div>
      </div>
    `;
  }

  // 9. DEBRIEF
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
          <span class="badge-tag cyan">🎉 Challenge Complete!</span>
          <h1 class="survey-title" style="font-size: 2rem;">Your Decision Personality</h1>
          <p class="survey-description" style="max-width: 620px; margin: 0 auto 1.5rem;">
            Here is what your gut choices reveal about how your brain handles risk, money, and time:
          </p>
        </div>

        <div class="debrief-grid">
          <div class="debrief-card">
            <div class="debrief-metric-header">
              <span class="badge-tag emerald">Loss Sensitivity</span>
              <span style="font-size: 1.3rem;">⚖️</span>
            </div>
            <div class="debrief-metric-value">
              ${lambda}x
            </div>
            <div class="debrief-metric-title">${lambdaLabel}</div>
            <div class="debrief-metric-body">
              ${lambdaDesc}
            </div>
          </div>

          <div class="debrief-card">
            <div class="debrief-metric-header">
              <span class="badge-tag violet">Waiting Cost</span>
              <span style="font-size: 1.3rem;">⏳</span>
            </div>
            <div class="debrief-metric-value" style="color: ${est < 25000 ? '#fb7185' : '#34d399'};">
              $${est.toLocaleString()}
            </div>
            <div class="debrief-metric-title">${m.egbCategory || 'Exponential Effect'}</div>
            <div class="debrief-metric-body">
              You guessed that waiting 8 years lost <strong>$${est.toLocaleString()}</strong>.
              In reality, waiting cost a massive <strong>$${trueCost.toLocaleString()}</strong>! Because of compounding, waiting 8 years cut final wealth in half.
            </div>
          </div>

          <div class="debrief-card">
            <div class="debrief-metric-header">
              <span class="badge-tag cyan">Certainty Value</span>
              <span style="font-size: 1.3rem;">🎯</span>
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

        <div style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 16px; padding: 1.75rem; text-align: center;">
          <h3 style="color: var(--text-main); font-size: 1.25rem; font-weight: 800; margin-bottom: 0.4rem;">
            Thank you for contributing to the research! 🎓
          </h3>
          <p style="font-size: 0.95rem; color: var(--text-body); max-width: 560px; margin: 0 auto 1.25rem; line-height: 1.6;">
            Your anonymous responses have been successfully committed to the research database and synthesized into our aggregate cross-sectional dataset.
          </p>
          <div style="display: flex; justify-content: center; gap: 0.75rem; flex-wrap: wrap;">
            <button class="btn-secondary" style="font-size: 0.88rem;" onclick="window.navigateToSection('dashboard')">
              ← Return to Research Platform
            </button>
            <button class="btn-secondary" style="font-size: 0.88rem;" onclick="window.resetSurvey()">
              ↺ Retake Study
            </button>
          </div>
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
            <span class="step-name">${step.emoji} ${step.name}</span>
            <span style="font-family: var(--font-mono); font-size: 0.85rem;">Question ${state.currentStepIndex} of ${STEPS.length - 2}</span>
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

  // Smooth autofocus on number inputs if present
  if (step.id === 'anchoring_quote') {
    setTimeout(() => {
      const input = document.getElementById('anchoringInput');
      if (input) input.focus();
    }, 60);
  } else if (step.id === 'rule72_delay') {
    setTimeout(() => {
      const input = document.getElementById('delayInput');
      if (input) input.focus();
    }, 60);
  }
}

function renderConfidencePicker() {
  const current = state.responses.confidence_rating || 4;
  let starsHtml = '';
  for (let i = 1; i <= 5; i++) {
    starsHtml += `
      <button type="button" 
              class="star-btn ${i <= current ? 'active' : ''}" 
              data-star-rating="${i}"
              onclick="window.setConfidenceRating(${i})">
        ★
      </button>
    `;
  }
  return `
    <div class="confidence-box">
      <span style="font-size: 0.9rem; font-weight: 600; color: var(--text-body);">How confident do you feel in this choice?</span>
      <div class="confidence-stars">${starsHtml}</div>
    </div>
  `;
}

// -------------------------------------------------------------
// RESEARCHER ANALYTICS (PROTECTED BEHIND PIN)
// -------------------------------------------------------------
async function fetchAnalytics() {
  try {
    const res = await fetch('/api/survey/analytics', {
      headers: { 'X-Admin-Pin': state.adminPin }
    });
    if (res.status === 401) {
      state.isAdmin = false;
      sessionStorage.removeItem('veritas_admin_pin');
      window.promptAdminLogin();
      return;
    }
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
          <span class="badge-tag cyan">🔒 Private Researcher Portal</span>
          <h1 style="font-size: 2rem; font-weight: 900; color: var(--text-main);">Behavioral Analytics Dashboard</h1>
          <p style="font-size: 0.92rem; color: var(--text-muted);">
            Live statistical synthesis of Framing Effects, Loss Aversion, and Cost of Delay.
          </p>
        </div>

        <div class="analytics-actions">
          <button class="btn-action-sm" onclick="window.toggleLeftMenu()">
            ☰ Menu
          </button>
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
          <button class="btn-action-sm" style="border-color: rgba(244,63,94,0.4); color: #fb7185;" onclick="window.adminLogout()">
            🔒 Lock Portal
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
          <div class="kpi-number" style="color: #38bdf8;">+${fr.framingShiftDelta || 0}%</div>
          <div class="kpi-subtext">χ² = ${fr.chiSquare || 0} (p = ${fr.pValue ?? 1})</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-title">Avg Loss Sensitivity (λ)</div>
          <div class="kpi-number" style="color: #34d399;">${loss.meanLambda || 0}x</div>
          <div class="kpi-subtext">Benchmark: 2.25x | Median: ${loss.medianLambda || 0}x</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-title">Linear Growth Bias</div>
          <div class="kpi-number" style="color: #fb7185;">${delay.linearBiasProportion || 0}%</div>
          <div class="kpi-subtext">Underestimate Cost of Waiting</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-title">Median Completion Time</div>
          <div class="kpi-number" style="color: #fbbf24;">${Math.round((tele.medianLatencyMs || 0) / 1000)}s</div>
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
            <h3 style="color: var(--text-main); font-size: 1.25rem; font-weight: 800;">Participant Responses</h3>
            <p style="font-size: 0.85rem; color: var(--text-muted);">
              Individual records with sub-second decision latencies
            </p>
          </div>
          <select id="cohortFilterSelect" 
                  style="background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-main); padding: 0.45rem 0.85rem; border-radius: 8px; font-size: 0.85rem;"
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
    const res = await fetch(url, {
      headers: { 'X-Admin-Pin': state.adminPin }
    });
    const data = await res.json();
    const rows = data.responses || [];
    const container = document.getElementById('tableContainer');
    if (!container) return;

    if (rows.length === 0) {
      container.innerHTML = `
        <div style="padding: 2.5rem; text-align: center; color: var(--text-muted);">
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
            <span class="badge-tag ${isAlpha ? 'cyan' : 'rose'}" style="margin: 0; padding: 0.2rem 0.5rem; font-size: 0.7rem;">
              ${r.cohort}
            </span>
          </td>
          <td style="font-weight: 700;">
            Plan ${r.responses?.framing_job_choice || '-'}
          </td>
          <td>
            $${r.responses?.anchoring_valuation_estimate || '-'}k
          </td>
          <td style="font-family: var(--font-mono); font-weight: 800; color: #34d399;">
            ${m.lambda ?? '-'}x
          </td>
          <td>
            $${Number(r.responses?.delay_growth_estimate || 0).toLocaleString()}
          </td>
          <td>
            ${r.responses?.real_option_choice === 'invest_now' 
              ? '<span style="color: #38bdf8; font-weight: 700;">Open Now</span>' 
              : '<span style="color: #c084fc; font-weight: 700;">Pay & Wait</span>'}
          </td>
          <td style="font-family: var(--font-mono); font-size: 0.8rem;">
            ${latencySec}s
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
window.hoverStart = (optId) => telemetry.recordHoverStart(optId);
window.hoverEnd = (optId) => telemetry.recordHoverEnd(optId);

window.updateAnchoringEstimate = (val) => {
  const num = parseFloat(val);
  const isValid = !isNaN(num) && num > 0;
  state.responses.anchoring_valuation_estimate = isValid ? num : null;
  telemetry.recordRevision();

  const preview = document.getElementById('anchoringFormattedPreview');
  if (preview) {
    if (isValid) {
      preview.innerText = `Interpreted value: $${(num * 1000).toLocaleString()}`;
      preview.classList.add('active');
    } else {
      preview.innerText = 'Type 500 for $500,000, 750 for $750,000, etc.';
      preview.classList.remove('active');
    }
  }

  const btn = document.getElementById('surveyNextBtn');
  if (btn) btn.disabled = false;
};

window.updateDelayEstimate = (val) => {
  const num = parseFloat(val);
  const isValid = !isNaN(num) && num > 0;
  state.responses.delay_growth_estimate = isValid ? num : null;
  telemetry.recordRevision();

  const preview = document.getElementById('delayFormattedPreview');
  if (preview) {
    if (isValid) {
      preview.innerText = `Interpreted guess: $${num.toLocaleString()}`;
      preview.classList.add('active');
    } else {
      preview.innerText = 'Enter your estimate in standard dollars (e.g. 15000)';
      preview.classList.remove('active');
    }
  }

  const btn = document.getElementById('surveyNextBtn');
  if (btn) btn.disabled = false;
};

window.updateOptionThreshold = (val) => {
  const num = Number(val);
  state.responses.option_switch_threshold = num;
  const display = document.getElementById('optionThresholdDisplay');
  if (display) {
    display.innerText = `$${num.toLocaleString()}`;
  }
};

window.filterTable = (cohort) => {
  state.activeFilterCohort = cohort;
  loadResponsesTable();
};

window.seedBenchmarkData = async () => {
  try {
    const res = await fetch('/api/survey/seed-demo', {
      method: 'POST',
      headers: { 'X-Admin-Pin': state.adminPin }
    });
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
    const res = await fetch('/api/survey/reset', {
      method: 'POST',
      headers: { 'X-Admin-Pin': state.adminPin }
    });
    const json = await res.json();
    showToast(json.message);
    render();
  } catch (err) {
    showToast('Failed to clear data.');
  }
};

window.adminLogout = () => {
  state.isAdmin = false;
  state.adminPin = '';
  sessionStorage.removeItem('veritas_admin_pin');
  showToast('Locked. PIN required to re-enter.');
  window.switchMode('survey');
};

window.exportCsv = () => {
  window.location.href = `/api/survey/export.csv?pin=${encodeURIComponent(state.adminPin)}`;
};

window.exportJson = () => {
  window.location.href = `/api/survey/export.json?pin=${encodeURIComponent(state.adminPin)}`;
};

// =============================================================
// POLITICAL MARKET PREDICTOR & SIMULATION INTERFACE
// =============================================================
const PRESET_NEWS = [
  {
    id: 'fed_rate_cut',
    title: 'Federal Reserve announces surprise 50 bps emergency interest rate cut to bolster liquidity',
    category: 'Monetary Policy',
    certainty: 95,
    text: 'The Federal Reserve unanimously voted to cut the federal funds rate by 50 basis points at an unscheduled emergency meeting, citing cooling inflation metrics and labor market stabilization needs. Chairman Powell emphasized quantitative easing liquidity backstops.'
  },
  {
    id: 'us_china_tariffs',
    title: 'White House issues executive order imposing 35% tariffs on imported steel and solar panels',
    category: 'Trade & Protectionism',
    certainty: 90,
    text: 'The President signed a sweeping executive tariff schedule imposing a 35% duty on imported foreign manufactured steel, critical minerals, and renewable equipment. Trade representatives warn of retaliatory export restrictions from key trading partners.'
  },
  {
    id: 'mideast_escalation',
    title: 'Strait of Hormuz maritime blockade threats escalate geopolitical tension, military deployed',
    category: 'Geopolitics & Defense',
    certainty: 80,
    text: 'Naval strike groups have been scrambled to the Persian Gulf following direct missile threats against oil tankers transiting the Strait of Hormuz. Pentagon officials confirmed expedited defense contract allocations for anti-missile defense interceptors.'
  },
  {
    id: 'clean_energy_subsidy',
    title: 'Congress passes massive $120B clean energy tax credit expansion for grid modernization',
    category: 'Energy & Climate',
    certainty: 88,
    text: 'A bipartisan coalition passed legislation extending solar, battery storage, and advanced nuclear subsidies through 2035, while establishing accelerated depreciation deductions for domestic renewable infrastructure builders.'
  },
  {
    id: 'corporate_tax_overhaul',
    title: 'Senate committee proposes increasing statutory corporate tax rate from 21% to 28%',
    category: 'Taxation & Fiscal',
    certainty: 55,
    text: 'Lawmakers in the Senate Finance Committee drafted legislation targeting corporate income and high-volume stock buybacks with an increased headline corporate rate of 28% and a minimum global tax on offshore intellectual property.'
  }
];

window.setMarketInputTab = (tab) => {
  state.market.activeTab = tab;
  renderMarketPredictorView(document.getElementById('mainApp'));
};

window.setMarketChartView = (view) => {
  state.market.activeChartView = view;
  renderMarketPredictorView(document.getElementById('mainApp'));
};

window.openAssetModal = (assetId) => {
  const result = state.market.lastResult;
  if (!result) return;
  const asset = result.assets.find(a => a.assetId === assetId);
  if (!asset) return;

  const modal = document.createElement('div');
  modal.className = 'chart-modal-overlay';
  modal.id = 'assetChartModal';
  modal.onclick = (e) => {
    if (e.target === modal) window.closeAssetModal();
  };

  const isUp = asset.expectedShiftPct > 0;
  const isNeutral = Math.abs(asset.expectedShiftPct) <= 0.3;
  const accentColor = isNeutral ? '#94a3b8' : (isUp ? '#10b981' : '#f43f5e');

  // Large Modal SVG Dimensions
  const svgW = 900;
  const svgH = 420;
  const padLeft = 68;
  const padRight = 24;
  const padTop = 30;
  const padBottom = 42;
  const plotW = svgW - padLeft - padRight;
  const plotH = svgH - padTop - padBottom;

  const candles = asset.candles || [];
  const trajectory = asset.trajectory || [];

  let allMin = Infinity;
  let allMax = -Infinity;

  candles.forEach(c => {
    if (c.low < allMin) allMin = c.low;
    if (c.high > allMax) allMax = c.high;
  });

  trajectory.forEach(t => {
    if (t.bear < allMin) allMin = t.bear;
    if (t.bull > allMax) allMax = t.bull;
  });

  if (!isFinite(allMin) || !isFinite(allMax) || allMax === allMin) {
    allMin = (asset.currentPrice || 100) * 0.95;
    allMax = (asset.currentPrice || 100) * 1.05;
  }

  const priceMargin = (allMax - allMin) * 0.08 || 1;
  const yMin = allMin - priceMargin;
  const yMax = allMax + priceMargin;
  const yRange = yMax - yMin;

  const getY = (val) => padTop + plotH - ((val - yMin) / yRange) * plotH;
  const getX = (dayIdx, totalDays) => padLeft + (dayIdx / totalDays) * plotW;

  // 6 Horizontal Grid levels for large modal
  const yTicks = [
    yMin + yRange * 0.05,
    yMin + yRange * 0.22,
    yMin + yRange * 0.40,
    yMin + yRange * 0.58,
    yMin + yRange * 0.76,
    yMin + yRange * 0.94
  ];

  const basePriceY = getY(asset.currentPrice || 100);
  const totalDays = result.horizonDays;

  // 7 X-Axis Day markers
  const xTicks = [];
  const step = Math.max(1, Math.floor(totalDays / 6));
  for (let d = 1; d <= totalDays; d += step) {
    xTicks.push({ day: d, label: `Day ${d} (T+${d})` });
  }
  if (!xTicks.some(t => t.day === totalDays)) {
    xTicks.push({ day: totalDays, label: `Day ${totalDays} (T+${totalDays})` });
  }

  // Large Candlestick elements
  const candleWidth = Math.max(8, Math.min(24, (plotW / candles.length) * 0.65));
  const candleSvgElements = candles.map((c, i) => {
    const cx = getX(i + 0.5, candles.length);
    const wickTop = getY(c.high);
    const wickBottom = getY(c.low);
    const bodyTop = getY(Math.max(c.open, c.close));
    const bodyBottom = getY(Math.min(c.open, c.close));
    const bodyHeight = Math.max(2, bodyBottom - bodyTop);
    const colorClass = c.isGreen ? 'green' : 'red';

    return `
      <g class="candle-group">
        <line class="wick ${colorClass}" x1="${cx.toFixed(1)}" y1="${wickTop.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${wickBottom.toFixed(1)}" />
        <rect class="candle-body ${colorClass}" x="${(cx - candleWidth / 2).toFixed(1)}" y="${bodyTop.toFixed(1)}" width="${candleWidth.toFixed(1)}" height="${bodyHeight.toFixed(1)}" rx="2" />
      </g>
    `;
  }).join('');

  // Confidence Corridor for modal
  const bullPoints = trajectory.map((t, idx) => `${getX(idx, totalDays).toFixed(1)},${getY(t.bull).toFixed(1)}`).join(' ');
  const bearPointsRev = [...trajectory].reverse().map((t, idx) => {
    const origIdx = totalDays - idx;
    return `${getX(origIdx, totalDays).toFixed(1)},${getY(t.bear).toFixed(1)}`;
  }).join(' ');
  const bandPolygon = `${bullPoints} ${bearPointsRev}`;
  const medianPath = trajectory.map((t, idx) => `${getX(idx, totalDays).toFixed(1)},${getY(t.base).toFixed(1)}`).join(' ');

  const lastCandle = candles[candles.length - 1] || { open: asset.currentPrice, close: asset.projectedPrice, high: asset.projectedPrice, low: asset.currentPrice };

  modal.innerHTML = `
    <div class="chart-modal-dialog">
      <!-- Modal Header -->
      <div class="chart-modal-header">
        <div>
          <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.35rem;">
            <span style="font-size: 1.8rem;">${asset.icon}</span>
            <h2 style="color: var(--text-main); font-size: 1.6rem; font-weight: 900; letter-spacing: -0.02em;">
              ${asset.assetId} — ${asset.name}
            </h2>
            <span class="badge-tag cyan">${asset.category}</span>
          </div>
          <p style="font-size: 0.88rem; color: var(--text-muted);">
            High-Resolution Price Discovery & Intraday Shock Modeling (${totalDays}-Day Horizon)
          </p>
        </div>
        <button class="chart-modal-close-btn" onclick="window.closeAssetModal()" aria-label="Close modal">✕</button>
      </div>

      <!-- Key Macro Indicators Bar -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem;">
        <div class="stat-card" style="padding: 0.75rem 1rem;">
          <span class="stat-label">Initial Baseline</span>
          <span class="stat-value" style="font-size: 1.2rem; color: var(--text-main);">$${Number(asset.currentPrice).toFixed(2)}</span>
        </div>
        <div class="stat-card" style="padding: 0.75rem 1rem;">
          <span class="stat-label">Projected T+${totalDays} Price</span>
          <span class="stat-value" style="font-size: 1.2rem; color: ${accentColor};">$${Number(asset.projectedPrice).toFixed(2)}</span>
        </div>
        <div class="stat-card" style="padding: 0.75rem 1rem;">
          <span class="stat-label">Expected Net Shift</span>
          <span class="stat-value" style="font-size: 1.2rem; color: ${accentColor};">${isUp ? '+' : ''}${asset.expectedShiftPct}%</span>
        </div>
        <div class="stat-card" style="padding: 0.75rem 1rem;">
          <span class="stat-label">95% Confidence Band</span>
          <span class="stat-value" style="font-size: 1rem; color: var(--text-body);">${asset.confidenceLower}% to ${asset.confidenceUpper}%</span>
        </div>
        <div class="stat-card" style="padding: 0.75rem 1rem;">
          <span class="stat-label">Algorithmic Stance</span>
          <span class="stat-value" style="font-size: 1rem; color: ${accentColor}; font-weight: 800;">${asset.stance}</span>
        </div>
      </div>

      <!-- Large Scale Candlestick Chart -->
      <div class="modal-candlestick-wrapper">
        <div class="candle-hover-overlay" style="font-size: 0.85rem; padding: 0.4rem 0.75rem 0.6rem;">
          <span>Day ${totalDays} Final Candle:</span>
          <span>Open: <b>$${Number(lastCandle.open).toFixed(2)}</b></span>
          <span>High: <b style="color: #34d399;">$${Number(lastCandle.high).toFixed(2)}</b></span>
          <span>Low: <b style="color: #fb7185;">$${Number(lastCandle.low).toFixed(2)}</b></span>
          <span>Close: <b style="color: ${lastCandle.close >= lastCandle.open ? '#34d399' : '#fb7185'};">$${Number(lastCandle.close).toFixed(2)}</b></span>
        </div>

        <svg class="modal-candlestick-svg" viewBox="0 0 ${svgW} ${svgH}">
          <!-- Horizontal Grid Lines & Y-Price Labels -->
          ${yTicks.map(tVal => {
            const yPos = getY(tVal);
            return `
              <line class="grid-line" x1="${padLeft}" y1="${yPos.toFixed(1)}" x2="${svgW - padRight}" y2="${yPos.toFixed(1)}" />
              <text x="${padLeft - 10}" y="${(yPos + 4).toFixed(1)}" text-anchor="end" font-weight="600">$${tVal < 100 ? tVal.toFixed(2) : Math.round(tVal)}</text>
            `;
          }).join('')}

          <!-- T=0 Baseline Reference -->
          <line class="baseline-ref" x1="${padLeft}" y1="${basePriceY.toFixed(1)}" x2="${svgW - padRight}" y2="${basePriceY.toFixed(1)}" />
          <text x="${svgW - padRight - 6}" y="${(basePriceY - 6).toFixed(1)}" text-anchor="end" fill="#38bdf8" font-size="9px" font-weight="700">T=0 Baseline ($${Number(asset.currentPrice).toFixed(2)})</text>

          <!-- Vertical Day Grid Lines -->
          ${xTicks.map(xTick => {
            const xPos = getX(xTick.day, totalDays);
            return `
              <line class="grid-line" x1="${xPos.toFixed(1)}" y1="${padTop}" x2="${xPos.toFixed(1)}" y2="${padTop + plotH}" />
              <text x="${xPos.toFixed(1)}" y="${svgH - 12}" text-anchor="middle" font-weight="600">${xTick.label}</text>
            `;
          }).join('')}

          <!-- Axes Borders -->
          <line class="axis-line" x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${padTop + plotH}" />
          <line class="axis-line" x1="${padLeft}" y1="${padTop + plotH}" x2="${svgW - padRight}" y2="${padTop + plotH}" />

          <!-- Background 90% Confidence Corridor -->
          <polygon points="${bandPolygon}" fill="${isUp ? 'rgba(16,185,129,0.08)' : 'rgba(244,63,94,0.08)'}" stroke="none" />
          <polyline points="${bullPoints}" fill="none" stroke="${isUp ? '#34d399' : '#fb7185'}" stroke-width="1.2" stroke-dasharray="4 4" opacity="0.45" />
          <polyline points="${medianPath}" fill="none" stroke="${accentColor}" stroke-width="1.5" stroke-dasharray="2 3" opacity="0.6" />

          <!-- Real-World Candlesticks -->
          ${candleSvgElements}
        </svg>
      </div>

      <!-- Policy Transmission Context Notes -->
      <div style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 12px; padding: 1rem 1.25rem; font-size: 0.85rem; color: var(--text-body); line-height: 1.6;">
        <b style="color: var(--text-main);">Policy Transmission Dynamics:</b>
        The candlestick path reflects initial shock absorption on days 1–3 followed by systemic drift according to the policy domain beta sensitivity (${result.analysis.domainLabel}). Intraday volatility captures market liquidity digestion and regulatory certainty revisions.
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Esc key listener to close modal
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      window.closeAssetModal();
      document.removeEventListener('keydown', handleKeyDown);
    }
  };
  document.addEventListener('keydown', handleKeyDown);
};

window.closeAssetModal = () => {
  document.getElementById('assetChartModal')?.remove();
};

window.selectMarketPreset = (presetId) => {
  const found = PRESET_NEWS.find(p => p.id === presetId);
  if (!found) return;
  state.market.selectedPresetId = presetId;
  state.market.inputText = found.text;
  state.market.certainty = found.certainty;
  renderMarketPredictorView(document.getElementById('mainApp'));
};

window.handleFileUpload = (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target.result;
    state.market.inputText = content;
    state.market.activeTab = 'text';
    showToast(`Loaded file: ${file.name}`);
    renderMarketPredictorView(document.getElementById('mainApp'));
  };
  reader.readAsText(file);
};

window.fetchUrlArticle = async () => {
  const urlInput = document.getElementById('marketUrlInput');
  const targetUrl = urlInput?.value?.trim();
  if (!targetUrl) {
    showToast('Please enter a valid news URL');
    return;
  }

  const btn = document.getElementById('fetchUrlBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Extracting...';
  }

  try {
    const res = await fetch('/api/market/fetch-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Pin': state.adminPin
      },
      body: JSON.stringify({ url: targetUrl })
    });
    const json = await res.json();
    if (json.success && json.extractedText) {
      state.market.inputText = `${json.title}\n\n${json.description}\n\n${json.extractedText}`;
      state.market.inputUrl = targetUrl;
      state.market.activeTab = 'text';
      showToast('Successfully extracted news article!');
      renderMarketPredictorView(document.getElementById('mainApp'));
    } else {
      showToast(json.error || 'Failed to extract article content.');
    }
  } catch (err) {
    showToast('Failed to connect to extraction server.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = 'Extract & Populate →';
    }
  }
};

window.runMarketPrediction = () => {
  const textarea = document.getElementById('marketTextInput');
  const text = textarea ? textarea.value.trim() : state.market.inputText;
  if (!text) {
    showToast('Please enter political news text or choose a preset.');
    return;
  }

  const certaintySlider = document.getElementById('marketCertaintyInput');
  const certaintyVal = certaintySlider ? Number(certaintySlider.value) : state.market.certainty;
  
  const horizonSelect = document.getElementById('marketHorizonSelect');
  const horizonVal = horizonSelect ? Number(horizonSelect.value) : state.market.horizonDays;

  const directionSelect = document.getElementById('marketDirectionSelect');
  const directionVal = directionSelect ? directionSelect.value : state.market.manualDirection;

  state.market.inputText = text;
  state.market.certainty = certaintyVal;
  state.market.horizonDays = horizonVal;
  state.market.manualDirection = directionVal;

  // Run NLP Analysis
  const analysis = analyzePoliticalText(text);

  // Run Monte Carlo Market Projection
  const sim = simulateMarketResponse(analysis, {
    horizonDays: horizonVal,
    userCertainty: certaintyVal,
    manualDirection: directionVal === 'auto' ? null : directionVal
  });

  state.market.lastResult = sim;
  state.market.history.unshift({
    headline: text.slice(0, 85) + '...',
    timestamp: new Date().toLocaleTimeString(),
    domain: analysis.domainLabel,
    regime: sim.regime
  });
  if (state.market.history.length > 5) state.market.history.pop();

  triggerHaptic(20);
  showToast('Simulation complete: Asset vectors projected.');
  renderMarketPredictorView(document.getElementById('mainApp'));
};

function renderMarketPredictorView(container) {
  const result = state.market.lastResult;
  const currentText = state.market.inputText || PRESET_NEWS[0].text;

  container.innerHTML = `
    <div class="market-container">
      <!-- Top Overview Header -->
      <div class="market-hero-card">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.4rem;">
              <span class="badge-tag cyan">⚡ QUANTITATIVE ESTIMATION</span>
              <span style="font-size: 0.8rem; color: #10b981; font-family: var(--font-mono); font-weight: 700;">ACCESS VERIFIED</span>
            </div>
            <h1 style="font-size: 1.85rem; font-weight: 900; color: var(--text-main); letter-spacing: -0.02em;">
              Political News & Policy Market Predictor
            </h1>
            <p style="color: var(--text-muted); font-size: 0.95rem; max-width: 680px; margin-top: 0.4rem;">
              Multi-factor natural language processing combined with historical asset beta sensitivity and Monte Carlo drift simulation to forecast market reactions to political events.
            </p>
          </div>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button class="btn-secondary" style="font-size: 0.85rem;" onclick="window.toggleLeftMenu()">
              ☰ Switch Section
            </button>
            <button class="btn-secondary" style="font-size: 0.85rem;" onclick="window.navigateToSection('dashboard')">
              ← Platform Hub
            </button>
          </div>
        </div>
      </div>

      <!-- Input & Controls Section -->
      <div class="card" style="padding: 1.5rem;">
        <div class="input-tab-nav">
          <button class="${state.market.activeTab === 'text' ? 'active' : ''}" onclick="window.setMarketInputTab('text')">
            📝 Text / Headline
          </button>
          <button class="${state.market.activeTab === 'url' ? 'active' : ''}" onclick="window.setMarketInputTab('url')">
            🔗 News URL
          </button>
          <button class="${state.market.activeTab === 'upload' ? 'active' : ''}" onclick="window.setMarketInputTab('upload')">
            📂 Document Upload
          </button>
          <button class="${state.market.activeTab === 'preset' ? 'active' : ''}" onclick="window.setMarketInputTab('preset')">
            ⚡ Quick Presets
          </button>
        </div>

        <!-- TAB: TEXT -->
        ${state.market.activeTab === 'text' ? `
          <div>
            <label style="font-size: 0.85rem; font-weight: 700; color: var(--text-body); display: block; margin-bottom: 0.5rem;">
              Political News Article, Bill Text, or Speech Excerpt:
            </label>
            <textarea id="marketTextInput" 
                      rows="4" 
                      style="width: 100%; padding: 0.85rem; border-radius: 10px; background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-main); font-family: inherit; font-size: 0.92rem; resize: vertical;" 
                      placeholder="e.g. White House announces aggressive export curbs on AI chips, while considering broad reciprocal trade tariffs...">${currentText}</textarea>
          </div>
        ` : ''}

        <!-- TAB: URL -->
        ${state.market.activeTab === 'url' ? `
          <div>
            <label style="font-size: 0.85rem; font-weight: 700; color: var(--text-body); display: block; margin-bottom: 0.5rem;">
              Insert Live Political News Article URL:
            </label>
            <div style="display: flex; gap: 0.75rem;">
              <input type="url" 
                     id="marketUrlInput" 
                     placeholder="https://www.reuters.com/... or https://bloomberg.com/..." 
                     value="${state.market.inputUrl}"
                     style="flex: 1; padding: 0.75rem 1rem; border-radius: 10px; background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-main);" />
              <button id="fetchUrlBtn" class="btn-primary" onclick="window.fetchUrlArticle()">
                Extract & Populate →
              </button>
            </div>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.5rem;">
              Our backend proxy fetches the webpage, scrubs boilerplate ads and navigation, and feeds the sanitized political text directly into the analyzer.
            </p>
          </div>
        ` : ''}

        <!-- TAB: UPLOAD -->
        ${state.market.activeTab === 'upload' ? `
          <div style="text-align: center; padding: 2rem 1rem; border: 2px dashed var(--border-color); border-radius: 12px; background: var(--bg-surface);">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">📄</div>
            <h4 style="font-size: 1rem; color: var(--text-main); margin-bottom: 0.3rem;">Upload Political Research Document or Press Release</h4>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.25rem;">
              Supports .txt, .md, .csv, and plain-text policy drafts.
            </p>
            <input type="file" id="marketFileInput" accept=".txt,.md,.csv,.json" style="display: none;" onchange="window.handleFileUpload(event)" />
            <button class="btn-secondary" onclick="document.getElementById('marketFileInput').click()">
              Choose File from Computer
            </button>
          </div>
        ` : ''}

        <!-- TAB: PRESETS -->
        ${state.market.activeTab === 'preset' ? `
          <div>
            <label style="font-size: 0.85rem; font-weight: 700; color: var(--text-body); display: block; margin-bottom: 0.6rem;">
              Select a Calibrated Political Benchmark Scenario:
            </label>
            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
              ${PRESET_NEWS.map(p => `
                <div class="preset-chip ${state.market.selectedPresetId === p.id ? 'active' : ''}" onclick="window.selectMarketPreset('${p.id}')">
                  <span>${p.category}:</span> <b>${p.title.slice(0, 48)}...</b>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Simulation Estimation Modifiers -->
        <div style="margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px solid var(--border-color); display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.25rem;">
          <div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem;">
              <label style="font-size: 0.8rem; font-weight: 700; color: var(--text-body);">Political Certainty</label>
              <span id="certaintyDisplayVal" style="font-size: 0.8rem; font-family: var(--font-mono); color: #0284c7;">${state.market.certainty}%</span>
            </div>
            <input type="range" 
                   id="marketCertaintyInput" 
                   min="20" 
                   max="100" 
                   value="${state.market.certainty}" 
                   style="width: 100%; accent-color: #0284c7;"
                   oninput="document.getElementById('certaintyDisplayVal').innerText = this.value + '%'" />
            <span style="font-size: 0.72rem; color: var(--text-muted);">Probability that legislation/policy is enacted</span>
          </div>

          <div>
            <label style="font-size: 0.8rem; font-weight: 700; color: var(--text-body); display: block; margin-bottom: 0.35rem;">
              Forecast Horizon
            </label>
            <select id="marketHorizonSelect" style="width: 100%; padding: 0.5rem; border-radius: 8px; background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-main); font-size: 0.85rem;">
              <option value="7" ${state.market.horizonDays === 7 ? 'selected' : ''}>7 Days (Immediate Shock Response)</option>
              <option value="30" ${state.market.horizonDays === 30 ? 'selected' : ''}>30 Days (Medium-term Absorption)</option>
              <option value="90" ${state.market.horizonDays === 90 ? 'selected' : ''}>90 Days (Quarterly Policy Cycle)</option>
            </select>
          </div>

          <div>
            <label style="font-size: 0.8rem; font-weight: 700; color: var(--text-body); display: block; margin-bottom: 0.35rem;">
              Directional Bias Override
            </label>
            <select id="marketDirectionSelect" style="width: 100%; padding: 0.5rem; border-radius: 8px; background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-main); font-size: 0.85rem;">
              <option value="auto" ${state.market.manualDirection === 'auto' ? 'selected' : ''}>🤖 Auto-Detect (NLP Sentiment)</option>
              <option value="bullish" ${state.market.manualDirection === 'bullish' ? 'selected' : ''}>📈 Force Pro-Growth / Bullish Bias</option>
              <option value="bearish" ${state.market.manualDirection === 'bearish' ? 'selected' : ''}>📉 Force Contractionary / Bearish Bias</option>
            </select>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; margin-top: 1.5rem;">
          <button class="btn-primary" style="padding: 0.8rem 1.8rem; font-size: 0.95rem; font-weight: 800;" onclick="window.runMarketPrediction()">
            ⚡ Run Prediction Engine
          </button>
        </div>
      </div>

      <!-- RESULTS SECTION -->
      ${result ? `
        <div style="animation: fadeIn 0.4s ease forwards;">
          <!-- Regime & Macro Card -->
          <div class="card" style="border: 1px solid var(--border-color); margin-bottom: 1.5rem; background: var(--bg-card);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.25rem;">
              <div>
                <span class="badge-tag cyan">FORECAST REGIME</span>
                <h3 style="font-size: 1.5rem; font-weight: 700; color: var(--text-main); margin-top: 0.25rem;">
                  ${result.regime}
                </h3>
              </div>
              <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                <div class="stat-card" style="padding: 0.6rem 1rem;">
                  <span class="stat-label">Domain</span>
                  <span class="stat-value" style="font-size: 0.95rem; color: #60a5fa;">${result.analysis.domainLabel}</span>
                </div>
                <div class="stat-card" style="padding: 0.6rem 1rem;">
                  <span class="stat-label">Sentiment</span>
                  <span class="stat-value" style="font-size: 0.95rem; color: ${result.analysis.sentimentScore >= 0 ? '#34d399' : '#fb7185'};">
                    ${result.analysis.sentimentScore > 0 ? '+' : ''}${result.analysis.sentimentScore}
                  </span>
                </div>
                <div class="stat-card" style="padding: 0.6rem 1rem;">
                  <span class="stat-label">Assumed Certainty</span>
                  <span class="stat-value" style="font-size: 0.95rem; color: #facc15;">${result.certaintyAssumed}%</span>
                </div>
              </div>
            </div>

            <div style="font-size: 0.85rem; color: var(--text-muted); display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
              <span>Key Extracted Signal Tokens:</span>
              ${result.analysis.keywordsFound.map(kw => `
                <span style="font-family: var(--font-mono); background: var(--bg-surface); border: 1px solid var(--border-color); padding: 0.15rem 0.45rem; border-radius: 6px; font-size: 0.75rem; color: var(--text-body);">
                  ${kw}
                </span>
              `).join('')}
            </div>
          </div>

          <!-- Top Winners & Top Losers Grid -->
          <div class="pmp-grid-2" style="margin-bottom: 1.5rem;">
            <!-- Winners -->
            <div class="card" style="border-left: 4px solid #10b981;">
              <h4 style="font-size: 1rem; font-weight: 800; color: #059669; margin-bottom: 0.85rem; display: flex; align-items: center; gap: 0.5rem;">
                <span>🚀</span> Top Expected Beneficiaries
              </h4>
              <div style="display: flex; flex-direction: column; gap: 0.6rem;">
                ${result.topWinners.length ? result.topWinners.map(w => `
                  <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.75rem; background: rgba(16, 185, 129, 0.08); border-radius: 8px;">
                    <div>
                      <b style="color: var(--text-main); font-size: 0.9rem;">${w.icon} ${w.assetId}</b>
                      <span style="font-size: 0.78rem; color: var(--text-muted); margin-left: 0.5rem;">${w.name}</span>
                    </div>
                    <span class="pill-bullish" style="font-weight: 700;">+${w.expectedShiftPct}%</span>
                  </div>
                `).join('') : '<p style="color: var(--text-muted); font-size: 0.85rem;">No sectors showing significant upside under this policy shock.</p>'}
              </div>
            </div>

            <!-- Losers -->
            <div class="card" style="border-left: 4px solid #f43f5e;">
              <h4 style="font-size: 1rem; font-weight: 800; color: #e11d48; margin-bottom: 0.85rem; display: flex; align-items: center; gap: 0.5rem;">
                <span>⚠️</span> Top Expected Headwinds
              </h4>
              <div style="display: flex; flex-direction: column; gap: 0.6rem;">
                ${result.topLosers.length ? result.topLosers.map(l => `
                  <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.75rem; background: rgba(244, 63, 94, 0.08); border-radius: 8px;">
                    <div>
                      <b style="color: var(--text-main); font-size: 0.9rem;">${l.icon} ${l.assetId}</b>
                      <span style="font-size: 0.78rem; color: var(--text-muted); margin-left: 0.5rem;">${l.name}</span>
                    </div>
                    <span class="pill-bearish" style="font-weight: 700;">${l.expectedShiftPct}%</span>
                  </div>
                `).join('') : '<p style="color: var(--text-muted); font-size: 0.85rem;">No sectors showing significant downside under this policy shock.</p>'}
              </div>
            </div>
          </div>

          <!-- All Asset Classes Breakdown Header & View Switcher -->
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1rem;">
            <div>
              <h3 style="font-size: 1.25rem; font-weight: 800; color: var(--text-main); margin-bottom: 0.2rem;">
                Multi-Asset Forecast Models (${result.horizonDays}-Day Horizon)
              </h3>
              <p style="font-size: 0.8rem; color: var(--text-muted);">
                Realistic OHLC candlestick price discovery vs Monte Carlo median/confidence drift.
              </p>
            </div>

            <div class="chart-view-selector">
              <button class="chart-tab-btn ${state.market.activeChartView === 'candlestick' ? 'active' : ''}" onclick="window.setMarketChartView('candlestick')">
                🕯️ Candlestick View
              </button>
              <button class="chart-tab-btn ${state.market.activeChartView === 'montecarlo' ? 'active' : ''}" onclick="window.setMarketChartView('montecarlo')">
                📈 Monte Carlo Band View
              </button>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 1.25rem;">
            ${result.assets.map(asset => {
              const isUp = asset.expectedShiftPct > 0;
              const isNeutral = Math.abs(asset.expectedShiftPct) <= 0.3;
              const accentColor = isNeutral ? '#94a3b8' : (isUp ? '#10b981' : '#f43f5e');

              // SVG Dimensions
              const svgW = 380;
              const svgH = 185;
              const padLeft = 48;
              const padRight = 14;
              const padTop = 18;
              const padBottom = 26;
              const plotW = svgW - padLeft - padRight;
              const plotH = svgH - padTop - padBottom;

              const candles = asset.candles || [];
              const trajectory = asset.trajectory || [];

              // Price extremes
              let allMin = Infinity;
              let allMax = -Infinity;

              candles.forEach(c => {
                if (c.low < allMin) allMin = c.low;
                if (c.high > allMax) allMax = c.high;
              });

              trajectory.forEach(t => {
                if (t.bear < allMin) allMin = t.bear;
                if (t.bull > allMax) allMax = t.bull;
              });

              if (!isFinite(allMin) || !isFinite(allMax) || allMax === allMin) {
                allMin = (asset.currentPrice || 100) * 0.95;
                allMax = (asset.currentPrice || 100) * 1.05;
              }

              // Give padding to price range
              const priceMargin = (allMax - allMin) * 0.08 || 1;
              const yMin = allMin - priceMargin;
              const yMax = allMax + priceMargin;
              const yRange = yMax - yMin;

              const getY = (val) => padTop + plotH - ((val - yMin) / yRange) * plotH;
              const getX = (dayIdx, totalDays) => padLeft + (dayIdx / totalDays) * plotW;

              // Grid Y-Axis ticks (4 levels)
              const yTicks = [
                yMin + yRange * 0.1,
                yMin + yRange * 0.4,
                yMin + yRange * 0.7,
                yMin + yRange * 0.95
              ];

              // Base Price Line
              const basePriceY = getY(asset.currentPrice || 100);

              // X-Axis day markers (5 ticks)
              const totalDays = result.horizonDays;
              const xTicks = [
                { day: 1, label: 'T+1' },
                { day: Math.round(totalDays * 0.25), label: `T+${Math.round(totalDays * 0.25)}` },
                { day: Math.round(totalDays * 0.5), label: `T+${Math.round(totalDays * 0.5)}` },
                { day: Math.round(totalDays * 0.75), label: `T+${Math.round(totalDays * 0.75)}` },
                { day: totalDays, label: `T+${totalDays}` }
              ];

              let chartInnerSvg = '';

              if (state.market.activeChartView === 'candlestick') {
                // Render Candlesticks
                const candleWidth = Math.max(3.5, Math.min(10, (plotW / candles.length) * 0.65));
                const candleSvgElements = candles.map((c, i) => {
                  const cx = getX(i + 0.5, candles.length);
                  const wickTop = getY(c.high);
                  const wickBottom = getY(c.low);
                  const bodyTop = getY(Math.max(c.open, c.close));
                  const bodyBottom = getY(Math.min(c.open, c.close));
                  const bodyHeight = Math.max(1.5, bodyBottom - bodyTop);
                  const colorClass = c.isGreen ? 'green' : 'red';

                  return `
                    <g class="candle-group">
                      <!-- High-Low Wick -->
                      <line class="wick ${colorClass}" x1="${cx.toFixed(1)}" y1="${wickTop.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${wickBottom.toFixed(1)}" />
                      <!-- Real Body -->
                      <rect class="candle-body ${colorClass}" x="${(cx - candleWidth / 2).toFixed(1)}" y="${bodyTop.toFixed(1)}" width="${candleWidth.toFixed(1)}" height="${bodyHeight.toFixed(1)}" rx="1" />
                    </g>
                  `;
                }).join('');

                chartInnerSvg = candleSvgElements;
              } else {
                // Render Monte Carlo Tunnel
                const bullPoints = trajectory.map((t, idx) => `${getX(idx, totalDays).toFixed(1)},${getY(t.bull).toFixed(1)}`).join(' ');
                const bearPointsRev = [...trajectory].reverse().map((t, idx) => {
                  const origIdx = totalDays - idx;
                  return `${getX(origIdx, totalDays).toFixed(1)},${getY(t.bear).toFixed(1)}`;
                }).join(' ');
                const bandPolygon = `${bullPoints} ${bearPointsRev}`;

                const medianPath = trajectory.map((t, idx) => `${getX(idx, totalDays).toFixed(1)},${getY(t.base).toFixed(1)}`).join(' ');

                chartInnerSvg = `
                  <!-- Confidence Corridor 90% Band -->
                  <polygon points="${bandPolygon}" fill="${isUp ? 'rgba(16,185,129,0.12)' : 'rgba(244,63,94,0.12)'}" stroke="none" />
                  <!-- Bull / Bear Boundaries -->
                  <polyline points="${bullPoints}" fill="none" stroke="${isUp ? '#34d399' : '#fb7185'}" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.65" />
                  <!-- Median Base Path -->
                  <polyline points="${medianPath}" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                `;
              }

              // Latest candle values
              const lastCandle = candles[candles.length - 1] || { open: asset.currentPrice, close: asset.projectedPrice, high: asset.projectedPrice, low: asset.currentPrice };

              return `
                <div class="asset-card" onclick="window.openAssetModal('${asset.assetId}')" title="Click to enlarge full-screen chart">
                  <span class="expand-hint-badge">🔍 Click to Enlarge</span>

                  <!-- Header: Asset identity, price shift, stance -->
                  <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                      <div style="display: flex; align-items: center; gap: 0.4rem;">
                        <span style="font-size: 1.25rem;">${asset.icon}</span>
                        <strong style="color: var(--text-main); font-size: 1rem; letter-spacing: -0.01em;">${asset.assetId}</strong>
                        <span style="font-size: 0.72rem; padding: 0.15rem 0.45rem; border-radius: 4px; background: var(--bg-surface); color: var(--text-muted); font-family: var(--font-mono);">${asset.category}</span>
                      </div>
                      <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.2rem;">${asset.name}</div>
                    </div>
                    <div style="text-align: right;">
                      <span class="stat-metric-pill ${isNeutral ? 'pill-neutral' : (isUp ? 'pill-bullish' : 'pill-bearish')}" style="font-weight: 800;">
                        ${isUp ? '+' : ''}${asset.expectedShiftPct}%
                      </span>
                      <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.25rem; font-family: var(--font-mono);">
                        $${Number(asset.currentPrice).toFixed(2)} → <b style="color: var(--text-main);">$${Number(asset.projectedPrice).toFixed(2)}</b>
                      </div>
                    </div>
                  </div>

                  <!-- Real-World Candlestick / Grid Chart Frame -->
                  <div class="candlestick-wrapper">
                    <div class="candle-hover-overlay">
                      <span>O: <b>$${Number(lastCandle.open).toFixed(2)}</b></span>
                      <span>H: <b style="color: #059669;">$${Number(lastCandle.high).toFixed(2)}</b></span>
                      <span>L: <b style="color: #e11d48;">$${Number(lastCandle.low).toFixed(2)}</b></span>
                      <span>C: <b style="color: ${lastCandle.close >= lastCandle.open ? '#059669' : '#e11d48'};">$${Number(lastCandle.close).toFixed(2)}</b></span>
                    </div>

                    <svg class="candlestick-svg" viewBox="0 0 ${svgW} ${svgH}">
                      <!-- Grid Lines (Horizontal) -->
                      ${yTicks.map(tVal => {
                        const yPos = getY(tVal);
                        return `
                          <line class="grid-line" x1="${padLeft}" y1="${yPos.toFixed(1)}" x2="${svgW - padRight}" y2="${yPos.toFixed(1)}" />
                          <text x="${padLeft - 6}" y="${(yPos + 3).toFixed(1)}" text-anchor="end">$${tVal < 100 ? tVal.toFixed(1) : Math.round(tVal)}</text>
                        `;
                      }).join('')}

                      <!-- Baseline T=0 Reference -->
                      <line class="baseline-ref" x1="${padLeft}" y1="${basePriceY.toFixed(1)}" x2="${svgW - padRight}" y2="${basePriceY.toFixed(1)}" />

                      <!-- Grid Lines & Ticks (Vertical Days) -->
                      ${xTicks.map(xTick => {
                        const xPos = getX(xTick.day, totalDays);
                        return `
                          <line class="grid-line" x1="${xPos.toFixed(1)}" y1="${padTop}" x2="${xPos.toFixed(1)}" y2="${padTop + plotH}" />
                          <text x="${xPos.toFixed(1)}" y="${svgH - 8}" text-anchor="middle">${xTick.label}</text>
                        `;
                      }).join('')}

                      <!-- Axes Borders -->
                      <line class="axis-line" x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${padTop + plotH}" />
                      <line class="axis-line" x1="${padLeft}" y1="${padTop + plotH}" x2="${svgW - padRight}" y2="${padTop + plotH}" />

                      <!-- Candlestick / Band Visual Graphics -->
                      ${chartInnerSvg}
                    </svg>
                  </div>

                  <!-- Footer: Confidence Range & Strategy Stance -->
                  <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.76rem; color: var(--text-muted); border-top: 1px solid var(--border-color); padding-top: 0.6rem;">
                    <span>95% Shock Band: <b style="color: var(--text-body);">${asset.confidenceLower}% to ${asset.confidenceUpper}%</b></span>
                    <span style="color: ${accentColor}; font-weight: 800;">${asset.stance} ↗</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : `
        <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted); border: 1px dashed var(--border-color); border-radius: 16px; background: var(--bg-surface);">
          <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">📊</div>
          <p style="font-size: 0.95rem; color: var(--text-body); font-weight: 600;">Prediction engine ready.</p>
          <p style="font-size: 0.85rem; color: var(--text-muted);">
            Click <b>"Run Prediction Engine"</b> above to extract political sentiment and project asset vectors.
          </p>
        </div>
      `}
    </div>
  `;
}

document.addEventListener('DOMContentLoaded', () => {
  initSession();
});
