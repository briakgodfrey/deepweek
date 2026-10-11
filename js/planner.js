// Planner Data Structure
// Bump SCHEMA_VERSION whenever the shape of plannerData changes, and add a
// step to migratePlannerData() so existing users' data is upgraded on load.
const SCHEMA_VERSION = 2;
const STORAGE_KEY = 'plannerData';
const VIEW_KEY = 'plannerView';
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_ABBREVIATIONS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Date helpers. Days store their date as a local "YYYY-MM-DD" string.
function toISODate(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

function parseISODate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getMonth() === month - 1 ? date : null;
}

function addDays(date, count) {
    const result = new Date(date);
    result.setDate(result.getDate() + count);
    return result;
}

function formatDayName(date) {
    return `${DAY_NAMES[date.getDay()]}, ${date.toLocaleString('default', { month: 'short' })} ${date.getDate()}`;
}

function buildWeekDays(startDate) {
    const days = [];
    for (let i = 0; i < 7; i++) {
        const date = addDays(startDate, i);
        days.push({
            id: generateId('day'),
            date: toISODate(date),
            name: formatDayName(date),
            workSchedule: 'Edit Schedule',
            isOffDay: false,
            notes: '',
            sections: []
        });
    }
    return days;
}

let plannerData = {
    schemaVersion: SCHEMA_VERSION,
    weeks: [
        {
            id: 'week1',
            name: 'This Week',
            days: []
        }
    ],
    currentWeek: 'week1'
};

// Initialize with current week if no data exists
function initializeDefaultWeek() {
    const week = plannerData.weeks[0];
    if (week.days.length === 0) {
        // Start from today
        week.days = buildWeekDays(new Date());
    }
}

let nextId = 1000;

// Toast Notifications
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠'
    };
    
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.success}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
    `;
    
    container.appendChild(toast);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => {
            container.removeChild(toast);
        }, 300);
    }, 3000);
}

// Utility Functions
function generateId(prefix) {
    // Use timestamp + random for truly unique IDs
    return `${prefix}${Date.now()}${Math.random().toString(36).substr(2, 5)}`;
}

// Escape user-provided text before interpolating it into HTML
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Storage access can throw (quota exceeded, private mode, blocked site data)
function storageGet(key) {
    try {
        return localStorage.getItem(key);
    } catch (error) {
        console.error(`Could not read "${key}" from storage:`, error);
        return null;
    }
}

function storageSet(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (error) {
        console.error(`Could not write "${key}" to storage:`, error);
        return false;
    }
}

let saveFailing = false;

function saveData() {
    const ok = storageSet(STORAGE_KEY, JSON.stringify(plannerData));
    if (!ok && !saveFailing) {
        showToast('Could not save — browser storage is full or blocked. Export a backup (Ctrl+S).', 'error');
    } else if (ok && saveFailing) {
        showToast('Saving works again', 'success');
    }
    saveFailing = !ok;
    return ok;
}

// Upgrade older data shapes to the current schema
function migratePlannerData(raw) {
    const version = Number.isInteger(raw.schemaVersion) ? raw.schemaVersion : 0;
    if (version > SCHEMA_VERSION) {
        throw new Error('This data was created by a newer version of Deepweek');
    }
    // v0 -> v1: schemaVersion introduced; no structural changes.
    // v1 -> v2: days get a real date (inferred from names like "Monday, Oct 11"),
    // tasks get subtasks (defaulted in normalizePlannerData).
    const data = { ...raw, schemaVersion: SCHEMA_VERSION };
    if (version < 2) {
        data.weeks = raw.weeks.map(week =>
            week && typeof week === 'object' && Array.isArray(week.days)
                ? { ...week, days: inferWeekDates(week) }
                : week
        );
    }
    return data;
}

// IDs from generateId() start with a millisecond timestamp, which tells us
// roughly when a day was created and so which year "Oct 11" refers to.
function timestampFromId(id) {
    const match = /^[a-z]+(\d{13})/.exec(typeof id === 'string' ? id : '');
    return match ? new Date(Number(match[1])) : null;
}

function inferDateFromName(name, reference) {
    const match = /([A-Za-z]{3,})\.?\s+(\d{1,2})\b/.exec(typeof name === 'string' ? name : '');
    if (!match) return null;
    const month = MONTH_ABBREVIATIONS.indexOf(match[1].slice(0, 3).toLowerCase());
    if (month < 0) return null;
    const dayOfMonth = Number(match[2]);

    // Pick the year that puts the date closest to when the day was created
    let best = null;
    for (const year of [reference.getFullYear() - 1, reference.getFullYear(), reference.getFullYear() + 1]) {
        const candidate = new Date(year, month, dayOfMonth);
        if (candidate.getMonth() !== month) continue;
        if (!best || Math.abs(candidate - reference) < Math.abs(best - reference)) best = candidate;
    }
    return best;
}

function inferWeekDates(week) {
    const days = week.days.map(day => (day && typeof day === 'object' ? day : {}));
    const dates = days.map(day => {
        if (parseISODate(day.date)) return parseISODate(day.date);
        const reference = timestampFromId(day.id) || timestampFromId(week.id) || new Date();
        return inferDateFromName(day.name, reference);
    });

    // Days in a week are consecutive, so fill any gaps from the first known date
    const anchor = dates.findIndex(Boolean);
    return days.map((day, i) => {
        const date = dates[i] || (anchor >= 0 ? addDays(dates[anchor], i - anchor) : null);
        return { ...day, date: date ? toISODate(date) : '' };
    });
}

// Validate untrusted data (from storage or an imported file) and coerce it
// into the expected shape. Throws if it isn't recognisable planner data.
function normalizePlannerData(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.weeks)) {
        throw new Error('Invalid planner data format');
    }

    const data = migratePlannerData(raw);
    const seenIds = new Set();
    const asObject = value => (value && typeof value === 'object' ? value : {});
    const asArray = value => (Array.isArray(value) ? value : []);
    const asText = value => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');

    // IDs are interpolated into inline handlers, so only allow safe characters
    // and regenerate any that are missing, malformed, or duplicated.
    const cleanId = (id, prefix) => {
        const valid = typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);
        const result = valid && !seenIds.has(id) ? id : generateId(prefix);
        seenIds.add(result);
        return result;
    };

    const weeks = data.weeks.map(asObject).map(week => ({
        id: cleanId(week.id, 'week'),
        name: asText(week.name) || 'Untitled Week',
        days: asArray(week.days).map(asObject).map(day => ({
            id: cleanId(day.id, 'day'),
            date: parseISODate(day.date) ? day.date : '',
            name: asText(day.name),
            workSchedule: asText(day.workSchedule) || 'Edit Schedule',
            isOffDay: day.isOffDay === true,
            notes: asText(day.notes),
            sections: asArray(day.sections).map(asObject).map(section => ({
                id: cleanId(section.id, 'section'),
                name: asText(section.name),
                tasks: asArray(section.tasks).map(asObject).map(task => ({
                    id: cleanId(task.id, 'task'),
                    text: asText(task.text),
                    time: asText(task.time),
                    estimate: asText(task.estimate),
                    completed: task.completed === true,
                    subtasks: asArray(task.subtasks).map(asObject).map(subtask => ({
                        id: cleanId(subtask.id, 'subtask'),
                        text: asText(subtask.text),
                        completed: subtask.completed === true
                    }))
                }))
            }))
        }))
    }));

    if (weeks.length === 0) {
        throw new Error('Planner data contains no weeks');
    }

    const currentWeek = weeks.some(w => w.id === data.currentWeek) ? data.currentWeek : weeks[0].id;

    return { schemaVersion: SCHEMA_VERSION, weeks, currentWeek };
}

function loadData() {
    const saved = storageGet(STORAGE_KEY);
    if (!saved) return;

    try {
        const normalized = normalizePlannerData(JSON.parse(saved));
        plannerData = normalized;
        if (JSON.stringify(normalized) !== saved) {
            saveData();
        }
    } catch (error) {
        // Keep the unreadable data so it can be recovered, then start fresh
        console.error('Saved planner data is unreadable:', error);
        const backupKey = `${STORAGE_KEY}.corrupt-${Date.now()}`;
        const backedUp = storageSet(backupKey, saved);
        showToast(
            backedUp
                ? `Saved data couldn't be read. A copy was kept as "${backupKey}".`
                : 'Saved data couldn\'t be read and could not be backed up.',
            'error'
        );
    }
}

