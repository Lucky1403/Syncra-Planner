/* ==========================================================================
  Syncra Task Planner - Logic Engine
   ========================================================================== */

// --- Global App State ---
const state = {
  events: [],
  currentDate: new Date(),        // The active calendar / timeline date
  activeView: 'calendar',         // 'calendar' | 'timeline'
  activeFilter: 'all',            // 'all' | 'urgent'
  sortFilter: 'time',             // 'time' | 'priority' | 'status'
  searchQuery: '',
  priorityFilter: 'all',
  statusFilter: 'all',
  editingEventId: null,           // ID of the event currently being edited
  tempSubtasks: [],               // Subtasks list in current form
  activeAlarmEvent: null,         // Event triggering the current alarm
  activeAlarmReminder: null,
  userToken: localStorage.getItem('syncra_token') || null,
  userEmail: localStorage.getItem('syncra_email') || null,
  authMode: 'login'               // 'login' | 'signup'
};

const STORAGE_KEYS = {
  events: 'syncra_schedule_events',
  deletedEvents: 'syncra_deleted_event_ids',
  syncPending: 'syncra_sync_pending'
};

function getScopedStorageKey(key, email = state.userEmail) {
  const scope = email ? encodeURIComponent(email.toLowerCase()) : 'guest';
  return `${STORAGE_KEYS[key]}_${scope}`;
}

let deletedEventIds = JSON.parse(localStorage.getItem(getScopedStorageKey('deletedEvents')) || '[]');

function openSyncOutbox() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }
    const request = indexedDB.open('syncra-outbox', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('syncs');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function queueSyncPayload() {
  if (!state.userToken) return;
  const payload = {
    events: state.events.filter(event => !isSharedEvent(event)),
    deletedIds: deletedEventIds
  };
  openSyncOutbox().then(database => new Promise((resolve, reject) => {
    const transaction = database.transaction('syncs', 'readwrite');
    transaction.objectStore('syncs').put(payload, getScopedStorageKey('syncPending'));
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  })).catch(error => console.warn('Could not persist offline sync:', error));
}

function readQueuedSyncPayload() {
  return openSyncOutbox().then(database => new Promise((resolve, reject) => {
    const transaction = database.transaction('syncs', 'readonly');
    const request = transaction.objectStore('syncs').get(getScopedStorageKey('syncPending'));
    request.onsuccess = () => {
      database.close();
      resolve(request.result || null);
    };
    request.onerror = () => {
      database.close();
      reject(request.error);
    };
  })).catch(() => null);
}

function clearQueuedSyncPayload() {
  return openSyncOutbox().then(database => new Promise((resolve, reject) => {
    const transaction = database.transaction('syncs', 'readwrite');
    transaction.objectStore('syncs').delete(getScopedStorageKey('syncPending'));
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  })).catch(() => undefined);
}

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
  agendaSearch: document.getElementById('agenda-search'),
  priorityFilter: document.getElementById('priority-filter'),
  statusFilter: document.getElementById('status-filter'),

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
  btnChangePassword: document.getElementById('btn-change-password'),
  btnDeleteAccount: document.getElementById('btn-delete-account'),
  agendaItemsContainer: document.getElementById('agenda-items-container'),
  btnEmptyAdd: document.getElementById('btn-empty-add'),
  
  // Modal Event Form
  modalEventForm: document.getElementById('modal-event-form'),
  modalTitle: document.getElementById('modal-title'),
  modalFormClose: document.getElementById('modal-form-close'),
  tabTask: document.getElementById('tab-task'),
  eventCreationForm: document.getElementById('event-creation-form'),
  formItemId: document.getElementById('form-item-id'),
  formItemType: document.getElementById('form-item-type'),
  formTitle: document.getElementById('form-title'),
  formDate: document.getElementById('form-date'),
  formTimeStart: document.getElementById('form-time-start'),
  // Time picker elements
  timePickerHour: document.getElementById('time-picker-hour'),
  timePickerMinute: document.getElementById('time-picker-minute'),
  hourInput: document.getElementById('hour-input'),
  minuteInput: document.getElementById('minute-input'),
  timeSetBtn: document.getElementById('time-set-btn'),
  formPriority: document.getElementById('form-priority'),
  formCategory: document.getElementById('form-category'),
  formReminder: document.getElementById('form-reminder'),
  formAdditionalReminders: document.getElementById('form-additional-reminders'),
  formAlarmTone: document.getElementById('form-alarm-tone'),
  btnPreviewTone: document.getElementById('btn-preview-tone'),
  formDuration: document.getElementById('form-duration'),
  formRecurrence: document.getElementById('form-recurrence'),
  formRecurrenceUntil: document.getElementById('form-recurrence-until'),
  formDescription: document.getElementById('form-description'),
  formCompleted: document.getElementById('form-completed'),
  formNewSubtask: document.getElementById('form-new-subtask'),
  btnAddSubtask: document.getElementById('btn-add-subtask'),
  subtasksFormListContainer: document.getElementById('subtasks-form-list-container'),
  btnCancelForm: document.getElementById('btn-cancel-form'),
  btnDeleteItem: document.getElementById('btn-delete-item'),
  btnSubmitForm: document.getElementById('btn-submit-form'),
  
  // Dynamic form containers
  groupPriority: document.getElementById('group-priority'),
  groupSharing: document.getElementById('group-sharing'),
  formShareEmail: document.getElementById('form-share-email'),
  formSharePermission: document.getElementById('form-share-permission'),
  btnShareEvent: document.getElementById('btn-share-event'),
  eventSharesList: document.getElementById('event-shares-list'),
  groupSubtasks: document.getElementById('group-subtasks'),
  groupCompleted: document.getElementById('group-completed'),

  // Alarm Overlay
  alarmAlertOverlay: document.getElementById('alarm-alert-overlay'),
  alarmItemType: document.getElementById('alarm-item-type'),
  alarmItemTitle: document.getElementById('alarm-item-title'),
  alarmItemTime: document.getElementById('alarm-item-time'),
  alarmBtnSnooze: document.getElementById('alarm-btn-snooze'),
  alarmBtnDismiss: document.getElementById('alarm-btn-dismiss'),
  
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
  badgeUrgent: document.getElementById('badge-urgent'),
  greetingTitle: document.getElementById('greeting-title'),
  labelTimeStart: document.getElementById('label-time-start'),
  toastContainer: document.getElementById('toast-container'),
  navItems: document.querySelectorAll('.sidebar-nav .nav-item')
};

