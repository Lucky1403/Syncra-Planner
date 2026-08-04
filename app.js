/* ==========================================================================
   Syncra Task & Meeting Scheduler - Logic Engine
   ========================================================================== */

// --- Global App State ---
const state = {
  events: [],
  currentDate: new Date(),        // The active calendar / timeline date
  activeView: 'calendar',         // 'calendar' | 'timeline'
  activeFilter: 'all',            // 'all' | 'tasks' | 'meetings' | 'urgent'
  sortFilter: 'time',             // 'time' | 'priority' | 'status'
  editingEventId: null,           // ID of the event currently being edited
  tempSubtasks: [],               // Subtasks list in current form
  activeAlarmEvent: null,         // Event triggering the current alarm
  userToken: localStorage.getItem('syncra_token') || null,
  userEmail: localStorage.getItem('syncra_email') || null,
  authMode: 'login'               // 'login' | 'signup'
};

// --- DOM Cache ---
const DOM = {
  liveTime: document.getElementById('live-time'),
  liveDate: document.getElementById('live-date'),
  btnAddItem: document.getElementById('btn-add-item'),
  btnToggleNotifications: document.getElementById('btn-toggle-notifications'),
  notificationStatusDot: document.getElementById('notification-status-dot'),
  calPrev: document.getElementById('cal-prev'),
  calNext: document.getElementById('cal-next'),
  calCurrentLabel: document.getElementById('cal-current-label'),
  calendarDaysContainer: document.getElementById('calendar-days-container'),
  viewCalendar: document.getElementById('view-calendar'),
  viewTimeline: document.getElementById('view-timeline'),
  timelineTodayBtn: document.getElementById('timeline-today-btn'),
  timelineActiveDate: document.getElementById('timeline-active-date'),
  timePrev: document.getElementById('time-prev'),
  timeNext: document.getElementById('time-next'),
  timelineHours: document.getElementById('timeline-hours'),
  timelineSlots: document.getElementById('timeline-slots'),
  delayAlertBanner: document.getElementById('delay-alert-banner'),
  delayAlertText: document.getElementById('delay-alert-text'),
  btnFocusOverdue: document.getElementById('btn-focus-overdue'),
  agendaTitle: document.getElementById('agenda-title'),
  sortFilterSelect: document.getElementById('sort-filter'),

  // Auth elements
  authOverlay: document.getElementById('auth-overlay'),
  authForm: document.getElementById('auth-form'),
  authEmail: document.getElementById('auth-email'),
  authPassword: document.getElementById('auth-password'),
  authTitle: document.getElementById('auth-title'),
  authSubtitle: document.getElementById('auth-subtitle'),
  authSubmitBtn: document.getElementById('auth-submit-btn'),
  authSwitchBtn: document.getElementById('auth-switch-btn'),
  authSwitchPrompt: document.getElementById('auth-switch-prompt'),
  authErrorMsg: document.getElementById('auth-error-msg'),
  
  // Profile element
  sidebarUserPanel: document.getElementById('sidebar-user-panel'),
  userEmailDisplay: document.getElementById('user-email-display'),
  btnLogout: document.getElementById('btn-logout'),
  agendaItemsContainer: document.getElementById('agenda-items-container'),
  btnEmptyAdd: document.getElementById('btn-empty-add'),
  
  // Modal Event Form
  modalEventForm: document.getElementById('modal-event-form'),
  modalTitle: document.getElementById('modal-title'),
  modalFormClose: document.getElementById('modal-form-close'),
  tabTask: document.getElementById('tab-task'),
  tabMeeting: document.getElementById('tab-meeting'),
  eventCreationForm: document.getElementById('event-creation-form'),
  formItemId: document.getElementById('form-item-id'),
  formItemType: document.getElementById('form-item-type'),
  formTitle: document.getElementById('form-title'),
  formDate: document.getElementById('form-date'),
  formTimeStart: document.getElementById('form-time-start'),
  formTimeEnd: document.getElementById('form-time-end'),
  formPriority: document.getElementById('form-priority'),
  formCategory: document.getElementById('form-category'),
  formReminder: document.getElementById('form-reminder'),
  formMeetingLink: document.getElementById('form-meeting-link'),
  formMeetingLocation: document.getElementById('form-meeting-location'),
  formDescription: document.getElementById('form-description'),
  formCompleted: document.getElementById('form-completed'),
  formNewSubtask: document.getElementById('form-new-subtask'),
  btnAddSubtask: document.getElementById('btn-add-subtask'),
  subtasksFormListContainer: document.getElementById('subtasks-form-list-container'),
  btnCancelForm: document.getElementById('btn-cancel-form'),
  btnDeleteItem: document.getElementById('btn-delete-item'),
  btnSubmitForm: document.getElementById('btn-submit-form'),
  
  // Dynamic form containers
  groupTimeEnd: document.getElementById('group-time-end'),
  groupPriority: document.getElementById('group-priority'),
  groupMeetingDetails: document.getElementById('group-meeting-details'),
  groupSubtasks: document.getElementById('group-subtasks'),
  groupCompleted: document.getElementById('group-completed'),

  // Alarm Overlay
  alarmAlertOverlay: document.getElementById('alarm-alert-overlay'),
  alarmItemType: document.getElementById('alarm-item-type'),
  alarmItemTitle: document.getElementById('alarm-item-title'),
  alarmItemTime: document.getElementById('alarm-item-time'),
  alarmBtnSnooze: document.getElementById('alarm-btn-snooze'),
  alarmBtnDismiss: document.getElementById('alarm-btn-dismiss'),
  alarmBtnJoin: document.getElementById('alarm-btn-join'),
  
  // Analytics
  completionPercentage: document.getElementById('completion-percentage'),
  statsProgressBar: document.getElementById('stats-progress-bar'),
  statCompleted: document.getElementById('stat-completed'),
  statPending: document.getElementById('stat-pending'),
  statDelayRisk: document.getElementById('stat-delay-risk'),
  
  // Import/Export
  btnExport: document.getElementById('btn-export'),
  btnImport: document.getElementById('btn-import'),
  importFile: document.getElementById('import-file'),
  
  // Sidebar count badges
  badgeAll: document.getElementById('badge-all'),
  badgeTasks: document.getElementById('badge-tasks'),
  badgeMeetings: document.getElementById('badge-meetings'),
  badgeUrgent: document.getElementById('badge-urgent'),
  greetingTitle: document.getElementById('greeting-title'),
  labelTimeStart: document.getElementById('label-time-start'),
  toastContainer: document.getElementById('toast-container'),
  navItems: document.querySelectorAll('.sidebar-nav .nav-item')
};

// --- Audio Synthesizer Context ---
let audioCtx = null;
let alarmAudioInterval = null;

function initAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playAlarmNote(frequency, startTime, duration) {
  if (!audioCtx) return;
  
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  
  // Blend a sine wave and triangle wave for a softer chime
  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, startTime);
  
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(0.2, startTime + 0.05); // volume ramp up
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration); // decay
  
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  
  osc.start(startTime);
  osc.stop(startTime + duration);
}

function playAlarmChimeSequence() {
  initAudioContext();
  if (!audioCtx) return;
  
  const now = audioCtx.currentTime;
  // Standard dual note digital chime: E5 followed by A5
  playAlarmNote(659.25, now, 0.4);      // E5
  playAlarmNote(880.00, now + 0.15, 0.65); // A5
}

