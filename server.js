import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || '1661'; // Secret PIN for Researcher Dashboard
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'responses.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ responses: [] }, null, 2), 'utf-8');

function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
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
    return false;
  }
}

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

function computeParticipantMetrics(payload) {
  const { responses, telemetry } = payload;
  let lambda = 2.0;
  if (Array.isArray(responses.loss_aversion_gambles)) {
    const acceptedCount = responses.loss_aversion_gambles.filter(Boolean).length;
    if (acceptedCount === 0) lambda = 3.5;
    else if (acceptedCount === 1) lambda = 2.5;
    else if (acceptedCount === 2) lambda = 1.67;
    else if (acceptedCount === 3) lambda = 1.25;
    else if (acceptedCount === 4) lambda = 1.0;
    else lambda = 0.85;
  }

  const TRUE_COST_OF_DELAY = 39408;
  const userEstimate = Number(responses.delay_growth_estimate) || 0;
  const egbRatio = Number((userEstimate / TRUE_COST_OF_DELAY).toFixed(2));
  
  let egbCategory = 'Linear Bias (Underestimated Compounding)';
  if (egbRatio >= 0.8 && egbRatio <= 1.25) egbCategory = 'Accurate Compounding Visionary';
  else if (egbRatio > 1.25) egbCategory = 'Overestimated';
  else if (egbRatio >= 0.4) egbCategory = 'Moderate Compounding Awareness';

  const choseWait = responses.real_option_choice === 'wait_for_information';
  const optionInsight = choseWait 
    ? 'Safety-First (Paid the fee to guarantee zero losses)' 
    : 'Value-Maximizer (Took the risk to avoid burning fees)';

  return {
    lambda,
    isRiskAverse: responses.framing_job_choice === 'A',
    isRiskSeeking: responses.framing_job_choice === 'B',
    trueCostOfDelay: TRUE_COST_OF_DELAY,
    userEstimate,
    egbRatio,
    egbCategory,
    choseWait,
    optionInsight,
    totalReactionTimeMs: telemetry?.totalReactionTimeMs || 0
  };
}

function generateRealisticDemoData(count = 50) {
  const items = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const isAlpha = i % 2 === 0;
    const cohort = isAlpha ? 'Alpha' : 'Beta';
    const timestamp = new Date(now - (count - i) * 90000).toISOString();
    const sessionId = crypto.randomUUID();

    const framing_job_choice = isAlpha 
      ? (Math.random() < 0.72 ? 'A' : 'B')
      : (Math.random() < 0.76 ? 'B' : 'A');

    let anchoring_valuation_estimate = isAlpha
      ? Math.round(580 + Math.random() * 220)
      : Math.round(380 + Math.random() * 180);

    const framing_discount_choice = isAlpha 
      ? (Math.random() < 0.58 ? 'cash' : 'credit')
      : (Math.random() < 0.82 ? 'cash' : 'credit');

    const rand = Math.random();
    let gambles = [true, true, false, false, false];
    let lambda = 1.67;
    if (rand < 0.22) { gambles = [true, false, false, false, false]; lambda = 2.5; }
    else if (rand < 0.65) { gambles = [true, true, false, false, false]; lambda = 1.67; }
    else if (rand < 0.85) { gambles = [true, true, true, false, false]; lambda = 1.25; }
    else if (rand < 0.95) { gambles = [true, true, true, true, false]; lambda = 1.0; }
    else { gambles = [false, false, false, false, false]; lambda = 3.5; }

    const loss_aversion_sunk_choice = Math.random() < 0.66 ? 'hold_for_breakeven' : 'sell_and_reallocate';

    let delay_growth_estimate;
    const estRand = Math.random();
    if (estRand < 0.68) delay_growth_estimate = Math.round(6000 + Math.random() * 9000);
    else if (estRand < 0.88) delay_growth_estimate = Math.round(18000 + Math.random() * 12000);
    else delay_growth_estimate = Math.round(36000 + Math.random() * 8000);

    const real_option_choice = Math.random() < 0.64 ? 'wait_for_information' : 'invest_now';
    const option_switch_threshold = Math.round(10000 + Math.random() * 16000);

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
        confidence_rating: Math.floor(3 + Math.random() * 3),
        age_bracket: Math.random() < 0.25 ? 'under_18' : '18_plus',
        financial_experience: ['low', 'moderate', 'high'][Math.floor(Math.random() * 3)]
      },
      telemetry: {
        totalReactionTimeMs: Math.round(35000 + Math.random() * 45000),
        switchCount: Math.floor(Math.random() * 3),
        device: 'Web Browser'
      }
    };

    items.push({
      ...payload,
      metrics: computeParticipantMetrics(payload)
    });
  }
  return items;
}

