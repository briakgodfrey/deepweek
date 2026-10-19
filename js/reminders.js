// Task reminders
//
// A task's reminder is stored on the task as `reminder`: minutes before the
// task's start time (0 = at the start time), or null for no reminder.
// Reminders fire while Deepweek is open, including in a background tab or a
// minimized window. Without a server nothing can wake a closed app, so any
// reminder that came due while it was closed is listed the next time it opens.

const REMINDER_STATE_KEY = 'reminderState';
const REMINDER_CHECK_INTERVAL_MS = 20 * 1000;
// A reminder found up to this late (e.g. the laptop was asleep) still goes off
const REMINDER_GRACE_MS = 15 * 60 * 1000;
// Reminders missed by more than the grace period, up to this long ago, are listed as missed
const REMINDER_MISSED_WINDOW_MS = 24 * 60 * 60 * 1000;
const REMINDER_SNOOZE_MS = 10 * 60 * 1000;
const REMINDER_HISTORY_MS = 7 * 24 * 60 * 60 * 1000;
const REMINDER_MAX_OFFSET = 7 * 24 * 60;

const REMINDER_OPTIONS = [
    { minutes: 0, label: 'At start time', short: 'At time' },
    { minutes: 5, label: '5 minutes before', short: '5m' },
    { minutes: 10, label: '10 minutes before', short: '10m' },
    { minutes: 15, label: '15 minutes before', short: '15m' },
    { minutes: 30, label: '30 minutes before', short: '30m' },
    { minutes: 60, label: '1 hour before', short: '1h' },
    { minutes: 120, label: '2 hours before', short: '2h' },
    { minutes: 1440, label: '1 day before', short: '1d' }
];

function normalizeReminder(value) {
    return Number.isInteger(value) && value >= 0 && value <= REMINDER_MAX_OFFSET ? value : null;
}

function reminderLabel(minutes, short = false) {
    const option = REMINDER_OPTIONS.find(o => o.minutes === minutes);
    if (option) return short ? option.short : option.label;
    return short ? `${minutes}m` : `${minutes} minutes before`;
}

// Per-device bookkeeping, kept out of plannerData so it isn't exported:
// handled = reminders already shown, snoozed = taskId -> when to show it again,
// lastCheck = when reminders were last checked (so we know what came due while closed)
function loadReminderState() {
    const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
    try {
        const saved = JSON.parse(storageGet(REMINDER_STATE_KEY));
        if (isObject(saved)) {
            return {
                handled: isObject(saved.handled) ? saved.handled : {},
                snoozed: isObject(saved.snoozed) ? saved.snoozed : {},
                lastCheck: typeof saved.lastCheck === 'number' ? saved.lastCheck : null
            };
        }
    } catch (error) {
        console.error('Could not read reminder state:', error);
    }
    return { handled: {}, snoozed: {}, lastCheck: null };
}

let reminderState = { handled: {}, snoozed: {}, lastCheck: null };

// Several tabs can be open, so always change the latest saved copy
function updateReminderState(change) {
    reminderState = loadReminderState();
    change(reminderState);
    storageSet(REMINDER_STATE_KEY, JSON.stringify(reminderState));
}

// When a task starts, as a timestamp, or null if its day or time can't be read
function taskStartTime(day, task) {
    const date = parseISODate(day.date);
    const minutes = parseTaskTime(task.time);
    if (!date || minutes === null) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, minutes).getTime();
}

function reminderFireTime(day, task) {
    const offset = normalizeReminder(task.reminder);
    const start = taskStartTime(day, task);
    return start === null || offset === null ? null : start - offset * 60 * 1000;
}

// Changing the task's time or reminder gives it a new key, so it can go off again
function reminderKey(task, fireAt) {
    return `${task.id}@${fireAt}`;
}

// Every open task that has a reminder it can schedule
function collectReminders() {
    const reminders = [];
    plannerData.weeks.forEach(week => week.days.forEach(day => day.sections.forEach(section => {
        section.tasks.forEach(task => {
            if (task.completed || normalizeReminder(task.reminder) === null) return;
            const fireAt = reminderFireTime(day, task);
            if (fireAt !== null) reminders.push({ week, day, section, task, fireAt });
        });
    })));
    return reminders;
}

