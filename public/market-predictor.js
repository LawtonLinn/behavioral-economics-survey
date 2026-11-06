/**
 * Political Market Predictor (PMP) Engine
 * Quantitative Multi-Factor Sentiment, Policy Classification & Asset Impact Matrix
 */

// 1. Sector & Asset Taxonomy
export const ASSETS = [
  { id: 'SPY', name: 'S&P 500 ETF (SPY)', category: 'Equities', baseVol: 0.14, icon: '📈' },
  { id: 'QQQ', name: 'Nasdaq 100 (Tech / Growth)', category: 'Equities', baseVol: 0.20, icon: '💻' },
  { id: 'XLE', name: 'Energy Select Sector (XLE)', category: 'Commodities / Energy', baseVol: 0.24, icon: '🛢️' },
  { id: 'ICLN', name: 'Clean Energy ETF (ICLN)', category: 'Renewables', baseVol: 0.28, icon: '🌱' },
  { id: 'ITA', name: 'Aerospace & Defense (ITA)', category: 'Defense', baseVol: 0.16, icon: '🛡️' },
  { id: 'XLF', name: 'Financial Sector ETF (XLF)', category: 'Financials', baseVol: 0.18, icon: '🏦' },
  { id: 'TLT', name: '20+ Year Treasury Bond (TLT)', category: 'Bonds / Rates', baseVol: 0.15, icon: '📜' },
  { id: 'GLD', name: 'SPDR Gold Shares (GLD)', category: 'Safe Haven', baseVol: 0.13, icon: '🪙' },
  { id: 'UUP', name: 'US Dollar Index Bullish (UUP)', category: 'Currencies', baseVol: 0.08, icon: '💵' },
  { id: 'BTC', name: 'Bitcoin (Risk & Speculation)', category: 'Crypto / Alternative', baseVol: 0.48, icon: '⚡' }
];

// 2. Policy Dictionaries & Sector Betas
const POLICY_DOMAINS = {
  trade_tariffs: {
    label: 'Trade, Tariffs & Protectionism',
    keywords: ['tariff', 'tariffs', 'customs', 'duty', 'trade war', 'wto', 'import', 'export', 'embargo', 'sanction', 'trade barrier', 'countervailing', 'dumping', 'usmca'],
    impacts: {
      SPY: -0.35,
      QQQ: -0.45,
      XLE: 0.10,
      ICLN: -0.20,
      ITA: 0.15,
      XLF: -0.25,
      TLT: 0.20,
      GLD: 0.40,
      UUP: 0.35,
      BTC: -0.25
    }
  },
  monetary_fiscal: {
    label: 'Monetary, Rates & Treasury Policy',
    keywords: ['fed', 'interest rate', 'rate cut', 'rate hike', 'powell', 'inflation', 'cpi', 'pce', 'treasury', 'yield', 'quantitative easing', 'liquidity', 'balance sheet', 'bond yields', 'fiscal stimulus', 'debt ceiling'],
    impacts: {
      SPY: 0.50,
      QQQ: 0.70,
      XLE: 0.20,
      ICLN: 0.45,
      ITA: 0.05,
      XLF: -0.20,
      TLT: 0.65,
      GLD: 0.35,
      UUP: -0.50,
      BTC: 0.80
    }
  },
  antitrust_regulatory: {
    label: 'Antitrust, Big Tech & Corporate Regulation',
    keywords: ['antitrust', 'monopoly', 'doj', 'ftc', 'lina khan', 'regulation', 'breakup', 'sec', 'investigation', 'subpoena', 'compliance', 'privacy law', 'tech crackdown', 'ai regulation'],
    impacts: {
      SPY: -0.30,
      QQQ: -0.75,
      XLE: 0.05,
      ICLN: 0.0,
      ITA: 0.0,
      XLF: -0.15,
      TLT: 0.10,
      GLD: 0.10,
      UUP: -0.05,
      BTC: -0.30
    }
  },
  geopolitical_defense: {
    label: 'Geopolitical Conflict, Defense & War',
    keywords: ['war', 'military', 'conflict', 'missile', 'nato', 'taiwan', 'ukraine', 'middle east', 'strait of hormuz', 'iran', 'defense spending', 'pentagon', 'escalation', 'ceasefire', 'treaty', 'blockade'],
    impacts: {
      SPY: -0.40,
      QQQ: -0.30,
      XLE: 0.75,
      ICLN: -0.10,
      ITA: 0.85,
      XLF: -0.30,
      TLT: 0.40,
      GLD: 0.80,
      UUP: 0.45,
      BTC: -0.35
    }
  },
  energy_climate: {
    label: 'Energy, Clean Tech & Environmental Subsidies',
    keywords: ['oil', 'gas', 'pipeline', 'opec', 'drilling', 'clean energy', 'ira', 'inflation reduction act', 'green new deal', 'epa', 'carbon', 'renewables', 'solar', 'wind', 'ev mandate', 'emissions', 'nuclear'],
    impacts: {
      SPY: 0.05,
      QQQ: 0.15,
      XLE: -0.60,
      ICLN: 0.85,
      ITA: 0.0,
      XLF: 0.05,
      TLT: 0.05,
      GLD: 0.15,
      UUP: -0.10,
      BTC: 0.10
    }
  },
  taxation_corporate: {
    label: 'Corporate Tax, Capital Gains & Labor Policy',
    keywords: ['corporate tax', 'capital gains', 'tax cuts', 'tax hike', 'irs', 'corporate rate', 'deduction', 'minimum tax', 'stock buyback', 'labor union', 'minimum wage', 'deregulation'],
    impacts: {
      SPY: 0.60,
      QQQ: 0.65,
      XLE: 0.40,
      ICLN: 0.10,
      ITA: 0.20,
      XLF: 0.70,
      TLT: -0.35,
      GLD: -0.20,
      UUP: 0.25,
      BTC: 0.40
    }
  }
};