function computeAggregateAnalytics(responses) {
  const total = responses.length;
  if (total === 0) {
    return {
      summary: { total: 0, alphaCount: 0, betaCount: 0, avgLatencySeconds: 0 },
      framing: { gainCertainPercent: 0, gainRiskyPercent: 0, lossCertainPercent: 0, lossRiskyPercent: 0, framingShiftDelta: 0, chiSquare: 0, pValue: 1, oddsRatio: 1 },
      anchoring: { highAnchorMean: 0, lowAnchorMean: 0, anchoringGap: 0, anchoringRatio: 0 },
      lossAversion: { meanLambda: 0, medianLambda: 0, stdDevLambda: 0, benchmarkLambda: 2.25, distribution: [] },
      delayAndRealOptions: { trueCostOfDelay: 39408, meanEstimatedDelayCost: 0, linearBiasProportion: 0, calibratedProportion: 0, choseWaitPercent: 0, choseInvestNowPercent: 0, avgOptionSwitchThreshold: 0 },
      telemetry: { medianLatencyMs: 0, avgSwitches: 0, totalResponses: 0 }
    };
  }

  const alphaGroup = responses.filter(r => r.cohort === 'Alpha');
  const betaGroup = responses.filter(r => r.cohort === 'Beta');

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

  const alphaValuations = alphaGroup.map(r => Number(r.responses?.anchoring_valuation_estimate)).filter(v => v > 0);
  const betaValuations = betaGroup.map(r => Number(r.responses?.anchoring_valuation_estimate)).filter(v => v > 0);
  const highAnchorMean = calculateMean(alphaValuations);
  const lowAnchorMean = calculateMean(betaValuations);
  const anchoringGap = highAnchorMean - lowAnchorMean;
  const anchoringRatio = Number(((anchoringGap / 500) * 100).toFixed(1));

  const lambdas = responses.map(r => r.metrics?.lambda || 2.0);
  const meanLambda = calculateMean(lambdas);
  const medianLambda = calculateMedian(lambdas);
  const stdDevLambda = calculateStdDev(lambdas, meanLambda);

  const lambdaBuckets = [
    { label: 'λ ≤ 1.0 (Risk Friendly)', count: lambdas.filter(l => l <= 1.0).length },
    { label: '1.0 < λ ≤ 1.5 (Mild Aversion)', count: lambdas.filter(l => l > 1.0 && l <= 1.5).length },
    { label: '1.5 < λ ≤ 2.0 (Moderate Aversion)', count: lambdas.filter(l => l > 1.5 && l <= 2.0).length },
    { label: '2.0 < λ ≤ 2.75 (Classic Loss Aversion)', count: lambdas.filter(l => l > 2.0 && l <= 2.75).length },
    { label: 'λ > 2.75 (Strong Loss Aversion)', count: lambdas.filter(l => l > 2.75).length }
  ];

  const delayEstimates = responses.map(r => Number(r.responses?.delay_growth_estimate)).filter(v => v >= 0);
  const meanDelayEst = calculateMean(delayEstimates);
  const linearThinkers = responses.filter(r => (r.metrics?.egbRatio || 0) < 0.4).length;
  const calibratedThinkers = responses.filter(r => {
    const ratio = r.metrics?.egbRatio || 0;
    return ratio >= 0.75 && ratio <= 1.25;
  }).length;

  const waitCount = responses.filter(r => r.responses?.real_option_choice === 'wait_for_information').length;
  const investCount = responses.filter(r => r.responses?.real_option_choice === 'invest_now').length;

  const optionThresholds = responses.map(r => Number(r.responses?.option_switch_threshold)).filter(v => v > 0);
  const avgOptionSwitchThreshold = calculateMean(optionThresholds);

  const latencies = responses.map(r => r.metrics?.totalReactionTimeMs || 0).filter(v => v > 0);

  return {
    summary: {
      total,
      alphaCount: alphaGroup.length,
      betaCount: betaGroup.length,
      avgLatencySeconds: Number((calculateMean(latencies) / 1000).toFixed(1)),
      medianLatencyMs: Math.round(calculateMedian(latencies))
    },
    framing: {
      gainCertainPercent: gainCertainPct,
      gainRiskyPercent: gainRiskyPct,
      lossCertainPercent: lossCertainPct,
      lossRiskyPercent: lossRiskyPct,
      framingShiftDelta,
      chiSquare: chiSqStats.chiSquare,
      pValue: chiSqStats.pValue,
      oddsRatio: chiSqStats.oddsRatio
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
      distribution: lambdaBuckets
    },
    delayAndRealOptions: {
      trueCostOfDelay: 39408,
      meanEstimatedDelayCost: Math.round(meanDelayEst),
      linearBiasProportion: Number(((linearThinkers / total) * 100).toFixed(1)),
      calibratedProportion: Number(((calibratedThinkers / total) * 100).toFixed(1)),
      choseWaitPercent: Number(((waitCount / total) * 100).toFixed(1)),
      choseInvestNowPercent: Number(((investCount / total) * 100).toFixed(1)),
      avgOptionSwitchThreshold: Math.round(avgOptionSwitchThreshold)
    },
    telemetry: {
      medianLatencyMs: Math.round(calculateMedian(latencies)),
      avgSwitches: Number((responses.reduce((acc, r) => acc + (r.telemetry?.switchCount || 0), 0) / total).toFixed(1)),
      totalResponses: total
    }
  };
}