// --- Audio Synthesizer Context ---
let audioCtx = null;
let alarmAudioInterval = null;
let lastLiveDate = getLocalDateString(new Date());

function initAudioContext() {
  if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
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

const ALARM_TONES = {
  classic: [659.25, 880],
  bright: [784, 988, 1174],
  soft: [523.25, 659.25, 783.99],
  urgent: [880, 880, 1046.5, 880],
  digital: [440, 660, 880, 660],
  calm: [392, 523.25, 659.25]
};

function playAlarmChimeSequence(tone = 'classic') {
  initAudioContext();
  if (!audioCtx) return;
  
  const now = audioCtx.currentTime;
  const notes = ALARM_TONES[tone] || ALARM_TONES.classic;
  notes.forEach((frequency, index) => {
    playAlarmNote(frequency, now + index * 0.14, index === notes.length - 1 ? 0.65 : 0.4);
  });
}

function startAlarmAudio(tone = 'classic') {
  stopAlarmAudio();
  playAlarmChimeSequence(tone);
  alarmAudioInterval = setInterval(() => playAlarmChimeSequence(tone), 1800);
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
  
  // Load data first (synchronously for local, or start async for backend)
  if (state.userToken) {
    // For logged-in users, try to load local cache first, then sync from backend
    const savedData = localStorage.getItem(getScopedStorageKey('events'));
    if (savedData) {
      try {
        state.events = JSON.parse(savedData);
      } catch (error) {
        console.error('Failed to parse cached events:', error);
      }
    }
    // Then fetch fresh data from backend
    syncEventsFromBackend();
  } else {
    // Load local or mock data for logged-out users
    loadLocalOrMockData();
  }

  renderApp();

  setupEventListeners();
  startLiveClock();
  startAlarmTicker();
  checkNotificationPermissionState();
  if (state.userToken && 'Notification' in window && Notification.permission === 'granted') {
    registerPushSubscription();
  }
  
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

  window.addEventListener('online', syncEventsToBackend);
}

function saveToStorage() {
  localStorage.setItem(getScopedStorageKey('events'), JSON.stringify(state.events));
  localStorage.setItem(getScopedStorageKey('deletedEvents'), JSON.stringify(deletedEventIds));
  if (state.userToken) {
    localStorage.setItem(getScopedStorageKey('syncPending'), 'true');
    queueSyncPayload();
  }
  updateCountBadges();
  updateAnalytics();
  syncEventsToBackend(); // Push updates to MySQL backend database!
}

function isSharedEvent(event) {
  return Boolean(event && event.isShared);
}

function canEditEvent(event) {
  return !isSharedEvent(event) || event.sharePermission === 'edit';
}

function loadLocalOrMockData() {
  let savedData = localStorage.getItem(getScopedStorageKey('events'));
  if (!savedData) {
    savedData = localStorage.getItem(STORAGE_KEYS.events);
    if (savedData) localStorage.setItem(getScopedStorageKey('events'), savedData);
  }
  if (savedData) {
    try {
      state.events = JSON.parse(savedData).filter(event => event.type === 'task');
      return;
    } catch (error) {
      localStorage.removeItem(getScopedStorageKey('events'));
    }
  }
  loadMockData();
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
      type: 'task',
      date: todayStr,
      startTime: '10:00',
      priority: 'high',
      category: 'work',
      description: 'Discuss scheduling app deliverables and design framework with stakeholders.',
      reminder: '5',
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
  localStorage.setItem(getScopedStorageKey('events'), JSON.stringify(state.events));
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
    const liveDate = getLocalDateString(now);
    if (liveDate !== lastLiveDate) {
      if (getLocalDateString(state.currentDate) === lastLiveDate) {
        state.currentDate = new Date(now);
        renderApp();
      }
      lastLiveDate = liveDate;
    }
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
  const urgentCount = todaysEvents.filter(e => e.priority === 'high' && !e.completed).length;
  
  DOM.badgeAll.textContent = allCount;
  DOM.badgeTasks.textContent = tasksCount;
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
    DOM.delayAlertText.textContent = `You have ${overdueItems.length} overdue task(s) past schedule!`;
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
    row.addEventListener('dragover', (event) => event.preventDefault());
    row.addEventListener('drop', (event) => {
      event.preventDefault();
      const eventId = event.dataTransfer.getData('text/plain');
      const scheduled = state.events.find(item => item.id === eventId);
      if (!scheduled) return;
      scheduled.date = getLocalDateString(state.currentDate);
      scheduled.startTime = `${String(hr).padStart(2, '0')}:00`;
      scheduled.updatedAt = new Date().toISOString();
      saveToStorage();
      renderApp();
    });
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
    
    
    // Draw event box
    const card = document.createElement('div');
    card.className = `timeline-event-card type-${ev.type}`;
    card.draggable = true;
    card.addEventListener('dragstart', (event) => event.dataTransfer.setData('text/plain', ev.id));
    if (ev.duration) card.style.minHeight = `${Math.max(70, Math.min(360, ev.duration * 1.5))}px`;
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
      chk.disabled = !canEditEvent(ev);
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
  } else if (state.activeFilter === 'urgent') {
    items = items.filter(e => e.priority === 'high' && !e.completed);
  }

  if (state.searchQuery) {
    const query = state.searchQuery.toLowerCase();
    items = items.filter(e => [e.title, e.description, e.category, e.location]
      .filter(Boolean).some(value => value.toLowerCase().includes(query)));
  }
  if (state.priorityFilter !== 'all') {
    items = items.filter(e => e.priority === state.priorityFilter);
  }
  if (state.statusFilter === 'completed') items = items.filter(e => e.completed);
  if (state.statusFilter === 'pending') items = items.filter(e => !e.completed);
  
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
    chk.disabled = !canEditEvent(ev);
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
    
    // Task checklist stats
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
        schk.disabled = !canEditEvent(ev);
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
    editBtn.title = isSharedEvent(ev) ? `Shared event (${ev.sharePermission})` : 'Edit Event';
    editBtn.innerHTML = `<i data-lucide="${isSharedEvent(ev) ? 'users' : 'edit-3'}"></i>`;
    editBtn.addEventListener('click', () => openFormModal(ev.id));
    actionWrap.appendChild(editBtn);
    
    if (!isSharedEvent(ev)) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'action-icon-btn delete';
      deleteBtn.title = 'Delete Event';
      deleteBtn.innerHTML = `<i data-lucide="trash-2"></i>`;
      deleteBtn.addEventListener('click', () => deleteEvent(ev.id));
      actionWrap.appendChild(deleteBtn);
    }
    
    box.appendChild(actionWrap);
    DOM.agendaItemsContainer.appendChild(box);
  });
}


