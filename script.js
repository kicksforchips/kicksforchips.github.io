// ===== CONFIG =====
const SQUARE_APP_ID = 'sq0idp-SIAb7Bit66sbtwCW5_soBA';
const SQUARE_LOCATION_ID = 'LWZWSDG';
const MAX_TEAMS = 20;
const MAX_PLAYERS_PER_TEAM = 5;

// ===== STATE =====
let teams = JSON.parse(localStorage.getItem('k4c_teams') || '[]');
let teamMode = 'new'; // 'new' or 'join'
let regMode = 'individual'; // 'individual' or 'team'
let card = null;
let applePay = null;

// ===== VIEW TOGGLING =====
const tabs = document.querySelectorAll('.nav-tab');
const views = document.querySelectorAll('.view');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.view;
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    views.forEach(v => v.classList.toggle('active', v.id === target));
  });
});

// ===== REGISTRATION MODE TOGGLE =====
const modeBtns = document.querySelectorAll('.mode-btn');
const individualFields = document.getElementById('individual-fields');
const teamFields = document.getElementById('team-fields');
const teamAssignment = document.getElementById('team-assignment');
const priceLabel = document.getElementById('price-label');
const submitBtn = document.getElementById('submit-btn');

modeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    regMode = btn.dataset.regMode;
    modeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (regMode === 'team') {
      individualFields.classList.add('hidden');
      teamFields.classList.remove('hidden');
      teamAssignment.classList.add('hidden');
      priceLabel.textContent = '$75.00';
      submitBtn.textContent = 'Pay $75 & Register Team';
    } else {
      individualFields.classList.remove('hidden');
      teamFields.classList.add('hidden');
      teamAssignment.classList.remove('hidden');
      priceLabel.textContent = '$15.00';
      submitBtn.textContent = 'Pay $15 & Register';
    }

    updateApplePayAmount();
  });
});

// ===== TEAM MODE TOGGLE =====
const toggleBtns = document.querySelectorAll('.toggle-btn');
const joinInput = document.getElementById('join-team-input');
const newInfo = document.getElementById('new-team-info');

toggleBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    teamMode = btn.dataset.teamMode;
    toggleBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (teamMode === 'join') {
      joinInput.classList.remove('hidden');
      newInfo.classList.add('hidden');
      populateTeamSelect();
    } else {
      joinInput.classList.add('hidden');
      newInfo.classList.remove('hidden');
    }
  });
});

// ===== POPULATE TEAM DROPDOWN =====
function populateTeamSelect() {
  const select = document.getElementById('teamNumber');
  select.innerHTML = '<option value="">Select a team to join...</option>';

  teams.forEach(team => {
    if (team.players.length < MAX_PLAYERS_PER_TEAM) {
      const opt = document.createElement('option');
      opt.value = team.number;
      const names = team.players.map(p => p.firstName).join(', ');
      opt.textContent = `Team ${team.number} (${team.players.length}/${MAX_PLAYERS_PER_TEAM}) — ${names}`;
      select.appendChild(opt);
    }
  });

  if (select.options.length === 1) {
    const opt = document.createElement('option');
    opt.disabled = true;
    opt.textContent = 'No teams available to join yet';
    select.appendChild(opt);
  }
}

// ===== RENDER ROSTER =====
function renderRoster() {
  const roster = document.getElementById('roster');

  if (teams.length === 0) {
    roster.innerHTML = '<p class="no-teams">No teams registered yet. Be the first!</p>';
    return;
  }

  roster.innerHTML = teams.map(team => {
    const isFull = team.players.length >= MAX_PLAYERS_PER_TEAM;
    return `
      <div class="team-card ${isFull ? 'full' : ''}">
        <div class="team-card-header">
          <span class="team-number">Team ${team.number}</span>
          <span class="team-count">${team.players.length}/${MAX_PLAYERS_PER_TEAM}${isFull ? ' FULL' : ''}</span>
        </div>
        <ul class="team-players">
          ${team.players.map(p => {
            const name = p.lastName ? `${p.firstName} ${p.lastName}` : p.firstName;
            return `<li>${name}</li>`;
          }).join('')}
        </ul>
      </div>
    `;
  }).join('');
}

// ===== SAVE TEAMS =====
function saveTeams() {
  localStorage.setItem('k4c_teams', JSON.stringify(teams));
}

// ===== GET NEXT TEAM NUMBER =====
function getNextTeamNumber() {
  if (teams.length >= MAX_TEAMS) return null;
  const used = new Set(teams.map(t => t.number));
  for (let i = 1; i <= MAX_TEAMS; i++) {
    if (!used.has(i)) return i;
  }
  return null;
}

// ===== GET CURRENT AMOUNT =====
function getCurrentAmount() {
  return regMode === 'team' ? '75.00' : '15.00';
}

// ===== UPDATE APPLE PAY AMOUNT =====
function updateApplePayAmount() {
  // Apple Pay amount is set at tokenize time via paymentRequest, no runtime update needed
}

// ===== CREATE PAYMENT REQUEST FOR APPLE PAY =====
function createPaymentRequest(payments) {
  return payments.paymentRequest({
    countryCode: 'US',
    currencyCode: 'USD',
    total: {
      amount: getCurrentAmount(),
      label: regMode === 'team' ? 'K4C Team Registration (5 players)' : 'K4C Player Registration',
    },
  });
}