function checkReminders() {
    const now = Date.now();
    const reminders = collectReminders();
    const due = [];
    const missed = [];

    const sort = (reminder, firedAt) => {
        const lateness = now - firedAt;
        if (lateness <= REMINDER_GRACE_MS) due.push(reminder);
        else if (lateness <= REMINDER_MISSED_WINDOW_MS) missed.push(reminder);
    };

    updateReminderState(state => {
        // On the very first check there's nothing to have missed
        const lastCheck = state.lastCheck === null ? now : state.lastCheck;

        reminders.forEach(reminder => {
            const key = reminderKey(reminder.task, reminder.fireAt);
            if (state.handled[key] || reminder.fireAt > now) return;
            state.handled[key] = now;
            // Only reminders that came due since the last check go off. One that
            // is in the past because its task was just moved earlier stays quiet.
            if (reminder.fireAt > lastCheck) sort(reminder, reminder.fireAt);
        });

        Object.entries(state.snoozed).forEach(([taskId, until]) => {
            const reminder = reminders.find(r => r.task.id === taskId);
            // Drop snoozes for tasks that were deleted, completed, or lost their reminder
            if (!reminder || typeof until !== 'number') {
                delete state.snoozed[taskId];
                return;
            }
            if (until > now) return;
            delete state.snoozed[taskId];
            sort(reminder, until);
        });

        // Forget old history so storage doesn't grow forever
        Object.entries(state.handled).forEach(([key, handledAt]) => {
            if (typeof handledAt !== 'number' || now - handledAt > REMINDER_HISTORY_MS) {
                delete state.handled[key];
            }
        });

        state.lastCheck = now;
    });

    due.forEach(fireReminder);
    if (missed.length) showMissedReminders(missed);
}

// "Starting now · 2:30 PM", "Starts at 2:30 PM", "Starts tomorrow at 9:00 AM", "Started at 8:00 AM"
function describeStart(day, task) {
    const start = taskStartTime(day, task);
    const startDate = new Date(start);
    const time = formatClockTime(parseTaskTime(task.time));
    const today = toISODate(new Date());
    const tomorrow = toISODate(addDays(new Date(), 1));
    if (Math.abs(start - Date.now()) <= 5 * 60 * 1000) return `Starting now · ${time}`;
    const verb = start <= Date.now() ? 'Started' : 'Starts';
    if (day.date === today) return `${verb} at ${time}`;
    if (day.date === tomorrow) return `${verb} tomorrow at ${time}`;
    return `${verb} ${formatDayName(startDate)} at ${time}`;
}