// --- Action Handlers ---
function toggleEventCompletion(eventId) {
  const ev = state.events.find(e => e.id === eventId);
  if (ev && canEditEvent(ev)) {
    ev.completed = !ev.completed;
    ev.updatedAt = new Date().toISOString();
    if (isSharedEvent(ev)) {
      updateSharedEvent(ev).then(updated => {
        Object.assign(ev, updated);
        saveToStorage();
        renderApp();
        showToast(`"${ev.title}" marked as ${ev.completed ? 'completed' : 'pending'}.`, "success");
      }).catch(error => showToast(error.message, 'error'));
    } else {
      saveToStorage();
      renderApp();
      showToast(`"${ev.title}" marked as ${ev.completed ? 'completed' : 'pending'}.`, "success");
    }
  } else if (ev) {
    showToast('This shared event is view-only.', 'info');
  }
}

function toggleSubtaskCompletion(taskId, subtaskId) {
  const ev = state.events.find(e => e.id === taskId);
  if (ev && ev.subtasks && canEditEvent(ev)) {
    const sub = ev.subtasks.find(s => s.id === subtaskId);
    if (sub) {
      sub.completed = !sub.completed;
      ev.updatedAt = new Date().toISOString();
      
      // Auto complete parent task if all subtasks are finished
      const allDone = ev.subtasks.every(s => s.completed);
      if (allDone && !ev.completed) {
        ev.completed = true;
        showToast(`All subtasks done! "${ev.title}" completed.`, "success");
      } else if (!allDone && ev.completed) {
        ev.completed = false;
      }
      
      if (isSharedEvent(ev)) {
        updateSharedEvent(ev).then(updated => {
          Object.assign(ev, updated);
          saveToStorage();
          renderApp();
        }).catch(error => showToast(error.message, 'error'));
      } else {
        saveToStorage();
        renderApp();
      }
    }
  } else if (ev) {
    showToast('This shared event is view-only.', 'info');
  }
}