// ===== SQUARE PAYMENT INIT =====
async function initSquarePayment() {
  const statusEl = document.getElementById('payment-status');

  try {
    const payments = window.Square.payments(SQUARE_APP_ID, SQUARE_LOCATION_ID);

    // Card form
    card = await payments.card();
    await card.attach('#card-container');

    // Apple Pay
    try {
      const paymentRequest = createPaymentRequest(payments);
      applePay = await payments.applePay(paymentRequest);
      // Apple Pay button is auto-rendered by the SDK inside #apple-pay-container
      const apContainer = document.getElementById('apple-pay-container');
      // Insert a divider before Apple Pay
      const divider = document.createElement('div');
      divider.className = 'pay-divider';
      divider.textContent = 'or';
      apContainer.parentNode.insertBefore(divider, apContainer);
      await applePay.attach('#apple-pay-container');
    } catch (apErr) {
      // Apple Pay not available on this device/browser — that's fine
      console.log('Apple Pay not available:', apErr.message || apErr);
    }

    statusEl.textContent = 'Payment ready.';
    statusEl.className = 'ready';
    submitBtn.disabled = false;
  } catch (e) {
    console.error('Square init error:', e);
    statusEl.textContent = 'Could not load payment form. Please refresh and try again.';
    statusEl.className = 'error';
  }
}

// ===== VALIDATE & COLLECT PLAYERS =====
function validateAndCollectPlayers() {
  const form = document.getElementById('registration-form');

  if (regMode === 'individual') {
    const firstName = form.querySelector('#firstName').value.trim();
    const lastName = form.querySelector('#lastName').value.trim();
    if (!firstName) {
      setStatus('Please enter your first name.', 'error');
      form.querySelector('#firstName').focus();
      return null;
    }
    return [{ firstName, lastName }];
  }

  // Team mode — collect all 5 players
  const players = [];
  for (let i = 1; i <= 5; i++) {
    const first = form.querySelector(`[name="teamFirst${i}"]`).value.trim();
    const last = form.querySelector(`[name="teamLast${i}"]`).value.trim();
    if (!first) {
      setStatus(`Please enter a first name for Player ${i}.`, 'error');
      form.querySelector(`[name="teamFirst${i}"]`).focus();
      return null;
    }
    players.push({ firstName: first, lastName: last });
  }
  return players;
}

// ===== VALIDATE TEAM TARGET =====
function validateTeamTarget() {
  if (regMode === 'team') {
    // Whole team always creates a new team
    const num = getNextTeamNumber();
    if (num === null) {
      setStatus('All 20 teams are full. Registration is closed.', 'error');
      return null;
    }
    return { mode: 'new', number: num };
  }

  // Individual
  if (teamMode === 'join') {
    const selected = document.getElementById('teamNumber').value;
    if (!selected) {
      setStatus('Please select a team to join.', 'error');
      return null;
    }
    const num = parseInt(selected, 10);
    const team = teams.find(t => t.number === num);
    if (!team || team.players.length >= MAX_PLAYERS_PER_TEAM) {
      setStatus('That team is full. Please choose another.', 'error');
      return null;
    }
    return { mode: 'join', number: num };
  }

  const num = getNextTeamNumber();
  if (num === null) {
    setStatus('All 20 teams are full. Registration is closed.', 'error');
    return null;
  }
  return { mode: 'new', number: num };
}

// ===== REGISTER PLAYERS =====
function registerPlayers(players, target) {
  if (target.mode === 'join') {
    const team = teams.find(t => t.number === target.number);
    players.forEach(p => team.players.push(p));
  } else {
    teams.push({
      number: target.number,
      players: players,
    });
  }

  saveTeams();
  renderRoster();
  populateTeamSelect();
}

// ===== PROCESS PAYMENT RESULT =====
function processPaymentResult(result, players, target) {
  if (result.status === 'OK') {
    registerPlayers(players, target);

    const label = `Team ${target.number}`;
    if (regMode === 'team') {
      setStatus(`Payment successful! Your team is registered as ${label}.`, 'success');
    } else {
      setStatus(`Payment successful! ${players[0].firstName} registered to ${label}.`, 'success');
    }

    // Reset form
    const form = document.getElementById('registration-form');
    form.reset();
    modeBtns[0].click(); // back to individual
    toggleBtns[0].click(); // back to new team
    return true;
  } else {
    let errorMsg = 'Payment failed.';
    if (result.errors) {
      errorMsg = result.errors.map(e => e.message).join(' ');
    }
    setStatus(errorMsg, 'error');
    return false;
  }
}

// ===== FORM SUBMIT (Card Payment) =====
const form = document.getElementById('registration-form');
const statusEl = document.getElementById('form-status');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const players = validateAndCollectPlayers();
  if (!players) return;

  const target = validateTeamTarget();
  if (!target) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Processing...';

  try {
    const result = await card.tokenize();
    processPaymentResult(result, players, target);
  } catch (err) {
    console.error('Payment error:', err);
    setStatus('Payment error. Please try again.', 'error');
  }

  submitBtn.disabled = false;
  submitBtn.textContent = regMode === 'team' ? 'Pay $75 & Register Team' : 'Pay $15 & Register';
});

function setStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = type;
}

// ===== INIT =====
renderRoster();

// Load Square SDK
if (window.Square) {
  initSquarePayment();
} else {
  document.getElementById('payment-status').textContent = 'Loading payment form...';
  document.getElementById('payment-status').className = '';
  const checkSquare = setInterval(() => {
    if (window.Square) {
      clearInterval(checkSquare);
      initSquarePayment();
    }
  }, 500);
}
