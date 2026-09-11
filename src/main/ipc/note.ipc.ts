import type { Note, NoteInput } from '@shared/types/domain'
import { handle } from './handle'
import { deleteNote, listNotes, readNote, saveNote } from '../services/note.service'
import { notifyDataChanged } from '../services/bus'

export function registerNoteIpc(): void {
  handle<Note[]>('note:list', (taskId?: number | null, keyword?: string) => listNotes(taskId, keyword))

  handle<Note>('note:get', (id: number) => readNote(id))

  handle<Note>('note:save', (input: NoteInput) => {
    const note = saveNote(input)
    notifyDataChanged('notes')
    return note
  })

  handle<void>('note:remove', (id: number) => {
    deleteNote(id)
    notifyDataChanged('notes')
  })
}