function startAlarmAudio() {
  stopAlarmAudio();
  playAlarmChimeSequence();
  alarmAudioInterval = setInterval(playAlarmChimeSequence, 1800);
}

function stopAlarmAudio() {
  if (alarmAudioInterval) {
    clearInterval(alarmAudioInterval);
    alarmAudioInterval = null;
  }
}


// --- Life Cycle & Storage ---
function init() {
  // Check auth session
  updateAuthUI();
  
  if (state.userToken) {
    // Fetch user data from centralized MySQL database
    syncEventsFromBackend();
  } else {
    // Load mock data on first launch to showcase layout before auth displays
    loadMockData();
  }

  setupEventListeners();
  startLiveClock();
  startAlarmTicker();
  checkNotificationPermissionState();
  
  // Run Lucide renderer on startup to bind all icons (sidebar, auth logo, etc.)
  if (window.lucide) {
    lucide.createIcons();
  }

  // Register service worker for PWA offline support
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('Service Worker registered successfully:', reg.scope))
        .catch(err => console.log('Service Worker registration failed:', err));
    });
  }
}

function saveToStorage() {
  localStorage.setItem('syncra_schedule_events', JSON.stringify(state.events));
  updateCountBadges();
  updateAnalytics();
  syncEventsToBackend(); // Push updates to MySQL backend database!
}

