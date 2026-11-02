import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'responses.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ responses: [] }, null, 2), 'utf-8');
}

function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading responses.json:', err);
    return { responses: [] };
  }
}

function writeData(data) {
  try {
    const tempFile = `${DATA_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, DATA_FILE);
    return true;
  } catch (err) {
    console.error('Error writing responses.json:', err);
    return false;
  }
}

// Statistical Helper Functions
function calculateMean(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((acc, v) => acc + v, 0) / arr.length;
}

function calculateMedian(arr) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function calculateStdDev(arr, mean) {
  if (!arr || arr.length < 2) return 0;
  const variance = arr.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

// Pearson Chi-Square 2x2 with continuity correction
function chiSquare2x2(a, b, c, d) {
  const N = a + b + c + d;
  if (N === 0) return { chiSquare: 0, pValue: 1, oddsRatio: 1 };
  
  const numerator = N * Math.pow(Math.max(0, Math.abs(a * d - b * c) - N / 2), 2);
  const denominator = (a + b) * (c + d) * (a + c) * (b + d);
  const chiSq = denominator > 0 ? numerator / denominator : 0;
  const oddsRatio = (b * c > 0) ? (a * d) / (b * c) : 1;
  
  const z = Math.sqrt(chiSq);
  const pValue = Math.min(1, Math.max(0, 2 * (1 - normalCdf(z))));
  
  return {
    chiSquare: Number(chiSq.toFixed(2)),
    pValue: Number(pValue.toFixed(4)),
    oddsRatio: Number(oddsRatio.toFixed(2))
  };
}

function normalCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - prob : prob;
}

// Compute Individual Behavioral Metrics
function computeParticipantMetrics(payload) {
  const { cohort, responses, telemetry } = payload;
  
  // 1. Loss Aversion Lambda estimation:
  // Gambles: [30, 50, 70, 90, 110]
  let lambda = 2.0;
  if (Array.isArray(responses.loss_aversion_gambles)) {
    const gambles = responses.loss_aversion_gambles;
    const acceptedCount = gambles.filter(Boolean).length;
    if (acceptedCount === 0) {
      lambda = 3.5; // Very cautious / highly loss averse
    } else if (acceptedCount === 1) {
      lambda = 2.5; // Indifference around $40 -> 100/40 = 2.5
    } else if (acceptedCount === 2) {
      lambda = 1.67; // Indifference around $60 -> 100/60 = 1.67
    } else if (acceptedCount === 3) {
      lambda = 1.25; // Indifference around $80 -> 100/80 = 1.25
    } else if (acceptedCount === 4) {
      lambda = 1.0; // Risk Neutral -> 100/100 = 1.0
    } else {
      lambda = 0.85; // Risk Seeking (took -$110 coin flip)
    }
  }

  // 2. Framing Job Interpretation
  const isRiskAverse = responses.framing_job_choice === 'A';
  const isRiskSeeking = responses.framing_job_choice === 'B';

  // 3. Compounding Delay & Rule of 72 Error
  // Principal: $10,000 at 9% return over 24 years.
  // Rule of 72 doubling time = 72 / 9 = 8 years.
  // Starting today: 10,000 * (1.09)^24 = $79,110.83
  // Delaying 8 years: 10,000 * (1.09)^16 = $39,703.46
  // True mathematical Cost of Delay = $39,407.37 (~$39,408)
  const TRUE_COST_OF_DELAY = 39408;
  const userEstimate = Number(responses.delay_growth_estimate) || 0;
  const egbRatio = Number((userEstimate / TRUE_COST_OF_DELAY).toFixed(2));
  
  let egbCategory = 'Linear Bias (Severely Underestimated)';
  if (egbRatio >= 0.8 && egbRatio <= 1.25) {
    egbCategory = 'Accurate Compounding Intuition';
  } else if (egbRatio > 1.25) {
    egbCategory = 'Overestimated';
  } else if (egbRatio >= 0.4) {
    egbCategory = 'Moderate Compounding Awareness';
  }

  // 4. Real Option to Wait Interpretation
  const choseWait = responses.real_option_choice === 'wait_for_information';
  const optionInsight = choseWait 
    ? 'Safety First: Paid the waiting fee to guarantee no losses.' 
    : 'Value Maximizer: Realized the $18,000 waiting fee was too high and took the risk.';

  const totalReactionTimeMs = telemetry?.totalReactionTimeMs || 0;

  return {
    lambda,
    isRiskAverse,
    isRiskSeeking,
    trueCostOfDelay: TRUE_COST_OF_DELAY,
    userEstimate,
    egbRatio,
    egbCategory,
    choseWait,
    optionInsight,
    totalReactionTimeMs
  };
}

// Generate Realistic Benchmark Dataset (N=50) for immediate demo & charts
function generateRealisticDemoData(count = 50) {
  const items = [];
  const now = Date.now();
  
  for (let i = 0; i < count; i++) {
    const isAlpha = i % 2 === 0;
    const cohort = isAlpha ? 'Alpha' : 'Beta';
    const timestamp = new Date(now - (count - i) * 90000).toISOString();
    const sessionId = crypto.randomUUID();

    // 1. Framing Effect (Gain frame chooses Certain A ~72%, Loss frame chooses Risky B ~76%)
    let framing_job_choice;
    if (isAlpha) {
      framing_job_choice = Math.random() < 0.72 ? 'A' : 'B';
    } else {
      framing_job_choice = Math.random() < 0.76 ? 'B' : 'A';
    }

    // 2. Anchoring: House price
    // Alpha High Anchor $850k -> mean ~$680k
    // Beta Low Anchor $350k -> mean ~$460k
    let anchoring_valuation_estimate;
    if (isAlpha) {
      anchoring_valuation_estimate = Math.round(580 + Math.random() * 220); // 580k - 800k
    } else {
      anchoring_valuation_estimate = Math.round(380 + Math.random() * 180); // 380k - 560k
    }

    // Micro Framing: Cash discount vs card fee
    const framing_discount_choice = isAlpha 
      ? (Math.random() < 0.58 ? 'cash' : 'credit')
      : (Math.random() < 0.82 ? 'cash' : 'credit'); // Surcharge feels like penalty -> heavy shift to cash

    // 3. Loss Aversion: Lambda ~ 1.5 - 2.5
    const rand = Math.random();
    let gambles;
    let lambda = 2.0;
    if (rand < 0.22) {
      gambles = [true, false, false, false, false];
      lambda = 2.5;
    } else if (rand < 0.65) {
      gambles = [true, true, false, false, false];
      lambda = 1.67;
    } else if (rand < 0.85) {
      gambles = [true, true, true, false, false];
      lambda = 1.25;
    } else if (rand < 0.95) {
      gambles = [true, true, true, true, false];
      lambda = 1.0;
    } else {
      gambles = [false, false, false, false, false];
      lambda = 3.5;
    }

    const loss_aversion_sunk_choice = Math.random() < 0.66 ? 'hold_for_breakeven' : 'sell_and_reallocate';

    // 4. Rule of 72 & Cost of Delay ($39,408 true)
    let delay_growth_estimate;
    const estRand = Math.random();
    if (estRand < 0.68) {
      delay_growth_estimate = Math.round(6000 + Math.random() * 9000); // 6k - 15k (Linear bias)
    } else if (estRand < 0.88) {
      delay_growth_estimate = Math.round(18000 + Math.random() * 12000); // 18k - 30k
    } else {
      delay_growth_estimate = Math.round(36000 + Math.random() * 8000); // 36k - 44k
    }

    // 5. Real Options: Bakery lease
    const real_option_choice = Math.random() < 0.64 ? 'wait_for_information' : 'invest_now';
    const option_switch_threshold = Math.round(10000 + Math.random() * 16000); // $10k - $26k

    const reactionTimeMs = Math.round(35000 + Math.random() * 45000); // 35s - 80s
    const switchCount = Math.floor(Math.random() * 3);
    const confidenceRating = Math.floor(3 + Math.random() * 3);

    const payload = {
      sessionId,
      cohort,
      timestamp,
      responses: {
        framing_job_choice,
        anchoring_valuation_estimate,
        framing_discount_choice,
        loss_aversion_gambles: gambles,
        loss_aversion_sunk_choice,
        delay_growth_estimate,
        real_option_choice,
        option_switch_threshold,
        confidence_rating: confidenceRating
      },
      telemetry: {
        totalReactionTimeMs: reactionTimeMs,
        switchCount,
        device: 'Web Browser',
        stepTimes: [
          { stepId: 'framing_jobs', reactionTimeMs: 8000, switches: 1 },
          { stepId: 'anchoring_quote', reactionTimeMs: 6500, switches: 0 },
          { stepId: 'loss_lotteries', reactionTimeMs: 12000, switches: 1 },
          { stepId: 'rule72_delay', reactionTimeMs: 9000, switches: 0 },
          { stepId: 'real_options', reactionTimeMs: 11000, switches: 1 }
        ]
      }
    };

    const metrics = computeParticipantMetrics(payload);
    items.push({
      ...payload,
      metrics
    });
  }

  return items;
}

// Compute Aggregate Synthesis
function computeAggregateAnalytics(responses) {
  const total = responses.length;
  if (total === 0) {
    return {
      summary: { total: 0, alphaCount: 0, betaCount: 0, avgLatencySeconds: 0 },
      framing: { gainCertainPercent: 0, gainRiskyPercent: 0, lossCertainPercent: 0, lossRiskyPercent: 0, framingShiftDelta: 0, chiSquare: 0, pValue: 1, oddsRatio: 1 },
      anchoring: { highAnchorMean: 0, lowAnchorMean: 0, anchoringGap: 0, anchoringRatio: 0 },
      lossAversion: { meanLambda: 0, medianLambda: 0, stdDevLambda: 0, benchmarkLambda: 2.25, sunkCostAvoidancePercent: 0, distribution: [] },
      delayAndRealOptions: { trueCostOfDelay: 39408, meanEstimatedDelayCost: 0, medianEstimatedDelayCost: 0, meanEgbRatio: 0, linearBiasProportion: 0, calibratedProportion: 0, choseWaitPercent: 0, choseInvestNowPercent: 0, avgOptionSwitchThreshold: 0 },
      telemetry: { medianLatencyMs: 0, avgSwitches: 0, totalResponses: 0 }
    };
  }

  const alphaGroup = responses.filter(r => r.cohort === 'Alpha');
  const betaGroup = responses.filter(r => r.cohort === 'Beta');

  // 1. Framing Job Contingency
  const aGainCertain = alphaGroup.filter(r => r.responses?.framing_job_choice === 'A').length;
  const bGainRisky = alphaGroup.filter(r => r.responses?.framing_job_choice === 'B').length;
  const cLossCertain = betaGroup.filter(r => r.responses?.framing_job_choice === 'A').length;
  const dLossRisky = betaGroup.filter(r => r.responses?.framing_job_choice === 'B').length;

  const gainTotal = aGainCertain + bGainRisky || 1;
  const lossTotal = cLossCertain + dLossRisky || 1;

  const gainCertainPct = Number(((aGainCertain / gainTotal) * 100).toFixed(1));
  const gainRiskyPct = Number(((bGainRisky / gainTotal) * 100).toFixed(1));
  const lossCertainPct = Number(((cLossCertain / lossTotal) * 100).toFixed(1));
  const lossRiskyPct = Number(((dLossRisky / lossTotal) * 100).toFixed(1));

  const framingShiftDelta = Number((lossRiskyPct - gainRiskyPct).toFixed(1));
  const chiSqStats = chiSquare2x2(aGainCertain, bGainRisky, cLossCertain, dLossRisky);

  // 2. Anchoring (House Prices in $ Thousands)
  const alphaValuations = alphaGroup
    .map(r => Number(r.responses?.anchoring_valuation_estimate))
    .filter(v => !isNaN(v) && v > 0);
  const betaValuations = betaGroup
    .map(r => Number(r.responses?.anchoring_valuation_estimate))
    .filter(v => !isNaN(v) && v > 0);

  const highAnchorMean = calculateMean(alphaValuations);
  const lowAnchorMean = calculateMean(betaValuations);
  const anchoringGap = highAnchorMean - lowAnchorMean;
  // Anchors: High = $850k, Low = $350k (Difference is $500k)
  const anchoringRatio = Number(((anchoringGap / (850 - 350)) * 100).toFixed(1));

  // 3. Loss Aversion
  const lambdas = responses.map(r => r.metrics?.lambda || 2.0);
  const meanLambda = calculateMean(lambdas);
  const medianLambda = calculateMedian(lambdas);
  const stdDevLambda = calculateStdDev(lambdas, meanLambda);

  const sunkHolders = responses.filter(r => r.responses?.loss_aversion_sunk_choice === 'hold_for_breakeven').length;
  const sunkCostAvoidancePercent = Number(((sunkHolders / total) * 100).toFixed(1));

  const lambdaBuckets = [
    { label: 'λ ≤ 1.0 (Risk Friendly)', count: lambdas.filter(l => l <= 1.0).length },
    { label: '1.0 < λ ≤ 1.5 (Mild Aversion)', count: lambdas.filter(l => l > 1.0 && l <= 1.5).length },
    { label: '1.5 < λ ≤ 2.0 (Moderate Aversion)', count: lambdas.filter(l => l > 1.5 && l <= 2.0).length },
    { label: '2.0 < λ ≤ 2.75 (Classic Loss Aversion)', count: lambdas.filter(l => l > 2.0 && l <= 2.75).length },
    { label: 'λ > 2.75 (Strong Loss Aversion)', count: lambdas.filter(l => l > 2.75).length }
  ];

  // 4. Rule of 72 & Cost of Delay & Real Options
  const TRUE_COST_OF_DELAY = 39408;
  const delayEstimates = responses
    .map(r => Number(r.responses?.delay_growth_estimate))
    .filter(v => !isNaN(v) && v >= 0);
  const meanDelayEst = calculateMean(delayEstimates);
  const medianDelayEst = calculateMedian(delayEstimates);
  const egbRatios = responses.map(r => r.metrics?.egbRatio || (meanDelayEst / TRUE_COST_OF_DELAY));
  const meanEgbRatio = calculateMean(egbRatios);

  const linearThinkers = responses.filter(r => (r.metrics?.egbRatio || 0) < 0.4).length;
  const calibratedThinkers = responses.filter(r => {
    const ratio = r.metrics?.egbRatio || 0;
    return ratio >= 0.75 && ratio <= 1.25;
  }).length;

  const waitCount = responses.filter(r => r.responses?.real_option_choice === 'wait_for_information').length;
  const investCount = responses.filter(r => r.responses?.real_option_choice === 'invest_now').length;
  const choseWaitPct = Number(((waitCount / total) * 100).toFixed(1));
  const choseInvestPct = Number(((investCount / total) * 100).toFixed(1));

  const optionThresholds = responses
    .map(r => Number(r.responses?.option_switch_threshold))
    .filter(v => !isNaN(v) && v > 0);
  const avgOptionSwitchThreshold = calculateMean(optionThresholds);

  // 5. Telemetry
  const latencies = responses
    .map(r => r.metrics?.totalReactionTimeMs || r.telemetry?.totalReactionTimeMs || 0)
    .filter(v => v > 0);
  const medianLatencyMs = calculateMedian(latencies);
  const avgLatencySec = Number((calculateMean(latencies) / 1000).toFixed(1));
  const totalSwitches = responses.reduce((acc, r) => acc + (r.telemetry?.switchCount || 0), 0);
  const avgSwitches = Number((totalSwitches / total).toFixed(1));

  return {
    summary: {
      total,
      alphaCount: alphaGroup.length,
      betaCount: betaGroup.length,
      avgLatencySeconds: avgLatencySec,
      medianLatencyMs: Math.round(medianLatencyMs)
    },
    framing: {
      gainCertainPercent: gainCertainPct,
      gainRiskyPercent: gainRiskyPct,
      lossCertainPercent: lossCertainPct,
      lossRiskyPercent: lossRiskyPct,
      framingShiftDelta,
      chiSquare: chiSqStats.chiSquare,
      pValue: chiSqStats.pValue,
      oddsRatio: chiSqStats.oddsRatio,
      contingency: {
        gainCertain: aGainCertain,
        gainRisky: bGainRisky,
        lossCertain: cLossCertain,
        lossRisky: dLossRisky
      }
    },
    anchoring: {
      highAnchorMean: Math.round(highAnchorMean),
      lowAnchorMean: Math.round(lowAnchorMean),
      anchoringGap: Math.round(anchoringGap),
      anchoringRatio
    },
    lossAversion: {
      meanLambda: Number(meanLambda.toFixed(2)),
      medianLambda: Number(medianLambda.toFixed(2)),
      stdDevLambda: Number(stdDevLambda.toFixed(2)),
      benchmarkLambda: 2.25,
      sunkCostAvoidancePercent,
      distribution: lambdaBuckets
    },
    delayAndRealOptions: {
      trueCostOfDelay: TRUE_COST_OF_DELAY,
      meanEstimatedDelayCost: Math.round(meanDelayEst),
      medianEstimatedDelayCost: Math.round(medianDelayEst),
      meanEgbRatio: Number(meanEgbRatio.toFixed(2)),
      linearBiasProportion: Number(((linearThinkers / total) * 100).toFixed(1)),
      calibratedProportion: Number(((calibratedThinkers / total) * 100).toFixed(1)),
      choseWaitPercent: choseWaitPct,
      choseInvestNowPercent: choseInvestPct,
      avgOptionSwitchThreshold: Math.round(avgOptionSwitchThreshold)
    },
    telemetry: {
      medianLatencyMs: Math.round(medianLatencyMs),
      avgSwitches,
      totalResponses: total
    }
  };
}

// Convert Responses to CSV
function responsesToCsv(responses) {
  const headers = [
    'session_id',
    'timestamp',
    'cohort',
    'framing_job_choice',
    'framing_discount_choice',
    'anchoring_house_estimate_thousands',
    'loss_aversion_lambda',
    'loss_aversion_sunk_choice',
    'delay_growth_estimate_dollars',
    'true_cost_of_delay_dollars',
    'exponential_growth_bias_ratio',
    'real_option_choice',
    'option_switch_threshold_dollars',
    'reaction_time_ms',
    'option_switches',
    'confidence_rating'
  ];

  const rows = responses.map(r => {
    return [
      r.sessionId || '',
      r.timestamp || '',
      r.cohort || '',
      r.responses?.framing_job_choice || '',
      r.responses?.framing_discount_choice || '',
      r.responses?.anchoring_valuation_estimate || '',
      r.metrics?.lambda ?? '',
      r.responses?.loss_aversion_sunk_choice || '',
      r.responses?.delay_growth_estimate || '',
      r.metrics?.trueCostOfDelay ?? 39408,
      r.metrics?.egbRatio ?? '',
      r.responses?.real_option_choice || '',
      r.responses?.option_switch_threshold || '',
      r.telemetry?.totalReactionTimeMs ?? '',
      r.telemetry?.switchCount ?? 0,
      r.responses?.confidence_rating ?? ''
    ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 10 * 1024 * 1024) reject(new Error('Payload too large'));
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.csv': 'text/csv; charset=utf-8'
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (pathname === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', version: '2.1.0' }));
    return;
  }

  // Session start
  if (pathname === '/api/session/start' && req.method === 'POST') {
    const data = readData();
    const alphaCount = data.responses.filter(r => r.cohort === 'Alpha').length;
    const betaCount = data.responses.filter(r => r.cohort === 'Beta').length;
    
    let assignedCohort;
    if (alphaCount < betaCount) {
      assignedCohort = 'Alpha';
    } else if (betaCount < alphaCount) {
      assignedCohort = 'Beta';
    } else {
      assignedCohort = Math.random() < 0.5 ? 'Alpha' : 'Beta';
    }

    const sessionId = crypto.randomUUID();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      sessionId,
      cohort: assignedCohort,
      assignedAt: new Date().toISOString()
    }));
    return;
  }

  // Submit survey
  if (pathname === '/api/survey/submit' && req.method === 'POST') {
    try {
      const payload = await parseJsonBody(req);
      if (!payload.sessionId || !payload.cohort || !payload.responses) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required survey submission fields' }));
        return;
      }

      const metrics = computeParticipantMetrics(payload);
      const record = {
        sessionId: payload.sessionId,
        cohort: payload.cohort,
        timestamp: new Date().toISOString(),
        responses: payload.responses,
        telemetry: payload.telemetry || {},
        metrics
      };

      const db = readData();
      db.responses.push(record);
      writeData(db);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        sessionId: payload.sessionId,
        personalMetrics: metrics
      }));
    } catch (err) {
      console.error('Submit error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to save response' }));
    }
    return;
  }

  // Analytics
  if (pathname === '/api/survey/analytics' && req.method === 'GET') {
    const db = readData();
    const analytics = computeAggregateAnalytics(db.responses);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: analytics }));
    return;
  }

  // Responses list
  if (pathname === '/api/survey/responses' && req.method === 'GET') {
    const db = readData();
    const cohort = url.searchParams.get('cohort');
    let list = db.responses;
    if (cohort && (cohort === 'Alpha' || cohort === 'Beta')) {
      list = list.filter(r => r.cohort === cohort);
    }
    list = [...list].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, total: list.length, responses: list }));
    return;
  }

  // Seed demo data
  if (pathname === '/api/survey/seed-demo' && req.method === 'POST') {
    const demoItems = generateRealisticDemoData(50);
    const db = readData();
    db.responses.push(...demoItems);
    writeData(db);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Added 50 realistic benchmark responses' }));
    return;
  }

  // Reset data
  if (pathname === '/api/survey/reset' && req.method === 'POST') {
    writeData({ responses: [] });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Survey responses cleared' }));
    return;
  }

  // Export CSV
  if (pathname === '/api/survey/export.csv' && req.method === 'GET') {
    const db = readData();
    const csv = responsesToCsv(db.responses);
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="behavioral_study_${Date.now()}.csv"`
    });
    res.end(csv);
    return;
  }

  // Export JSON
  if (pathname === '/api/survey/export.json' && req.method === 'GET') {
    const db = readData();
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="behavioral_study_${Date.now()}.json"`
    });
    res.end(JSON.stringify(db.responses, null, 2));
    return;
  }

  // Static files
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '') safePath = '/index.html';

  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const fallbackPath = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(fallbackPath, (fbErr, content) => {
        if (fbErr) {
          res.writeHead(404);
          res.end('Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(content);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500);
        res.end('Server Error');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  BEHAVIORAL ECONOMICS PLATFORM ONLINE`);
  console.log(`  Local URL: http://localhost:${PORT}`);
  console.log(`=======================================================`);
});
