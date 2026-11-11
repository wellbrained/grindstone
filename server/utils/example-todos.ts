import type { Todo } from '#shared/schemas/todo'

// Example in-memory store (resets on server restart). Replace with a real database.
// Files in `server/utils/` are auto-imported in all server code.
const todos: Todo[] = [
  { id: 1, title: 'Read the Nuxt docs', done: true },
  { id: 2, title: 'Build something great', done: false }
]

let nextId = todos.length + 1

export function listExampleTodos(): Todo[] {
  return todos
}

export function addExampleTodo(title: string): Todo {
  const todo: Todo = { id: nextId++, title, done: false }
  todos.push(todo)
  return todo
}

export function toggleExampleTodo(id: number): Todo | undefined {
  const todo = todos.find(t => t.id === id)
  if (todo) {
    todo.done = !todo.done
  }
  return todo
}