function deleteEvent(eventId) {
  const index = state.events.findIndex(e => e.id === eventId);
  if (index !== -1) {
    const title = state.events[index].title;
    state.events.splice(index, 1);
    if (state.userToken && !deletedEventIds.some(deleted => (typeof deleted === 'string' ? deleted : deleted.id) === eventId)) {
      deletedEventIds.push({ id: eventId, updatedAt: new Date().toISOString() });
    }
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
    
    DOM.modalTitle.textContent = "Edit Task";
    DOM.formItemId.value = ev.id;
    DOM.formItemType.value = ev.type;
    DOM.formTitle.value = ev.title;
    DOM.formDate.value = ev.date;
    DOM.formTimeStart.value = ev.startTime || '';
    DOM.formDuration.value = ev.duration || '';
    DOM.formRecurrence.value = 'none';
    DOM.formRecurrenceUntil.value = '';
    DOM.formPriority.value = ev.priority;
    DOM.formCategory.value = ev.category || 'work';
    DOM.formReminder.value = ev.reminder;
    Array.from(DOM.formAdditionalReminders.querySelectorAll('input')).forEach(input => {
      input.checked = (ev.reminders || []).includes(input.value);
    });
    DOM.formAlarmTone.value = ev.alarmTone || 'classic';
    DOM.formDescription.value = ev.description || '';
    
    // Populate tab active classes
    if (ev.type === 'task') {
      setFormTypeTab('task');
      state.tempSubtasks = ev.subtasks ? [...ev.subtasks] : [];
      renderFormSubtasks();
    }
    
    DOM.btnDeleteItem.classList.remove('hidden');
    if (isSharedEvent(ev)) {
      DOM.groupSharing.classList.add('hidden');
      DOM.btnDeleteItem.classList.add('hidden');
    } else {
      DOM.groupSharing.classList.remove('hidden');
      loadEventShares(ev.id);
    }
    
    // Show completion checkbox in edit mode
    DOM.groupCompleted.classList.remove('hidden');
    DOM.groupCompleted.style.display = 'flex';
    DOM.formCompleted.checked = ev.completed;
    const canEdit = canEditEvent(ev);
    [DOM.formTitle, DOM.formDate, DOM.formTimeStart, DOM.formPriority,
      DOM.formCategory, DOM.formReminder, DOM.formAlarmTone,
      DOM.formDuration, DOM.formDescription,
      DOM.formCompleted, DOM.tabTask, DOM.btnAddSubtask].forEach(control => {
      if (control) control.disabled = !canEdit;
    });
    DOM.formAdditionalReminders.querySelectorAll('input').forEach(input => { input.disabled = !canEdit; });
    DOM.btnSubmitForm.classList.toggle('hidden', !canEdit);
    if (!canEdit) showToast('This shared event is view-only.', 'info');
  } else {
    // Create mode
    DOM.modalTitle.textContent = "Create Task";
    DOM.formItemId.value = '';
    DOM.formDate.value = getLocalDateString(state.currentDate);
    DOM.btnDeleteItem.classList.add('hidden');
    DOM.groupSharing.classList.add('hidden');
    
    // Hide completion checkbox in create mode
    DOM.groupCompleted.classList.add('hidden');
    DOM.groupCompleted.style.display = 'none';
    DOM.formCompleted.checked = false;
    DOM.btnSubmitForm.classList.remove('hidden');
    [DOM.formTitle, DOM.formDate, DOM.formTimeStart, DOM.formPriority,
      DOM.formCategory, DOM.formReminder, DOM.formAlarmTone,
      DOM.formDuration, DOM.formDescription,
      DOM.formCompleted, DOM.tabTask, DOM.btnAddSubtask].forEach(control => {
      if (control) control.disabled = false;
    });
    DOM.formAlarmTone.value = 'classic';
    DOM.formAdditionalReminders.querySelectorAll('input').forEach(input => { input.checked = false; });
    
    // Default values
    setFormTypeTab('task');
  }
  
  // Initialize time picker with current value or now time
  initializeTimePicker(DOM.formTimeStart.value);
  
  // Re-bind Lucide icons in modal
  lucide.createIcons();
}

