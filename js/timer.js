// Pomodoro Timer
let timerInterval = null;
let timerSettings = {
    focusLength: 25,
    shortBreak: 5,
    longBreak: 15,
    pomosUntilLongBreak: 4,
    completedPomos: 0
};
let timerSeconds = timerSettings.focusLength * 60;
let timerMode = 'focus'; // 'focus', 'shortBreak', 'longBreak'
let isRunning = false;

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function startTimer() {
    if (isRunning) return;
    isRunning = true;
    document.getElementById('startBtn').style.display = 'none';
    document.getElementById('pauseBtn').style.display = 'inline-block';
    
    timerInterval = setInterval(() => {
        timerSeconds--;
        document.getElementById('timerDisplay').textContent = formatTime(timerSeconds);
        
        if (timerSeconds <= 0) {
            clearInterval(timerInterval);
            isRunning = false;
            
            // Determine next mode
            if (timerMode === 'focus') {
                timerSettings.completedPomos++;
                
                // Check if it's time for a long break
                if (timerSettings.completedPomos % timerSettings.pomosUntilLongBreak === 0) {
                    timerMode = 'longBreak';
                    timerSeconds = timerSettings.longBreak * 60;
                    document.getElementById('timerMode').textContent = 'Long Break';
                } else {
                    timerMode = 'shortBreak';
                    timerSeconds = timerSettings.shortBreak * 60;
                    document.getElementById('timerMode').textContent = 'Short Break';
                }
            } else {
                timerMode = 'focus';
                timerSeconds = timerSettings.focusLength * 60;
                document.getElementById('timerMode').textContent = 'Focus Mode';
            }
            
            document.getElementById('timerDisplay').textContent = formatTime(timerSeconds);
            document.getElementById('startBtn').style.display = 'inline-block';
            document.getElementById('pauseBtn').style.display = 'none';
            
            // Notification (sendSystemNotification also works on Android and installed iPhone apps)
            sendSystemNotification(timerMode === 'focus' ? 'Break is over!' : 'Time to focus!', {
                tag: 'focus-timer',
                icon: 'assets/icons/icon-192.png'
            });
        }
    }, 1000);
}

function pauseTimer() {
    clearInterval(timerInterval);
    isRunning = false;
    document.getElementById('startBtn').style.display = 'inline-block';
    document.getElementById('pauseBtn').style.display = 'none';
}

function resetTimer() {
    clearInterval(timerInterval);
    isRunning = false;
    timerMode = 'focus';
    timerSeconds = timerSettings.focusLength * 60;
    document.getElementById('timerDisplay').textContent = formatTime(timerSeconds);
    document.getElementById('timerMode').textContent = 'Focus Mode';
    document.getElementById('startBtn').style.display = 'inline-block';
    document.getElementById('pauseBtn').style.display = 'none';
}

// Request notification permission on load
if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}

// Timer Settings
function openTimerSettings() {
    document.getElementById('focusLengthInput').value = timerSettings.focusLength;
    document.getElementById('shortBreakInput').value = timerSettings.shortBreak;
    document.getElementById('longBreakInput').value = timerSettings.longBreak;
    document.getElementById('pomosInput').value = timerSettings.pomosUntilLongBreak;
    document.getElementById('timerSettingsModal').classList.add('active');
}

function closeTimerSettings() {
    document.getElementById('timerSettingsModal').classList.remove('active');
}

function saveTimerSettings() {
    const focus = parseInt(document.getElementById('focusLengthInput').value);
    const shortBreak = parseInt(document.getElementById('shortBreakInput').value);
    const longBreak = parseInt(document.getElementById('longBreakInput').value);
    const pomos = parseInt(document.getElementById('pomosInput').value);
    
    if (focus < 1 || shortBreak < 1 || longBreak < 1 || pomos < 1) {
        if (typeof showToast === 'function') {
            showToast('All values must be at least 1 minute', 'warning');
        } else {
            alert('All values must be at least 1 minute');
        }
        return;
    }
    
    timerSettings.focusLength = focus;
    timerSettings.shortBreak = shortBreak;
    timerSettings.longBreak = longBreak;
    timerSettings.pomosUntilLongBreak = pomos;
    
    // Save to localStorage
    try {
        localStorage.setItem('pomodoroSettings', JSON.stringify(timerSettings));
    } catch (error) {
        console.error('Could not save timer settings:', error);
    }
    
    // Reset timer with new settings if not running
    if (!isRunning && timerMode === 'focus') {
        timerSeconds = timerSettings.focusLength * 60;
        document.getElementById('timerDisplay').textContent = formatTime(timerSeconds);
    }
    
    closeTimerSettings();
    
    // Show success notification
    if (typeof showToast === 'function') {
        showToast('Timer settings saved', 'success');
    }
}

function loadTimerSettings() {
    let saved = null;
    try {
        saved = JSON.parse(localStorage.getItem('pomodoroSettings'));
    } catch (error) {
        console.error('Could not load timer settings:', error);
    }
    if (!saved || typeof saved !== 'object') return;

    // Only accept positive whole numbers; keep defaults for anything else
    const positiveInt = value => Number.isInteger(value) && value >= 1;
    ['focusLength', 'shortBreak', 'longBreak', 'pomosUntilLongBreak'].forEach(key => {
        if (positiveInt(saved[key])) timerSettings[key] = saved[key];
    });
    if (Number.isInteger(saved.completedPomos) && saved.completedPomos >= 0) {
        timerSettings.completedPomos = saved.completedPomos;
    }
    timerSeconds = timerSettings.focusLength * 60;
    document.getElementById('timerDisplay').textContent = formatTime(timerSeconds);
}

// Load saved settings on page load
window.addEventListener('load', () => {
    loadTimerSettings();
});
