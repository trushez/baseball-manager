// League baselines the engine is tuned against, and the calibration targets.
// Figures are 2024 MLB per-team-game averages (approximate). The real-roster checks (tools/sim-stars.js and the
// long-run tools) measure the game against these too.

export const TARGETS = {
  runsPerGame: 4.39,
  paPerGame: 37.8,
  perPA: {
    K: 0.222, BB: 0.079, HBP: 0.011, HR: 0.0296,
    H: 0.216, '1B': 0.141, '2B': 0.042, '3B': 0.0037,
  },
  AVG: 0.243, OBP: 0.312, SLG: 0.399, BABIP: 0.291,
  pitchesPerPA: 3.89,
  sbAttemptsPerGame: 0.81, /* chosen 3 Nov: 0.65 stolen bases per team-game (1.3 a game), about the real figure; 80% success */ sbSuccess: 0.80,
  starterIP: 5.2,
  dpPerGame: 0.72,
};

/** Tolerances for the calibration report: |sim - target| must be within these. */
export const TOLERANCE = {
  runsPerGame: 0.15, K: 0.008, BB: 0.006, HBP: 0.003, HR: 0.003, AVG: 0.006, OBP: 0.006, SLG: 0.010,
  BABIP: 0.008, pitchesPerPA: 0.08, sbAttemptsPerGame: 0.15, sbSuccess: 0.04, starterIP: 0.3,
};