// Week Management
function renderWeekSelector() {
    const selector = document.getElementById('weekSelector');
    selector.innerHTML = '';
    
    plannerData.weeks.forEach(week => {
        const weekItem = document.createElement('div');
        weekItem.className = 'week-item' + (week.id === plannerData.currentWeek ? ' active' : '');
        
        const btn = document.createElement('button');
        btn.className = 'week-btn';
        btn.textContent = week.name;
        btn.onclick = () => switchWeek(week.id);
        
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'week-actions';
        
        // Edit button
        const editBtn = document.createElement('button');
        editBtn.className = 'week-action-btn';
        editBtn.textContent = '✎';
        editBtn.title = 'Edit week name';
        editBtn.onclick = (e) => {
            e.stopPropagation();
            editWeekName(week.id);
        };
        
        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'week-action-btn delete';
        deleteBtn.textContent = '×';
        deleteBtn.title = 'Delete week';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteWeek(week.id);
        };
        
        actionsDiv.appendChild(editBtn);
        actionsDiv.appendChild(deleteBtn);
        
        weekItem.appendChild(btn);
        weekItem.appendChild(actionsDiv);
        selector.appendChild(weekItem);
    });
}

function switchWeek(weekId) {
    plannerData.currentWeek = weekId;
    const week = plannerData.weeks.find(w => w.id === weekId);
    document.getElementById('weekTitle').textContent = week.name;
    selectedDayId = null;
    monthCursor = null;
    saveData();
    renderWeekSelector();
    renderDays();
    updateProgress();
}

function addNewWeek() {
    document.getElementById('weekModal').classList.add('active');
}

function closeModal() {
    document.getElementById('weekModal').classList.remove('active');
}

function createNewWeek() {
    const name = document.getElementById('weekNameInput').value;
    const startDate = document.getElementById('weekStartDate').value;
    
    if (!name) {
        showToast('Please enter a week name', 'warning');
        return;
    }

    const newWeek = {
        id: generateId('week'),
        name: name,
        days: []
    };

    // Parse date string as local time, not UTC
    const date = parseISODate(startDate) || new Date();
    newWeek.days = buildWeekDays(date);

    plannerData.weeks.push(newWeek);
    plannerData.currentWeek = newWeek.id;
    selectedDayId = null;
    if (currentView === 'month') monthCursor = new Date(date.getFullYear(), date.getMonth(), 1);
    saveData();
    
    document.getElementById('weekNameInput').value = '';
    document.getElementById('weekStartDate').value = '';
    closeModal();
    
    renderWeekSelector();
    renderDays();
    updateProgress();
    
    showToast(`Week "${name}" created successfully`, 'success');
}

let currentEditingWeekId = null;

function editWeekName(weekId) {
    currentEditingWeekId = weekId;
    const week = plannerData.weeks.find(w => w.id === weekId);
    
    document.getElementById('editWeekInput').value = week.name;
    document.getElementById('editWeekModal').classList.add('active');
    
    setTimeout(() => {
        document.getElementById('editWeekInput').focus();
        document.getElementById('editWeekInput').select();
    }, 100);
}

function closeEditWeekModal() {
    document.getElementById('editWeekModal').classList.remove('active');
    currentEditingWeekId = null;
}

function saveWeekName() {
    if (!currentEditingWeekId) return;
    
    const newName = document.getElementById('editWeekInput').value.trim();
    if (!newName) {
        showToast('Please enter a week name', 'warning');
        return;
    }
    
    const week = plannerData.weeks.find(w => w.id === currentEditingWeekId);
    week.name = newName;
    saveData();
    
    if (currentEditingWeekId === plannerData.currentWeek) {
        document.getElementById('weekTitle').textContent = week.name;
    }
    
    closeEditWeekModal();
    renderWeekSelector();
    showToast('Week renamed successfully', 'success');
}

function deleteWeek(weekId) {
    // Don't allow deleting if it's the only week
    if (plannerData.weeks.length === 1) {
        showToast('Cannot delete the only week', 'warning');
        return;
    }
    
    const week = plannerData.weeks.find(w => w.id === weekId);
    const weekIdToDelete = weekId;
    
    showConfirmModal(
        'Delete Week',
        `Delete "${week.name}"? This cannot be undone.`,
        () => {
            // Double-check we still have more than one week
            if (plannerData.weeks.length <= 1) {
                showToast('Cannot delete the only week', 'warning');
                return;
            }
            
            // Find remaining week BEFORE deleting
            const remainingWeek = plannerData.weeks.find(w => w.id !== weekIdToDelete);
            
            if (!remainingWeek) {
                showToast('Cannot delete week - no other weeks available', 'error');
                return;
            }
            
            // If deleting the current week, switch to another week first
            if (weekIdToDelete === plannerData.currentWeek) {
                plannerData.currentWeek = remainingWeek.id;
            }
            
            // Remove the week
            plannerData.weeks = plannerData.weeks.filter(w => w.id !== weekIdToDelete);
            saveData();
            
            // Re-render everything
            const currentWeek = plannerData.weeks.find(w => w.id === plannerData.currentWeek);
            document.getElementById('weekTitle').textContent = currentWeek.name;
            renderWeekSelector();
            renderDays();
            updateProgress();
            
            showToast(`Week "${week.name}" deleted`, 'success');
        }
    );
}

