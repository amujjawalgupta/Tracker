import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import https from 'node:https';
import { fileURLToPath } from 'url';

// Load .env.local first, fallback to .env
dotenv.config({ path: '.env.local' });
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Dynamically use Google Sheet URL provided by client in header if present
app.use((req, _res, next) => {
  const clientUrl = req.headers['x-sheet-url'];
  if (clientUrl && typeof clientUrl === 'string' && clientUrl.trim()) {
    if (clientUrl.trim() !== googleScriptUrl) {
      googleScriptUrl = clientUrl.trim();
    }
  }
  next();
});

// In-memory state cache
let state = {
  habits: [
    { id: '1', name: 'Wake up at 06:00', emoji: '⏰', monthlyGoal: 25, createdAt: new Date().toISOString(), order: 0 },
    { id: '2', name: 'Workout', emoji: '🏋️', monthlyGoal: 26, createdAt: new Date().toISOString(), order: 1 },
    { id: '3', name: 'Read 20 Pages', emoji: '📖', monthlyGoal: 24, createdAt: new Date().toISOString(), order: 2 },
    { id: '4', name: 'Meditate', emoji: '🧘', monthlyGoal: 28, createdAt: new Date().toISOString(), order: 3 },
    { id: '5', name: 'No Junk Food', emoji: '🥗', monthlyGoal: 27, createdAt: new Date().toISOString(), order: 4 },
    { id: '6', name: 'Budget Tracking', emoji: '💰', monthlyGoal: 23, createdAt: new Date().toISOString(), order: 5 },
    { id: '7', name: 'Social Media Detox', emoji: '📵', monthlyGoal: 23, createdAt: new Date().toISOString(), order: 6 },
    { id: '8', name: 'Journal My Day', emoji: '📝', monthlyGoal: 28, createdAt: new Date().toISOString(), order: 7 },
    { id: '9', name: 'Cold Shower', emoji: '🚿', monthlyGoal: 24, createdAt: new Date().toISOString(), order: 8 },
    { id: '10', name: 'Eat Healthy', emoji: '🍎', monthlyGoal: 26, createdAt: new Date().toISOString(), order: 9 },
  ],
  entries: [],
  notes: [],
  routine: [
    { id: 'r1', time: '06:00', endTime: '06:30', activity: 'Wake Up & Stretch', emoji: '🌅', days: [0, 1, 2, 3, 4, 5, 6] },
    { id: 'r2', time: '06:30', endTime: '07:30', activity: 'Morning Workout', emoji: '🏋️', days: [1, 2, 3, 4, 5] },
    { id: 'r3', time: '07:30', endTime: '08:00', activity: 'Breakfast', emoji: '🥗', days: [0, 1, 2, 3, 4, 5, 6] },
    { id: 'r4', time: '08:00', endTime: '12:00', activity: 'Deep Work Block', emoji: '💻', days: [1, 2, 3, 4, 5] },
    { id: 'r5', time: '12:00', endTime: '13:00', activity: 'Lunch Break', emoji: '🍱', days: [0, 1, 2, 3, 4, 5, 6] },
    { id: 'r6', time: '13:00', endTime: '17:00', activity: 'Focused Study', emoji: '📖', days: [1, 2, 3, 4, 5] },
    { id: 'r7', time: '17:00', endTime: '18:00', activity: 'Exercise / Walk', emoji: '🚶', days: [0, 1, 2, 3, 4, 5, 6] },
    { id: 'r8', time: '19:00', endTime: '19:45', activity: 'Dinner', emoji: '🍽️', days: [0, 1, 2, 3, 4, 5, 6] },
    { id: 'r9', time: '20:00', endTime: '21:30', activity: 'Reading / Hobby', emoji: '📚', days: [0, 1, 2, 3, 4, 5, 6] },
    { id: 'r10', time: '22:00', endTime: '22:30', activity: 'Wind Down & Sleep', emoji: '😴', days: [0, 1, 2, 3, 4, 5, 6] },
  ],
  version: 1
};

const STATE_CACHE_FILE = path.join(__dirname, '.tracker-state.json');
try {
  if (fs.existsSync(STATE_CACHE_FILE)) {
    const cached = JSON.parse(fs.readFileSync(STATE_CACHE_FILE, 'utf8'));
    if (cached && typeof cached === 'object') {
      if (Array.isArray(cached.habits) && cached.habits.length > 0) state.habits = cached.habits;
      if (Array.isArray(cached.entries)) state.entries = cached.entries;
      if (Array.isArray(cached.notes)) state.notes = cached.notes;
      if (Array.isArray(cached.routine) && cached.routine.length > 0) state.routine = normalizeRoutineItems(cached.routine);
    }
  }
} catch (e) {}

