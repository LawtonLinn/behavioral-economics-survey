/**
 * TELEMETRY & INVESTIGATIVE ENGINE
 * Tracks micro-behaviors, reaction times, option switches, and hesitation.
 */

class BehavioralTelemetry {
  constructor() {
    this.sessionId = null;
    this.cohort = null;
    this.sessionStartTime = null;
    this.currentStepId = null;
    this.stepStartTime = null;
    
    this.stepRecords = {};
    this.totalSwitches = 0;
    this.tabSwitches = 0;
    this.unfocusedDurationMs = 0;
    this.lastBlurTime = null;

    this.activeHoverTarget = null;
    this.hoverStartTime = null;

    this.initGlobalListeners();
  }

  initSession(sessionId, cohort) {
    this.sessionId = sessionId;
    this.cohort = cohort;
    this.sessionStartTime = performance.now();
    this.stepRecords = {};
    this.totalSwitches = 0;
    this.tabSwitches = 0;
    this.unfocusedDurationMs = 0;
  }

  initGlobalListeners() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.tabSwitches++;
        this.lastBlurTime = performance.now();
      } else if (this.lastBlurTime) {
        this.unfocusedDurationMs += performance.now() - this.lastBlurTime;
        this.lastBlurTime = null;
      }
    });
  }

  startStep(stepId) {
    this.currentStepId = stepId;
    this.stepStartTime = performance.now();

    if (!this.stepRecords[stepId]) {
      this.stepRecords[stepId] = {
        stepId,
        enteredAt: new Date().toISOString(),
        reactionTimeMs: 0,
        switches: 0,
        hoverDwell: {},
        selectedOption: null,
        revisions: 0
      };
    }
  }

  recordHoverStart(optionId) {
    this.activeHoverTarget = optionId;
    this.hoverStartTime = performance.now();
  }

  recordHoverEnd(optionId) {
    if (this.activeHoverTarget === optionId && this.hoverStartTime) {
      const dwell = performance.now() - this.hoverStartTime;
      if (this.currentStepId && this.stepRecords[this.currentStepId]) {
        const dwells = this.stepRecords[this.currentStepId].hoverDwell;
        dwells[optionId] = (dwells[optionId] || 0) + Math.round(dwell);
      }
    }
    this.activeHoverTarget = null;
    this.hoverStartTime = null;
  }

  recordOptionSelection(optionId) {
    if (!this.currentStepId || !this.stepRecords[this.currentStepId]) return;

    const record = this.stepRecords[this.currentStepId];
    if (record.selectedOption !== null && record.selectedOption !== optionId) {
      record.switches++;
      this.totalSwitches++;
    }
    record.selectedOption = optionId;
  }

  recordRevision() {
    if (!this.currentStepId || !this.stepRecords[this.currentStepId]) return;
    this.stepRecords[this.currentStepId].revisions++;
  }

  finishStep(stepId) {
    const end = performance.now();
    const targetId = stepId || this.currentStepId;
    if (targetId && this.stepRecords[targetId]) {
      const duration = Math.round(end - (this.stepStartTime || end));
      this.stepRecords[targetId].reactionTimeMs = duration;
      this.stepRecords[targetId].completedAt = new Date().toISOString();
      return duration;
    }
    return 0;
  }

  getPayload() {
    const totalMs = this.sessionStartTime ? Math.round(performance.now() - this.sessionStartTime) : 0;
    const stepTimes = Object.values(this.stepRecords);

    return {
      totalReactionTimeMs: totalMs,
      switchCount: this.totalSwitches,
      tabSwitchCount: this.tabSwitches,
      unfocusedDurationMs: Math.round(this.unfocusedDurationMs),
      stepTimes,
      device: {
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
        userAgent: navigator.userAgent
      }
    };
  }
}

export const telemetry = new BehavioralTelemetry();