function closeFormModal() {
  DOM.modalEventForm.classList.add('hidden');
  state.editingEventId = null;
}

function setFormTypeTab(type) {
  DOM.formItemType.value = 'task';
  DOM.tabTask.classList.add('active');
  DOM.groupPriority.style.display = 'flex';
  DOM.groupSubtasks.style.display = 'flex';
  DOM.labelTimeStart.textContent = "Due Time";
}

// Time Picker Functions
function updateTimePickerFromSlider() {
  const hours = parseInt(DOM.timePickerHour.value) || 0;
  const minutes = parseInt(DOM.timePickerMinute.value) || 0;
  
  // Update input fields
  DOM.hourInput.value = String(hours).padStart(2, '0');
  DOM.minuteInput.value = String(minutes).padStart(2, '0');
  
  // Visual update - position the slider thumbs based on time
  const hourPercent = (hours / 23) * 100;
  const minutePercent = (minutes / 59) * 100;
  
  DOM.timePickerHour.style.setProperty('--value', hourPercent);
  DOM.timePickerMinute.style.setProperty('--value', minutePercent);
}

function updateTimePickerFromInput() {
  let hours = parseInt(DOM.hourInput.value) || 0;
  let minutes = parseInt(DOM.minuteInput.value) || 0;
  
  // Validate and constrain
  hours = Math.max(0, Math.min(23, hours));
  minutes = Math.max(0, Math.min(59, minutes));
  
  // Update inputs with validated values
  DOM.hourInput.value = String(hours).padStart(2, '0');
  DOM.minuteInput.value = String(minutes).padStart(2, '0');
  
  // Update sliders
  DOM.timePickerHour.value = hours;
  DOM.timePickerMinute.value = minutes;
  
  updateTimePickerFromSlider();
}

function applyTimePickerValue() {
  const hours = String(DOM.hourInput.value).padStart(2, '0');
  const minutes = String(DOM.minuteInput.value).padStart(2, '0');
  const timeValue = `${hours}:${minutes}`;
  
  DOM.formTimeStart.value = timeValue;
}

function initializeTimePicker(timeString = '') {
  if (timeString) {
    const [hours, minutes] = timeString.split(':').map(v => parseInt(v) || 0);
    DOM.timePickerHour.value = hours;
    DOM.timePickerMinute.value = minutes;
    DOM.hourInput.value = String(hours).padStart(2, '0');
    DOM.minuteInput.value = String(minutes).padStart(2, '0');
  } else {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    DOM.timePickerHour.value = hours;
    DOM.timePickerMinute.value = minutes;
    DOM.hourInput.value = String(hours).padStart(2, '0');
    DOM.minuteInput.value = String(minutes).padStart(2, '0');
  }
  updateTimePickerFromSlider();
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
  const editingEvent = state.editingEventId
    ? state.events.find(event => event.id === state.editingEventId)
    : null;
  const canEdit = canEditEvent(editingEvent);
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
    li.querySelector('.subtask-form-checkbox').disabled = !canEdit;
    li.querySelector('.subtask-delete-btn').disabled = !canEdit;
    
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
  
  return isValid;
}

function expandRecurringEvent(eventData) {
  const frequency = DOM.formRecurrence.value;
  const until = DOM.formRecurrenceUntil.value;
  if (frequency === 'none' || !until || state.editingEventId) return [eventData];

  const events = [eventData];
  const cursor = parseLocalDate(eventData.date);
  const endDate = parseLocalDate(until);
  let occurrence = 1;
  while (cursor < endDate && occurrence < 365) {
    if (frequency === 'daily') cursor.setDate(cursor.getDate() + 1);
    else if (frequency === 'weekly') cursor.setDate(cursor.getDate() + 7);
    else cursor.setMonth(cursor.getMonth() + 1);
    if (cursor > endDate) break;
    events.push({ ...eventData, id: `${eventData.id}-${occurrence}`, date: getLocalDateString(cursor), recurrence: 'none' });
    occurrence++;
  }
  return events;
}