// Always "h:mm AM/PM", so times written by reminders look like the app's other times
function formatClockTime(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const display = hours % 12 === 0 ? 12 : hours % 12;
    return `${display}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
}

function fireReminder(reminder) {
    const { week, day, task } = reminder;
    const title = task.text.trim() || 'Untitled task';
    const body = describeStart(day, task);
    showReminderToast(reminder, title, body);

    // The in-app card is enough when Deepweek is the window being looked at
    if (document.visibilityState === 'visible' && document.hasFocus()) return;
    sendSystemNotification(title, {
        body,
        tag: `reminder-${task.id}`,
        renotify: true,
        icon: 'assets/icons/icon-192.png',
        badge: 'assets/icons/favicon-32.png',
        data: { weekId: week.id, dayId: day.id }
    });
}

// Shows a system notification. Uses the service worker where there is one,
// since Android and installed iPhone apps don't allow `new Notification()`.
async function sendSystemNotification(title, options = {}) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    try {
        const registration = 'serviceWorker' in navigator
            ? await navigator.serviceWorker.getRegistration()
            : null;
        if (registration) {
            await registration.showNotification(title, options);
            return true;
        }
        const notification = new Notification(title, options);
        notification.onclick = () => {
            window.focus();
            if (options.data) openReminderDay(options.data.weekId, options.data.dayId);
            notification.close();
        };
        return true;
    } catch (error) {
        console.error('Could not show notification:', error);
        return false;
    }
}

function openReminderDay(weekId, dayId) {
    const week = plannerData.weeks.find(w => w.id === weekId);
    if (!week || !week.days.some(d => d.id === dayId)) return;
    closeSidebar();
    document.querySelectorAll('.modal.active').forEach(modal => modal.classList.remove('active'));
    openDay(weekId, dayId);
}

function removeToast(toast) {
    if (!toast.isConnected) return;
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
}

function createToastButton(label, onClick, extraClass = '') {
    const button = document.createElement('button');
    button.className = `reminder-toast-btn ${extraClass}`.trim();
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
}

// Reminder cards stay until dismissed, unlike regular toasts
function showReminderToast(reminder, title, body) {
    const { week, day, task } = reminder;
    const container = document.getElementById('toastContainer');
    const existing = container.querySelector(`[data-reminder-task="${task.id}"]`);
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast reminder-toast';
    toast.setAttribute('role', 'alert');
    toast.dataset.reminderTask = task.id;
    toast.innerHTML = `
        <span class="toast-icon" aria-hidden="true">⏰</span>
        <div class="toast-message reminder-toast-body">
            <span class="reminder-toast-title"></span>
            <span class="reminder-toast-meta"></span>
            <div class="reminder-toast-actions"></div>
        </div>
    `;
    toast.querySelector('.reminder-toast-title').textContent = title;
    toast.querySelector('.reminder-toast-meta').textContent = body;

    const actions = toast.querySelector('.reminder-toast-actions');
    actions.append(
        createToastButton('Open', () => {
            removeToast(toast);
            openReminderDay(week.id, day.id);
        }),
        createToastButton('Snooze 10 min', () => {
            updateReminderState(state => { state.snoozed[task.id] = Date.now() + REMINDER_SNOOZE_MS; });
            removeToast(toast);
            showToast('Snoozed for 10 minutes', 'success');
        })
    );
    const dismiss = createToastButton('×', () => removeToast(toast), 'reminder-toast-dismiss');
    dismiss.setAttribute('aria-label', 'Dismiss reminder');
    toast.appendChild(dismiss);

    container.appendChild(toast);
}

function showMissedReminders(missed) {
    const container = document.getElementById('toastContainer');
    const existing = container.querySelector('.missed-reminders-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast reminder-toast missed-reminders-toast';
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
        <span class="toast-icon" aria-hidden="true">⏰</span>
        <div class="toast-message reminder-toast-body">
            <span class="reminder-toast-title"></span>
            <span class="reminder-toast-meta">These came due while Deepweek was closed.</span>
            <div class="missed-reminders-list"></div>
        </div>
    `;
    toast.querySelector('.reminder-toast-title').textContent =
        missed.length === 1 ? 'You missed a reminder' : `You missed ${missed.length} reminders`;

    const list = toast.querySelector('.missed-reminders-list');
    missed.slice(0, 5).forEach(({ week, day, task }) => {
        const item = createToastButton('', () => {
            removeToast(toast);
            openReminderDay(week.id, day.id);
        }, 'missed-reminder-item');
        const name = document.createElement('span');
        name.className = 'missed-reminder-name';
        name.textContent = task.text.trim() || 'Untitled task';
        const when = document.createElement('span');
        when.className = 'missed-reminder-when';
        when.textContent = describeStart(day, task);
        item.append(name, when);
        list.appendChild(item);
    });
    if (missed.length > 5) {
        const more = document.createElement('span');
        more.className = 'reminder-toast-meta';
        more.textContent = `+${missed.length - 5} more`;
        list.appendChild(more);
    }

    const dismiss = createToastButton('×', () => removeToast(toast), 'reminder-toast-dismiss');
    dismiss.setAttribute('aria-label', 'Dismiss missed reminders');
    toast.appendChild(dismiss);
    container.appendChild(toast);
}

