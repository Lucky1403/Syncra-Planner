# Syncra - Task & Meeting Planner (Full-Stack PWA)

Syncra is a premium, high-end, full-stack Progressive Web App (PWA) designed to help you organize your daily tasks, meetings, and schedules. It features a futuristic **dark-mode glassmorphism design**, interactive visual views, a synthesized audio reminder system, centralized database synchronization, and seamless offline capability.

---

## 🚀 Key Features

*   **Centralized Multi-Device Sync**:
    *   **Python Flask API Backend**: A secure REST API that communicates user changes directly with a backend database.
    *   **MySQL Storage (with SQLite Fallback)**: Centralized relational tables for users, events, and subtasks. Runs on SQLite out-of-the-box if MySQL is not configured.
*   **User Session Security**:
    *   **JWT-Based Authentication**: Email and password account registration. Passwords are securely encrypted using `bcrypt`. Login sessions are managed via JWT.
    *   **Profile Control**: Direct logout triggers in the sidebar footer to clear tokens and sync states.
*   **Dual-View Dashboard**: 
    *   **Monthly Calendar**: Grid view with task densities, highlight states, and visual overflow counters.
    *   **Tabular Daily Timeline**: Full 24-hour tabular grid view that lists events side-by-side with a spacious `90px` gap layout, ensuring task events never overlap or get cut off.
*   **Interactive Checkbox Completion Engine**:
    *   **Card Checkboxes**: Mark tasks completed directly on cards in the Timeline and Agenda lists.
    *   **Edit Modal Checklist**: Toggles main event completion or checks off items in the Subtasks Checklist in the edit form directly instead of deleting them.
*   **Smart Alarm & Notification Engine**:
    *   **Web Audio API Oscillator Chimes**: Plays digital chimes directly in your browser. Zero external audio file dependencies.
    *   **Desktop & Mobile Notifications**: Integrated browser alerts with click-to-focus triggers.
    *   **Prior Reminders**: Configure alerts to fire on time, or 5m, 15m, 30m, 1h, or 2h prior to events.
*   **Offline Support & Backups**: Serves cached assets using a background Service Worker for offline operations. Export schedule data as a `.json` backup file or restore it instantly.

---

## ⚙️ Setup & Installation

Please refer to the separate [SETUP.md](file:///d:/Desktop/Task%20Scheduler%20Project/SETUP.md) file for desktop database backend setups, local network hosting, and PWA setup on mobile (Add to Home Screen).

---

## 📁 Project Structure

```text
├── backend/          # Centralized Python Flask API server
│   ├── app.py        # SQLAlchemy schema models, JWT auth routes, and sync handlers
│   ├── requirements.txt # Declares backend libraries (Flask, PyJWT, bcrypt, etc.)
│   └── .env.example  # Template for MySQL credentials
├── index.html        # Main HTML skeleton (includes glassmorphic login overlays)
├── styles.css        # Responsive layouts, tabular timeline rows, and glassmorphic designs
├── app.js            # Frontend logic engine, client API sync calls, and view renders
├── manifest.json     # PWA app configuration (names, colors, display standalone)
├── sw.js             # Service Worker handles offline caching & request interception
├── icon.svg          # Glow-themed vector application launcher icon
└── SETUP.md          # Centralized guide for local hosting and database setup
```
