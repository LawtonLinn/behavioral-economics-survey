/**
 * DYNAMIC BEHAVIORAL CHARTS ENGINE (SVG-based, Zero Dependencies)
 */

export class BehavioralCharts {
  /**
   * 1. Framing Shift Divergence (Gain Frame vs Loss Frame)
   */
  static renderFramingChart(containerId, framingData) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const gainCertain = framingData.gainCertainPercent || 0;
    const gainRisky = framingData.gainRiskyPercent || 0;
    const lossCertain = framingData.lossCertainPercent || 0;
    const lossRisky = framingData.lossRiskyPercent || 0;
    const pVal = framingData.pValue ?? 1;
    const chiSq = framingData.chiSquare ?? 0;
    const or = framingData.oddsRatio ?? 1;

    const width = el.clientWidth || 450;
    const height = 240;
    const pad = { top: 30, right: 25, bottom: 40, left: 110 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;
    const barHeight = 32;

    const svg = `
      <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
        <!-- Baseline Grid -->
        <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left + chartW}" y2="${pad.top}" stroke="rgba(255,255,255,0.08)" />
        <line x1="${pad.left + chartW * 0.5}" y1="${pad.top}" x2="${pad.left + chartW * 0.5}" y2="${pad.top + chartH}" stroke="rgba(255,255,255,0.05)" stroke-dasharray="4,4" />

        <!-- Axis Label -->
        <text x="${pad.left + chartW * 0.5}" y="${pad.top + chartH + 30}" fill="#94a3b8" font-size="11" text-anchor="middle" font-family="sans-serif">
          Percentage Choosing the Risky Gamble (%)
        </text>

        <!-- Gain Frame Row -->
        <text x="${pad.left - 12}" y="${pad.top + 22}" fill="#e2e8f0" font-size="12" font-weight="600" text-anchor="end">
          Gain Frame
        </text>
        <text x="${pad.left - 12}" y="${pad.top + 34}" fill="#06b6d4" font-size="9" text-anchor="end" font-family="monospace">
          (Saved Jobs)
        </text>
        <rect x="${pad.left}" y="${pad.top + 5}" width="${chartW}" height="${barHeight}" rx="6" fill="rgba(255,255,255,0.03)" />
        <rect x="${pad.left}" y="${pad.top + 5}" width="${(gainRisky / 100) * chartW}" height="${barHeight}" rx="6" fill="#06b6d4" opacity="0.85" />
        <text x="${pad.left + (gainRisky / 100) * chartW + 8}" y="${pad.top + 25}" fill="#fff" font-size="12" font-weight="700" font-family="monospace">
          ${gainRisky}% Risky
        </text>

        <!-- Loss Frame Row -->
        <text x="${pad.left - 12}" y="${pad.top + 82}" fill="#e2e8f0" font-size="12" font-weight="600" text-anchor="end">
          Loss Frame
        </text>
        <text x="${pad.left - 12}" y="${pad.top + 94}" fill="#f43f5e" font-size="9" text-anchor="end" font-family="monospace">
          (Lost Jobs)
        </text>
        <rect x="${pad.left}" y="${pad.top + 65}" width="${chartW}" height="${barHeight}" rx="6" fill="rgba(255,255,255,0.03)" />
        <rect x="${pad.left}" y="${pad.top + 65}" width="${(lossRisky / 100) * chartW}" height="${barHeight}" rx="6" fill="#f43f5e" opacity="0.85" />
        <text x="${pad.left + (lossRisky / 100) * chartW + 8}" y="${pad.top + 85}" fill="#fff" font-size="12" font-weight="700" font-family="monospace">
          ${lossRisky}% Risky
        </text>

        <!-- Statistical Callout Box -->
        <g transform="translate(${pad.left}, ${pad.top + 115})">
          <rect width="${chartW}" height="32" rx="6" fill="rgba(15,23,42,0.8)" stroke="rgba(255,255,255,0.08)" />
          <text x="12" y="20" fill="#94a3b8" font-size="11">
            Framing Shift: <tspan fill="#10b981" font-weight="700">+${framingData.framingShiftDelta ?? 0}%</tspan> |
            Odds Ratio: <tspan fill="#fff" font-weight="700">${or}x</tspan> |
            χ² = <tspan fill="#fff" font-weight="700">${chiSq}</tspan> 
            (${pVal < 0.05 ? '<tspan fill="#10b981" font-weight="700">p = ' + pVal + ' (Significant)</tspan>' : 'p = ' + pVal})
          </text>
        </g>
      </svg>
    `;

    el.innerHTML = svg;
  }

