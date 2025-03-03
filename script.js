// Global variables for charts.
let sensitivityChart = null;
let summaryChart = null;

/* Toggle the Sidebar Menu */
function toggleMenu() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('active');
}

/* Dark Mode Toggle */
function toggleTheme() {
  document.body.classList.toggle('dark');
}

/* NOTES FUNCTIONALITY */
function loadNotes() {
  const notesList = document.getElementById('notesList');
  notesList.innerHTML = '';
  const notes = JSON.parse(localStorage.getItem('dailyNotesArray')) || [];
  notes.forEach((note, index) => {
    const li = document.createElement('li');
    li.textContent = note;
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.className = 'note-delete';
    delBtn.onclick = () => deleteNote(index);
    li.appendChild(delBtn);
    notesList.appendChild(li);
  });
}

function addNote() {
  const noteInput = document.getElementById('noteInput');
  const note = noteInput.value.trim();
  if (note === '') return;
  let notes = JSON.parse(localStorage.getItem('dailyNotesArray')) || [];
  notes.push(note);
  localStorage.setItem('dailyNotesArray', JSON.stringify(notes));
  noteInput.value = '';
  loadNotes();
}

function deleteNote(index) {
  let notes = JSON.parse(localStorage.getItem('dailyNotesArray')) || [];
  notes.splice(index, 1);
  localStorage.setItem('dailyNotesArray', JSON.stringify(notes));
  loadNotes();
}

window.addEventListener('load', () => {
  loadNotes();
});

/* Utility: Clamp */
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/* Sigmoid Risk Mapping */
function calculateRiskLevel(metric, metricMin, metricMax) {
  const mid = (metricMin + metricMax) / 2;
  const alpha = 10 / (metricMax - metricMin);
  const sigmoid = 1 / (1 + Math.exp(-alpha * (metric - mid)));
  return 1 + 9 * sigmoid;
}

function riskParameters(riskLevel) {
  const stopLossPct = 30 - (riskLevel - 1) * (20 / 9);
  const tpMultiplier = 3 - (riskLevel - 1) * (2 / 9);
  return { stopLossPct, tpMultiplier };
}

function riskLabel(riskLevel) {
  if (riskLevel <= 2) return "Very Favorable";
  if (riskLevel <= 4) return "Favorable";
  if (riskLevel <= 6) return "Neutral";
  if (riskLevel <= 8) return "Risky";
  return "Very Risky";
}

/* SIMPLE MODEL CALCULATION */
function calculateSimple() {
  const P = parseFloat(document.getElementById('s_price').value);
  const delta = parseFloat(document.getElementById('s_delta').value);
  const ATR = parseFloat(document.getElementById('s_atr').value);
  const T_days = parseFloat(document.getElementById('s_tdays').value);
  const k = parseFloat(document.getElementById('s_k').value);
  
  const optionType = document.getElementById('s_optionType').value;
  const transaction = document.getElementById('s_transaction').value;
  
  let R = delta * ATR;
  let SL, TP;
  if (optionType === "call" && transaction === "buy") {
    SL = P - R;
    TP = P + k * R;
  } else if (optionType === "call" && transaction === "sell") {
    SL = P + R;
    TP = P - k * R;
  } else if (optionType === "put" && transaction === "buy") {
    SL = P + R;
    TP = P - k * R;
  } else if (optionType === "put" && transaction === "sell") {
    SL = P - R;
    TP = P + k * R;
  }
  
  const riskMetric = R / P;
  const riskLevelVal = calculateRiskLevel(riskMetric, 0.1, 0.5);
  const qualitative = riskLabel(riskLevelVal);
  
  document.getElementById('simpleResult').innerHTML = `
    <strong>Simple Model Results:</strong><br>
    Risk Metric: ${riskMetric.toFixed(3)}<br>
    Auto Risk Level: ${riskLevelVal.toFixed(1)} (${qualitative})<br>
    Stop Loss: $${SL.toFixed(2)}<br>
    Take Profit: $${TP.toFixed(2)}
  `;
  
  updateSummaryChart(P, T_days, SL, TP, 0, "simple");
}