// Confirmation Modal
let confirmCallback = null;

function showConfirmModal(title, message, onConfirm) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    confirmCallback = onConfirm;
    document.getElementById('confirmModal').classList.add('active');
}

function closeConfirmModal() {
    document.getElementById('confirmModal').classList.remove('active');
    confirmCallback = null;
}

function closeNotifyModal() {
    document.getElementById('notifyModal').classList.remove('active');
}

function showNotification(title, message) {
    document.getElementById('notifyTitle').textContent = title;
    document.getElementById('notifyMessage').textContent = message;
    document.getElementById('notifyModal').classList.add('active');
}

function handleConfirm() {
    if (confirmCallback) {
        confirmCallback();
    }
    closeConfirmModal();
}

function confirmAction() {
    const callback = confirmCallback;
    closeConfirmModal();
    if (callback) {
        setTimeout(() => {
            callback();
        }, 10);
    }
}

// Views: Day, Week, Month and Calendar (a time grid of the week)
const VIEWS = ['day', 'week', 'month', 'calendar'];
const VIEW_SUBTITLES = {
    day: 'One day at a time',
    week: 'Track your goals and crush your targets',
    month: 'Every planned day this month',
    calendar: 'Your scheduled tasks by time of day'
};
let currentView = 'week';
let selectedDayId = null;  // Day shown in Day view
let monthCursor = null;    // First day of the month shown in Month view

function loadViewPreference() {
    const saved = storageGet(VIEW_KEY);
    if (VIEWS.includes(saved)) currentView = saved;
}

function setView(view) {
    if (!VIEWS.includes(view)) return;
    currentView = view;
    storageSet(VIEW_KEY, view);
    renderDays();
}

function getCurrentWeek() {
    return plannerData.weeks.find(w => w.id === plannerData.currentWeek);
}

// Find the planned day for a date, preferring the current week when weeks overlap
function findDayByDate(isoDate) {
    const weeks = [getCurrentWeek(), ...plannerData.weeks].filter(Boolean);
    for (const week of weeks) {
        const day = week.days.find(d => d.date === isoDate);
        if (day) return { week, day };
    }
    return null;
}

function openDay(weekId, dayId) {
    plannerData.currentWeek = weekId;
    selectedDayId = dayId;
    saveData();
    renderWeekSelector();
    updateProgress();
    setView('day');
}

function allTasks(day) {
    return day.sections.flatMap(section => section.tasks);
}

function updateHeader() {
    const week = getCurrentWeek();
    const title = document.getElementById('weekTitle');
    if (currentView === 'month' && monthCursor) {
        title.textContent = monthCursor.toLocaleString('default', { month: 'long', year: 'numeric' });
    } else if (week) {
        title.textContent = week.name;
    }
    document.getElementById('pageSubtitle').textContent = VIEW_SUBTITLES[currentView];
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.setAttribute('aria-pressed', String(btn.dataset.view === currentView));
    });
}

function renderDays() {
    const container = document.getElementById('daysContainer');
    container.innerHTML = '';
    container.className = `days-grid view-${currentView}`;

    if (currentView === 'month') {
        renderMonthView(container);
    } else if (currentView === 'calendar') {
        renderCalendarView(container);
    } else if (currentView === 'day') {
        renderDayView(container);
    } else {
        renderWeekView(container);
    }
    updateHeader();
}

function renderWeekView(container) {
    const currentWeek = getCurrentWeek();
    if (!currentWeek) return;

    currentWeek.days.forEach(day => {
        container.appendChild(createDayCard(day));
        renderSections(day);
    });
}

// Day view
function getSelectedDay(week) {
    let day = week.days.find(d => d.id === selectedDayId);
    if (!day) {
        const today = toISODate(new Date());
        day = week.days.find(d => d.date === today) || week.days[0];
        selectedDayId = day ? day.id : null;
    }
    return day;
}

function renderDayView(container) {
    const week = getCurrentWeek();
    if (!week) return;
    const day = getSelectedDay(week);
    if (!day) return;

    const today = toISODate(new Date());
    const pills = week.days.map(d => {
        const date = parseISODate(d.date);
        const tasks = allTasks(d);
        const done = tasks.filter(t => t.completed).length;
        const classes = ['day-pill'];
        if (d.id === day.id) classes.push('active');
        if (d.date === today) classes.push('today');
        return `
            <button class="${classes.join(' ')}" onclick="selectDay('${d.id}')" aria-pressed="${d.id === day.id}">
                <span class="day-pill-weekday">${date ? DAY_NAMES[date.getDay()].slice(0, 3) : escapeHtml(d.name.slice(0, 3))}</span>
                <span class="day-pill-date">${date ? date.getDate() : ''}</span>
                <span class="day-pill-count">${tasks.length ? `${done}/${tasks.length}` : '&nbsp;'}</span>
            </button>
        `;
    }).join('');

    const strip = document.createElement('div');
    strip.className = 'day-strip';
    strip.innerHTML = `
        <button class="day-strip-arrow" onclick="stepDay(-1)" aria-label="Previous day">‹</button>
        <div class="day-pills">${pills}</div>
        <button class="day-strip-arrow" onclick="stepDay(1)" aria-label="Next day">›</button>
    `;
    container.appendChild(strip);

    const card = createDayCard(day);
    card.classList.add('day-card-focus');
    container.appendChild(card);
    renderSections(day);
}

function selectDay(dayId) {
    selectedDayId = dayId;
    renderDays();
}

// Move one day back or forward, crossing into another week if one covers that date
function stepDay(delta) {
    const week = getCurrentWeek();
    const day = getSelectedDay(week);
    const index = week.days.indexOf(day);
    const neighbour = week.days[index + delta];
    if (neighbour) {
        selectDay(neighbour.id);
        return;
    }

    const date = parseISODate(day.date);
    const match = date && findDayByDate(toISODate(addDays(date, delta)));
    if (match && match.week.id !== week.id) {
        openDay(match.week.id, match.day.id);
    } else {
        showToast(delta < 0 ? 'No earlier day planned' : 'No later day planned — create a new week', 'warning');
    }
}

// Month view
function defaultMonthCursor() {
    const week = getCurrentWeek();
    const firstDated = week && week.days.map(d => parseISODate(d.date)).find(Boolean);
    const date = firstDated || new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function stepMonth(delta) {
    const cursor = monthCursor || defaultMonthCursor();
    monthCursor = delta === 0
        ? new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        : new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1);
    renderDays();
}