  /**
   * 2. Loss Aversion Lambda (λ) Distribution Histogram
   */
  static renderLambdaDistribution(containerId, lossData) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const buckets = lossData.distribution || [];
    const meanLambda = lossData.meanLambda || 2.0;
    const medianLambda = lossData.medianLambda || 2.0;

    const width = el.clientWidth || 450;
    const height = 240;
    const pad = { top: 25, right: 30, bottom: 50, left: 40 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;

    const maxCount = Math.max(1, ...buckets.map(b => b.count));
    const barWidth = Math.max(20, (chartW / (buckets.length || 1)) - 14);

    let barsSvg = '';
    buckets.forEach((b, i) => {
      const x = pad.left + i * (chartW / buckets.length) + 6;
      const h = (b.count / maxCount) * (chartH - 25);
      const y = pad.top + chartH - h;

      let color = '#06b6d4';
      if (i === 0) color = '#10b981';
      if (i >= 3) color = '#f59e0b';
      if (i >= 4) color = '#f43f5e';

      const shortLabel = b.label.split('(')[0].replace('λ', 'λ');

      barsSvg += `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="5" fill="${color}" opacity="0.85" />
        <text x="${x + barWidth / 2}" y="${y - 6}" fill="#fff" font-size="11" font-weight="700" text-anchor="middle" font-family="monospace">
          ${b.count}
        </text>
        <text x="${x + barWidth / 2}" y="${pad.top + chartH + 18}" fill="#94a3b8" font-size="9.5" text-anchor="middle" font-family="monospace">
          ${shortLabel}
        </text>
      `;
    });

    const svg = `
      <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
        <line x1="${pad.left}" y1="${pad.top + chartH}" x2="${pad.left + chartW}" y2="${pad.top + chartH}" stroke="rgba(255,255,255,0.15)" />
        ${barsSvg}

        <!-- Benchmark Kahneman-Tversky λ = 2.25 line -->
        <g transform="translate(${pad.left + chartW * 0.65}, ${pad.top + 8})">
          <line x1="0" y1="0" x2="0" y2="${chartH}" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="3,3" />
          <rect x="-4" y="-8" width="115" height="20" rx="4" fill="rgba(245, 158, 11, 0.15)" stroke="rgba(245, 158, 11, 0.4)" />
          <text x="53" y="5" fill="#f59e0b" font-size="9" font-weight="700" text-anchor="middle" font-family="monospace">
            Standard Human (2.25)
          </text>
        </g>

        <text x="${pad.left}" y="${pad.top + chartH + 42}" fill="#94a3b8" font-size="10.5">
          Average Loss Sensitivity: <tspan fill="#06b6d4" font-weight="700">${meanLambda}x</tspan> |
          Median: <tspan fill="#fff" font-weight="700">${medianLambda}x</tspan>
        </text>
      </svg>
    `;

    el.innerHTML = svg;
  }

  /**
   * 3. Price Anchoring: House Price High Anchor ($850k) vs Low Anchor ($350k)
   */
  static renderAnchoringChart(containerId, anchoringData) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const highMean = anchoringData.highAnchorMean || 0;
    const lowMean = anchoringData.lowAnchorMean || 0;
    const gap = anchoringData.anchoringGap || 0;
    const ratio = anchoringData.anchoringRatio || 0;

    const width = el.clientWidth || 450;
    const height = 240;
    const pad = { top: 35, right: 30, bottom: 45, left: 110 };
    const chartW = width - pad.left - pad.right;
    const maxVal = 950; // In thousands ($950k)