// 3. Sentiment & Directional Modifiers
const POLARITY_WORDS = {
  positive_tailwinds: [
    'cut', 'cuts', 'stimulus', 'boost', 'subsidize', 'subsidy', 'easing', 'surge', 'rally',
    'growth', 'record', 'accord', 'deal', 'peace', 'approval', 'deregulate', 'exemption',
    'support', 'win', 'expansion', 'invest', 'breakthrough', 'dividend', 'optimism', 'truce'
  ],
  negative_headwinds: [
    'tariff', 'tariffs', 'hike', 'hikes', 'ban', 'sanction', 'block', 'penalize', 'penalty',
    'strike', 'escalate', 'crisis', 'crash', 'slump', 'inflation', 'default', 'prosecute',
    'lawsuit', 'crackdown', 'boycott', 'recession', 'tighten', 'veto', 'probe', 'restriction'
  ],
  intensifiers: [
    'historic', 'massive', 'emergency', 'aggressive', 'unprecedented', 'immediate', 'sweeping',
    'major', 'severe', 'total', 'critical', 'urgent', 'huge'
  ],
  mitigators: [
    'minor', 'delayed', 'stalled', 'unlikely', 'rumored', 'possible', 'limited', 'draft',
    'preliminary', 'unverified', 'gradual', 'partial'
  ]
};

/**
 * Text Sentiment & Magnitude Extraction
 */
