/**
 * Complete Google Apps Script content embedded for in-browser viewing and 1-click copying.
 * This ensures that on Vercel or any deployment, users can copy the full code directly from the web app.
 */
export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * ============================================================================
 * GOOGLE APPS SCRIPT FOR REAL-TIME HABIT TRACKER BACKEND
 * ============================================================================
 * 
 * HOW TO INSTALL IN GOOGLE SHEETS:
 * 1. Open Google Sheets (create a new blank spreadsheet at sheets.new).
 * 2. Click "Extensions" > "Apps Script" in the top menu.
 * 3. Delete any existing code in the editor, and paste this entire script.
 * 4. Click the "Save" icon (or Ctrl+S).
 * 5. Click the blue "Deploy" button (top right) > "New deployment".
 * 6. Click the gear icon next to "Select type" and choose "Web app".
 * 7. In the settings:
 *    - Description: "Habit Tracker Backend"
 *    - Execute as: "Me" (your Google account)
 *    - Who has access: "Anyone" (IMPORTANT: must be "Anyone" so the app can sync)
 * 8. Click "Deploy".
 * 9. Authorize the permissions when prompted (click "Advanced" > "Go to ... (unsafe)" > "Allow").
 * 10. Copy the "Web app URL" (it looks like: https://script.google.com/macros/s/.../exec).
 * 11. Paste that URL into your Habit Tracker.
 * 
 * That's it! Your Google Sheet will now create all 4 tabs (Habits, Entries, Notes, Routine)
 * automatically and sync all data in real-time as you use the tracker.
 * ============================================================================
 */

const HEADERS = {
  habits: ['id', 'name', 'emoji', 'monthlyGoal', 'order', 'createdAt'],
  entries: ['habitId', 'date', 'completed'],
  notes: ['id', 'text', 'color', 'createdAt'],
  routine: ['id', 'time', 'endTime', 'activity', 'emoji', 'days']
};

function extractTime(val, fallback) {
  if (!val) return fallback;
  if (val instanceof Date) {
    var hh = ('0' + val.getHours()).slice(-2);
    var mm = ('0' + val.getMinutes()).slice(-2);
    return hh + ':' + mm;
  }
  var str = String(val).trim();
  var match = str.match(/(?:^|\s|T)?(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (match) {
    var h = ('0' + parseInt(match[1], 10)).slice(-2);
    var m = match[2];
    return h + ':' + m;
  }
  return fallback;
}

function getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#F5EBE6'); // Terracotta tint
    headerRange.setFontColor('#4A2A1A');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // Ensure all 4 sheets exist with headers
    const habitsSheet = getOrCreateSheet(ss, 'Habits', HEADERS.habits);
    const entriesSheet = getOrCreateSheet(ss, 'Entries', HEADERS.entries);
    const notesSheet = getOrCreateSheet(ss, 'Notes', HEADERS.notes);
    const routineSheet = getOrCreateSheet(ss, 'Routine', HEADERS.routine);

    // Read Habits
    const habitsData = habitsSheet.getDataRange().getValues();
    const habits = [];
    for (let i = 1; i < habitsData.length; i++) {
      const row = habitsData[i];
      if (!row[0]) continue;
      habits.push({
        id: String(row[0]),
        name: String(row[1] || ''),
        emoji: String(row[2] || '🎯'),
        monthlyGoal: Number(row[3]) || 25,
        order: Number(row[4]) || 0,
        createdAt: row[5] ? String(row[5]) : new Date().toISOString()
      });
    }

    // Read Entries
    const entriesData = entriesSheet.getDataRange().getValues();
    const entries = [];
    for (let i = 1; i < entriesData.length; i++) {
      const row = entriesData[i];
      if (!row[0]) continue;
      entries.push({
        habitId: String(row[0]),
        date: String(row[1] || ''),
        completed: Boolean(row[2] === true || String(row[2]).toLowerCase() === 'true')
      });
    }

    // Read Notes
    const notesData = notesSheet.getDataRange().getValues();
    const notes = [];
    for (let i = 1; i < notesData.length; i++) {
      const row = notesData[i];
      if (!row[0]) continue;
      notes.push({
        id: String(row[0]),
        text: String(row[1] || ''),
        color: String(row[2] || '#C4704B'),
        createdAt: row[3] ? String(row[3]) : new Date().toISOString()
      });
    }

    // Read Routine
    const routineData = routineSheet.getDataRange().getValues();
    const routine = [];
    for (let i = 1; i < routineData.length; i++) {
      const row = routineData[i];
      if (!row[0]) continue;
      let days = [];
      try {
        if (typeof row[5] === 'string' && row[5].startsWith('[')) {
          days = JSON.parse(row[5]);
        } else if (typeof row[5] === 'string') {
          days = row[5].split(',').map(d => Number(d.trim())).filter(d => !isNaN(d));
        } else if (Array.isArray(row[5])) {
          days = row[5];
        }
      } catch (err) {
        days = [0, 1, 2, 3, 4, 5, 6];
      }
      routine.push({
        id: String(row[0]),
        time: extractTime(row[1], '08:00'),
        endTime: extractTime(row[2], '09:00'),
        activity: String(row[3] || ''),
        emoji: String(row[4] || '🎯'),
        days: days.length > 0 ? days : [0, 1, 2, 3, 4, 5, 6]
      });
    }

    const payload = {
      habits: habits,
      entries: entries,
      notes: notes,
      routine: routine,
      version: 1,
      timestamp: new Date().toISOString()
    };

    return ContentService.createTextOutput(JSON.stringify(payload))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    let body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. Sync Habits if provided
    if (body.habits && Array.isArray(body.habits)) {
      const sheet = getOrCreateSheet(ss, 'Habits', HEADERS.habits);
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.getRange(2, 1, lastRow - 1, HEADERS.habits.length).clearContent();
      }
      if (body.habits.length > 0) {
        const rows = body.habits.map(h => [
          h.id,
          h.name || '',
          h.emoji || '🎯',
          h.monthlyGoal || 25,
          h.order !== undefined ? h.order : 0,
          h.createdAt || new Date().toISOString()
        ]);
        sheet.getRange(2, 1, rows.length, HEADERS.habits.length).setValues(rows);
      }
    }

    // 2. Sync Entries if provided
    if (body.entries && Array.isArray(body.entries)) {
      const sheet = getOrCreateSheet(ss, 'Entries', HEADERS.entries);
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.getRange(2, 1, lastRow - 1, HEADERS.entries.length).clearContent();
      }
      if (body.entries.length > 0) {
        const rows = body.entries.map(ent => [
          ent.habitId,
          ent.date,
          ent.completed ? true : false
        ]);
        sheet.getRange(2, 1, rows.length, HEADERS.entries.length).setValues(rows);
      }
    }

    // 3. Sync Notes if provided
    if (body.notes && Array.isArray(body.notes)) {
      const sheet = getOrCreateSheet(ss, 'Notes', HEADERS.notes);
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.getRange(2, 1, lastRow - 1, HEADERS.notes.length).clearContent();
      }
      if (body.notes.length > 0) {
        const rows = body.notes.map(n => [
          n.id,
          n.text || '',
          n.color || '#C4704B',
          n.createdAt || new Date().toISOString()
        ]);
        sheet.getRange(2, 1, rows.length, HEADERS.notes.length).setValues(rows);
      }
    }

    // 4. Sync Routine if provided
    if (body.routine && Array.isArray(body.routine)) {
      const sheet = getOrCreateSheet(ss, 'Routine', HEADERS.routine);
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.getRange(2, 1, lastRow - 1, HEADERS.routine.length).clearContent();
      }
      if (body.routine.length > 0) {
        var rows = body.routine.map(function(r) {
          return [
            r.id,
            extractTime(r.time, '08:00'),
            extractTime(r.endTime, '09:00'),
            r.activity || '',
            r.emoji || '🎯',
            JSON.stringify(r.days || [0, 1, 2, 3, 4, 5, 6])
          ];
        });
        sheet.getRange(2, 2, rows.length, 2).setNumberFormat('@');
        sheet.getRange(2, 1, rows.length, HEADERS.routine.length).setValues(rows);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}`;