function renderMonthView(container) {
    if (!monthCursor) monthCursor = defaultMonthCursor();
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const gridStart = addDays(monthCursor, -monthCursor.getDay());
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cellCount = Math.ceil((monthCursor.getDay() + daysInMonth) / 7) * 7;
    const today = toISODate(new Date());

    const headers = DAY_NAMES.map(name => `<div class="month-weekday">${name.slice(0, 3)}</div>`).join('');

    let cells = '';
    for (let i = 0; i < cellCount; i++) {
        const date = addDays(gridStart, i);
        const iso = toISODate(date);
        const match = findDayByDate(iso);
        const classes = ['month-cell'];
        if (date.getMonth() !== month) classes.push('outside');
        if (iso === today) classes.push('today');
        if (!match) classes.push('unplanned');
        if (match && match.day.isOffDay) classes.push('off-day');

        let body = '';
        let label = `${formatDayName(date)}: no week planned. Create one starting here.`;
        if (match) {
            const tasks = allTasks(match.day);
            const done = tasks.filter(t => t.completed).length;
            const preview = tasks.slice(0, 3).map(t => `
                <span class="month-task${t.completed ? ' done' : ''}">${escapeHtml(t.text) || 'Untitled task'}</span>
            `).join('');
            const more = tasks.length > 3 ? `<span class="month-more">+${tasks.length - 3} more</span>` : '';
            const count = tasks.length ? `<span class="month-count">${done}/${tasks.length}</span>` : '';
            body = `${count}<span class="month-tasks">${preview}${more}</span>`;
            label = `${formatDayName(date)}: ${tasks.length} tasks, ${done} done`;
        }

        const action = match
            ? `openDay('${match.week.id}', '${match.day.id}')`
            : `startWeekOn('${iso}')`;
        cells += `
            <button class="${classes.join(' ')}" onclick="${action}" aria-label="${escapeHtml(label)}">
                <span class="month-date">${date.getDate()}</span>
                ${body}
            </button>
        `;
    }

    container.innerHTML = `
        <div class="view-toolbar">
            <button class="icon-btn" onclick="stepMonth(-1)" aria-label="Previous month">‹ Prev</button>
            <button class="icon-btn" onclick="stepMonth(0)">Today</button>
            <button class="icon-btn" onclick="stepMonth(1)" aria-label="Next month">Next ›</button>
        </div>
        <div class="month-grid">${headers}${cells}</div>
    `;
}

function startWeekOn(isoDate) {
    const start = parseISODate(isoDate);
    const end = addDays(start, 6);
    const short = date => date.toLocaleString('default', { month: 'short', day: 'numeric' });
    document.getElementById('weekNameInput').value = `${short(start)} – ${short(end)}`;
    document.getElementById('weekStartDate').value = isoDate;
    addNewWeek();
}

// Calendar view: the current week laid out on an hourly time grid
const CALENDAR_HOUR_HEIGHT = 48;

// Accepts "12:00 PM", "9am", "9:30", "14:15". Returns minutes after midnight, or null.
function parseTaskTime(text) {
    const match = /^\s*(\d{1,2})(?::(\d{2}))?\s*(a|p)?\.?\s*m?\.?\s*$/i.exec(text || '');
    if (!match) return null;
    let hours = Number(match[1]);
    const minutes = Number(match[2] || 0);
    const meridiem = (match[3] || '').toLowerCase();
    if (minutes > 59 || hours > 23 || (meridiem && (hours < 1 || hours > 12))) return null;
    if (meridiem === 'p' && hours !== 12) hours += 12;
    if (meridiem === 'a' && hours === 12) hours = 0;
    return hours * 60 + minutes;
}

// Accepts "30 min", "1h", "1.5 hrs", "1h 30m", or a bare number of minutes
function parseEstimate(text) {
    const value = (text || '').toLowerCase();
    const hours = /(\d+(?:\.\d+)?)\s*h/.exec(value);
    const minutes = /(\d+)\s*m/.exec(value);
    let total = (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0);
    if (!hours && !minutes && /^\s*\d+\s*$/.test(value)) total = Number(value);
    return Math.max(total || 30, 15);
}

function formatMinutes(total) {
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    const suffix = hours >= 12 && hours < 24 ? 'PM' : 'AM';
    const display = hours % 12 === 0 ? 12 : hours % 12;
    return minutes ? `${display}:${String(minutes).padStart(2, '0')} ${suffix}` : `${display} ${suffix}`;
}

function renderCalendarView(container) {
    const week = getCurrentWeek();
    if (!week) return;
    const today = toISODate(new Date());

    // Collect timed tasks per day and work out which hours to show
    let firstHour = 7;
    let lastHour = 22;
    const columns = week.days.map(day => {
        const events = [];
        let unscheduled = 0;
        day.sections.forEach(section => section.tasks.forEach(task => {
            const start = parseTaskTime(task.time);
            if (start === null) {
                unscheduled++;
                return;
            }
            const end = Math.min(start + parseEstimate(task.estimate), 24 * 60);
            events.push({ task, section, start, end });
            firstHour = Math.min(firstHour, Math.floor(start / 60));
            lastHour = Math.max(lastHour, Math.ceil(end / 60));
        }));

        // Give overlapping tasks side-by-side lanes
        events.sort((a, b) => a.start - b.start);
        const laneEnds = [];
        events.forEach(event => {
            let lane = laneEnds.findIndex(endTime => endTime <= event.start);
            if (lane === -1) lane = laneEnds.length;
            laneEnds[lane] = event.end;
            event.lane = lane;
        });
        return { day, events, unscheduled, lanes: Math.max(laneEnds.length, 1) };
    });

    const hourCount = lastHour - firstHour;
    const gridHeight = hourCount * CALENDAR_HOUR_HEIGHT;
    const pxPerMinute = CALENDAR_HOUR_HEIGHT / 60;

    const hourLabels = Array.from({ length: hourCount }, (_, i) =>
        `<div class="cal-hour" style="height:${CALENDAR_HOUR_HEIGHT}px">${formatMinutes((firstHour + i) * 60)}</div>`
    ).join('');

    const heads = columns.map(({ day, unscheduled }) => {
        const date = parseISODate(day.date);
        return `
            <button class="cal-day-head${day.date === today ? ' today' : ''}" onclick="openDay('${week.id}', '${day.id}')">
                <span class="cal-day-weekday">${date ? DAY_NAMES[date.getDay()].slice(0, 3) : escapeHtml(day.name)}</span>
                <span class="cal-day-date">${date ? date.getDate() : ''}</span>
                <span class="cal-unscheduled">${unscheduled ? `${unscheduled} untimed` : '&nbsp;'}</span>
            </button>
        `;
    }).join('');

    const bodies = columns.map(({ day, events, lanes }) => {
        const blocks = events.map(({ task, start, end, lane }) => {
            const top = (start - firstHour * 60) * pxPerMinute;
            const height = Math.max((end - start) * pxPerMinute, 22);
            const width = 100 / lanes;
            const label = escapeHtml(task.text) || 'Untitled task';
            return `
                <button class="cal-event${task.completed ? ' done' : ''}"
                    style="top:${top}px; height:${height}px; left:${lane * width}%; width:calc(${width}% - 4px)"
                    onclick="openDay('${week.id}', '${day.id}')"
                    title="${escapeHtml(task.time)} · ${label}">
                    <span class="cal-event-time">${formatMinutes(start)}</span>
                    <span class="cal-event-text">${label}</span>
                </button>
            `;
        }).join('');
        return `<div class="cal-day-body${day.isOffDay ? ' off-day' : ''}" style="height:${gridHeight}px">${blocks}</div>`;
    }).join('');

    const timedCount = columns.reduce((sum, column) => sum + column.events.length, 0);
    container.innerHTML = `
        ${timedCount === 0 ? '<p class="view-hint">No tasks have a time yet. Add one with <strong>+ Time</strong> in Day or Week view and it will appear here.</p>' : ''}
        <div class="calendar-scroll">
            <div class="calendar-grid" style="--cal-days:${week.days.length}">
                <div class="cal-corner"></div>
                ${heads}
                <div class="cal-hours">${hourLabels}</div>
                ${bodies}
            </div>
        </div>
    `;
}

