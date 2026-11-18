// Vitest setup, run before every test file.

// jsdom doesn't implement window.scrollTo, which TanStack Router calls on
// every navigation. Without this stub, each one logs "Not implemented".
window.scrollTo = () => {}