    const svg = `
      <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
        <!-- High Anchor Group -->
        <text x="${pad.left - 12}" y="${pad.top + 20}" fill="#e2e8f0" font-size="11.5" font-weight="600" text-anchor="end">
          High Anchor
        </text>
        <text x="${pad.left - 12}" y="${pad.top + 33}" fill="#f59e0b" font-size="9" text-anchor="end" font-family="monospace">
          (Suggested: $850k)
        </text>
        <rect x="${pad.left}" y="${pad.top + 10}" width="${chartW}" height="26" rx="5" fill="rgba(255,255,255,0.03)" />
        <rect x="${pad.left}" y="${pad.top + 10}" width="${(highMean / maxVal) * chartW}" height="26" rx="5" fill="#f59e0b" opacity="0.85" />
        <text x="${pad.left + (highMean / maxVal) * chartW + 8}" y="${pad.top + 28}" fill="#fff" font-size="12" font-weight="700" font-family="monospace">
          $${highMean}k Avg Guess
        </text>

        <!-- Low Anchor Group -->
        <text x="${pad.left - 12}" y="${pad.top + 80}" fill="#e2e8f0" font-size="11.5" font-weight="600" text-anchor="end">
          Low Anchor
        </text>
        <text x="${pad.left - 12}" y="${pad.top + 93}" fill="#06b6d4" font-size="9" text-anchor="end" font-family="monospace">
          (Suggested: $350k)
        </text>
        <rect x="${pad.left}" y="${pad.top + 70}" width="${chartW}" height="26" rx="5" fill="rgba(255,255,255,0.03)" />
        <rect x="${pad.left}" y="${pad.top + 70}" width="${(lowMean / maxVal) * chartW}" height="26" rx="5" fill="#06b6d4" opacity="0.85" />
        <text x="${pad.left + (lowMean / maxVal) * chartW + 8}" y="${pad.top + 88}" fill="#fff" font-size="12" font-weight="700" font-family="monospace">
          $${lowMean}k Avg Guess
        </text>

        <!-- Anchor Gap Box -->
        <g transform="translate(${pad.left}, ${pad.top + 120})">
          <rect width="${chartW}" height="32" rx="6" fill="rgba(15,23,42,0.8)" stroke="rgba(255,255,255,0.08)" />
          <text x="12" y="20" fill="#94a3b8" font-size="11">
            Psychological Gap: <tspan fill="#fff" font-weight="700">+$${gap}k</tspan> |
            Anchor Impact: <tspan fill="#10b981" font-weight="700">${ratio}%</tspan> of arbitrary suggestion absorbed
          </text>
        </g>
      </svg>
    `;