// Form submit action
function handleFormSubmit(e) {
  e.preventDefault();
  
  if (!validateForm()) {
    showToast("Please fix the validation errors in the form.", "error");
    return;
  }

  if (DOM.formReminder.value !== 'none' && !DOM.formTimeStart.value) {
    showToast("Set a time before adding a reminder.", "error");
    DOM.formTimeStart.parentElement.classList.add('invalid');
    return;
  }
  if (DOM.formRecurrence.value !== 'none' && (!DOM.formRecurrenceUntil.value || DOM.formRecurrenceUntil.value < DOM.formDate.value)) {
    showToast("Choose a valid repeat end date.", "error");
    DOM.formRecurrenceUntil.parentElement.classList.add('invalid');
    return;
  }
  
  const isEdit = !!state.editingEventId;
  const itemType = 'task';
  
  const eventData = {
    id: isEdit ? state.editingEventId : 'event-' + Date.now(),
    type: itemType,
    title: DOM.formTitle.value.trim(),
    date: DOM.formDate.value,
    startTime: DOM.formTimeStart.value || null,
    duration: DOM.formDuration.value ? Number(DOM.formDuration.value) : null,
    priority: itemType === 'task' ? DOM.formPriority.value : 'medium',
    category: DOM.formCategory.value,
    reminder: DOM.formReminder.value,
    reminders: Array.from(new Set([DOM.formReminder.value, ...Array.from(DOM.formAdditionalReminders.querySelectorAll('input:checked')).map(input => input.value)]))
      .filter(reminder => reminder !== 'none'),
    alarmTone: DOM.formAlarmTone.value,
    recurrence: DOM.formRecurrence.value,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    description: DOM.formDescription.value.trim(),
    updatedAt: new Date().toISOString(),
    completed: isEdit ? DOM.formCompleted.checked : false,
    dismissedAlarm: isEdit ? state.events.find(ev => ev.id === state.editingEventId).dismissedAlarm : false
  };

  if (eventData.reminder !== 'none') {
    requestNotificationPermissionForReminder();
    try {
      initAudioContext();
    } catch (error) {
      console.warn('Audio reminders are unavailable:', error);
    }
  }
  
  eventData.subtasks = [...state.tempSubtasks];

  const existingEvent = isEdit ? state.events.find(ev => ev.id === state.editingEventId) : null;
  if (existingEvent && isSharedEvent(existingEvent)) {
    if (!canEditEvent(existingEvent)) return;
    updateSharedEvent(eventData).then(updated => {
      Object.assign(existingEvent, updated);
      saveToStorage();
      closeFormModal();
      renderApp();
      showToast('Shared event updated successfully!', 'success');
    }).catch(error => showToast(error.message, 'error'));
    return;
  }
  
  if (isEdit) {
    const idx = state.events.findIndex(ev => ev.id === state.editingEventId);
    state.events[idx] = eventData;
    showToast("Event updated successfully!", "success");
  } else {
    state.events.push(...expandRecurringEvent(eventData));
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
  checkAlarms();
  setInterval(checkAlarms, 10000);
  window.addEventListener('focus', checkAlarms);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkAlarms();
  });
}

function checkAlarms() {
  const now = new Date();
  const todayStr = getLocalDateString(now);
  const nowTimeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  
  state.events.forEach(ev => {
    if (ev.completed || !ev.startTime) return;
    // If event alarm is dismissed, skip checking it
    if (ev.dismissedAlarm === true) return;
    if (ev.date !== todayStr) return;
    
    const reminderOffsets = ev.reminders && ev.reminders.length > 0
      ? ev.reminders.map(Number)
      : (ev.reminder === 'none' ? [] : [parseInt(ev.reminder, 10)]);
    if (reminderOffsets.length === 0) return;
    
    // Parse event start time
    const [evH, evM] = ev.startTime.split(':').map(Number);
    const eventTimeToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), evH, evM, 0, 0);
    
    // Check if snooze is active
    if (ev.snoozedUntil) {
      const snoozeTime = new Date(ev.snoozedUntil);
      if (now < snoozeTime) return; // Still snoozed
    }
    
    reminderOffsets.forEach(reminderOffsetMinutes => {
      if ((ev.triggeredReminders || []).includes(String(reminderOffsetMinutes))) return;
      const alarmTime = new Date(eventTimeToday.getTime() - (reminderOffsetMinutes * 60 * 1000));
      if (now >= alarmTime && now < new Date(eventTimeToday.getTime() + (20 * 60 * 1000))) {
        triggerAlarm(ev, reminderOffsetMinutes);
      }
    });
  });
}