// Reminder dialog
let reminderEditing = null;

function minutesToTimeInput(totalMinutes) {
    return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

function timeInputToMinutes(value) {
    const match = /^(\d{2}):(\d{2})$/.exec(value || '');
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function findDayAndTask(dayId, sectionId, taskId) {
    const week = getCurrentWeek();
    const day = week && week.days.find(d => d.id === dayId);
    const task = findTask(dayId, sectionId, taskId);
    return day && task ? { week, day, task } : null;
}

function openReminderModal(dayId, sectionId, taskId) {
    const found = findDayAndTask(dayId, sectionId, taskId);
    if (!found) return;
    const { day, task } = found;
    reminderEditing = { dayId, sectionId, taskId };

    document.getElementById('reminderTaskName').textContent = task.text.trim() || 'Untitled task';
    const start = parseTaskTime(task.time);
    document.getElementById('reminderTimeInput').value = minutesToTimeInput(start === null ? 9 * 60 : start);

    const select = document.getElementById('reminderOffsetInput');
    const current = normalizeReminder(task.reminder) === null ? 15 : task.reminder;
    const options = REMINDER_OPTIONS.some(o => o.minutes === current)
        ? REMINDER_OPTIONS
        : [...REMINDER_OPTIONS, { minutes: current, label: reminderLabel(current) }];
    select.innerHTML = options
        .map(o => `<option value="${o.minutes}"${o.minutes === current ? ' selected' : ''}>${escapeHtml(o.label)}</option>`)
        .join('');

    document.getElementById('reminderRemoveBtn').hidden = normalizeReminder(task.reminder) === null;
    document.getElementById('reminderSaveBtn').disabled = !parseISODate(day.date);
    updateReminderPreview();
    renderNotificationStatus();
    document.getElementById('reminderModal').classList.add('active');
}

function closeReminderModal() {
    document.getElementById('reminderModal').classList.remove('active');
    reminderEditing = null;
}

function updateReminderPreview() {
    const preview = document.getElementById('reminderPreview');
    const found = reminderEditing && findDayAndTask(reminderEditing.dayId, reminderEditing.sectionId, reminderEditing.taskId);
    if (!found) return;

    const date = parseISODate(found.day.date);
    const start = timeInputToMinutes(document.getElementById('reminderTimeInput').value);
    const offset = Number(document.getElementById('reminderOffsetInput').value);
    preview.classList.remove('warning');
    if (!date) {
        preview.textContent = 'This day has no date, so a reminder can\'t be scheduled.';
        preview.classList.add('warning');
        return;
    }
    if (start === null) {
        preview.textContent = 'Pick a time for this task.';
        preview.classList.add('warning');
        return;
    }
    const fireAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, start - offset);
    if (fireAt.getTime() <= Date.now()) {
        preview.textContent = 'That time has already passed. Pick a later time or an earlier day.';
        preview.classList.add('warning');
        return;
    }
    const when = toISODate(fireAt) === toISODate(new Date())
        ? 'today'
        : formatDayName(fireAt);
    preview.textContent = `You'll be reminded ${when} at ${formatClockTime(fireAt.getHours() * 60 + fireAt.getMinutes())}.`;
}

function renderNotificationStatus() {
    const status = document.getElementById('reminderPermission');
    const isApple = /iPhone|iPad|iPod/.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    let message;
    let button = '';

    if (!('Notification' in window)) {
        message = isApple && !isRunningStandalone()
            ? 'Reminders will appear inside Deepweek while it\'s open. To get notifications on iPhone or iPad, add Deepweek to your Home Screen (Share → Add to Home Screen) and set reminders there.'
            : 'This browser can\'t show notifications. Reminders will appear inside Deepweek while it\'s open.';
    } else if (Notification.permission === 'granted') {
        message = 'Notifications are on. Reminders also appear when Deepweek is in the background.';
    } else if (Notification.permission === 'denied') {
        message = 'Notifications are blocked for this site, so reminders only appear inside Deepweek. To turn them on, allow notifications in your browser\'s site settings.';
    } else {
        message = 'Turn on notifications to get reminders when Deepweek is in the background.';
        button = '<button class="icon-btn" type="button" onclick="enableNotifications()">Turn on notifications</button>';
    }

    status.innerHTML = `
        <p>${escapeHtml(message)}</p>
        ${button}
        <p class="reminder-note">Deepweek has to be open for reminders to go off. A background tab or minimized window is fine.</p>
    `;
}

async function enableNotifications() {
    if (!('Notification' in window)) return;
    try {
        await Notification.requestPermission();
    } catch (error) {
        console.error('Notification permission request failed:', error);
    }
    renderNotificationStatus();
}

function saveReminder() {
    if (!reminderEditing) return;
    const found = findDayAndTask(reminderEditing.dayId, reminderEditing.sectionId, reminderEditing.taskId);
    if (!found) return;
    const { day, task } = found;

    if (!parseISODate(day.date)) {
        showToast('This day has no date, so a reminder can\'t be scheduled', 'warning');
        return;
    }
    const start = timeInputToMinutes(document.getElementById('reminderTimeInput').value);
    if (start === null) {
        showToast('Pick a time for this task', 'warning');
        return;
    }

    // Ask for notifications on the first reminder, while we still have the click
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
    }

    // Keep the task's own wording for its time unless the time actually changed
    if (parseTaskTime(task.time) !== start) task.time = formatClockTime(start);
    task.reminder = normalizeReminder(Number(document.getElementById('reminderOffsetInput').value));

    updateReminderState(state => { delete state.snoozed[task.id]; });

    saveData();
    closeReminderModal();
    renderDays();
    showToast(`Reminder set: ${reminderLabel(task.reminder).toLowerCase()}`, 'success');
    checkReminders();
}

