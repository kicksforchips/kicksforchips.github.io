// ===== CONFIG =====
const SUPABASE_URL = 'https://ivjaznyfqfifgyfnwbhg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2amF6bnlmcWZpZmd5Zm53YmhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMzI0NjMsImV4cCI6MjA4OTgwODQ2M30.5wozfDagfVK7nYCdre5PPllVBa_DYDzRwHFWzTAXJpc';
const CHECKOUT_INDIVIDUAL = 'https://checkout.square.site/merchant/MLC0HN2RN1CZH/checkout/WHQ256VJPFU6F2NHF4CXZWET?src=sheet';
const CHECKOUT_TEAM = 'https://checkout.square.site/merchant/MLC0HN2RN1CZH/checkout/OBBAR7PSJSMQ76RBOCISYRJT?src=sheet';
const MAX_TEAMS = 16;
const MAX_PLAYERS_PER_TEAM = 5;

// ===== SUPABASE HELPERS =====
async function supabaseGet() {
  // Only return paid registrations for the public roster
  const res = await fetch(`${SUPABASE_URL}/rest/v1/registrations?select=*&paid=eq.true&order=created_at.asc`, {
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
  if (!res.ok) return null;
  return res.json();
}

// ===== STATE =====
let teams = []; // built from DB rows
let teamMode = null;
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

// ===== CLEAR STALE PENDING DATA ON LOAD =====
// If user returned to the main page without going through confirmation.html,
// the pending data is stale (they abandoned or cancelled checkout).
if (!window.location.search.includes('paid=') && localStorage.getItem('k4c_pending')) {
  localStorage.removeItem('k4c_pending');
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
  const paymentSection = document.getElementById('payment-section');
  const waitlistBanner = document.getElementById('waitlist-banner');

  function showIndividualMode() {
    regMode = 'individual';
    modeBtns.forEach(b => b.classList.toggle('active', b.dataset.regMode === 'individual'));
    individualFields.classList.remove('hidden');
    individualFields.querySelector('#firstName').setAttribute('required', '');
    individualFields.querySelector('#lastName').setAttribute('required', '');
    individualFields.querySelector('#phone').setAttribute('required', '');
    teamFields.classList.add('hidden');
    teamAssignment.classList.remove('hidden');
    paymentSection.classList.remove('hidden');
    waitlistBanner.classList.add('hidden');
    submitBtn.textContent = 'Pay $20 & Register';
  }

  function showTeamMode() {
    regMode = 'team';
    modeBtns.forEach(b => b.classList.toggle('active', b.dataset.regMode === 'team'));
    individualFields.classList.add('hidden');
    individualFields.querySelectorAll('[required]').forEach(el => el.removeAttribute('required'));
    teamFields.classList.remove('hidden');
    teamAssignment.classList.add('hidden');
    paymentSection.classList.remove('hidden');
    waitlistBanner.classList.add('hidden');
    submitBtn.textContent = 'Pay $100 & Register Team';
  }

  function showWaitlistMode() {
    regMode = 'waitlist';
    teamMode = null;
    modeBtns.forEach(b => b.classList.toggle('active', b.dataset.regMode === 'waitlist'));
    individualFields.classList.add('hidden');
    individualFields.querySelectorAll('[required]').forEach(el => el.removeAttribute('required'));
    teamFields.classList.remove('hidden');
    teamAssignment.classList.add('hidden');
    paymentSection.classList.add('hidden');
    waitlistBanner.classList.remove('hidden');
    submitBtn.textContent = 'Join Waitlist';
    setStatus('', '');
  }

  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.regMode;
      if (mode === 'waitlist') showWaitlistMode();
      else if (mode === 'team') showTeamMode();
      else showIndividualMode();
    });
  });

  // ===== TEAM MODE TOGGLE =====
  const toggleBtns = document.querySelectorAll('.toggle-btn');
  const joinInput = document.getElementById('join-team-input');
  const newInfo = document.getElementById('new-team-info');

  toggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.teamMode;

      // "Join Waitlist" toggle inside individual mode → switch to top-level waitlist mode
      if (mode === 'waitlist') {
        showWaitlistMode();
        return;
      }

      teamMode = mode;
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

    // ===== WAITLIST FLOW =====
    if (regMode === 'waitlist') {
      const players = [];
      for (let i = 1; i <= 5; i++) {
        const first = form.querySelector(`[name="teamFirst${i}"]`).value.trim();
        const last = form.querySelector(`[name="teamLast${i}"]`).value.trim();
        if (!first || !last) {
          setStatus(`Please enter all 5 players' first and last names.`, 'error');
          form.querySelector(`[name=${!first ? `teamFirst${i}` : `teamLast${i}`}]`).focus();
          return;
        }
        players.push({ firstName: first, lastName: last });
      }
      const phone = form.querySelector('#teamPhone').value.trim();
      if (!phone) {
        setStatus('Please enter your phone number so we can reach you.', 'error');
        form.querySelector('#teamPhone').focus();
        return;
      }

      submitBtn.disabled = true;
      setStatus('Adding your team to the waitlist...', 'success');

      const res = await fetch(`${SUPABASE_URL}/rest/v1/waitlist`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([{ players, phone }]),
      });

      if (res.ok) {
        setStatus(`You're on the waitlist! We'll text you at ${phone} if a spot opens.`, 'success');
        form.reset();
      } else {
        setStatus('Could not save your waitlist entry. Please try again or email info@kicksforchips.com', 'error');
        submitBtn.disabled = false;
      }
      return;
    }

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

    setStatus('Saving your registration...', 'success');

    // Insert rows NOW with paid=false so we have a record even if checkout is abandoned
    const rowsToInsert = result.players.map(p => ({
      team_number: target.number,
      first_name: p.firstName,
      last_name: p.lastName || '',
      phone: result.phone,
      paid: false,
    }));

    const inserted = await supabaseInsert(rowsToInsert);
    if (!inserted) {
      setStatus('Could not save registration. Please try again.', 'error');
      return;
    }

    const insertedIds = inserted.map(r => r.id);

    // Save as pending with timestamp + inserted IDs so confirmation.html can flip paid=true
    const pendingReg = {
      players: result.players,
      phone: result.phone,
      target,
      regMode,
      timestamp: Date.now(),
      ids: insertedIds,
    };
    localStorage.setItem('k4c_pending', JSON.stringify(pendingReg));

    setStatus('Redirecting to payment...', 'success');

    // Redirect to Square checkout
    const url = regMode === 'team' ? CHECKOUT_TEAM : CHECKOUT_INDIVIDUAL;
    window.location.href = url;
    // After payment, Square redirects to confirmation.html?paid=individual or ?paid=team
  });

  // ===== INIT =====
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

// ===== ESCAPE HTML =====
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
            return `<li>${escapeHtml(name)}</li>`;
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

  if (!teamMode) {
    setStatus('Please select "Create New Team" or "Join Existing Team".', 'error');
    return null;
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
    // Scroll error/success message into view so user actually sees it
    statusEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
