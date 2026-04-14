// ===== CONFIG =====
const SUPABASE_URL = 'https://ivjaznyfqfifgyfnwbhg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2amF6bnlmcWZpZmd5Zm53YmhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMzI0NjMsImV4cCI6MjA4OTgwODQ2M30.5wozfDagfVK7nYCdre5PPllVBa_DYDzRwHFWzTAXJpc';
const CHECKOUT_INDIVIDUAL = 'https://checkout.square.site/merchant/MLC0HN2RN1CZH/checkout/WHQ256VJPFU6F2NHF4CXZWET?src=sheet';
const CHECKOUT_TEAM = 'https://checkout.square.site/merchant/MLC0HN2RN1CZH/checkout/OBBAR7PSJSMQ76RBOCISYRJT?src=sheet';
const MAX_TEAMS = 20;
const MAX_PLAYERS_PER_TEAM = 5;
const PENDING_EXPIRY_MS = 30 * 60 * 1000;

// ===== SUPABASE HELPERS =====
async function supabaseGet() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/registrations?select=*&order=created_at.asc`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    }
  });
  if (!res.ok) return [];
  return res.json();
}

async function supabaseInsert(rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/registrations`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(rows),
  });
  return res.ok;
}

// ===== SEND SMS =====
async function sendSMS(phone, playerName, teamNumber) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: phone, playerName, teamNumber }),
    });
  } catch (e) {
    console.log('SMS send failed:', e);
  }
}

// ===== STATE =====
let teams = []; // built from DB rows
let teamMode = 'new';
let regMode = 'individual';

// ===== BUILD TEAMS FROM DB ROWS =====
function buildTeams(rows) {
  const teamMap = {};
  rows.forEach(r => {
    if (!teamMap[r.team_number]) {
      teamMap[r.team_number] = { number: r.team_number, players: [] };
    }
    teamMap[r.team_number].players.push({ firstName: r.first_name, lastName: r.last_name || '' });
  });
  return Object.values(teamMap).sort((a, b) => a.number - b.number);
}

// ===== LOAD TEAMS FROM SUPABASE =====
async function loadTeams() {
  const rows = await supabaseGet();
  teams = buildTeams(rows);
  renderRoster();
  populateTeamSelect();
}

// ===== CHECK FOR PAYMENT RETURN =====
const urlParams = new URLSearchParams(window.location.search);
const paidParam = urlParams.get('paid');

async function handlePaymentReturn() {
  const pendingReg = JSON.parse(localStorage.getItem('k4c_pending') || 'null');

  if (paidParam && pendingReg) {
    const age = Date.now() - (pendingReg.timestamp || 0);
    if (age < PENDING_EXPIRY_MS) {
      // Build rows for Supabase
      const rows = pendingReg.players.map(p => ({
        team_number: pendingReg.target.number,
        first_name: p.firstName,
        last_name: p.lastName || '',
      }));

      const success = await supabaseInsert(rows);
      if (success) {
        await loadTeams();
        const statusEl = document.getElementById('form-status');
        if (statusEl) {
          statusEl.textContent = 'Payment confirmed! Registration complete. Check your phone for a confirmation text!';
          statusEl.className = 'success';
        }
        // Send SMS confirmation
        if (pendingReg.phone) {
          const name = pendingReg.players[0].firstName;
          sendSMS(pendingReg.phone, name, pendingReg.target.number);
        }
      }
    }
    // Clear pending
    localStorage.removeItem('k4c_pending');
    window.history.replaceState({}, '', window.location.pathname);
  } else if (!paidParam && localStorage.getItem('k4c_pending')) {
    // Came back without ?paid= — they cancelled
    localStorage.removeItem('k4c_pending');
  }
}

// ===== VIEW TOGGLING =====
document.addEventListener('DOMContentLoaded', async () => {
  const tabs = document.querySelectorAll('.nav-tab');
  const views = document.querySelectorAll('.view');

  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      if (tab.classList.contains('donate-tab')) return; // don't interfere with external link
      const target = tab.dataset.view;
      if (!target) return;
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      views.forEach(v => v.classList.toggle('active', v.id === target));
    });
  });

  // Nav logo click -> go to signup
  const navLogo = document.querySelector('.nav-logo');
  if (navLogo) {
    navLogo.addEventListener('click', (e) => {
      e.preventDefault();
      tabs.forEach(t => t.classList.remove('active'));
      const signupTab = document.querySelector('[data-view="signup"]');
      if (signupTab) signupTab.classList.add('active');
      views.forEach(v => v.classList.toggle('active', v.id === 'signup'));
    });
  }

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
        individualFields.querySelectorAll('[required]').forEach(el => el.removeAttribute('required'));
        teamFields.classList.remove('hidden');
        teamAssignment.classList.add('hidden');
        submitBtn.textContent = 'Pay $100 & Register Team';
      } else {
        individualFields.classList.remove('hidden');
        individualFields.querySelector('#firstName').setAttribute('required', '');
        individualFields.querySelector('#lastName').setAttribute('required', '');
        individualFields.querySelector('#phone').setAttribute('required', '');
        teamFields.classList.add('hidden');
        teamAssignment.classList.remove('hidden');
        submitBtn.textContent = 'Pay $20 & Register';
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

  // ===== FORM SUBMIT =====
  const form = document.getElementById('registration-form');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Save selected team number BEFORE reloading (reload resets dropdown)
    const savedTeamSelection = document.getElementById('teamNumber').value;

    // Reload latest teams before validating
    await loadTeams();

    // Restore the selection after reload
    const teamSelect = document.getElementById('teamNumber');
    if (savedTeamSelection) teamSelect.value = savedTeamSelection;

    const result = validateAndCollectPlayers();
    if (!result) return;

    const target = validateTeamTarget();
    if (!target) return;

    // Save as pending with timestamp
    const pendingReg = { players: result.players, phone: result.phone, target, regMode, timestamp: Date.now() };
    localStorage.setItem('k4c_pending', JSON.stringify(pendingReg));

    setStatus('Redirecting to payment...', 'success');

    // Redirect to Square checkout
    const url = regMode === 'team' ? CHECKOUT_TEAM : CHECKOUT_INDIVIDUAL;
    window.location.href = url;
    // After payment, Square redirects to confirmation.html?paid=individual or ?paid=team
  });

  // ===== INIT =====
  await handlePaymentReturn();
  await loadTeams();
});

// ===== POPULATE TEAM DROPDOWN =====
function populateTeamSelect() {
  const select = document.getElementById('teamNumber');
  if (!select) return;
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
  if (!roster) return;

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
    if (!lastName) {
      setStatus('Please enter your last name.', 'error');
      form.querySelector('#lastName').focus();
      return null;
    }
    const phone = form.querySelector('#phone').value.trim();
    if (!phone) {
      setStatus('Please enter your phone number.', 'error');
      form.querySelector('#phone').focus();
      return null;
    }
    return { players: [{ firstName, lastName }], phone };
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
    if (!last) {
      setStatus(`Please enter a last name for Player ${i}.`, 'error');
      form.querySelector(`[name="teamLast${i}"]`).focus();
      return null;
    }
    players.push({ firstName: first, lastName: last });
  }
  const phone = form.querySelector('#teamPhone').value.trim();
  if (!phone) {
    setStatus('Please enter your phone number.', 'error');
    form.querySelector('#teamPhone').focus();
    return null;
  }
  return { players, phone };
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

// ===== STATUS =====
function setStatus(msg, type) {
  const statusEl = document.getElementById('form-status');
  if (statusEl) {
    statusEl.textContent = msg;
    statusEl.className = type;
  }
}