function persistLocalState() {
  try {
    fs.writeFileSync(STATE_CACHE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {}
}

let googleScriptUrl = process.env.GOOGLE_SCRIPT_URL || process.env.VITE_GOOGLE_SCRIPT_URL || '';
let isSyncing = false;
let syncTimeout = null;
let lastSyncedAt = null;
let lastSyncError = null;
let lastFetchedAt = 0;

// Reliable HTTPS request helper with redirect following
function httpsFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(url);
      const reqOptions = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers: options.headers || {},
      };

      const req = https.request(reqOptions, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          return resolve(httpsFetch(res.headers.location, { ...options, method: 'GET', body: undefined }));
        }
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });

      req.on('error', reject);
      if (options.body) {
        req.write(options.body);
      }
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

// Helper to normalize routine time strings to HH:MM format
function normalizeTime(val, fallback = '08:00') {
  if (val === undefined || val === null || val === '') return fallback;
  if (val instanceof Date) {
    const hh = String(val.getHours()).padStart(2, '0');
    const mm = String(val.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  let str = String(val).trim();
  
  const num = Number(str);
  if (!isNaN(num) && num >= 0 && num < 1 && str.includes('.')) {
    const totalMins = Math.round(num * 24 * 60);
    const h = String(Math.floor(totalMins / 60)).padStart(2, '0');
    const m = String(totalMins % 60).padStart(2, '0');
    return `${h}:${m}`;
  }
  
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    if (str.includes('1899')) {
      str = str.replace('1899-12-30', '2000-01-01');
    }
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      return `${h}:${m}`;
    }
  }

  const match = str.match(/(?:^|\s|T)?(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (match) {
    const h = String(parseInt(match[1], 10)).padStart(2, '0');
    const m = match[2];
    return `${h}:${m}`;
  }
  return fallback;
}

function normalizeRoutineItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map(r => ({
    ...r,
    time: normalizeTime(r.time, '08:00'),
    endTime: normalizeTime(r.endTime, '09:00'),
    days: Array.isArray(r.days) && r.days.length > 0 ? r.days : [0, 1, 2, 3, 4, 5, 6]
  }));
}

// Helper to push queued state to Google Apps Script
async function pushToGoogleSheet() {
  if (!googleScriptUrl) {
    console.log('[GoogleSheet] No GOOGLE_SCRIPT_URL configured yet. Stored in memory.');
    return;
  }

  isSyncing = true;
  try {
    console.log(`[GoogleSheet] Syncing to Google Sheets (${state.habits.length} habits, ${state.entries.length} entries, ${state.notes.length} notes)...`);
    const payload = JSON.stringify({
      habits: state.habits,
      entries: state.entries,
      notes: state.notes,
      routine: state.routine,
      version: state.version
    });

    const res = await httpsFetch(googleScriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      body: payload
    });

    lastSyncedAt = new Date().toISOString();
    lastSyncError = null;
    console.log('[GoogleSheet] ✅ Real-time sync to Google Sheets successful at', lastSyncedAt);
  } catch (error) {
    lastSyncError = error.message;
    console.error('[GoogleSheet] ❌ Error syncing to Google Sheets:', error.message);
  } finally {
    isSyncing = false;
  }
}

let lastClientUpdateAt = 0;

// Debounce helper to prevent spamming Google Sheets on rapid interactions
function scheduleSync() {
  persistLocalState();
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    pushToGoogleSheet();
  }, 400);
}