/* ADVANCED MODEL CALCULATION */
function calculateAdvanced() {
  const P = parseFloat(document.getElementById('a_price').value);
  const delta = parseFloat(document.getElementById('a_delta').value);
  const theta = parseFloat(document.getElementById('a_theta').value);
  const IV = parseFloat(document.getElementById('a_iv').value);
  const ATR = parseFloat(document.getElementById('a_atr').value);
  const MS = parseFloat(document.getElementById('a_ms').value);
  const S = parseFloat(document.getElementById('a_stock').value);
  const T_days = parseFloat(document.getElementById('a_tdays').value);
  const OI = parseFloat(document.getElementById('a_oi').value);
  const contracts = parseFloat(document.getElementById('a_contracts').value);
  
  const optionType = document.getElementById('a_optionType').value;
  const transaction = document.getElementById('a_transaction').value;
  
  const numerator = delta * ATR * (S / P) * Math.sqrt(OI + 1) *
                    Math.log(T_days + 1) * (1 + ((MS - 50) / 50));
  const denominator = P * Math.sqrt(theta) * Math.exp(IV / 100);
  const Q = Math.sqrt(numerator / denominator);
  
  const eta = contracts;
  let SL, TP;
  if (optionType === "call" && transaction === "buy") {
    SL = P * (1 - eta * Q);
    let TP_computed = P * (1 + eta * Q);
    const maxTP = P * 1.5;
    TP = Math.min(TP_computed, maxTP);
  } else if (optionType === "call" && transaction === "sell") {
    SL = P * (1 + eta * Q);
    let TP_computed = P * (1 - eta * Q);
    const minTP = P * 0.7;
    TP = Math.max(TP_computed, minTP);
  } else if (optionType === "put" && transaction === "buy") {
    SL = P * (1 + eta * Q);
    let TP_computed = P * (1 - eta * Q);
    const minTP = P * 0.7;
    TP = Math.max(TP_computed, minTP);
  } else if (optionType === "put" && transaction === "sell") {
    SL = P * (1 - eta * Q);
    let TP_computed = P * (1 + eta * Q);
    const maxTP = P * 1.5;
    TP = Math.min(TP_computed, maxTP);
  }
  
  const riskLevelVal = calculateRiskLevel(Q, 0.2, 1.0);
  const qualitative = riskLabel(riskLevelVal);
  const rrRatio = ((TP - P) / (P - SL)).toFixed(2);
  
  document.getElementById('advancedResult').innerHTML = `
    <strong>Advanced Model Results:</strong><br>
    Composite Sensitivity Score (Q): ${Q.toFixed(4)}<br>
    Auto Risk Level: ${riskLevelVal.toFixed(1)} (${qualitative})<br>
    Stop Loss: $${SL.toFixed(2)}<br>
    Take Profit: $${TP.toFixed(2)}<br>
    Risk/Reward Ratio: ${rrRatio}
  `;
  
  updateSummaryChart(P, T_days, SL, TP, theta, "advanced");
}

