import { Brand } from './Brand';

export function ServerWakeScreen() {
  return (
    <section className="bg-deep-space fixed inset-0 z-[80] flex flex-col items-center justify-center px-6 text-center">
      <Brand className="mb-8" />
      <h1 className="font-display mb-3 text-3xl font-bold tracking-tight">
        Waking the tables
      </h1>
      <p className="text-muted max-w-sm text-sm leading-relaxed">
        The free host went to sleep. Keep this page open — it usually takes
        under a minute.
      </p>
    </section>
  );
}