export function analyzePoliticalText(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return {
      primaryDomain: 'monetary_fiscal',
      sentimentScore: 0,
      intensity: 1.0,
      certaintyScore: 0.7,
      keywordsFound: []
    };
  }

  const text = rawText.toLowerCase();
  const words = text.match(/\b[a-z0-9_-]+\b/g) || [];

  // Match domains
  const domainScores = {};
  for (const [key, domain] of Object.entries(POLICY_DOMAINS)) {
    domainScores[key] = 0;
    for (const kw of domain.keywords) {
      if (text.includes(kw)) {
        domainScores[key] += 1;
      }
    }
  }

  let primaryDomain = 'monetary_fiscal';
  let maxScore = -1;
  for (const [key, score] of Object.entries(domainScores)) {
    if (score > maxScore && score > 0) {
      maxScore = score;
      primaryDomain = key;
    }
  }

  // Polarity / Sentiment calculation
  let posCount = 0;
  let negCount = 0;
  let intensifierCount = 0;
  let mitigatorCount = 0;
  const keywordsFound = [];

  for (const w of words) {
    if (POLARITY_WORDS.positive_tailwinds.includes(w)) {
      posCount++;
      keywordsFound.push(`+${w}`);
    } else if (POLARITY_WORDS.negative_headwinds.includes(w)) {
      negCount++;
      keywordsFound.push(`-${w}`);
    }

    if (POLARITY_WORDS.intensifiers.includes(w)) intensifierCount++;
    if (POLARITY_WORDS.mitigators.includes(w)) mitigatorCount++;
  }

  // Base sentiment in [-1.0, +1.0]
  const totalPolarity = posCount + negCount;
  let sentimentScore = 0;
  if (totalPolarity > 0) {
    sentimentScore = (posCount - negCount) / Math.max(totalPolarity, 2);
  }

  // Intensity multiplier [0.5, 2.0]
  let intensity = 1.0 + (intensifierCount * 0.25) - (mitigatorCount * 0.2);
  intensity = Math.max(0.5, Math.min(2.2, intensity));

  // Policy Certainty factor [0.4 to 0.95]
  let certaintyScore = 0.70;
  if (text.includes('passed') || text.includes('signed') || text.includes('effective immediately') || text.includes('announced')) {
    certaintyScore = 0.92;
  } else if (text.includes('proposed') || text.includes('debating') || text.includes('considers') || text.includes('rumor')) {
    certaintyScore = 0.55;
  }

  return {
    primaryDomain,
    domainLabel: POLICY_DOMAINS[primaryDomain]?.label || primaryDomain,
    sentimentScore: Number(sentimentScore.toFixed(3)),
    intensity: Number(intensity.toFixed(2)),
    certaintyScore: Number(certaintyScore.toFixed(2)),
    keywordsFound: keywordsFound.slice(0, 8)
  };
}

/**
 * Monte Carlo Simulation & Price Projection over Horizon Days
 */