/* CUSTOM (WEIGHTED) MODEL CALCULATION */
function calculateCustom() {
  const P = parseFloat(document.getElementById('c_price').value);
  const theta = parseFloat(document.getElementById('c_theta').value);
  const IV = parseFloat(document.getElementById('c_iv').value);
  const contracts = parseFloat(document.getElementById('c_contracts').value);
  
  const delta = parseFloat(document.getElementById('c_delta').value);
  const w_delta = parseFloat(document.getElementById('w_delta').value);
  
  const ATR = parseFloat(document.getElementById('c_atr').value);
  const w_atr = parseFloat(document.getElementById('w_atr').value);
  
  const S = parseFloat(document.getElementById('c_stock').value);
  const optPriceForRatio = parseFloat(document.getElementById('c_optionPrice').value);
  const w_ratio = parseFloat(document.getElementById('w_ratio').value);
  
  const OI = parseFloat(document.getElementById('c_oi').value);
  const w_oi = parseFloat(document.getElementById('w_oi').value);
  
  const T_days = parseFloat(document.getElementById('c_tdays').value);
  
  const MS = parseFloat(document.getElementById('c_ms').value);
  const w_ms = parseFloat(document.getElementById('w_ms').value);
  
  const optionType = document.getElementById('c_optionType').value;
  const transaction = document.getElementById('c_transaction').value;
  
  const slMult = parseFloat(document.getElementById('c_slMult').value);
  const tpMult = parseFloat(document.getElementById('c_tpMult').value);
  
  const weightedDelta = w_delta * delta;
  const weightedATR = w_atr * ATR;
  const weightedRatio = w_ratio * (S / optPriceForRatio);
  const weightedOI = Math.sqrt(w_oi * (OI + 1));
  const weightedT = Math.log(T_days + 1);
  const weightedMS = 1 + (w_ms * (MS - 50) / 50);
  
  const numerator = weightedDelta * weightedATR * weightedRatio * weightedOI * weightedT * weightedMS;
  const denominator = P * theta * Math.exp(IV / 100);
  const Q_custom = Math.sqrt(numerator / denominator);
  
  const riskLevelVal = calculateRiskLevel(Q_custom, 0.2, 1.0);
  const qualitative = riskLabel(riskLevelVal);
  const { stopLossPct, tpMultiplier } = riskParameters(riskLevelVal);
  const eta = contracts;
  
  let SL, TP;
  if (optionType === "call" && transaction === "buy") {
    SL = P * (1 - slMult * eta * Q_custom);
    let TP_computed = P * (1 + tpMultiplier * eta * Q_custom);
    const maxTP = P * 1.5;
    TP = Math.min(TP_computed, maxTP);
  } else if (optionType === "call" && transaction === "sell") {
    SL = P * (1 + slMult * eta * Q_custom);
    let TP_computed = P * (1 - tpMultiplier * eta * Q_custom);
    const minTP = P * 0.7;
    TP = Math.max(TP_computed, minTP);
  } else if (optionType === "put" && transaction === "buy") {
    SL = P * (1 + slMult * eta * Q_custom);
    let TP_computed = P * (1 - tpMultiplier * eta * Q_custom);
    const minTP = P * 0.7;
    TP = Math.max(TP_computed, minTP);
  } else if (optionType === "put" && transaction === "sell") {
    SL = P * (1 - slMult * eta * Q_custom);
    let TP_computed = P * (1 + tpMultiplier * eta * Q_custom);
    const maxTP = P * 1.5;
    TP = Math.min(TP_computed, maxTP);
  }
  
  const rrRatio = ((TP - P) / (P - SL)).toFixed(2);
  
  document.getElementById('customResult').innerHTML = `
    <strong>Custom Model Results:</strong><br>
    Weighted Composite Score (Q_custom): ${Q_custom.toFixed(4)}<br>
    Auto Risk Level: ${riskLevelVal.toFixed(1)} (${qualitative})<br>
    Stop Loss: $${SL.toFixed(2)}<br>
    Take Profit: $${TP.toFixed(2)}<br>
    Risk/Reward Ratio: ${rrRatio}
  `;
  
  updateSummaryChart(P, T_days, SL, TP, theta, "advanced");
}