function loadMockData() {
  const todayStr = getLocalDateString(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = getLocalDateString(tomorrow);
  
  state.events = [
    {
      id: 'mock-1',
      title: '🎯 Project Kickoff Sync',
      type: 'meeting',
      date: todayStr,
      startTime: '10:00',
      endTime: '11:00',
      priority: 'high',
      category: 'work',
      description: 'Discuss scheduling app deliverables and design framework with stakeholders.',
      reminder: '5',
      link: 'https://meet.google.com/abc-defg-hij',
      location: 'Conference Room 3A',
      completed: false,
      dismissedAlarm: false
    },
    {
      id: 'mock-2',
      title: '📝 Review Project Architecture Proposal',
      type: 'task',
      date: todayStr,
      startTime: '14:30',
      priority: 'medium',
      category: 'work',
      description: 'Go through database schemas and component definitions before tomorrow.',
      reminder: '15',
      subtasks: [
        { id: 'sub-1', text: 'Analyze local storage limits', completed: true },
        { id: 'sub-2', text: 'Structure glassmorphic layouts', completed: false }
      ],
      completed: false,
      dismissedAlarm: false
    },
    {
      id: 'mock-3',
      title: '🧘 Daily Yoga & Workout',
      type: 'task',
      date: todayStr,
      startTime: '18:00',
      priority: 'low',
      category: 'health',
      description: 'Stretching and breathing exercises to wrap up the day.',
      reminder: 'none',
      subtasks: [],
      completed: false,
      dismissedAlarm: false
    },
    {
      id: 'mock-4',
      title: '🎓 Learn Web Audio API Synthesizers',
      type: 'task',
      date: tomorrowStr,
      startTime: '09:00',
      priority: 'medium',
      category: 'education',
      description: 'Build robust oscillator chimes for alarm overlay.',
      reminder: '30',
      subtasks: [],
      completed: false,
      dismissedAlarm: false
    }
  ];
  saveToStorage();
}


// --- Main Render coordinator ---
function renderApp() {
  updateHeaderDateLabel();
  syncNavigationActiveStates();
  
  if (state.activeView === 'calendar') {
    DOM.viewCalendar.classList.remove('hidden');
    DOM.viewTimeline.classList.add('hidden');
    renderMonthlyCalendar();
  } else {
    DOM.viewCalendar.classList.add('hidden');
    DOM.viewTimeline.classList.remove('hidden');
    renderDailyTimeline();
  }
  
  renderAgendaList();
  updateAnalytics();
  updateCountBadges();
  checkDelayAlertBanner();
  
  // Re-bind Lucide icons
  lucide.createIcons();
}

function syncNavigationActiveStates() {
  // Desktop Sidebar Nav
  document.querySelectorAll('.sidebar-nav .nav-item:not(.filter-btn)').forEach(btn => {
    if (btn.dataset.view === state.activeView) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  // Mobile Bottom Nav
  document.querySelectorAll('.mobile-nav-item[data-view]').forEach(btn => {
    if (btn.dataset.view === state.activeView) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}


// --- Clock Widget ---
function startLiveClock() {
  function tick() {
    const now = new Date();
    // 24 Hour Format for live-time
    const hrs = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    DOM.liveTime.textContent = `${hrs}:${mins}`;
    
    // Custom formatted date
    const options = { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' };
    DOM.liveDate.textContent = now.toLocaleDateString('en-US', options);
  }
  
  tick();
  setInterval(tick, 1000);
}


// --- Header and Labels ---
function updateHeaderDateLabel() {
  // Update Monthly Calendar Header Navigation text
  const monthNames = [
    "January", "February", "March", "April", "May", "June", 
    "July", "August", "September", "October", "November", "December"
  ];
  const activeMonth = state.currentDate.getMonth();
  const activeYear = state.currentDate.getFullYear();
  DOM.calCurrentLabel.textContent = `${monthNames[activeMonth]} ${activeYear}`;
  
  // Set timeline text date picker label
  const options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
  DOM.timelineActiveDate.textContent = state.currentDate.toLocaleDateString('en-US', options);
  
  // Set bottom agenda title
  const dateStr = state.currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  DOM.agendaTitle.textContent = `Agenda: ${dateStr}`;
  
  // Greeting Title based on local time
  const hr = new Date().getHours();
  let greet = "Good evening!";
  if (hr < 12) greet = "Good morning!";
  else if (hr < 18) greet = "Good afternoon!";
  DOM.greetingTitle.textContent = greet;
}


// --- Count Badges in Sidebar ---
function updateCountBadges() {
  const activeDateStr = getLocalDateString(state.currentDate);
  const todaysEvents = state.events.filter(e => e.date === activeDateStr);
  
  const allCount = todaysEvents.length;
  const tasksCount = todaysEvents.filter(e => e.type === 'task').length;
  const meetingsCount = todaysEvents.filter(e => e.type === 'meeting').length;
  const urgentCount = todaysEvents.filter(e => e.priority === 'high' && !e.completed).length;
  
  DOM.badgeAll.textContent = allCount;
  DOM.badgeTasks.textContent = tasksCount;
  DOM.badgeMeetings.textContent = meetingsCount;
  DOM.badgeUrgent.textContent = urgentCount;
}


// --- Analytics Calculation ---
function updateAnalytics() {
  const activeDateStr = getLocalDateString(state.currentDate);
  const todaysEvents = state.events.filter(e => e.date === activeDateStr);
  
  const total = todaysEvents.length;
  const completed = todaysEvents.filter(e => e.completed).length;
  const pending = total - completed;
  
  // Delay Risk Count
  const delayRisk = calculateDelayRiskCount(todaysEvents);
  
  // Completion %
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  DOM.completionPercentage.textContent = `${pct}%`;
  DOM.statsProgressBar.style.width = `${pct}%`;
  
  DOM.statCompleted.textContent = completed;
  DOM.statPending.textContent = pending;
  DOM.statDelayRisk.textContent = delayRisk;
}

// Delay Risk helper
function calculateDelayRiskCount(eventList) {
  const now = new Date();
  const todayStr = getLocalDateString(now);
  const currentHrMin = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  
  return eventList.filter(e => {
    if (e.completed) return false;
    
    // Past date is always delay risk
    if (e.date < todayStr) return true;
    
    // If today, check if past start time
    if (e.date === todayStr && e.startTime) {
      return e.startTime < currentHrMin;
    }
    
    return false;
  }).length;
}

// Banner Check
function checkDelayAlertBanner() {
  const now = new Date();
  const todayStr = getLocalDateString(now);
  const currentHrMin = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  
  const overdueItems = state.events.filter(e => {
    if (e.completed) return false;
    if (e.date < todayStr) return true;
    if (e.date === todayStr && e.startTime && e.startTime < currentHrMin) return true;
    return false;
  });
  
  if (overdueItems.length > 0) {
    DOM.delayAlertBanner.classList.remove('hidden');
    DOM.delayAlertText.textContent = `You have ${overdueItems.length} overdue task(s) or meeting(s) past schedule!`;
  } else {
    DOM.delayAlertBanner.classList.add('hidden');
  }
}


// --- Monthly Calendar Grid Renderer ---
function renderMonthlyCalendar() {
  DOM.calendarDaysContainer.innerHTML = '';
  
  const activeYear = state.currentDate.getFullYear();
  const activeMonth = state.currentDate.getMonth();
  
  // First day of active month
  const firstDay = new Date(activeYear, activeMonth, 1);
  const startDayIdx = firstDay.getDay(); // 0 is Sun, 6 is Sat
  
  // Total days in active month
  const totalDays = new Date(activeYear, activeMonth + 1, 0).getDate();
  
  // Total days in previous month
  const prevMonthTotalDays = new Date(activeYear, activeMonth, 0).getDate();
  
  const totalCells = 42; // standard 6-row grid
  
  // Render loop
  for (let i = 0; i < totalCells; i++) {
    const cell = document.createElement('div');
    cell.className = 'calendar-day-cell';
    
    let cellDay, cellMonth, cellYear;
    
    if (i < startDayIdx) {
      // Previous Month padding days
      cell.classList.add('other-month');
      cellDay = prevMonthTotalDays - startDayIdx + i + 1;
      cellMonth = activeMonth - 1;
      cellYear = activeYear;
      if (cellMonth < 0) {
        cellMonth = 11;
        cellYear--;
      }
    } else if (i >= startDayIdx + totalDays) {
      // Next Month padding days
      cell.classList.add('other-month');
      cellDay = i - (startDayIdx + totalDays) + 1;
      cellMonth = activeMonth + 1;
      cellYear = activeYear;
      if (cellMonth > 11) {
        cellMonth = 0;
        cellYear++;
      }
    } else {
      // Current Month days
      cellDay = i - startDayIdx + 1;
      cellMonth = activeMonth;
      cellYear = activeYear;
      
      // Highlight today
      const today = new Date();
      if (cellDay === today.getDate() && cellMonth === today.getMonth() && cellYear === today.getFullYear()) {
        cell.classList.add('today');
      }
    }
    
    // Check if cell is the active state.currentDate day
    if (cellDay === state.currentDate.getDate() && cellMonth === state.currentDate.getMonth() && cellYear === state.currentDate.getFullYear()) {
      cell.style.boxShadow = 'inset 0 0 0 2px var(--color-primary)';
    }
    
    // Create Cell date identifier
    const cellDateObj = new Date(cellYear, cellMonth, cellDay);
    const dateStr = getLocalDateString(cellDateObj);
    cell.dataset.date = dateStr;
    
    // Day Label
    const dayLabel = document.createElement('span');
    dayLabel.className = 'day-number';
    dayLabel.textContent = cellDay;
    cell.appendChild(dayLabel);
    
    // Events List inside cell
    const eventsList = document.createElement('div');
    eventsList.className = 'day-events-list';
    
    // Filter events matching cell date
    const cellEvents = state.events.filter(e => e.date === dateStr);
    
    // Limit calendar view cell items to 3 items max
    const maxItems = 3;
    cellEvents.slice(0, maxItems).forEach(ev => {
      const badge = document.createElement('div');
      badge.className = `day-event-badge type-${ev.type} priority-${ev.priority}`;
      if (ev.completed) badge.classList.add('completed');
      
      const timeStr = ev.startTime ? `${ev.startTime} ` : '';
      badge.textContent = `${timeStr}${ev.title}`;
      badge.title = `${ev.type.toUpperCase()}: ${ev.title}`;
      eventsList.appendChild(badge);
    });
    
    if (cellEvents.length > maxItems) {
      const moreLabel = document.createElement('div');
      moreLabel.className = 'day-events-more';
      moreLabel.textContent = `+${cellEvents.length - maxItems} more`;
      eventsList.appendChild(moreLabel);
    }
    
    cell.appendChild(eventsList);
    
    // Cell Click Event
    cell.addEventListener('click', () => {
      state.currentDate = new Date(cellYear, cellMonth, cellDay);
      renderApp();
    });
    
    DOM.calendarDaysContainer.appendChild(cell);
  }
}


// --- Daily Timeline View Renderer ---
function renderDailyTimeline() {
  // Hide the separate hours column since we are building a unified tabular view
  if (DOM.timelineHours) {
    DOM.timelineHours.style.display = 'none';
  }
  
  DOM.timelineSlots.innerHTML = '';
  
  const startHour = 0;
  const endHour = 23; // 11 PM
  
  // Render tabular rows inside the slots column container
  for (let hr = startHour; hr <= endHour; hr++) {
    const row = document.createElement('div');
    row.className = 'timeline-table-row';
    row.dataset.hour = hr;
    
    // Time label cell (left side)
    const timeCell = document.createElement('div');
    timeCell.className = 'timeline-time-cell';
    let label = hr % 12 === 0 ? 12 : hr % 12;
    label += hr >= 12 ? ' PM' : ' AM';
    timeCell.textContent = label;
    
    // Events slot cell (right side)
    const eventsCell = document.createElement('div');
    eventsCell.className = 'timeline-events-cell';
    
    row.appendChild(timeCell);
    row.appendChild(eventsCell);
    DOM.timelineSlots.appendChild(row);
  }
  
  // Get active date strings
  const activeDateStr = getLocalDateString(state.currentDate);
  const daysEvents = state.events.filter(e => e.date === activeDateStr);
  
  // Render timeline cards into their respective hour slot cells
  daysEvents.forEach(ev => {
    if (!ev.startTime) return; // Skip events without a defined time
    
    const [startH, startM] = ev.startTime.split(':').map(Number);
    
    // Out of timeline window limit handling
    if (startH < startHour || startH > endHour) return;
    
    const row = DOM.timelineSlots.querySelector(`[data-hour="${startH}"]`);
    if (!row) return;
    const eventsCell = row.querySelector('.timeline-events-cell');
    if (!eventsCell) return;
    
    let durationLabel = '';
    if (ev.type === 'meeting' && ev.endTime) {
      durationLabel = ` - ${ev.endTime}`;
    }
    
    // Draw event box
    const card = document.createElement('div');
    card.className = `timeline-event-card type-${ev.type}`;
    if (ev.completed) card.classList.add('completed');
    
    // Inner container for horizontal alignment
    const inner = document.createElement('div');
    inner.className = 'timeline-card-inner';
    
    // Checkbox if task type to mark as done directly
    if (ev.type === 'task') {
      const checkboxWrapper = document.createElement('div');
      checkboxWrapper.className = 'item-checkbox-wrapper';
      
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = ev.completed;
      chk.addEventListener('change', (e) => {
        e.stopPropagation(); // Avoid opening details modal
        toggleEventCompletion(ev.id);
      });
      
      const customChk = document.createElement('div');
      customChk.className = 'checkbox-custom';
      
      checkboxWrapper.appendChild(chk);
      checkboxWrapper.appendChild(customChk);
      inner.appendChild(checkboxWrapper);
    }
    
    // Details wrapper
    const details = document.createElement('div');
    details.className = 'timeline-card-details';
    
    const title = document.createElement('div');
    title.className = 'timeline-card-title';
    title.textContent = ev.title;
    details.appendChild(title);
    
    const timeMeta = document.createElement('div');
    timeMeta.className = 'timeline-card-time';
    timeMeta.innerHTML = `<i data-lucide="clock" style="width:11px;height:11px;"></i> <span>${ev.startTime}${durationLabel}</span>`;
    details.appendChild(timeMeta);
    
    // In tabular view we can always display category and priority details if they exist
    if (ev.category) {
      const categoryMeta = document.createElement('div');
      categoryMeta.className = 'timeline-card-meta';
      categoryMeta.innerHTML = `<span>🏷️ ${ev.category.toUpperCase()}</span> <span>Priority: ${ev.priority.toUpperCase()}</span>`;
      details.appendChild(categoryMeta);
    }
    
    inner.appendChild(details);
    card.appendChild(inner);
    
    // Click action to open edit modal
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      openFormModal(ev.id);
    });
    
    eventsCell.appendChild(card);
  });
  
  // Re-run Lucide Icons rendering on dynamically added tags
  if (window.lucide) {
    window.lucide.createIcons();
  }
}


// --- Agenda List Bottom Panel Renderer ---
function renderAgendaList() {
  DOM.agendaItemsContainer.innerHTML = '';
  
  const activeDateStr = getLocalDateString(state.currentDate);
  
  // Filter by selected date & sidebar filter toggle
  let items = state.events.filter(e => e.date === activeDateStr);
  
  if (state.activeFilter === 'tasks') {
    items = items.filter(e => e.type === 'task');
  } else if (state.activeFilter === 'meetings') {
    items = items.filter(e => e.type === 'meeting');
  } else if (state.activeFilter === 'urgent') {
    items = items.filter(e => e.priority === 'high' && !e.completed);
  }
  
  // Sorting Engine
  items.sort((a, b) => {
    if (state.sortFilter === 'time') {
      const timeA = a.startTime || '23:59';
      const timeB = b.startTime || '23:59';
      return timeA.localeCompare(timeB);
    } else if (state.sortFilter === 'priority') {
      const weight = { high: 3, medium: 2, low: 1 };
      return weight[b.priority] - weight[a.priority];
    } else if (state.sortFilter === 'status') {
      return (a.completed ? 1 : 0) - (b.completed ? 0 : 1);
    }
    return 0;
  });
  
  // Render
  if (items.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.innerHTML = `
      <i data-lucide="calendar-x" class="empty-icon"></i>
      <p>No matches found in your agenda.</p>
    `;
    DOM.agendaItemsContainer.appendChild(emptyState);
    return;
  }
  
  items.forEach(ev => {
    const box = document.createElement('div');
    box.className = `agenda-item-box ${ev.completed ? 'completed' : ''}`;
    box.dataset.id = ev.id;
    
    // Checkbox Wrapper
    const checkWrap = document.createElement('div');
    checkWrap.className = 'item-checkbox-wrapper';
    
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = ev.completed;
    chk.addEventListener('change', () => toggleEventCompletion(ev.id));
    
    const customSpan = document.createElement('span');
    customSpan.className = 'checkbox-custom';
    
    checkWrap.appendChild(chk);
    checkWrap.appendChild(customSpan);
    box.appendChild(checkWrap);
    
    // Detail Row Left
    const details = document.createElement('div');
    details.className = 'item-details-left';
    
    const mainTitleRow = document.createElement('div');
    mainTitleRow.className = 'item-main-title-row';
    
    const titleSpan = document.createElement('span');
    titleSpan.className = 'item-title';
    titleSpan.textContent = ev.title;
    mainTitleRow.appendChild(titleSpan);
    
    // Priority / Type Badge
    const typePill = document.createElement('span');
    typePill.className = `pill pill-type-${ev.type}`;
    typePill.textContent = ev.type;
    mainTitleRow.appendChild(typePill);
    
    if (!ev.completed) {
      const prioPill = document.createElement('span');
      prioPill.className = `pill pill-priority-${ev.priority}`;
      prioPill.textContent = ev.priority;
      mainTitleRow.appendChild(prioPill);
    }
    
    details.appendChild(mainTitleRow);
    
    // Meta information sub-row
    const metaRow = document.createElement('div');
    metaRow.className = 'item-meta-row';
    
    // Time
    if (ev.startTime) {
      const durationText = ev.endTime ? ` - ${ev.endTime}` : '';
      metaRow.innerHTML += `
        <span class="meta-split"><i data-lucide="clock"></i>${ev.startTime}${durationText}</span>
      `;
    }
    
    // Meeting specific details
    if (ev.type === 'meeting') {
      if (ev.link) {
        metaRow.innerHTML += `
          <span class="meta-split"><i data-lucide="link"></i><a href="${ev.link}" target="_blank" style="color:var(--color-meeting);">Join Sync</a></span>
        `;
      }
      if (ev.location) {
        metaRow.innerHTML += `
          <span class="meta-split"><i data-lucide="map-pin"></i>${ev.location}</span>
        `;
      }
    }
    
    // Task Checklist stats
    if (ev.type === 'task' && ev.subtasks && ev.subtasks.length > 0) {
      const doneSub = ev.subtasks.filter(s => s.completed).length;
      metaRow.innerHTML += `
        <span class="meta-split"><i data-lucide="list-checks"></i>Subtasks: ${doneSub}/${ev.subtasks.length}</span>
      `;
    }
    
    // Category Label
    if (ev.category) {
      const categoryEmoji = {
        work: '💼 Work',
        personal: '🏠 Personal',
        education: '🎓 Education',
        health: '❤️ Health',
        other: '⭐ Other'
      }[ev.category] || '🏷️';
      
      metaRow.innerHTML += `
        <span class="meta-split"><span>${categoryEmoji}</span></span>
      `;
    }
    
    details.appendChild(metaRow);
    box.appendChild(details);
    
    // Subtasks Dropdown list if not editing
    if (ev.type === 'task' && ev.subtasks && ev.subtasks.length > 0) {
      const subtaskCollapse = document.createElement('div');
      subtaskCollapse.style.width = '100%';
      subtaskCollapse.style.paddingLeft = '38px';
      subtaskCollapse.style.marginTop = '4px';
      subtaskCollapse.style.display = 'flex';
      subtaskCollapse.style.flexDirection = 'column';
      subtaskCollapse.style.gap = '4px';
      
      ev.subtasks.forEach(s => {
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.gap = '8px';
        item.style.fontSize = '12px';
        
        const schk = document.createElement('input');
        schk.type = 'checkbox';
        schk.checked = s.completed;
        schk.addEventListener('change', () => toggleSubtaskCompletion(ev.id, s.id));
        
        const slbl = document.createElement('span');
        slbl.textContent = s.text;
        if (s.completed) {
          slbl.style.textDecoration = 'line-through';
          slbl.style.color = 'var(--text-muted)';
        }
        
        item.appendChild(schk);
        item.appendChild(slbl);
        subtaskCollapse.appendChild(item);
      });
      
      // We append it after detail row in layout. Let's restructure box
      const flexContainer = document.createElement('div');
      flexContainer.style.display = 'flex';
      flexContainer.style.flexDirection = 'column';
      flexContainer.style.flexGrow = '1';
      
      // Swap children
      box.removeChild(details);
      flexContainer.appendChild(details);
      flexContainer.appendChild(subtaskCollapse);
      
      box.insertBefore(flexContainer, box.children[1]);
    }
    
    // Action Buttons Right
    const actionWrap = document.createElement('div');
    actionWrap.className = 'item-actions-right';
    
    const editBtn = document.createElement('button');
    editBtn.className = 'action-icon-btn';
    editBtn.title = 'Edit Event';
    editBtn.innerHTML = `<i data-lucide="edit-3"></i>`;
    editBtn.addEventListener('click', () => openFormModal(ev.id));
    actionWrap.appendChild(editBtn);
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'action-icon-btn delete';
    deleteBtn.title = 'Delete Event';
    deleteBtn.innerHTML = `<i data-lucide="trash-2"></i>`;
    deleteBtn.addEventListener('click', () => deleteEvent(ev.id));
    actionWrap.appendChild(deleteBtn);
    
    box.appendChild(actionWrap);
    DOM.agendaItemsContainer.appendChild(box);
  });
}


// --- Action Handlers ---
function toggleEventCompletion(eventId) {
  const ev = state.events.find(e => e.id === eventId);
  if (ev) {
    ev.completed = !ev.completed;
    saveToStorage();
    renderApp();
    showToast(`"${ev.title}" marked as ${ev.completed ? 'completed' : 'pending'}.`, "success");
  }
}

function toggleSubtaskCompletion(taskId, subtaskId) {
  const ev = state.events.find(e => e.id === taskId);
  if (ev && ev.subtasks) {
    const sub = ev.subtasks.find(s => s.id === subtaskId);
    if (sub) {
      sub.completed = !sub.completed;
      
      // Auto complete parent task if all subtasks are finished
      const allDone = ev.subtasks.every(s => s.completed);
      if (allDone && !ev.completed) {
        ev.completed = true;
        showToast(`All subtasks done! "${ev.title}" completed.`, "success");
      } else if (!allDone && ev.completed) {
        ev.completed = false;
      }
      
      saveToStorage();
      renderApp();
    }
  }
}

function deleteEvent(eventId) {
  const index = state.events.findIndex(e => e.id === eventId);
  if (index !== -1) {
    const title = state.events[index].title;
    state.events.splice(index, 1);
    saveToStorage();
    renderApp();
    showToast(`"${title}" deleted successfully.`, "info");
  }
}


// --- Form Modal Creation & Handling ---
function openFormModal(eventId = null) {
  initAudioContext(); // Enable Audio context on user click trigger
  
  DOM.eventCreationForm.reset();
  DOM.subtasksFormListContainer.innerHTML = '';
  state.editingEventId = eventId;
  state.tempSubtasks = [];
  
  DOM.modalEventForm.classList.remove('hidden');
  
  if (eventId) {
    // Edit mode
    const ev = state.events.find(e => e.id === eventId);
    if (!ev) return;
    
    DOM.modalTitle.textContent = "Edit Scheduled Event";
    DOM.formItemId.value = ev.id;
    DOM.formItemType.value = ev.type;
    DOM.formTitle.value = ev.title;
    DOM.formDate.value = ev.date;
    DOM.formTimeStart.value = ev.startTime || '';
    DOM.formTimeEnd.value = ev.endTime || '';
    DOM.formPriority.value = ev.priority;
    DOM.formCategory.value = ev.category || 'work';
    DOM.formReminder.value = ev.reminder;
    DOM.formMeetingLink.value = ev.link || '';
    DOM.formMeetingLocation.value = ev.location || '';
    DOM.formDescription.value = ev.description || '';
    
    // Populate tab active classes
    if (ev.type === 'task') {
      setFormTypeTab('task');
      state.tempSubtasks = ev.subtasks ? [...ev.subtasks] : [];
      renderFormSubtasks();
    } else {
      setFormTypeTab('meeting');
    }
    
    DOM.btnDeleteItem.classList.remove('hidden');
    
    // Show completion checkbox in edit mode
    DOM.groupCompleted.classList.remove('hidden');
    DOM.groupCompleted.style.display = 'flex';
    DOM.formCompleted.checked = ev.completed;
  } else {
    // Create mode
    DOM.modalTitle.textContent = "Create Scheduled Event";
    DOM.formItemId.value = '';
    DOM.formDate.value = getLocalDateString(state.currentDate);
    DOM.btnDeleteItem.classList.add('hidden');
    
    // Hide completion checkbox in create mode
    DOM.groupCompleted.classList.add('hidden');
    DOM.groupCompleted.style.display = 'none';
    DOM.formCompleted.checked = false;
    
    // Default values
    setFormTypeTab('task');
  }
  
  // Re-bind Lucide icons in modal
  lucide.createIcons();
}

function closeFormModal() {
  DOM.modalEventForm.classList.add('hidden');
  state.editingEventId = null;
}

function setFormTypeTab(type) {
  DOM.formItemType.value = type;
  
  if (type === 'task') {
    DOM.tabTask.classList.add('active');
    DOM.tabMeeting.classList.remove('active');
    
    DOM.groupTimeEnd.style.display = 'none';
    DOM.groupPriority.style.display = 'flex';
    DOM.groupMeetingDetails.style.display = 'none';
    DOM.groupSubtasks.style.display = 'flex';
    DOM.labelTimeStart.textContent = "Due Time";
  } else {
    DOM.tabTask.classList.remove('active');
    DOM.tabMeeting.classList.add('active');
    
    DOM.groupTimeEnd.style.display = 'flex';
    DOM.groupPriority.style.display = 'none';
    DOM.groupMeetingDetails.style.display = 'block';
    DOM.groupSubtasks.style.display = 'none';
    DOM.labelTimeStart.textContent = "Start Time";
  }
}

// Subtasks list handling in modal form
function addSubtaskFromInput() {
  const text = DOM.formNewSubtask.value.trim();
  if (text) {
    const newSub = {
      id: 'sub-' + Date.now() + '-' + Math.floor(Math.random()*100),
      text: text,
      completed: false
    };
    state.tempSubtasks.push(newSub);
    DOM.formNewSubtask.value = '';
    renderFormSubtasks();
  }
}

function renderFormSubtasks() {
  DOM.subtasksFormListContainer.innerHTML = '';
  state.tempSubtasks.forEach((sub, idx) => {
    const li = document.createElement('li');
    li.className = 'subtask-form-item';
    li.style.display = 'flex';
    li.style.alignItems = 'center';
    li.style.justifyContent = 'space-between';
    li.style.width = '100%';
    
    const spanClass = sub.completed ? 'completed' : '';
    li.innerHTML = `
      <label style="display:flex; align-items:center; gap:8px; margin:0; flex-grow:1; cursor:pointer; min-width:0;">
        <input type="checkbox" class="subtask-form-checkbox" data-index="${idx}" ${sub.completed ? 'checked' : ''} style="width:14px; height:14px; cursor:pointer;">
        <span class="${spanClass}" style="text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${sub.text}</span>
      </label>
      <button type="button" class="subtask-delete-btn" data-index="${idx}">
        <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
      </button>
    `;
    
    // Checkbox toggle listener
    li.querySelector('.subtask-form-checkbox').addEventListener('change', (e) => {
      state.tempSubtasks[idx].completed = e.target.checked;
      renderFormSubtasks();
    });
    
    // delete binding
    li.querySelector('.subtask-delete-btn').addEventListener('click', () => {
      state.tempSubtasks.splice(idx, 1);
      renderFormSubtasks();
    });
    
    DOM.subtasksFormListContainer.appendChild(li);
  });
  
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Form validation
function validateForm() {
  let isValid = true;
  
  // Title field
  if (!DOM.formTitle.value.trim()) {
    DOM.formTitle.parentElement.classList.add('invalid');
    isValid = false;
  } else {
    DOM.formTitle.parentElement.classList.remove('invalid');
  }
  
  // Date field
  if (!DOM.formDate.value) {
    DOM.formDate.parentElement.classList.add('invalid');
    isValid = false;
  } else {
    DOM.formDate.parentElement.classList.remove('invalid');
  }
  
  // Meeting specific verification
  const isMeeting = DOM.formItemType.value === 'meeting';
  if (isMeeting) {
    // End time > Start Time
    if (DOM.formTimeStart.value && DOM.formTimeEnd.value) {
      if (DOM.formTimeStart.value >= DOM.formTimeEnd.value) {
        DOM.formTimeEnd.parentElement.classList.add('invalid');
        isValid = false;
      } else {
        DOM.formTimeEnd.parentElement.classList.remove('invalid');
      }
    }
    
    // Link validation (optional, only if typed)
    if (DOM.formMeetingLink.value.trim()) {
      try {
        new URL(DOM.formMeetingLink.value.trim());
        DOM.formMeetingLink.parentElement.classList.remove('invalid');
      } catch (e) {
        DOM.formMeetingLink.parentElement.classList.add('invalid');
        isValid = false;
      }
    } else {
      DOM.formMeetingLink.parentElement.classList.remove('invalid');
    }
  }
  
  return isValid;
}

// Form submit action
function handleFormSubmit(e) {
  e.preventDefault();
  
  if (!validateForm()) {
    showToast("Please fix the validation errors in the form.", "error");
    return;
  }
  
  const isEdit = !!state.editingEventId;
  const itemType = DOM.formItemType.value;
  
  const eventData = {
    id: isEdit ? state.editingEventId : 'event-' + Date.now(),
    type: itemType,
    title: DOM.formTitle.value.trim(),
    date: DOM.formDate.value,
    startTime: DOM.formTimeStart.value || null,
    priority: itemType === 'task' ? DOM.formPriority.value : 'medium',
    category: DOM.formCategory.value,
    reminder: DOM.formReminder.value,
    description: DOM.formDescription.value.trim(),
    completed: isEdit ? DOM.formCompleted.checked : false,
    dismissedAlarm: isEdit ? state.events.find(ev => ev.id === state.editingEventId).dismissedAlarm : false
  };
  
  if (itemType === 'task') {
    eventData.subtasks = [...state.tempSubtasks];
  } else {
    eventData.endTime = DOM.formTimeEnd.value || null;
    eventData.link = DOM.formMeetingLink.value.trim() || null;
    eventData.location = DOM.formMeetingLocation.value.trim() || null;
  }
  
  if (isEdit) {
    const idx = state.events.findIndex(ev => ev.id === state.editingEventId);
    state.events[idx] = eventData;
    showToast("Event updated successfully!", "success");
  } else {
    state.events.push(eventData);
    showToast("New Event scheduled successfully!", "success");
  }
  
  // Set currentDate to match date of submitted event
  state.currentDate = parseLocalDate(eventData.date);
  
  saveToStorage();
  closeFormModal();
  renderApp();
}


// --- Smart Reminder & Alarm Engine ---
function startAlarmTicker() {
  // Check alarms every 10 seconds
  setInterval(checkAlarms, 10000);
}

function checkAlarms() {
  const now = new Date();
  const todayStr = getLocalDateString(now);
  const nowTimeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  
  state.events.forEach(ev => {
    if (ev.completed || ev.dismissedAlarm || !ev.startTime) return;
    if (ev.date !== todayStr) return;
    
    // Calculate offset minutes for reminder
    const reminderOffsetMinutes = ev.reminder === 'none' ? -1 : parseInt(ev.reminder);
    if (reminderOffsetMinutes < 0) return;
    
    // Parse event start time
    const [evH, evM] = ev.startTime.split(':').map(Number);
    const eventTimeToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), evH, evM, 0, 0);
    
    // Check if snooze is active
    if (ev.snoozedUntil) {
      const snoozeTime = new Date(ev.snoozedUntil);
      if (now < snoozeTime) return; // Still snoozed
    }
    
    // Calculate exact target notification timestamp
    const alarmTime = new Date(eventTimeToday.getTime() - (reminderOffsetMinutes * 60 * 1000));
    
    // If we've passed the alarm trigger threshold, trigger alarm (with a 20-minute expiry safety window)
    if (now >= alarmTime && now < new Date(eventTimeToday.getTime() + (20 * 60 * 1000))) {
      triggerAlarm(ev, reminderOffsetMinutes);
    }
  });
}

function triggerAlarm(event, minutesBefore) {
  // Prevent duplicate alarm overlays
  if (state.activeAlarmEvent && state.activeAlarmEvent.id === event.id) return;
  
  state.activeAlarmEvent = event;
  
  // Setup overlay
  DOM.alarmItemTitle.textContent = event.title;
  DOM.alarmItemType.textContent = event.type;
  DOM.alarmItemType.className = `alarm-item-type type-${event.type}`;
  
  let labelTime = `Happening now!`;
  if (minutesBefore > 0) {
    labelTime = `Starts in ${minutesBefore} minutes (${event.startTime})`;
  } else if (event.type === 'task') {
    labelTime = `Due at ${event.startTime}`;
  }
  DOM.alarmItemTime.textContent = labelTime;
  
  // Connect video join links for meetings
  if (event.type === 'meeting' && event.link) {
    DOM.alarmBtnJoin.href = event.link;
    DOM.alarmBtnJoin.classList.remove('hidden');
  } else {
    DOM.alarmBtnJoin.classList.add('hidden');
  }
  
  // Reveal alarm popup and kick off audio synthesizer
  DOM.alarmAlertOverlay.classList.remove('hidden');
  startAlarmAudio();
  
  // Browser push notification fallback
  sendBrowserNotification(event, labelTime);
}

function dismissAlarm(isSnooze = false) {
  stopAlarmAudio();
  DOM.alarmAlertOverlay.classList.add('hidden');
  
  if (state.activeAlarmEvent) {
    const ev = state.events.find(e => e.id === state.activeAlarmEvent.id);
    if (ev) {
      if (isSnooze) {
        // Snooze for 5 minutes
        const snoozeDate = new Date();
        snoozeDate.setMinutes(snoozeDate.getMinutes() + 5);
        ev.snoozedUntil = snoozeDate.getTime();
        showToast(`Alarm for "${ev.title}" snoozed for 5 minutes.`, "info");
      } else {
        // Fully dismissed
        ev.dismissedAlarm = true;
        ev.snoozedUntil = null;
        showToast(`Alarm for "${ev.title}" dismissed.`, "success");
      }
      saveToStorage();
    }
  }
  state.activeAlarmEvent = null;
}


// --- Browser Desktop Notification integration ---
function checkNotificationPermissionState() {
  if (!("Notification" in window)) {
    DOM.btnToggleNotifications.style.display = 'none';
    return;
  }
  
  const status = Notification.permission;
  if (status === 'granted') {
    DOM.notificationStatusDot.className = 'status-indicator success';
    DOM.btnToggleNotifications.title = "Desktop Notifications Enabled";
  } else if (status === 'denied') {
    DOM.notificationStatusDot.className = 'status-indicator warning';
    DOM.btnToggleNotifications.title = "Desktop Notifications Blocked";
  } else {
    DOM.notificationStatusDot.className = 'status-indicator warning';
    DOM.btnToggleNotifications.title = "Enable Desktop Notifications";
  }
}

function toggleNotificationsPermission() {
  if (!("Notification" in window)) {
    showToast("Notifications not supported in this browser.", "error");
    return;
  }
  
  initAudioContext(); // user click enables audio context
  
  if (Notification.permission === 'default') {
    Notification.requestPermission().then(permission => {
      checkNotificationPermissionState();
      if (permission === 'granted') {
        showToast("Desktop notifications enabled successfully!", "success");
      } else {
        showToast("Notification permission was denied.", "error");
      }
    });
  } else if (Notification.permission === 'denied') {
    showToast("Please enable notifications in your browser site settings.", "info");
  } else {
    showToast("Notifications are already enabled.", "info");
  }
}

function sendBrowserNotification(event, description) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  
  const title = `Syncra Alarm: ${event.title}`;
  const options = {
    body: description,
    icon: 'favicon.ico', // Fallback, could load custom png or logo icon
    requireInteraction: true,
    tag: event.id
  };
  
  const notification = new Notification(title, options);
  notification.onclick = function() {
    window.focus();
    openFormModal(event.id);
    notification.close();
  };
}


// --- Backup / Restore (JSON) ---
function exportScheduleBackup() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.events, null, 2));
  const dlAnchorElem = document.createElement('a');
  
  const fileDateStr = getLocalDateString(new Date());
  dlAnchorElem.setAttribute("href", dataStr);
  dlAnchorElem.setAttribute("download", `syncra_backup_${fileDateStr}.json`);
  dlAnchorElem.click();
  showToast("Schedule backup downloaded successfully!", "success");
}