function responsesToCsv(responses) {
  const headers = [
    'session_id', 'timestamp', 'cohort', 'framing_job_choice', 'framing_discount_choice',
    'anchoring_house_estimate_thousands', 'loss_aversion_lambda', 'loss_aversion_sunk_choice',
    'delay_growth_estimate_dollars', 'true_cost_of_delay_dollars', 'real_option_choice',
    'option_switch_threshold_dollars', 'reaction_time_ms', 'confidence_rating',
    'age_bracket', 'financial_experience'
  ];
  const rows = responses.map(r => [
    r.sessionId || '', r.timestamp || '', r.cohort || '',
    r.responses?.framing_job_choice || '', r.responses?.framing_discount_choice || '',
    r.responses?.anchoring_valuation_estimate || '', r.metrics?.lambda ?? '',
    r.responses?.loss_aversion_sunk_choice || '', r.responses?.delay_growth_estimate || '',
    r.metrics?.trueCostOfDelay ?? 39408, r.responses?.real_option_choice || '',
    r.responses?.option_switch_threshold || '', r.telemetry?.totalReactionTimeMs ?? '',
    r.responses?.confidence_rating ?? '',
    r.responses?.age_bracket || r.demographics?.age_bracket || '',
    r.responses?.financial_experience || r.demographics?.financial_experience || ''
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  return [headers.join(','), ...rows].join('\n');
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 5 * 1024 * 1024) reject(new Error('Payload too large'));
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// Authentication Check: Verifies secret PIN for administrative actions
function verifyAdmin(req, url) {
  const headerPin = req.headers['x-admin-pin'];
  const queryPin = url.searchParams.get('pin');
  return (headerPin === ADMIN_PIN || queryPin === ADMIN_PIN);
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Pin');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health
  if (pathname === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', version: '2.3.0' }));
    return;
  }

  // URL Scraping / Article Fetch Proxy (Extract clean headline & body from URL)
  if (pathname === '/api/market/fetch-url' && req.method === 'POST') {
    if (!verifyAdmin(req, url)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: PIN required' }));
      return;
    }
    try {
      const body = await parseJsonBody(req);
      const targetUrl = body.url;
      if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Valid HTTP/HTTPS URL required' }));
        return;
      }

      // Fetch webpage with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Remote server responded with HTTP ${response.status}` }));
        return;
      }

      const html = await response.text();

      // Extract title
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : '';

      // Extract meta description or og:description
      const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
                          html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i) ||
                          html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
      const description = ogDescMatch ? ogDescMatch[1].trim() : '';

      // Strip tags from body to get snippet
      const cleanBody = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 3000);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        url: targetUrl,
        title: title || 'Political News Headline',
        description,
        extractedText: `${title} - ${description} - ${cleanBody.slice(0, 1500)}`.trim()
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Failed to fetch URL: ${err.message}` }));
    }
    return;
  }

  // Verify PIN Endpoint (For Admin Login)
  if (pathname === '/api/admin/verify' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    if (body.pin === ADMIN_PIN) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Authenticated' }));
    } else {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Incorrect PIN' }));
    }
    return;
  }

  // Public Session Start
  if (pathname === '/api/session/start' && req.method === 'POST') {
    const data = readData();
    const alphaCount = data.responses.filter(r => r.cohort === 'Alpha').length;
    const betaCount = data.responses.filter(r => r.cohort === 'Beta').length;
    const assignedCohort = alphaCount < betaCount ? 'Alpha' : (betaCount < alphaCount ? 'Beta' : (Math.random() < 0.5 ? 'Alpha' : 'Beta'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ sessionId: crypto.randomUUID(), cohort: assignedCohort }));
    return;
  }

  // Public Submit Survey
  if (pathname === '/api/survey/submit' && req.method === 'POST') {
    try {
      const payload = await parseJsonBody(req);
      if (!payload.sessionId || !payload.cohort || !payload.responses) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing fields' }));
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
      res.end(JSON.stringify({ success: true, personalMetrics: metrics }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Save failed' }));
    }
    return;
  }

  // --- PROTECTED ADMIN ENDPOINTS (Require PIN) ---

  // 1. Analytics
  if (pathname === '/api/survey/analytics' && req.method === 'GET') {
    if (!verifyAdmin(req, url)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: Admin PIN required' }));
      return;
    }
    const db = readData();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: computeAggregateAnalytics(db.responses) }));
    return;
  }

  // 2. Raw Responses
  if (pathname === '/api/survey/responses' && req.method === 'GET') {
    if (!verifyAdmin(req, url)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: Admin PIN required' }));
      return;
    }
    const db = readData();
    const cohort = url.searchParams.get('cohort');
    let list = db.responses;
    if (cohort && (cohort === 'Alpha' || cohort === 'Beta')) list = list.filter(r => r.cohort === cohort);
    list = [...list].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, total: list.length, responses: list }));
    return;
  }

  // 3. Seed Demo Data
  if (pathname === '/api/survey/seed-demo' && req.method === 'POST') {
    if (!verifyAdmin(req, url)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: Admin PIN required' }));
      return;
    }
    const demoItems = generateRealisticDemoData(50);
    const db = readData();
    db.responses.push(...demoItems);
    writeData(db);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Added 50 benchmark records' }));
    return;
  }

  // 4. Reset Data
  if (pathname === '/api/survey/reset' && req.method === 'POST') {
    if (!verifyAdmin(req, url)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: Admin PIN required' }));
      return;
    }
    writeData({ responses: [] });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Cleared all responses' }));
    return;
  }

  // 5. Export CSV
  if (pathname === '/api/survey/export.csv' && req.method === 'GET') {
    if (!verifyAdmin(req, url)) {
      res.writeHead(401, { 'Content-Type': 'text/plain' });
      res.end('Unauthorized: Admin PIN required');
      return;
    }
    const db = readData();
    const csv = responsesToCsv(db.responses);
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="behavioral_study_${Date.now()}.csv"`
    });
    res.end(csv);
    return;
  }

  // 6. Export JSON
  if (pathname === '/api/survey/export.json' && req.method === 'GET') {
    if (!verifyAdmin(req, url)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    const db = readData();
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="behavioral_study_${Date.now()}.json"`
    });
    res.end(JSON.stringify(db.responses, null, 2));
    return;
  }

  // Static Frontend Files
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
        if (fbErr) { res.writeHead(404); res.end('Not Found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(content);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    fs.readFile(filePath, (readErr, content) => {
      if (readErr) { res.writeHead(500); res.end('Server Error'); return; }
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(content);
    });
  });
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  BEHAVIORAL ECONOMICS PLATFORM ONLINE`);
  console.log(`  Local URL: http://localhost:${PORT}`);
  console.log(`  Admin PIN: ${ADMIN_PIN}`);
  console.log(`=======================================================`);
});