// Fetch all data from Google Sheets
async function fetchFromGoogleSheet(force = false) {
  if (!googleScriptUrl) return;

  // Protect recently pushed local changes from being overwritten by stale Google Sheets data
  if (!force && (isSyncing || syncTimeout || Date.now() - lastClientUpdateAt < 4000)) {
    console.log('[GoogleSheet] Skipping fetchFromGoogleSheet: recent local mutation in progress.');
    return;
  }

  try {
    console.log('[GoogleSheet] Fetching latest data from Google Sheets...');
    const res = await httpsFetch(googleScriptUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (res.body) {
      const data = JSON.parse(res.body);
      // Double check after network roundtrip that a client mutation didn't happen while fetching
      if (!force && Date.now() - lastClientUpdateAt < 4000) {
        console.log('[GoogleSheet] Discarding fetched data: local mutation occurred during fetch.');
        return;
      }

      if (data && Array.isArray(data.habits)) {
        if (data.habits.length > 0 || state.habits.length === 0) {
          state.habits = data.habits;
        } else if (Date.now() - lastClientUpdateAt > 10000) {
          state.habits = data.habits;
        }
        if (data.entries) state.entries = data.entries;
        if (data.notes) state.notes = data.notes;
        if (data.routine && data.routine.length > 0) state.routine = normalizeRoutineItems(data.routine);
        lastFetchedAt = Date.now();
        lastSyncedAt = new Date().toISOString();
        lastSyncError = null;
        console.log(`[GoogleSheet] ✅ Fetched fresh data from Google Sheets (${state.habits.length} habits, ${state.entries.length} entries, ${state.notes.length} notes).`);
      }
    }
  } catch (error) {
    lastSyncError = error.message;
    console.error('[GoogleSheet] ❌ Could not fetch from Google Sheets:', error.message);
  }
}

// Initial fetch on server start
if (googleScriptUrl) {
  fetchFromGoogleSheet();
}

// Live background poll: checks Google Sheets every 4 seconds for external updates
setInterval(() => {
  if (
    googleScriptUrl &&
    !isSyncing &&
    !syncTimeout &&
    Date.now() - lastClientUpdateAt > 4000 &&
    Date.now() - lastFetchedAt > 3500
  ) {
    fetchFromGoogleSheet();
  }
}, 4000);

// ─── API Routes ──────────────────────────────────────────────

// Health & connection status
app.get(['/api/status', '/status'], (_req, res) => {
  res.json({
    configured: Boolean(googleScriptUrl),
    scriptUrl: googleScriptUrl ? `${googleScriptUrl.slice(0, 35)}...` : '',
    isSyncing,
    lastSyncedAt,
    lastSyncError,
    habitsCount: state.habits.length,
    entriesCount: state.entries.length,
    notesCount: state.notes.length,
    routineCount: state.routine.length
  });
});

// Update or clear Google Apps Script URL dynamically
app.post(['/api/config', '/config'], async (req, res) => {
  const { scriptUrl } = req.body;

  // Handle clearing / disconnecting
  if (!scriptUrl || typeof scriptUrl !== 'string' || !scriptUrl.trim()) {
    googleScriptUrl = '';
    try {
      const envPath = path.join(__dirname, '.env.local');
      if (fs.existsSync(envPath)) fs.unlinkSync(envPath);
    } catch {}
    console.log('[Config] Google Sheet disconnected and cleared.');
    return res.json({ status: 'cleared', configured: false, scriptUrl: '' });
  }

  googleScriptUrl = scriptUrl.trim();

  // Save to .env.local if filesystem is writable (local dev)
  try {
    const envPath = path.join(__dirname, '.env.local');
    const envContent = `VITE_GOOGLE_SCRIPT_URL=${googleScriptUrl}\nGOOGLE_SCRIPT_URL=${googleScriptUrl}\n`;
    fs.writeFileSync(envPath, envContent, 'utf8');
  } catch (fsErr) {
    console.log('[Config] Read-only filesystem (e.g. Vercel serverless), script URL cached in memory.');
  }

  console.log('[Config] Updated Google Apps Script URL. Testing connection and initial sync...');
  await fetchFromGoogleSheet(true);

  // If the connected sheet was empty (0 habits), initialize it with all default habits and routine!
  let initializedSheet = false;
  if (state.habits.length === 0) {
    console.log('[Config] Brand new empty sheet detected. Initializing all habits, routine, and entries...');
    initializedSheet = true;
    await pushToGoogleSheet();
  }

  res.json({
    status: 'success',
    configured: true,
    scriptUrl: googleScriptUrl,
    initializedSheet,
    habitsCount: state.habits.length
  });
});

// Explicit DELETE route to clear Google Sheet configuration
app.delete(['/api/config', '/config'], (_req, res) => {
  googleScriptUrl = '';
  try {
    const envPath = path.join(__dirname, '.env.local');
    if (fs.existsSync(envPath)) fs.unlinkSync(envPath);
  } catch {}
  console.log('[Config] Google Sheet disconnected and cleared via DELETE.');
  res.json({ status: 'cleared', configured: false, scriptUrl: '' });
});

// Get all tracker data - automatically fetches fresh if older than 2.5s and no pending local changes
app.get(['/api/data', '/data'], async (req, res) => {
  if (
    googleScriptUrl &&
    !isSyncing &&
    !syncTimeout &&
    Date.now() - lastClientUpdateAt > 4000 &&
    (req.query.fresh === 'true' || Date.now() - lastFetchedAt > 2500)
  ) {
    await fetchFromGoogleSheet();
  }
  res.json(state);
});

// Full state sync
app.post(['/api/sync', '/sync'], async (req, res) => {
  lastClientUpdateAt = Date.now();
  const { habits, entries, notes, routine } = req.body;
  if (habits && Array.isArray(habits)) state.habits = habits;
  if (entries && Array.isArray(entries)) state.entries = entries;
  if (notes && Array.isArray(notes)) state.notes = notes;
  if (routine && Array.isArray(routine)) state.routine = normalizeRoutineItems(routine);

  if (process.env.VERCEL) {
    await pushToGoogleSheet();
  } else {
    scheduleSync();
  }
  res.json({ status: 'success', timestamp: new Date().toISOString() });
});

// Real-time delete habit: deletes immediately from memory and pushes directly to Google Sheets
app.delete(['/api/habits/:id', '/habits/:id'], async (req, res) => {
  const { id } = req.params;
  lastClientUpdateAt = Date.now();
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }
  state.habits = state.habits.filter(h => h.id !== id);
  state.entries = state.entries.filter(e => e.habitId !== id);
  console.log(`[Delete] Deleted habit id ${id} in real time. Pushing immediately to Google Sheets...`);
  
  await pushToGoogleSheet();
  res.json({ status: 'success', deletedId: id, habitsCount: state.habits.length });
});