function triggerImportFileSelect() {
  DOM.importFile.click();
}

function handleImportFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const parsed = JSON.parse(evt.target.result);
      if (Array.isArray(parsed)) {
        // Sanity checks on keys
        const isValid = parsed.every(item => item.id && item.title && item.type && item.date);
        if (isValid) {
          state.events = parsed;
          saveToStorage();
          renderApp();
          showToast("Schedule restored successfully from backup!", "success");
        } else {
          showToast("Invalid backup file structure.", "error");
        }
      } else {
        showToast("Backup file must contain a list of items.", "error");
      }
    } catch (err) {
      showToast("Error parsing backup JSON file.", "error");
    }
  };
  reader.readAsText(file);
}


// --- Toast Notification Display ---
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icons = {
    success: 'check-circle-2',
    error: 'alert-circle',
    info: 'info'
  };
  
  toast.innerHTML = `
    <i data-lucide="${icons[type] || 'info'}"></i>
    <span>${message}</span>
  `;
  
  DOM.toastContainer.appendChild(toast);
  lucide.createIcons();
  
  // Animate in
  setTimeout(() => toast.classList.add('show'), 10);
  
  // Animate out and remove
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}


// --- Event Listeners Setup ---
function setupEventListeners() {
  // Sidebar Quick Add
  DOM.btnAddItem.addEventListener('click', () => openFormModal());
  
  // Navigation tabs (View switches)
  DOM.navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      const button = e.currentTarget;
      
      // Filter buttons logic vs view switches logic
      if (button.classList.contains('filter-btn')) {
        // filter clicked
        document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        state.activeFilter = button.dataset.filter;
      } else {
        // View switch clicked
        document.querySelectorAll('.nav-item:not(.filter-btn)').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        state.activeView = button.dataset.view;
      }
      renderApp();
    });
  });

  // Calendar Navigator arrows
  DOM.calPrev.addEventListener('click', () => {
    state.currentDate.setMonth(state.currentDate.getMonth() - 1);
    renderApp();
  });
  DOM.calNext.addEventListener('click', () => {
    state.currentDate.setMonth(state.currentDate.getMonth() + 1);
    renderApp();
  });

  // Mobile Bottom Navigation Tabs binding
  document.querySelectorAll('.mobile-nav-item[data-view]').forEach(item => {
    item.addEventListener('click', (e) => {
      state.activeView = e.currentTarget.dataset.view;
      renderApp();
    });
  });
  
  const mobileBtnAdd = document.getElementById('mobile-btn-add');
  if (mobileBtnAdd) {
    mobileBtnAdd.addEventListener('click', () => openFormModal());
  }
  
  const mobileBtnAgenda = document.getElementById('mobile-btn-agenda');
  if (mobileBtnAgenda) {
    mobileBtnAgenda.addEventListener('click', () => {
      const agendaCard = document.querySelector('.agenda-list-card');
      if (agendaCard) {
        agendaCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }
  
  const mobileBtnBackup = document.getElementById('mobile-btn-backup');
  if (mobileBtnBackup) {
    mobileBtnBackup.addEventListener('click', () => {
      exportScheduleBackup();
    });
  }

  // Timeline Navigation
  DOM.timelineTodayBtn.addEventListener('click', () => {
    state.currentDate = new Date();
    renderApp();
  });
  DOM.timePrev.addEventListener('click', () => {
    state.currentDate.setDate(state.currentDate.getDate() - 1);
    renderApp();
  });
  DOM.timeNext.addEventListener('click', () => {
    state.currentDate.setDate(state.currentDate.getDate() + 1);
    renderApp();
  });

  // Sort Agenda lists
  DOM.sortFilterSelect.addEventListener('change', (e) => {
    state.sortFilter = e.target.value;
    renderAgendaList();
  });

  // Overdue Banner Resolve Button Click
  DOM.btnFocusOverdue.addEventListener('click', () => {
    // Find first overdue date
    const now = new Date();
    const todayStr = getLocalDateString(now);
    const currentHrMin = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    
    const overdue = state.events.find(e => {
      if (e.completed) return false;
      if (e.date < todayStr) return true;
      if (e.date === todayStr && e.startTime && e.startTime < currentHrMin) return true;
      return false;
    });
    
    if (overdue) {
      state.currentDate = parseLocalDate(overdue.date);
      renderApp();
      // Highlight in view
      setTimeout(() => {
        const targetElement = document.querySelector(`.agenda-item-box[data-id="${overdue.id}"]`);
        if (targetElement) {
          targetElement.style.border = '1.5px solid var(--color-high)';
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => {
            targetElement.style.border = '';
          }, 3000);
        }
      }, 300);
    }
  });

  // Empty state add button
  DOM.btnEmptyAdd.addEventListener('click', () => openFormModal());

  // Notification Enable
  DOM.btnToggleNotifications.addEventListener('click', toggleNotificationsPermission);

  // Form Modal actions
  DOM.modalFormClose.addEventListener('click', closeFormModal);
  DOM.btnCancelForm.addEventListener('click', closeFormModal);
  
  DOM.tabTask.addEventListener('click', () => setFormTypeTab('task'));
  DOM.tabMeeting.addEventListener('click', () => setFormTypeTab('meeting'));
  
  DOM.btnAddSubtask.addEventListener('click', addSubtaskFromInput);
  DOM.formNewSubtask.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addSubtaskFromInput();
    }
  });

  // Modal Submit
  DOM.eventCreationForm.addEventListener('submit', handleFormSubmit);

  // Modal Delete
  DOM.btnDeleteItem.addEventListener('click', () => {
    if (state.editingEventId) {
      deleteEvent(state.editingEventId);
      closeFormModal();
    }
  });

  // Alarm overlay actions
  DOM.alarmBtnDismiss.addEventListener('click', () => dismissAlarm(false));
  DOM.alarmBtnSnooze.addEventListener('click', () => dismissAlarm(true));
  
  // Backup buttons
  DOM.btnExport.addEventListener('click', exportScheduleBackup);
  DOM.btnImport.addEventListener('click', triggerImportFileSelect);
  DOM.importFile.addEventListener('change', handleImportFileSelect);
  
  // Close modals on clicking overlay wrapper
  window.addEventListener('click', (e) => {
    if (e.target === DOM.modalEventForm) {
      closeFormModal();
    }
  });

  // Auth event listeners
  DOM.authForm.addEventListener('submit', handleAuthSubmit);
  DOM.authSwitchBtn.addEventListener('click', (e) => {
    e.preventDefault();
    toggleAuthMode();
  });
  DOM.btnLogout.addEventListener('click', handleLogout);
}