function createDayCard(day) {
    const dayCard = document.createElement('div');
    dayCard.className = 'day-card' + (day.isOffDay ? ' off-day' : '');

    dayCard.innerHTML = `
        <div class="day-card-header">
            <div class="day-name-group">
                <input type="text" class="day-name-input" value="${escapeHtml(day.name)}" 
                    onchange="updateDayName('${day.id}', this.value)"
                    onclick="this.select()">
            </div>
            <div class="work-schedule-badge" onclick="editWorkSchedule('${day.id}')">
                Edit Schedule
            </div>
        </div>
        <div class="day-card-body">
            <div id="sections-${day.id}"></div>
            <button class="add-section-btn" onclick="addSection('${day.id}')">+ Add Section</button>
            <div class="notes-section">
                <div class="notes-header">
                    <div class="notes-title">📝 Daily Notes</div>
                </div>
                <textarea class="notes-textarea" 
                    placeholder="Reflections, thoughts, or anything else for today..."
                    onchange="updateDayNotes('${day.id}', this.value)">${escapeHtml(day.notes)}</textarea>
            </div>
        </div>
    `;

    return dayCard;
}

function updateDayName(dayId, newName) {
    const week = plannerData.weeks.find(w => w.id === plannerData.currentWeek);
    const day = week.days.find(d => d.id === dayId);
    day.name = newName;
    saveData();
}

function updateDayNotes(dayId, notes) {
    const week = plannerData.weeks.find(w => w.id === plannerData.currentWeek);
    const day = week.days.find(d => d.id === dayId);
    day.notes = notes;
    saveData();
}

let currentEditingDayId = null;

function editWorkSchedule(dayId) {
    currentEditingDayId = dayId;
    const week = plannerData.weeks.find(w => w.id === plannerData.currentWeek);
    const day = week.days.find(d => d.id === dayId);
    
    document.getElementById('scheduleInput').value = day.workSchedule;
    document.getElementById('scheduleModal').classList.add('active');
    
    // Focus the input
    setTimeout(() => {
        document.getElementById('scheduleInput').focus();
        document.getElementById('scheduleInput').select();
    }, 100);
}

function closeScheduleModal() {
    document.getElementById('scheduleModal').classList.remove('active');
    currentEditingDayId = null;
}

function saveWorkSchedule() {
    if (!currentEditingDayId) return;
    
    const newSchedule = document.getElementById('scheduleInput').value.trim();
    if (!newSchedule) {
        showToast('Please enter a work schedule', 'warning');
        return;
    }
    
    const week = plannerData.weeks.find(w => w.id === plannerData.currentWeek);
    const day = week.days.find(d => d.id === currentEditingDayId);
    day.workSchedule = newSchedule;
    
    saveData();
    closeScheduleModal();
    renderDays();
    showToast('Schedule updated', 'success');
}

// Section Management
function renderSections(day) {
    const container = document.getElementById(`sections-${day.id}`);
    container.innerHTML = '';
    
    day.sections.forEach(section => {
        const sectionDiv = document.createElement('div');
        sectionDiv.className = 'section';
        
        sectionDiv.innerHTML = `
            <div class="section-header">
                <span class="section-drag-handle" title="Drag to reorder section">⋮⋮</span>
                <input type="text" class="section-title-input" value="${escapeHtml(section.name)}" 
                    placeholder="Section name..."
                    onchange="updateSectionName('${day.id}', '${section.id}', this.value)"
                    onkeypress="if(event.key === 'Enter') { updateSectionName('${day.id}', '${section.id}', this.value); this.blur(); }"
                    onclick="this.select()">
                <div class="section-actions">
                    <button class="icon-btn" onclick="addTask('${day.id}', '${section.id}')">+ Task</button>
                    <button class="icon-btn danger" onclick="deleteSection('${day.id}', '${section.id}')">Delete</button>
                </div>
            </div>
            <div class="tasks-list" id="tasks-${section.id}"></div>
        `;
        
        container.appendChild(sectionDiv);
        renderTasks(day, section);
    });
    
    // Initialize drag and drop for sections
    if (typeof Sortable !== 'undefined') {
        new Sortable(container, {
            animation: 150,
            handle: '.section-drag-handle',
            ghostClass: 'section-ghost',
            dragClass: 'section-dragging',
            onEnd: function(evt) {
                // Update section order in data
                const movedSection = day.sections[evt.oldIndex];
                day.sections.splice(evt.oldIndex, 1);
                day.sections.splice(evt.newIndex, 0, movedSection);
                saveData();
            }
        });
    }
}

function updateSectionName(dayId, sectionId, newName) {
    const week = plannerData.weeks.find(w => w.id === plannerData.currentWeek);
    const day = week.days.find(d => d.id === dayId);
    const section = day.sections.find(s => s.id === sectionId);
    section.name = newName;
    saveData();
}

function addSection(dayId) {
    console.log('addSection called with dayId:', dayId);
    const week = plannerData.weeks.find(w => w.id === plannerData.currentWeek);
    console.log('Found week:', week);
    const day = week.days.find(d => d.id === dayId);
    console.log('Found day:', day);
    
    const newSection = {
        id: generateId('section'),
        name: '',
        tasks: []
    };
    
    console.log('Created new section:', newSection);
    day.sections.push(newSection);
    console.log('Day sections after push:', day.sections.length);
    saveData();
    console.log('Data saved, rendering...');
    renderDays();
    console.log('Render complete');
    
    // Focus the new section input
    setTimeout(() => {
        const input = document.querySelector(`input.section-title-input[value=""]`);
        if (input) input.focus();
    }, 100);
}