/* Update the Summary Chart */
function updateSummaryChart(P, T_days, stopLoss, takeProfit, theta, modelType) {
  const ctx = document.getElementById('summaryChart').getContext('2d');
  const steps = 50;
  const days = [];
  const worstValues = [];
  for (let i = 0; i <= steps; i++) {
    const t = (T_days * i) / steps;
    days.push(t.toFixed(1));
    let worst;
    if (modelType === "simple") {
      worst = P * (1 - t / T_days);
    } else {
      const alpha = 1 + theta / 100;
      worst = P * (1 - Math.pow(t / T_days, alpha));
    }
    worstValues.push(worst);
  }
  const stopLossData = Array(steps + 1).fill(stopLoss);
  const takeProfitData = Array(steps + 1).fill(takeProfit);
  
  const data = {
    labels: days,
    datasets: [
      {
        label: "Stop Loss",
        data: stopLossData,
        borderColor: "rgba(255, 99, 132, 1)",
        backgroundColor: "rgba(255, 99, 132, 0.2)",
        fill: false,
        borderWidth: 2,
        pointRadius: 0
      },
      {
        label: "Take Profit",
        data: takeProfitData,
        borderColor: "rgba(75, 192, 192, 1)",
        backgroundColor: "rgba(75, 192, 192, 0.2)",
        fill: false,
        borderWidth: 2,
        pointRadius: 0
      },
      {
        label: "Worst-case Scenario",
        data: worstValues,
        borderColor: "rgba(255, 206, 86, 1)",
        backgroundColor: "rgba(255, 206, 86, 0.2)",
        fill: false,
        borderWidth: 2,
        pointRadius: 0
      }
    ]
  };
  
  if (summaryChart !== null) {
    summaryChart.data = data;
    summaryChart.update();
  } else {
    summaryChart = new Chart(ctx, {
      type: 'line',
      data: data,
      options: {
        plugins: { legend: { position: 'top' } },
        scales: {
          x: { title: { display: true, text: "Days Till Expiration" } },
          y: { title: { display: true, text: "Option Value ($)" } }
        }
      }
    });
  }
}

/* Update Sensitivity Chart */
function updateSensitivityChart() {
  const P = parseFloat(document.getElementById('c_price').value) || 1;
  const theta = parseFloat(document.getElementById('c_theta').value) || 1;
  const iv = parseFloat(document.getElementById('c_iv').value) || 10;
  const contracts = parseFloat(document.getElementById('c_contracts').value) || 1;
  
  const delta = parseFloat(document.getElementById('c_delta').value) || 0.5;
  const atr = parseFloat(document.getElementById('c_atr').value) || 1;
  const w_atr = parseFloat(document.getElementById('w_atr').value) || 1;
  
  const S = parseFloat(document.getElementById('c_stock').value) || 1;
  const optPriceForRatio = parseFloat(document.getElementById('c_optionPrice').value) || 1;
  const w_ratio = parseFloat(document.getElementById('w_ratio').value) || 1;
  
  const OI = parseFloat(document.getElementById('c_oi').value) || 1;
  const w_oi = parseFloat(document.getElementById('w_oi').value) || 1;
  
  const T_days = parseFloat(document.getElementById('c_tdays').value) || 1;
  const w_tdays = parseFloat(document.getElementById('w_tdays').value) || 1;
  
  const ms = parseFloat(document.getElementById('c_ms').value) || 50;
  const w_ms = parseFloat(document.getElementById('w_ms').value) || 1;
  
  const w_delta_vals = [];
  const Q_vals = [];
  const steps = 30;
  for (let i = 0; i <= steps; i++) {
    const w_delta_val = 0.1 + (2.9 * i / steps);
    w_delta_vals.push(w_delta_val.toFixed(2));
    
    const numerator = (w_delta_val * delta) * (w_atr * atr) * (w_ratio * (S / optPriceForRatio)) *
                      Math.sqrt(w_oi * (OI + 1)) * Math.log(w_tdays * (T_days + 1)) *
                      (1 + (w_ms * (ms - 50) / 50));
    const denom = P * theta * Math.exp(iv / 100);
    const Q_custom = Math.sqrt(numerator / denom);
    Q_vals.push(Q_custom);
  }
  
  const ctx = document.getElementById('sensitivityChart').getContext('2d');
  if (sensitivityChart !== null) {
    sensitivityChart.destroy();
  }
  sensitivityChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: w_delta_vals,
      datasets: [{
        label: 'Composite Score Q_custom',
        data: Q_vals,
        borderColor: 'rgba(75, 192, 192, 1)',
        fill: false,
        tension: 0.1
      }]
    },
    options: {
      scales: {
        x: { title: { display: true, text: 'Delta Weight (w_delta)' } },
        y: { title: { display: true, text: 'Q_custom' } }
      }
    }
  });
}