    el.innerHTML = svg;
  }

  /**
   * 4. Rule of 72 & Cost of Delay
   */
  static renderDelayCompoundingChart(containerId, delayData) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const trueCost = delayData.trueCostOfDelay || 39408;
    const meanEst = delayData.meanEstimatedDelayCost || 0;
    const linearPct = delayData.linearBiasProportion || 0;
    const calibratedPct = delayData.calibratedProportion || 0;

    const width = el.clientWidth || 450;
    const height = 240;
    const pad = { top: 30, right: 30, bottom: 45, left: 110 };
    const chartW = width - pad.left - pad.right;
    const maxVal = 48000;

    const svg = `
      <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
        <!-- True Mathematical Cost of Waiting -->
        <text x="${pad.left - 12}" y="${pad.top + 20}" fill="#e2e8f0" font-size="11" font-weight="600" text-anchor="end">
          Real Lost Money
        </text>
        <text x="${pad.left - 12}" y="${pad.top + 33}" fill="#10b981" font-size="9" text-anchor="end" font-family="monospace">
          (Compound Reality)
        </text>
        <rect x="${pad.left}" y="${pad.top + 10}" width="${chartW}" height="26" rx="5" fill="rgba(255,255,255,0.03)" />
        <rect x="${pad.left}" y="${pad.top + 10}" width="${(trueCost / maxVal) * chartW}" height="26" rx="5" fill="#10b981" opacity="0.85" />
        <text x="${pad.left + (trueCost / maxVal) * chartW + 8}" y="${pad.top + 28}" fill="#10b981" font-size="12" font-weight="800" font-family="monospace">
          $39,408
        </text>

        <!-- Average Human Guess -->
        <text x="${pad.left - 12}" y="${pad.top + 75}" fill="#e2e8f0" font-size="11" font-weight="600" text-anchor="end">
          People's Guess
        </text>
        <text x="${pad.left - 12}" y="${pad.top + 88}" fill="#f43f5e" font-size="9" text-anchor="end" font-family="monospace">
          (Linear Brain)
        </text>
        <rect x="${pad.left}" y="${pad.top + 65}" width="${chartW}" height="26" rx="5" fill="rgba(255,255,255,0.03)" />
        <rect x="${pad.left}" y="${pad.top + 65}" width="${(Math.min(maxVal, meanEst) / maxVal) * chartW}" height="26" rx="5" fill="#f43f5e" opacity="0.85" />
        <text x="${pad.left + (Math.min(maxVal, meanEst) / maxVal) * chartW + 8}" y="${pad.top + 83}" fill="#fff" font-size="12" font-weight="700" font-family="monospace">
          $${meanEst.toLocaleString()}
        </text>

        <!-- Breakdown Box -->
        <g transform="translate(${pad.left}, ${pad.top + 115})">
          <rect width="${chartW}" height="35" rx="6" fill="rgba(15,23,42,0.8)" stroke="rgba(255,255,255,0.08)" />
          <text x="12" y="21" fill="#94a3b8" font-size="10.5">
            Linear Growth Bias: <tspan fill="#f43f5e" font-weight="700">${linearPct}%</tspan> think in straight lines |
            Accurate: <tspan fill="#10b981" font-weight="700">${calibratedPct}%</tspan>
          </text>
        </g>
      </svg>
    `;

    el.innerHTML = svg;
  }

  /**
   * 5. Real Options: Bakery Lease (Open Now vs Pay Holding Fee to Wait)
   */
  static renderRealOptionsChart(containerId, optionsData) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const waitPct = optionsData.choseWaitPercent || 0;
    const investPct = optionsData.choseInvestNowPercent || 0;
    const avgThreshold = optionsData.avgOptionSwitchThreshold || 0;

    const width = el.clientWidth || 450;
    const height = 240;
    const pad = { top: 25, right: 25, bottom: 45, left: 25 };
    const chartW = width - pad.left - pad.right;

    const barH = 34;
    const waitWidth = (waitPct / 100) * chartW;
    const investWidth = (investPct / 100) * chartW;

    const svg = `
      <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
        <text x="${pad.left}" y="${pad.top}" fill="#94a3b8" font-size="11" font-weight="600" text-transform="uppercase">
          Bakery Dilemma: Pay $18,000 to Wait for News vs Open Right Now
        </text>

        <!-- Stacked Choice Bar -->
        <g transform="translate(${pad.left}, ${pad.top + 15})">
          <rect x="0" y="0" width="${waitWidth}" height="${barH}" rx="6" fill="#8b5cf6" />
          <rect x="${waitWidth}" y="0" width="${investWidth}" height="${barH}" rx="6" fill="#06b6d4" />

          <text x="12" y="22" fill="#fff" font-size="12" font-weight="700">
            Pay Fee to Wait: ${waitPct}%
          </text>
          <text x="${chartW - 12}" y="22" fill="#04101c" font-size="12" font-weight="700" text-anchor="end">
            Open Right Now: ${investPct}%
          </text>
        </g>

        <!-- Legend -->
        <g transform="translate(${pad.left}, ${pad.top + 70})">
          <circle cx="6" cy="6" r="5" fill="#8b5cf6" />
          <text x="18" y="10" fill="#e2e8f0" font-size="11">
            <strong>Chose to Wait (Safety First):</strong> Paid $18k to avoid any risk of losing money.
          </text>
          
          <circle cx="6" cy="32" r="5" fill="#06b6d4" />
          <text x="18" y="36" fill="#e2e8f0" font-size="11">
            <strong>Opened Now (Value Maximizer):</strong> Took the risk because $18k waiting fee was too expensive.
          </text>
        </g>

        <!-- Threshold Callout -->
        <g transform="translate(${pad.left}, ${pad.top + 130})">
          <rect width="${chartW}" height="32" rx="6" fill="rgba(15,23,42,0.8)" stroke="rgba(255,255,255,0.08)" />
          <text x="12" y="20" fill="#94a3b8" font-size="11">
            Average Max Waiting Fee People Would Pay: 
            <tspan fill="#10b981" font-weight="700">$${avgThreshold.toLocaleString()}</tspan>
          </text>
        </g>
      </svg>
    `;

    el.innerHTML = svg;
  }
}