function triggerAlarm(event, minutesBefore) {
  // Prevent duplicate alarm overlays
  if (state.activeAlarmEvent && state.activeAlarmEvent.id === event.id) return;
  
  state.activeAlarmEvent = event;
  state.activeAlarmReminder = minutesBefore;
  
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
  
  
  // Show the visual and browser alarms independently so audio restrictions cannot suppress notifications.
  DOM.alarmAlertOverlay.classList.remove('hidden');
  try {
    sendBrowserNotification(event, labelTime).catch(error => {
      console.warn('Browser notification could not be shown:', error);
    });
  } catch (error) {
    console.warn('Browser notification could not be shown:', error);
  }
  try {
    startAlarmAudio(event.alarmTone || 'classic');
  } catch (error) {
    console.warn('Audio alarm could not start:', error);
  }
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
        // Fully dismissed - mark this reminder as triggered so it won't repeat
        ev.triggeredReminders = [...new Set([...(ev.triggeredReminders || []), String(state.activeAlarmReminder)])];
        // Mark the entire event alarm as dismissed to prevent future alarms today
        ev.dismissedAlarm = true;
        ev.snoozedUntil = null;
        showToast(`Alarm for "${ev.title}" dismissed.`, "success");
      }
      saveToStorage();
    }
  }
  state.activeAlarmEvent = null;
  state.activeAlarmReminder = null;
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

function requestNotificationPermissionForReminder() {
  if (!("Notification" in window) || Notification.permission !== 'default') return;
  Notification.requestPermission().then(permission => {
    checkNotificationPermissionState();
    if (permission !== 'granted') {
      showToast("Notifications are blocked. Enable them in browser settings to receive reminders.", "info");
    } else {
      registerPushSubscription();
    }
  }).catch(error => console.warn('Notification permission request failed:', error));
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
        registerPushSubscription();
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

async function sendBrowserNotification(event, description) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  
  const title = `Syncra Alarm: ${event.title}`;
  const options = {
    body: description,
    icon: 'icon.svg',
    requireInteraction: true,
    tag: event.id,
    data: { url: './index.html', eventId: event.id }
  };

  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, options);
    return;
  }
  
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
        const isValid = parsed.every(item => {
          if (!item || typeof item !== 'object' || !item.id || !item.title || !item.date) return false;
          if (item.type !== 'task' || typeof item.title !== 'string' || item.title.length > 200) return false;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) return false;
          if (!Array.isArray(item.subtasks)) return false;
          return item.subtasks.every(subtask => subtask && typeof subtask.id === 'string'
            && typeof subtask.text === 'string' && subtask.text.trim() && subtask.text.length <= 250);
        });
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
  DOM.agendaSearch.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.trim();
    renderAgendaList();
  });
  DOM.priorityFilter.addEventListener('change', (e) => {
    state.priorityFilter = e.target.value;
    renderAgendaList();
  });
  DOM.statusFilter.addEventListener('change', (e) => {
    state.statusFilter = e.target.value;
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
  DOM.formAlarmTone.addEventListener('change', () => playAlarmChimeSequence(DOM.formAlarmTone.value));
  DOM.btnPreviewTone.addEventListener('click', () => playAlarmChimeSequence(DOM.formAlarmTone.value));
  
  // Time Picker Event Listeners
  DOM.timePickerHour.addEventListener('input', updateTimePickerFromSlider);
  DOM.timePickerMinute.addEventListener('input', updateTimePickerFromSlider);
  DOM.hourInput.addEventListener('input', updateTimePickerFromInput);
  DOM.minuteInput.addEventListener('input', updateTimePickerFromInput);
  DOM.timeSetBtn.addEventListener('click', applyTimePickerValue);
  
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
  DOM.btnChangePassword.addEventListener('click', changePassword);
  DOM.btnDeleteAccount.addEventListener('click', deleteAccount);
  DOM.btnShareEvent.addEventListener('click', shareEvent);
}

function loadEventShares(eventId) {
  DOM.eventSharesList.innerHTML = '';
  fetch(`${API_BASE}/events/${encodeURIComponent(eventId)}/shares`, {
    headers: { 'Authorization': `Bearer ${state.userToken}` }
  }).then(response => response.ok ? response.json() : [])
    .then(shares => shares.forEach(share => {
      const item = document.createElement('li');
      item.textContent = `${share.email} (${share.permission})`;
      DOM.eventSharesList.appendChild(item);
    })).catch(() => undefined);
}

function shareEvent() {
  if (!state.editingEventId || !DOM.formShareEmail.value.trim()) return;
  fetch(`${API_BASE}/events/${encodeURIComponent(state.editingEventId)}/shares`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.userToken}` },
    body: JSON.stringify({ email: DOM.formShareEmail.value.trim(), permission: DOM.formSharePermission.value })
  }).then(response => response.json().then(data => ({ ok: response.ok, data })))
    .then(result => {
      showToast(result.data.message, result.ok ? 'success' : 'error');
      if (result.ok) {
        DOM.formShareEmail.value = '';
        loadEventShares(state.editingEventId);
      }
    }).catch(() => showToast('Event sharing failed.', 'error'));
}

function updateSharedEvent(event) {
  return fetch(`${API_BASE}/shared/events/${encodeURIComponent(event.id)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.userToken}`
    },
    body: JSON.stringify(event)
  }).then(response => response.json().then(data => {
    if (!response.ok) throw new Error(data.message || 'Shared event update failed.');
    return { ...data, isShared: true };
  }));
}

function changePassword() {
  const currentPassword = window.prompt('Enter your current password:');
  const newPassword = window.prompt('Enter a new password (at least 8 characters):');
  if (!currentPassword || !newPassword) return;
  fetch(`${API_BASE}/account/password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.userToken}` },
    body: JSON.stringify({ currentPassword, newPassword })
  }).then(response => response.json().then(data => ({ ok: response.ok, data })))
    .then(result => showToast(result.data.message, result.ok ? 'success' : 'error'))
    .catch(() => showToast('Password change failed.', 'error'));
}

function deleteAccount() {
  if (!window.confirm('Delete your account and all owned events permanently?')) return;
  fetch(`${API_BASE}/account`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${state.userToken}` }
  }).then(response => {
    if (!response.ok) throw new Error('Account deletion failed');
    handleLogout();
    showToast('Account deleted successfully.', 'success');
  }).catch(() => showToast('Account deletion failed.', 'error'));
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

