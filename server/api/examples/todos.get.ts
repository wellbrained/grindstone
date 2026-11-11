// GET /api/examples/todos — the file name suffix (.get) sets the HTTP method.
// The return type flows to `useFetch('/api/examples/todos')` on the client automatically.
export default defineEventHandler(() => {
  return listExampleTodos()
})
