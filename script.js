// ===== CONFIG =====
const CHECKOUT_INDIVIDUAL = 'https://checkout.square.site/merchant/MLC0HN2RN1CZH/checkout/WHQ256VJPFU6F2NHF4CXZWET?src=sheet';
const CHECKOUT_TEAM = 'https://checkout.square.site/merchant/MLC0HN2RN1CZH/checkout/OBBAR7PSJSMQ76RBOCISYRJT?src=sheet';
const MAX_TEAMS = 20;
const MAX_PLAYERS_PER_TEAM = 5;

// ===== STATE =====
let teams = JSON.parse(localStorage.getItem('k4c_teams') || '[]');
let pendingReg = JSON.parse(localStorage.getItem('k4c_pending') || 'null');
let teamMode = 'new';
let regMode = 'individual';

// ===== CHECK FOR PAYMENT RETURN =====
const urlParams = new URLSearchParams(window.location.search);
const paidParam = urlParams.get('paid');

if (paidParam && pendingReg) {
  // They came back from Square — register them
  registerPlayers(pendingReg.players, pendingReg.target);
  pendingReg = null;
  localStorage.removeItem('k4c_pending');

  // Clean up the URL
  window.history.replaceState({}, '', window.location.pathname);

  // Show success after page loads
  window.addEventListener('DOMContentLoaded', () => {
    const statusEl = document.getElementById('form-status');
    if (statusEl) {
      statusEl.textContent = 'Payment confirmed! Registration complete.';
      statusEl.className = 'success';
    }
  });
}

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
      submitBtn.textContent = 'Pay $75 & Register Team';
    } else {
      individualFields.classList.remove('hidden');
      teamFields.classList.add('hidden');
      teamAssignment.classList.remove('hidden');
      submitBtn.textContent = 'Pay $15 & Register';
    }
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
    const num = getNextTeamNumber();
    if (num === null) {
      setStatus('All 20 teams are full. Registration is closed.', 'error');
      return null;
    }
    return { mode: 'new', number: num };
  }

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

// ===== FORM SUBMIT =====
const form = document.getElementById('registration-form');
const statusEl = document.getElementById('form-status');

form.addEventListener('submit', (e) => {
  e.preventDefault();

  const players = validateAndCollectPlayers();
  if (!players) return;

  const target = validateTeamTarget();
  if (!target) return;

  // Save as pending — will be confirmed when they return from Square
  const currentRegMode = regMode;
  pendingReg = { players, target, regMode: currentRegMode };
  localStorage.setItem('k4c_pending', JSON.stringify(pendingReg));

  setStatus('Redirecting to payment...', 'success');

  // Redirect to Square checkout (same tab so they come back with ?paid=)
  const url = currentRegMode === 'team' ? CHECKOUT_TEAM : CHECKOUT_INDIVIDUAL;
  window.location.href = url;
});

function setStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = type;
}

// ===== INIT =====
renderRoster();

// Show success message if just returned from payment
if (paidParam && !pendingReg) {
  const statusEl = document.getElementById('form-status');
  if (statusEl) {
    statusEl.textContent = 'Payment confirmed! Registration complete.';
    statusEl.className = 'success';
  }
}