export function simulateMarketResponse(analysis, options = {}) {
  const {
    horizonDays = 30,
    numSimulations = 250,
    userCertainty = null,
    manualDirection = null // 'bullish', 'bearish', or null (auto)
  } = options;

  const certainty = userCertainty !== null ? (userCertainty / 100) : analysis.certaintyScore;
  const domain = POLICY_DOMAINS[analysis.primaryDomain] || POLICY_DOMAINS.monetary_fiscal;

  // Sentiment sign adjustment
  let sentimentMultiplier = analysis.sentimentScore;
  if (manualDirection === 'bullish') sentimentMultiplier = Math.max(0.4, Math.abs(analysis.sentimentScore) || 0.6);
  if (manualDirection === 'bearish') sentimentMultiplier = -Math.max(0.4, Math.abs(analysis.sentimentScore) || 0.6);
  if (Math.abs(sentimentMultiplier) < 0.15) {
    // If neutral text, assign default directional impulse based on domain risk
    sentimentMultiplier = (analysis.primaryDomain === 'geopolitical_defense' || analysis.primaryDomain === 'trade_tariffs') ? -0.45 : 0.35;
  }

  const assetProjections = [];

  for (const asset of ASSETS) {
    const rawBeta = domain.impacts[asset.id] ?? 0;
    // Expected percentage return shift over the horizon:
    // Beta * sentiment * intensity * certainty * scaling
    const expectedShiftPct = rawBeta * sentimentMultiplier * analysis.intensity * certainty * 8.5; // e.g. +3.5%
    const dailyDrift = expectedShiftPct / 100 / horizonDays;
    const dailyVol = asset.baseVol / Math.sqrt(252);

    // Monte Carlo runs for paths
    const paths = [];
    const basePrice = 100.0;

    for (let s = 0; s < numSimulations; s++) {
      const path = [basePrice];
      let p = basePrice;
      for (let d = 1; d <= horizonDays; d++) {
        // Standard normal Box-Muller
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2.0 * Math.log(u1 || 0.0001)) * Math.cos(2.0 * Math.PI * u2);

        // Jump process on day 1-3 (policy news shock)
        const shockDecay = Math.exp(-(d - 1) / 4.0);
        const policyDrift = dailyDrift * (1 + shockDecay * 2.5);

        const dailyReturn = policyDrift + (dailyVol * z);
        p = Math.max(0.1, p * (1 + dailyReturn));
        path.push(Number(p.toFixed(2)));
      }
      paths.push(path);
    }

    // Compute median path, 5th percentile (bear), 95th percentile (bull)
    const trajectory = [];
    for (let d = 0; d <= horizonDays; d++) {
      const dayValues = paths.map(p => p[d]).sort((a, b) => a - b);
      const p5 = dayValues[Math.floor(numSimulations * 0.05)];
      const p50 = dayValues[Math.floor(numSimulations * 0.50)];
      const p95 = dayValues[Math.floor(numSimulations * 0.95)];
      trajectory.push({ day: d, bear: p5, base: p50, bull: p95 });
    }

    const startPrice = trajectory[0].base;
    const endPrice = trajectory[horizonDays].base;
    const finalShiftPct = Number((((endPrice - startPrice) / startPrice) * 100).toFixed(2));
    const confidenceLower = Number((((trajectory[horizonDays].bear - startPrice) / startPrice) * 100).toFixed(2));
    const confidenceUpper = Number((((trajectory[horizonDays].bull - startPrice) / startPrice) * 100).toFixed(2));

    let stance = 'Neutral';
    if (finalShiftPct > 1.0) stance = 'Strong Buy / Overweight';
    else if (finalShiftPct > 0.3) stance = 'Moderate Tailwinds';
    else if (finalShiftPct < -1.0) stance = 'Strong Sell / Hedge';
    else if (finalShiftPct < -0.3) stance = 'Moderate Headwinds';

    assetProjections.push({
      assetId: asset.id,
      name: asset.name,
      category: asset.category,
      icon: asset.icon,
      baseVol: asset.baseVol,
      expectedShiftPct: finalShiftPct,
      confidenceLower,
      confidenceUpper,
      stance,
      trajectory
    });
  }

  // Sort by expected magnitude of impact (absolute shift)
  assetProjections.sort((a, b) => Math.abs(b.expectedShiftPct) - Math.abs(a.expectedShiftPct));

  // Market Regime Identification
  let regime = 'Mixed / Sector Rotation';
  const spyShift = assetProjections.find(a => a.assetId === 'SPY')?.expectedShiftPct || 0;
  const gldShift = assetProjections.find(a => a.assetId === 'GLD')?.expectedShiftPct || 0;
  const tltShift = assetProjections.find(a => a.assetId === 'TLT')?.expectedShiftPct || 0;

  if (spyShift > 1.5 && gldShift < 0.5) {
    regime = 'Risk-On Expansionary (Liquidity Surge)';
  } else if (spyShift < -1.5 && gldShift > 1.0) {
    regime = 'Stagflationary / Safe-Haven Flight';
  } else if (spyShift < -1.0 && tltShift > 1.0) {
    regime = 'Defensive Flight-to-Quality';
  } else if (Math.abs(spyShift) <= 0.8 && Math.abs(gldShift) <= 0.8) {
    regime = 'Equilibrium / Low Systemic Volatility';
  }

  return {
    timestamp: new Date().toISOString(),
    analysis,
    certaintyAssumed: Math.round(certainty * 100),
    horizonDays,
    regime,
    topWinners: assetProjections.filter(a => a.expectedShiftPct > 0).slice(0, 3),
    topLosers: assetProjections.filter(a => a.expectedShiftPct < 0).slice(0, 3),
    assets: assetProjections
  };
}