function deleteSection(dayId, sectionId) {
    console.log('=== DELETE SECTION CALLED ===');
    console.log('dayId:', dayId);
    console.log('sectionId:', sectionId);
    
    const week = plannerData.weeks.find(w => w.id === plannerData.currentWeek);
    if (!week) {
        console.log('ERROR: Week not found');
        return;
    }
    
    const day = week.days.find(d => d.id === dayId);
    if (!day) {
        console.log('ERROR: Day not found');
        return;
    }
    
    console.log('Day sections before delete:', day.sections.map(s => ({ id: s.id, name: s.name })));
    
    const section = day.sections.find(s => s.id === sectionId);
    if (!section) {
        console.log('ERROR: Section not found');
        return;
    }
    
    // Capture these in local variables for the closure
    const sectionName = section.name || 'this section';
    const dayIdCopy = dayId;
    const sectionIdCopy = sectionId;
    
    showConfirmModal(
        'Delete Section',
        `Delete "${sectionName}" and all its tasks?`,
        () => {
            console.log('=== DELETE CALLBACK EXECUTING ===');
            console.log('Looking for dayId:', dayIdCopy);
            console.log('Looking to delete sectionId:', sectionIdCopy);
            
            // Fresh lookup each time
            const currentWeek = plannerData.weeks.find(w => w.id === plannerData.currentWeek);
            if (!currentWeek) {
                console.log('ERROR: Current week not found in callback');
                return;
            }
            
            const currentDay = currentWeek.days.find(d => d.id === dayIdCopy);
            if (!currentDay) {
                console.log('ERROR: Current day not found in callback');
                return;
            }
            
            console.log('Current day sections BEFORE filter:', currentDay.sections.map(s => ({ id: s.id, name: s.name })));
            
            // Filter out only the specific section
            const beforeCount = currentDay.sections.length;
            currentDay.sections = currentDay.sections.filter(s => {
                const keep = s.id !== sectionIdCopy;
                console.log(`Section ${s.id} (${s.name}): ${keep ? 'KEEP' : 'DELETE'}`);
                return keep;
            });
            const afterCount = currentDay.sections.length;
            
            console.log('Current day sections AFTER filter:', currentDay.sections.map(s => ({ id: s.id, name: s.name })));
            console.log(`Deleted section ${sectionIdCopy}. Before: ${beforeCount}, After: ${afterCount}`);
            
            saveData();
            console.log('Data saved');
            renderDays();
            console.log('Days rendered');
            updateProgress();
            console.log('=== DELETE COMPLETE ===');
        }
    );
}

// Task Management
function renderTasks(day, section) {
    const container = document.getElementById(`tasks-${section.id}`);
    container.innerHTML = '';
    
    section.tasks.forEach(task => {
        // Each task block holds the task row and its subtasks, so they drag together
        const taskBlock = document.createElement('div');
        taskBlock.className = 'task-block';

        const taskDiv = document.createElement('div');
        taskDiv.className = 'task-item' + (task.completed ? ' completed' : '');
        const subtasksDone = task.subtasks.filter(s => s.completed).length;

        taskDiv.innerHTML = `
            <span class="task-drag-handle" title="Drag to reorder">⋮⋮</span>
            <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} 
                onchange="toggleTask('${day.id}', '${section.id}', '${task.id}', this.checked)">
            <textarea class="task-text" rows="1" 
                placeholder="Task description..."
                onchange="updateTaskText('${day.id}', '${section.id}', '${task.id}', this.value)"
                onkeypress="if(event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); updateTaskText('${day.id}', '${section.id}', '${task.id}', this.value); this.blur(); }"
                oninput="autoResize(this)">${escapeHtml(task.text)}</textarea>
            ${task.subtasks.length ? `
                <span class="subtask-count" title="Subtasks done">${subtasksDone}/${task.subtasks.length}</span>
            ` : ''}
            <button class="icon-btn" onclick="addSubtask('${day.id}', '${section.id}', '${task.id}')" title="Add a subtask">+ Sub</button>
            ${task.estimate ? `
                <div class="task-estimate">
                    <input type="text" value="${escapeHtml(task.estimate)}" 
                        onchange="updateTaskEstimate('${day.id}', '${section.id}', '${task.id}', this.value)"
                        onclick="this.select()" placeholder="Est">
                </div>
            ` : `
                <button class="icon-btn" onclick="addTaskEstimate('${day.id}', '${section.id}', '${task.id}')">+ Est</button>
            `}
            ${task.time ? `
                <div class="task-time">
                    <input type="text" value="${escapeHtml(task.time)}" 
                        onchange="updateTaskTime('${day.id}', '${section.id}', '${task.id}', this.value)"
                        onclick="this.select()">
                </div>
            ` : `
                <button class="icon-btn" onclick="addTaskTime('${day.id}', '${section.id}', '${task.id}')">+ Time</button>
            `}
            <button class="task-delete" onclick="deleteTask('${day.id}', '${section.id}', '${task.id}')">×</button>
        `;
        
        taskBlock.appendChild(taskDiv);
        if (task.subtasks.length) {
            taskBlock.appendChild(createSubtaskList(day, section, task));
        }
        container.appendChild(taskBlock);

        taskBlock.querySelectorAll('textarea').forEach(autoResize);
    });
    
    // Initialize drag and drop for this task list
    if (typeof Sortable !== 'undefined') {
        new Sortable(container, {
            animation: 150,
            handle: '.task-drag-handle',
            ghostClass: 'task-ghost',
            dragClass: 'task-dragging',
            onEnd: function(evt) {
                // Update task order in data
                const movedTask = section.tasks[evt.oldIndex];
                section.tasks.splice(evt.oldIndex, 1);
                section.tasks.splice(evt.newIndex, 0, movedTask);
                saveData();
            }
        });
    }
}

function createSubtaskList(day, section, task) {
    const list = document.createElement('div');
    list.className = 'subtask-list';
    const ids = `'${day.id}', '${section.id}', '${task.id}'`;

    list.innerHTML = task.subtasks.map(subtask => `
        <div class="subtask-item${subtask.completed ? ' completed' : ''}" data-subtask-id="${subtask.id}">
            <span class="subtask-drag-handle" title="Drag to reorder">⋮⋮</span>
            <input type="checkbox" class="task-checkbox subtask-checkbox" ${subtask.completed ? 'checked' : ''}
                aria-label="Mark subtask complete"
                onchange="toggleSubtask(${ids}, '${subtask.id}', this.checked)">
            <textarea class="subtask-text" rows="1"
                placeholder="Subtask..."
                onchange="updateSubtaskText(${ids}, '${subtask.id}', this.value)"
                onkeypress="if(event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); updateSubtaskText(${ids}, '${subtask.id}', this.value); this.blur(); }"
                oninput="autoResize(this)">${escapeHtml(subtask.text)}</textarea>
            <button class="task-delete subtask-delete" onclick="deleteSubtask(${ids}, '${subtask.id}')" aria-label="Delete subtask">×</button>
        </div>
    `).join('');

    if (typeof Sortable !== 'undefined') {
        new Sortable(list, {
            animation: 150,
            handle: '.subtask-drag-handle',
            ghostClass: 'task-ghost',
            dragClass: 'task-dragging',
            onEnd: function(evt) {
                const moved = task.subtasks.splice(evt.oldIndex, 1)[0];
                task.subtasks.splice(evt.newIndex, 0, moved);
                saveData();
            }
        });
    }
    return list;
}

