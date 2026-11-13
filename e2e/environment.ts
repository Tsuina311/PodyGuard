// Loaded before app.ts/config.ts. The injected MemoryEventStore never uses this URL.
// Always replace inherited credentials: demo and browser tests must not touch a real DB.
process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:1/podyguard_memory_only';