function decodeBase64Url(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), character => character.charCodeAt(0));
}

function registerPushSubscription() {
  if (!state.userToken || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
  Promise.all([
    fetch(`${API_BASE}/push/config`).then(response => response.ok ? response.json() : null),
    navigator.serviceWorker.ready
  ]).then(([config, registration]) => {
    if (!config || !config.publicKey) return;
    return registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeBase64Url(config.publicKey)
    }).then(subscription => fetch(`${API_BASE}/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.userToken}`
      },
      body: JSON.stringify(subscription.toJSON())
    }));
  }).catch(error => console.warn('Push subscription could not be registered:', error));
}

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
    const pending = localStorage.getItem(getScopedStorageKey('syncPending')) === 'true';
    if (pending) {
      const savedData = localStorage.getItem(getScopedStorageKey('events'));
      if (savedData) {
        try {
          state.events = JSON.parse(savedData);
        } catch (error) {
          console.error('Failed to parse pending local schedule:', error);
        }
      }
      syncEventsToBackend().then(() => {
        if (localStorage.getItem(getScopedStorageKey('syncPending')) !== 'true') {
          syncEventsFromBackend();
        }
      });
      return;
    }
    const ownEvents = Array.isArray(data) ? data : [];
    return fetch(`${API_BASE}/shared/events`, {
      headers: { 'Authorization': `Bearer ${state.userToken}` }
    }).then(sharedResponse => sharedResponse.ok ? sharedResponse.json() : [])
      .then(sharedEvents => {
        state.events = ownEvents.concat((Array.isArray(sharedEvents) ? sharedEvents : []).map(event => ({
          ...event,
          isShared: true
        })));
        localStorage.setItem(getScopedStorageKey('events'), JSON.stringify(state.events));
        renderApp();
      });
  })
  .catch(err => {
    console.error('Failed to fetch events from backend:', err);
    // If backend is unreachable, we fall back to local cached events
    const savedData = localStorage.getItem(getScopedStorageKey('events'));
    if (savedData) {
      try {
        state.events = JSON.parse(savedData);
        renderApp();
      } catch (parseError) {
        console.error('Failed to parse local schedule:', parseError);
      }
    }
  });
}

function syncEventsToBackend() {
  if (!state.userToken || !navigator.onLine) return Promise.resolve();

  return readQueuedSyncPayload().then(queuedPayload => {
    const payload = queuedPayload || {
      events: state.events.filter(event => !isSharedEvent(event)),
      deletedIds: deletedEventIds
    };
    return fetch(`${API_BASE}/events/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.userToken}`
    },
      body: JSON.stringify(payload)
    });
  })
  .then(res => {
    if (res.status === 401) {
      handleLogout();
      return;
    }
    if (!res.ok) throw new Error(`Sync failed with status ${res.status}`);
    return res.json();
  })
  .then(data => {
    if (data && Array.isArray(data.events)) {
      const sharedEvents = state.events.filter(event => isSharedEvent(event));
      state.events = data.events.concat(sharedEvents);
      localStorage.setItem(getScopedStorageKey('events'), JSON.stringify(state.events));
    }
    deletedEventIds = [];
    localStorage.setItem(getScopedStorageKey('deletedEvents'), '[]');
    localStorage.removeItem(getScopedStorageKey('syncPending'));
    return clearQueuedSyncPayload();
  })
  .catch(err => {
    localStorage.setItem(getScopedStorageKey('syncPending'), 'true');
    console.error('Failed to sync events to backend:', err);
  });
}

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
    deletedEventIds = JSON.parse(localStorage.getItem(getScopedStorageKey('deletedEvents')) || '[]');
    
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
  deletedEventIds = [];
  
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
