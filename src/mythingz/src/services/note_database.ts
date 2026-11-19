import { currentTimestamp } from './database_types';
import { notesApi } from '../../../api/records.api';

// Create or update a note and refresh its modification timestamp.
export async function saveNote(
  note: { id?: number; title: string; category: string; content: string },
) {
  if (note.id) {
    const updated = await notesApi.update(note.id, {
      title: note.title,
      category: note.category,
      notes: note.content,
      updated_at: currentTimestamp(),
    });
    if (!updated) throw new Error('This note no longer exists.');
    return;
  }
  await notesApi.create({
    title: note.title,
    category: note.category,
    notes: note.content,
    updated_at: currentTimestamp(),
  });
}