function findTask(dayId, sectionId, taskId) {
    const week = getCurrentWeek();
    const day = week && week.days.find(d => d.id === dayId);
    const section = day && day.sections.find(s => s.id === sectionId);
    return (section && section.tasks.find(t => t.id === taskId)) || null;
}

function addSubtask(dayId, sectionId, taskId) {
    const task = findTask(dayId, sectionId, taskId);
    if (!task) return;
    const subtask = { id: generateId('subtask'), text: '', completed: false };
    task.subtasks.push(subtask);
    // A new open subtask means the parent isn't finished
    task.completed = false;
    saveData();
    renderDays();
    updateProgress();

    setTimeout(() => {
        const input = document.querySelector(`[data-subtask-id="${subtask.id}"] .subtask-text`);
        if (input) input.focus();
    }, 100);
}

function updateSubtaskText(dayId, sectionId, taskId, subtaskId, text) {
    const task = findTask(dayId, sectionId, taskId);
    const subtask = task && task.subtasks.find(s => s.id === subtaskId);
    if (!subtask) return;
    subtask.text = text;
    saveData();
}

// Finishing the last subtask finishes the task; reopening one reopens it
function toggleSubtask(dayId, sectionId, taskId, subtaskId, completed) {
    const task = findTask(dayId, sectionId, taskId);
    const subtask = task && task.subtasks.find(s => s.id === subtaskId);
    if (!subtask) return;
    subtask.completed = completed;
    task.completed = task.subtasks.every(s => s.completed);
    saveData();
    renderDays();
    updateProgress();
}

function deleteSubtask(dayId, sectionId, taskId, subtaskId) {
    const task = findTask(dayId, sectionId, taskId);
    if (!task) return;
    task.subtasks = task.subtasks.filter(s => s.id !== subtaskId);
    saveData();
    renderDays();
    updateProgress();
}

function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}

function addTask(dayId, sectionId) {
    const week = plannerData.weeks.find(w => w.id === plannerData.currentWeek);
    const day = week.days.find(d => d.id === dayId);
    const section = day.sections.find(s => s.id === sectionId);
    
    const newTask = {
        id: generateId('task'),
        text: '',
        time: '',
        estimate: '',
        completed: false,
        subtasks: []
    };
    
    section.tasks.push(newTask);
    saveData();
    renderDays();
    updateProgress();
    
    // Focus the new task input
    setTimeout(() => {
        const taskInputs = document.querySelectorAll(`#tasks-${sectionId} .task-text`);
        const lastInput = taskInputs[taskInputs.length - 1];
        if (lastInput) lastInput.focus();
    }, 100);
}

function updateTaskText(dayId, sectionId, taskId, newText) {
    const week = plannerData.weeks.find(w => w.id === plannerData.currentWeek);
    const day = week.days.find(d => d.id === dayId);
    const section = day.sections.find(s => s.id === sectionId);
    const task = section.tasks.find(t => t.id === taskId);
    task.text = newText;
    saveData();
}

function updateTaskTime(dayId, sectionId, taskId, newTime) {
    const week = plannerData.weeks.find(w => w.id === plannerData.currentWeek);
    const day = week.days.find(d => d.id === dayId);
    const section = day.sections.find(s => s.id === sectionId);
    const task = section.tasks.find(t => t.id === taskId);
    task.time = newTime;
    saveData();
    renderDays();
}

function addTaskTime(dayId, sectionId, taskId) {
    const week = plannerData.weeks.find(w => w.id === plannerData.currentWeek);
    const day = week.days.find(d => d.id === dayId);
    const section = day.sections.find(s => s.id === sectionId);
    const task = section.tasks.find(t => t.id === taskId);
    task.time = '12:00 PM';
    saveData();
    renderDays();
}

function updateTaskEstimate(dayId, sectionId, taskId, newEstimate) {
    const week = plannerData.weeks.find(w => w.id === plannerData.currentWeek);
    const day = week.days.find(d => d.id === dayId);
    const section = day.sections.find(s => s.id === sectionId);
    const task = section.tasks.find(t => t.id === taskId);
    task.estimate = newEstimate;
    saveData();
    renderDays();
}

function addTaskEstimate(dayId, sectionId, taskId) {
    const week = plannerData.weeks.find(w => w.id === plannerData.currentWeek);
    const day = week.days.find(d => d.id === dayId);
    const section = day.sections.find(s => s.id === sectionId);
    const task = section.tasks.find(t => t.id === taskId);
    task.estimate = '30 min';
    saveData();
    renderDays();
}

function toggleTask(dayId, sectionId, taskId, completed) {
    const week = plannerData.weeks.find(w => w.id === plannerData.currentWeek);
    const day = week.days.find(d => d.id === dayId);
    const section = day.sections.find(s => s.id === sectionId);
    const task = section.tasks.find(t => t.id === taskId);
    task.completed = completed;
    // Checking off a task checks off its subtasks too
    if (completed) task.subtasks.forEach(subtask => { subtask.completed = true; });
    saveData();
    renderDays();
    updateProgress();
}

function deleteTask(dayId, sectionId, taskId) {
    const week = plannerData.weeks.find(w => w.id === plannerData.currentWeek);
    if (!week) return;
    
    const day = week.days.find(d => d.id === dayId);
    if (!day) return;
    
    const section = day.sections.find(s => s.id === sectionId);
    if (!section) return;
    
    section.tasks = section.tasks.filter(t => t.id !== taskId);
    saveData();
    renderDays();
    updateProgress();
}

// Progress Tracking
function updateProgress() {
    const week = plannerData.weeks.find(w => w.id === plannerData.currentWeek);
    if (!week) return;
    
    let totalTasks = 0;
    let completedTasks = 0;
    
    week.days.forEach(day => {
        day.sections.forEach(section => {
            section.tasks.forEach(task => {
                totalTasks++;
                if (task.completed) completedTasks++;
            });
        });
    });
    
    const percentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    
    document.getElementById('progress-fill-mini').style.width = percentage + '%';
    document.getElementById('progress-text-mini').textContent = percentage + '%';
    document.getElementById('completed-tasks-mini').textContent = completedTasks;
    document.getElementById('total-tasks-mini').textContent = totalTasks;
}