function removeReminder() {
    if (!reminderEditing) return;
    const found = findDayAndTask(reminderEditing.dayId, reminderEditing.sectionId, reminderEditing.taskId);
    if (!found) return;
    found.task.reminder = null;
    updateReminderState(state => { delete state.snoozed[found.task.id]; });
    saveData();
    closeReminderModal();
    renderDays();
    showToast('Reminder removed', 'success');
}

// The button shown on a task row
function reminderButtonHtml(day, section, task) {
    const ids = `'${day.id}', '${section.id}', '${task.id}'`;
    if (normalizeReminder(task.reminder) === null) {
        return `<button class="icon-btn" onclick="openReminderModal(${ids})" title="Get reminded about this task">+ Remind</button>`;
    }
    const schedulable = reminderFireTime(day, task) !== null;
    const title = schedulable
        ? `Reminder: ${reminderLabel(task.reminder).toLowerCase()}`
        : 'This reminder needs a time it can read, like 2:30 PM. Click to fix it.';
    return `
        <button class="task-reminder${schedulable ? '' : ' invalid'}" onclick="openReminderModal(${ids})" title="${escapeHtml(title)}">
            <span aria-hidden="true">⏰</span> ${escapeHtml(reminderLabel(task.reminder, true))}${schedulable ? '' : ' !'}
        </button>
    `;
}

// Notification clicks: the service worker asks an open window to show the day,
// or opens a new one with ?week=…&day=… in the address
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
        const message = event.data;
        if (message && message.type === 'open-day') {
            openReminderDay(message.weekId, message.dayId);
        }
    });
}

function openDayFromAddress() {
    const params = new URLSearchParams(window.location.search);
    const weekId = params.get('week');
    const dayId = params.get('day');
    if (!weekId || !dayId) return;
    openReminderDay(weekId, dayId);
    params.delete('week');
    params.delete('day');
    const query = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : '') + window.location.hash);
}

window.addEventListener('load', () => {
    openDayFromAddress();
    checkReminders();
    // Background tabs run timers about once a minute, so reminders stay within a minute or so
    setInterval(checkReminders, REMINDER_CHECK_INTERVAL_MS);
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkReminders();
});
