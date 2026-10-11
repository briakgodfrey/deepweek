# Deepweek

> Formerly **Weekflow**. Your saved planner data carries over automatically.

> A minimalist, monochrome productivity planner built for focused work and intentional planning.

![License](https://img.shields.io/badge/license-proprietary-lightgrey.svg)
![Version](https://img.shields.io/badge/version-1.0.0-green.svg)

## 🎯 Overview

Deepweek is a sleek, browser-based weekly planner designed for anyone who values clean design and powerful functionality. Built with vanilla JavaScript and no build step, it's fast and private.

For now: No accounts, no cloud sync, no subscriptions—just open the file and start planning. All your data stays in your browser, making it perfect for those who prioritize privacy and simplicity.

## ✨ Features

### Core Functionality
- **📅 Multi-Week Planning** - Create and switch between unlimited weeks
- **🗂️ Four Views** - Day, Week, Month, and Calendar (your week on an hourly time grid)
- **✅ Task Management** - Add, edit, delete, and check off tasks with ease
- **↳ Subtasks** - Break a task into steps; finishing the last step finishes the task
- **⏱️ Time Estimates** - Track how long tasks should take
- **🕐 Time Scheduling** - Assign specific times to tasks
- **📝 Daily Notes** - Reflect on your day with built-in note sections
- **💾 Auto-Save** - Everything saves automatically to browser localStorage

### Productivity Tools
- **🍅 Pomodoro Timer** - Built-in focus timer (25-min work / 5-min break)
- **📊 Progress Tracking** - Real-time completion statistics
- **🎨 Clean UI** - Minimalist monochrome design that stays out of your way

### Technical Highlights
- **No Build Step** - Pure HTML, CSS, and JavaScript; the only library (SortableJS) and the fonts are bundled locally
- **Installable App (PWA)** - Install on desktop, Android, or iPhone/iPad and launch it like a native app
- **Offline First** - Works completely offline once loaded, no internet required, no external requests
- **Privacy Focused** - All data stays in your browser, nothing sent to servers
- **Responsive Design** - Works on desktop and mobile devices
- **Data Persistence** - Uses localStorage, with validation, schema versioning, and a warning if saving fails
- **Backup & Restore** - Export and import your planner as JSON (imports are validated before use)

## 🚀 Quick Start

### Option 1: Use It Online and Install It
1. Visit the [live app](https://briakgodfrey.github.io/weekflow) (GitHub Pages)
2. Install it as an app (optional, see below). After the first visit it works offline.

### Option 2: Download and Run Locally
1. Download or clone the whole repo (the app needs the `css/`, `js/`, `vendor/`, and `assets/` folders, not just `index.html`)
2. Open `index.html` in any modern web browser
3. Start planning!

> Opening the file directly works fine, but installing and the offline cache need the app to be served over `https://` (or `http://localhost`). To try the full app locally, run `python3 -m http.server` in the project folder and visit `http://localhost:8000`.

## 📲 Install as an App

Deepweek is a Progressive Web App (PWA): a website you can install and use like a regular app, with its own icon and window, and no app store.

| Platform | How to install |
|---|---|
| **Chrome / Edge (Windows, Mac, Linux, ChromeOS)** | Click **+ Install App** in the sidebar, or the install icon in the address bar |
| **Android (Chrome)** | Tap **+ Install App**, or menu ⋮ → **Install app** |
| **iPhone / iPad (Safari)** | Tap **Share** → **Add to Home Screen** |
| **Mac (Safari 17+)** | **File** → **Add to Dock** |

Once installed:
- It opens in its own window and works with no internet connection
- Your data stays on your device, the same as in the browser. On desktop and Android the installed app shares data with the browser tab. On iPhone/iPad the Home Screen app keeps its own separate copy, so use Export/Import to move existing data into it.
- The app asks the browser to keep its storage persistent so your planner isn't cleared when disk space runs low
- When a new version is published, you'll see **"A new version of Deepweek is available"**. Click **Reload** to update. Your data is kept.

> 💡 Export a backup now and then (**Ctrl+S**). Clearing your browser's site data or uninstalling the app can delete your planner.

## 📖 How to Use

### Creating Your First Week
1. The planner starts with a default week beginning today
2. Click **"+ New Week"** to create additional weeks
3. Switch between weeks using the sidebar navigation

### Managing Tasks
- Click **"+ Add Section"** to create task categories (e.g., "Workout", "Study")
- Click **"+ Task"** within a section to add tasks
- Click any text to edit it inline
- Check boxes to mark tasks complete
- Click **"+ Est"** to add time estimates
- Click **"+ Time"** to schedule when you'll do it

### Switching Views
Use the **Day / Week / Month / Calendar** switcher at the top, or press **1**–**4**.
- **Day** - One day at a time. Use the day strip or the ‹ › arrows to move between days.
- **Week** - Every day of the week, stacked.
- **Month** - A month grid with a preview of each day's tasks. Click a day to open it, or click an empty date to start a new week there.
- **Calendar** - The week on an hourly grid. Tasks with a **Time** appear as blocks sized by their **Est** (e.g. `45 min`, `1.5 hrs`). Tasks without a time are counted as "untimed" under each day.

### Subtasks
- Click **"+ Sub"** on any task to add a step under it
- Check off steps individually; checking the parent task checks off all its steps
- Drag steps by their handle to reorder them

### Using the Pomodoro Timer
1. Click **"Start"** in the sidebar to begin a 25-minute focus session
2. The timer will automatically switch to a 5-minute break
3. Notifications alert you when sessions complete (enable browser notifications)

### Daily Notes
- Each day card has a notes section at the bottom
- Perfect for reflections, wins, or things you learned
- Auto-saves as you type

## 🛠️ Technical Details

**Built With:**
- HTML5
- CSS3 (Custom properties, Flexbox, Grid)
- Vanilla JavaScript (ES6+)
- SortableJS (bundled in `vendor/`, MIT)
- Manrope and IBM Plex Mono (self-hosted in `assets/fonts/`, SIL OFL 1.1)

**App Files:**
- `manifest.webmanifest` - App name, icons, and colors used when installed
- `sw.js` - Service worker that caches the app for offline use
- `js/pwa.js` - Registers the service worker, shows the update prompt and the install button
- `assets/icons/` - App icons (`icon.svg` is the source; the PNGs are generated from it)

**Browser Compatibility:**
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

**Data Storage:**
- localStorage (5-10MB limit depending on browser)
- Data persists between sessions
- Export with **Ctrl+S**, import from a JSON backup
- If saved data can't be read, a copy is kept under a `plannerData.corrupt-<timestamp>` key and the app starts fresh

## 🚢 Releasing Updates

The service worker serves the app from a cache, so browsers only pick up changes when `sw.js` itself changes. For every release:

1. Make your changes.
2. If you **added or renamed a file** the app loads, add it to the `APP_SHELL` list in `sw.js`. If any listed file is missing, the update won't install and users stay on the previous version.
3. **Bump `CACHE_VERSION`** in `sw.js` (e.g. `'v2'` → `'v3'`), and change the `?v=` on the CSS/JS links in `index.html` to match (e.g. `?v=3`). The `?v=` makes sure browsers don't combine the new page with an old cached stylesheet or script.
4. If you changed the shape of the saved data, bump `SCHEMA_VERSION` in `js/planner.js` and add a migration step in `migratePlannerData()`.
5. Deploy. Returning users see the update prompt the next time they open the app.

## 🎨 Design Philosophy

The design embraces **refined minimalism**:
- Monochrome color palette for reduced visual noise
- IBM Plex Mono for technical precision
- Manrope for readable, modern display text
- Subtle animations and micro-interactions
- Focus on content, not decoration

## 🔮 Future Enhancements

- [X] Dark mode toggle
- [X] Data export (JSON/CSV)
- [X] Drag-and-drop task reordering
- [ ] Recurring tasks
- [X] Calendar view
- [X] Day and month views
- [X] Subtasks
- [ ] Time blocking visualization
- [ ] Weekly/monthly analytics
- [ ] Import from Google Calendar
- [X] Installable app (PWA) for desktop and mobile
- [ ] App store versions

## 🤝 Contributing

This is a personal project, but suggestions and feedback are welcome! Feel free to:
- Open issues for bugs or feature requests
- Submit pull requests for improvements
- Fork and customize for your own use

## 📄 License

Proprietary License - Free to use as-is for personal or commercial purposes. Modifications and derivative works are not permitted. See LICENSE file for full terms.

## 👩‍💻 About

Built by **Bria** ([Briabytes](https://github.com/briakgodfrey))

This planner was born from a simple need: a productivity tool that's fast, private, and doesn't require creating yet another account. No cloud sync, no subscription, no tracking—just a solid planner that works offline and respects your data.

Perfect for students juggling coursework, developers managing side projects, or anyone who wants to plan their week without the bloat of traditional productivity apps.

**Connect:**
- 🌐 [Blog](https://briabytes.com)
- 📺 [Twitch](https://twitch.tv/briabytes)

## 🙏 Acknowledgments

- Fonts: [Manrope](https://fonts.google.com/specimen/Manrope) & [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono) (SIL Open Font License 1.1, see `assets/fonts/`)
- Drag and drop: [SortableJS](https://github.com/SortableJS/Sortable) (MIT, see `vendor/sortablejs/LICENSE`)
- Inspired by the need for a productivity tool that's beautiful, functional, and respects user privacy

---

⭐ **Star this repo if you find it useful!** ⭐