// Export/Import Functions
function exportData() {
    const dataStr = JSON.stringify(plannerData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    
    // Generate filename with current date
    const date = new Date().toISOString().split('T')[0];
    link.download = `deepweek-backup-${date}.json`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showToast('Planner data exported successfully', 'success');
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.size > MAX_IMPORT_BYTES) {
        showToast('Import file is too large', 'error');
        event.target.value = '';
        return;
    }
    
    const reader = new FileReader();
    
    reader.onload = (e) => {
        try {
            // Validate and sanitize before anything touches the page
            const importedData = normalizePlannerData(JSON.parse(e.target.result));
            
            // Confirm before overwriting
            showConfirmModal(
                'Import Data',
                '⚠️ This will replace all your current data with the imported data. Continue?',
                () => {
                    plannerData = importedData;
                    saveData();
                    
                    // Re-render everything
                    const week = plannerData.weeks.find(w => w.id === plannerData.currentWeek);
                    document.getElementById('weekTitle').textContent = week.name;
                    renderWeekSelector();
                    renderDays();
                    updateProgress();
                    
                    showToast('Data imported successfully', 'success');
                }
            );
        } catch (error) {
            showToast('Error importing data: ' + error.message, 'error');
        }
        
        // Reset the file input
        event.target.value = '';
    };
    
    reader.onerror = () => {
        showToast('Could not read the selected file', 'error');
        event.target.value = '';
    };
    
    reader.readAsText(file);
}

// Initialize on load
window.addEventListener('load', () => {
    loadData();
    loadDarkMode();
    loadViewPreference();
    
    // Initialize default week if starting fresh
    const week = plannerData.weeks.find(w => w.id === plannerData.currentWeek);
    if (week && week.days.length === 0) {
        initializeDefaultWeek();
        saveData();
    }
    
    document.getElementById('weekTitle').textContent = week.name;
    renderWeekSelector();
    renderDays();
    updateProgress();
});

// Close modal when clicking outside
window.addEventListener('click', (e) => {
    const weekModal = document.getElementById('weekModal');
    const scheduleModal = document.getElementById('scheduleModal');
    const editWeekModal = document.getElementById('editWeekModal');
    const confirmModal = document.getElementById('confirmModal');
    const notifyModal = document.getElementById('notifyModal');
    const timerSettingsModal = document.getElementById('timerSettingsModal');
    
    if (e.target === weekModal) {
        closeModal();
    }
    
    if (e.target === scheduleModal) {
        closeScheduleModal();
    }
    
    if (e.target === editWeekModal) {
        closeEditWeekModal();
    }
    
    if (e.target === confirmModal) {
        closeConfirmModal();
    }
    
    if (e.target === notifyModal) {
        closeNotifyModal();
    }
    
    if (e.target === timerSettingsModal) {
        closeTimerSettings();
    }
});

// Dark Mode
function toggleDarkMode() {
    const body = document.body;
    const isDark = body.classList.toggle('dark-mode');
    
    // Update icon
    const icon = document.querySelector('.theme-icon');
    icon.textContent = isDark ? '🌙' : '☀️';
    
    // Save preference
    storageSet('darkMode', isDark ? 'enabled' : 'disabled');
    updateThemeColor(isDark);
}

// Match the browser/app title bar to the current theme
function updateThemeColor(isDark) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#0f0f0f' : '#ffffff');
}

function loadDarkMode() {
    const darkMode = storageGet('darkMode');
    if (darkMode === 'enabled') {
        document.body.classList.add('dark-mode');
        document.querySelector('.theme-icon').textContent = '🌙';
        updateThemeColor(true);
    }
}

// Help Modal
function showHelpModal() {
    document.getElementById('helpModal').classList.add('active');
}

function closeHelpModal() {
    document.getElementById('helpModal').classList.remove('active');
}

// Keyboard Shortcuts
document.addEventListener('keydown', function(e) {
    // Ignore if user is typing in an input/textarea
    const activeElement = document.activeElement;
    const isTyping = activeElement.tagName === 'INPUT' || 
                     activeElement.tagName === 'TEXTAREA' ||
                     activeElement.isContentEditable;
    
    // Ctrl + N: Add new task (when focused on a task)
    if (e.ctrlKey && e.key === 'n' && !e.shiftKey) {
        e.preventDefault();
        // Find the currently focused task and add a new task to its section
        if (activeElement.classList.contains('task-text')) {
            const taskItem = activeElement.closest('.task-item');
            const tasksContainer = taskItem.closest('.tasks-list');
            const sectionId = tasksContainer.id.replace('tasks-', '');
            const dayCard = taskItem.closest('.day-card');
            const dayId = dayCard.querySelector('[id^="sections-"]').id.replace('sections-', '');
            addTask(dayId, sectionId);
        }
    }
    
    // Ctrl + Shift + N: Add new section (when focused anywhere in a day)
    if (e.ctrlKey && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        const dayCard = activeElement.closest('.day-card');
        if (dayCard) {
            const dayId = dayCard.querySelector('[id^="sections-"]').id.replace('sections-', '');
            addSection(dayId);
        }
    }
    
    // Ctrl + N inside a subtask: add another subtask to the same task
    if (e.ctrlKey && e.key === 'n' && !e.shiftKey && activeElement.classList.contains('subtask-text')) {
        const addBtn = activeElement.closest('.task-block').querySelector('.task-item .icon-btn[title="Add a subtask"]');
        if (addBtn) addBtn.click();
    }

    // Delete: Remove focused subtask
    if (e.key === 'Delete' && activeElement.classList.contains('subtask-text')) {
        e.preventDefault();
        const deleteBtn = activeElement.closest('.subtask-item').querySelector('.subtask-delete');
        if (deleteBtn) deleteBtn.click();
    }

    // 1-4: Switch between Day, Week, Month and Calendar views
    if (!isTyping && !e.ctrlKey && !e.metaKey && !e.altKey && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        setView(VIEWS[Number(e.key) - 1]);
    }

    // Delete: Remove focused task
    if (e.key === 'Delete' && activeElement.classList.contains('task-text')) {
        e.preventDefault();
        const taskItem = activeElement.closest('.task-item');
        const deleteBtn = taskItem.querySelector('.task-delete');
        if (deleteBtn) deleteBtn.click();
    }
    
    // Ctrl + S: Export data
    if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        exportData();
    }
    
    // Ctrl + D: Toggle dark mode
    if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        toggleDarkMode();
    }
    
    // ?: Show help
    if (e.key === '?' && !isTyping) {
        e.preventDefault();
        showHelpModal();
    }
    
    // Esc: Close any modal
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(modal => {
            modal.classList.remove('active');
        });
    }
    
    // Space: Start/Pause timer (when not typing)
    if (e.key === ' ' && !isTyping) {
        e.preventDefault();
        const startBtn = document.getElementById('startBtn');
        const pauseBtn = document.getElementById('pauseBtn');
        if (startBtn.style.display !== 'none') {
            startTimer();
        } else {
            pauseTimer();
        }
    }
    
    // R: Reset timer (when not typing)
    if (e.key === 'r' && !isTyping) {
        e.preventDefault();
        resetTimer();
    }
});