// --- Helper Functions ---
function getLocalDateString(dateObj) {
  // Returns 'YYYY-MM-DD' representing the local calendar day
  const yr = dateObj.getFullYear();
  const mo = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dy = String(dateObj.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${dy}`;
}

function parseLocalDate(dateStr) {
  if (!dateStr) return new Date();
  
  // Clean formatting - ensure YYYY-MM-DD
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const yr = parseInt(parts[0], 10);
    const mo = parseInt(parts[1], 10) - 1;
    const dy = parseInt(parts[2], 10);
    const date = new Date(yr, mo, dy);
    if (!isNaN(date.getTime())) return date;
  }
  
  // Fallback
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) return parsed;
  
  // Clean fallback to active currentDate or today
  return new Date();
}


// --- Backend API Sync and Auth Engine ---

const API_BASE = window.location.origin.includes('localhost:8000') || window.location.origin.includes('127.0.0.1')
  ? 'http://localhost:5000/api'
  : '/api';

function showAuthOverlay() {
  if (DOM.authOverlay) {
    DOM.authOverlay.classList.remove('hidden');
    DOM.authOverlay.style.display = 'flex';
  }
}

function hideAuthOverlay() {
  if (DOM.authOverlay) {
    DOM.authOverlay.classList.add('hidden');
    DOM.authOverlay.style.display = 'none';
  }
}

function updateAuthUI() {
  if (state.userToken) {
    hideAuthOverlay();
    if (DOM.sidebarUserPanel) {
      DOM.sidebarUserPanel.style.display = 'flex';
    }
    if (DOM.userEmailDisplay) {
      DOM.userEmailDisplay.textContent = state.userEmail;
    }
  } else {
    showAuthOverlay();
    if (DOM.sidebarUserPanel) {
      DOM.sidebarUserPanel.style.display = 'none';
    }
  }
}

function syncEventsFromBackend() {
  if (!state.userToken) return;
  
  fetch(`${API_BASE}/events`, {
    headers: {
      'Authorization': `Bearer ${state.userToken}`
    }
  })
  .then(res => {
    if (res.status === 401) {
      // Unauthorized, token expired
      handleLogout();
      throw new Error('Session expired');
    }
    return res.json();
  })
  .then(data => {
    state.events = data;
    // Save to local storage for offline caching
    localStorage.setItem('syncra_schedule_events', JSON.stringify(state.events));
    renderApp();
  })
  .catch(err => {
    console.error('Failed to fetch events from backend:', err);
    // If backend is unreachable, we fall back to local cached events
    const savedData = localStorage.getItem('syncra_schedule_events');
    if (savedData) {
      state.events = JSON.parse(savedData);
      renderApp();
    }
  });
}

function syncEventsToBackend() {
  if (!state.userToken) return;
  
  fetch(`${API_BASE}/events/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.userToken}`
    },
    body: JSON.stringify({ events: state.events })
  })
  .then(res => {
    if (res.status === 401) {
      handleLogout();
    }
  })
  .catch(err => console.error('Failed to sync events to backend:', err));
}

def_auth_switch = toggleAuthMode;

function handleAuthSubmit(e) {
  e.preventDefault();
  
  const email = DOM.authEmail.value.trim();
  const password = DOM.authPassword.value;
  
  if (!email || !password) return;
  
  const url = state.authMode === 'login' ? `${API_BASE}/auth/login` : `${API_BASE}/auth/signup`;
  
  DOM.authSubmitBtn.disabled = true;
  DOM.authSubmitBtn.textContent = state.authMode === 'login' ? 'Logging in...' : 'Signing up...';
  DOM.authErrorMsg.classList.add('hidden');
  
  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  })
  .then(res => {
    if (!res.ok) {
      return res.json().then(err => { throw new Error(err.message || 'Authentication failed'); });
    }
    return res.json();
  })
  .then(data => {
    state.userToken = data.token;
    state.userEmail = data.email;
    localStorage.setItem('syncra_token', data.token);
    localStorage.setItem('syncra_email', data.email);
    
    updateAuthUI();
    
    // Clear input fields
    DOM.authEmail.value = '';
    DOM.authPassword.value = '';
    
    // Load data from backend
    syncEventsFromBackend();
    
    showToast(state.authMode === 'login' ? "Logged in successfully!" : "Signed up successfully!", "success");
  })
  .catch(err => {
    console.error(err);
    DOM.authErrorMsg.textContent = err.message;
    DOM.authErrorMsg.classList.remove('hidden');
  })
  .finally(() => {
    DOM.authSubmitBtn.disabled = false;
    DOM.authSubmitBtn.textContent = state.authMode === 'login' ? 'Log In' : 'Sign Up';
  });
}

function handleLogout() {
  state.userToken = null;
  state.userEmail = null;
  localStorage.removeItem('syncra_token');
  localStorage.removeItem('syncra_email');
  
  state.events = [];
  localStorage.removeItem('syncra_schedule_events');
  
  updateAuthUI();
  renderApp();
  showToast("Logged out successfully.", "info");
}

function toggleAuthMode() {
  if (state.authMode === 'login') {
    state.authMode = 'signup';
    DOM.authTitle.textContent = "Sign Up to Syncra";
    DOM.authSubtitle.textContent = "Create an account to keep your plans synced";
    DOM.authSubmitBtn.textContent = "Sign Up";
    DOM.authSwitchPrompt.textContent = "Already have an account?";
    DOM.authSwitchBtn.textContent = "Log In";
  } else {
    state.authMode = 'login';
    DOM.authTitle.textContent = "Log In to Syncra";
    DOM.authSubtitle.textContent = "Keep your schedules synced across devices";
    DOM.authSubmitBtn.textContent = "Log In";
    DOM.authSwitchPrompt.textContent = "Don't have an account?";
    DOM.authSwitchBtn.textContent = "Sign Up";
  }
  DOM.authErrorMsg.classList.add('hidden');
}


// Start application on page load
window.addEventListener('DOMContentLoaded', init);