// Habits update
app.post(['/api/habits', '/habits'], async (req, res) => {
  lastClientUpdateAt = Date.now();
  const { habits } = req.body;
  if (habits && Array.isArray(habits)) {
    state.habits = habits;
    if (process.env.VERCEL) {
      await pushToGoogleSheet();
    } else {
      scheduleSync();
    }
  }
  res.json({ status: 'success', habits: state.habits });
});

// Real-time entry toggle
app.post(['/api/entry/toggle', '/entry/toggle'], async (req, res) => {
  lastClientUpdateAt = Date.now();
  const { habitId, date, completed } = req.body;
  if (!habitId || !date) {
    return res.status(400).json({ error: 'habitId and date required' });
  }

  const existingIndex = state.entries.findIndex(e => e.habitId === habitId && e.date === date);
  if (existingIndex >= 0) {
    if (completed === false || state.entries[existingIndex].completed) {
      state.entries.splice(existingIndex, 1);
    } else {
      state.entries[existingIndex].completed = true;
    }
  } else {
    state.entries.push({ habitId, date, completed: true });
  }

  if (process.env.VERCEL) {
    await pushToGoogleSheet();
  } else {
    scheduleSync();
  }
  res.json({ status: 'success', entries: state.entries });
});

// Notes update
app.post(['/api/notes', '/notes'], async (req, res) => {
  lastClientUpdateAt = Date.now();
  const { notes } = req.body;
  if (notes && Array.isArray(notes)) {
    state.notes = notes;
    if (process.env.VERCEL) {
      await pushToGoogleSheet();
    } else {
      scheduleSync();
    }
  }
  res.json({ status: 'success', notes: state.notes });
});

// Routine update
app.post(['/api/routine', '/routine'], async (req, res) => {
  lastClientUpdateAt = Date.now();
  const { routine } = req.body;
  if (routine && Array.isArray(routine)) {
    state.routine = normalizeRoutineItems(routine);
    if (process.env.VERCEL) {
      await pushToGoogleSheet();
    } else {
      scheduleSync();
    }
  }
  res.json({ status: 'success', routine: state.routine });
});

export default app;

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n🚀 Tracker Backend Server running at http://localhost:${PORT}`);
    console.log(`📊 Google Sheets Sync: ${googleScriptUrl ? 'CONFIGURED (' + googleScriptUrl.slice(0, 30) + '...)' : 'Awaiting Script URL'}`);
    console.log(`🔗 API endpoints available under /api/*\n`);
  });
}
