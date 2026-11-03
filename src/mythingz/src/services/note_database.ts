import type { BrowserDatabase } from '../web/database';
import { currentTimestamp } from './database_types';

// Create or update a note and refresh its modification timestamp.
export async function saveNote(
  database: BrowserDatabase,
  note: { id?: number; title: string; category: string; content: string },
) {
  if (note.id) {
    await database.runAsync(
      'UPDATE notes SET title = ?, category = ?, notes = ?, updated_at = ? WHERE id = ?',
      note.title,
      note.category,
      note.content,
      currentTimestamp(),
      note.id,
    );
    return;
  }
  await database.runAsync(
    'INSERT INTO notes (title, category, notes, updated_at) VALUES (?, ?, ?, ?)',
    note.title,
    note.category,
    note.content,
    currentTimestamp(),
  );
}
