export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground p-8">
      <main className="flex flex-col items-center gap-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl text-primary">
          Real Estate SaaS
        </h1>
        <p className="max-w-md text-lg text-muted-foreground">
          Comprehensive property management solution.
        </p>
        <div className="flex gap-4">
          <button className="rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors">
            Get Started
          </button>
          <button className="rounded-md border border-input bg-background px-6 py-3 text-sm font-semibold shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors">
            Documentation
          </button>
        </div>
      </main>
    </div>
  );
}
