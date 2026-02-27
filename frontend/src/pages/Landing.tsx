import { useNavigate } from "react-router-dom";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import { FRONTEND_TEXT } from "../text";

export default function Landing() {
  const navigate = useNavigate();
  const landingText = FRONTEND_TEXT.landing;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent)] text-white font-semibold text-xl">
            {landingText.brandInitial}
          </div>
          <div>
            <div className="font-display text-2xl">{landingText.brandName}</div>
            <p className="text-sm text-[var(--color-ink-soft)]">{landingText.brandTagline}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => navigate("/app")} size="sm">
            {landingText.nav.signIn}
          </Button>
          <Button variant="primary" onClick={() => undefined} size="sm">
            {landingText.nav.createAccount}
          </Button>
        </div>
      </header>

      <main className="flex-1 bg-gradient-to-b from-white to-[#eef1f6]">
        <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-12 pt-8 sm:px-6 sm:pb-16 sm:pt-10 md:flex-row md:items-center md:gap-10">
          <div className="flex-1 space-y-6">
            <Badge tone="accent" label={landingText.hero.badge} />
            <h1 className="text-3xl leading-[1.05] sm:text-4xl md:text-5xl">{landingText.hero.title}</h1>
            <p className="text-base text-[var(--color-ink-soft)] sm:text-lg">{landingText.hero.body}</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button size="lg" onClick={() => navigate("/app")} className="w-full sm:w-auto">
                {landingText.hero.primaryCta}
              </Button>
              <Button size="lg" variant="ghost" onClick={() => navigate("/app")} className="w-full sm:w-auto">
                {landingText.hero.secondaryCta}
              </Button>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-[var(--color-ink-soft)]">
              {landingText.hero.highlights.map((highlight) => (
                <span key={highlight} className="flex items-center gap-2">
                  • {highlight}
                </span>
              ))}
            </div>
          </div>
          <div className="flex-1">
            <div className="surface-card shadow-elevated p-6 rounded-2xl">
              <p className="text-sm text-[var(--color-ink-soft)] mb-2">{landingText.preview.heading}</p>
              <div className="rounded-xl border border-[var(--color-border-subtle)] bg-gradient-to-br from-white to-[#f6f7fb] p-5">
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="session-heading">{landingText.preview.sessionsTitle}</span>
                  <span className="text-[var(--color-ink-soft)]">{landingText.preview.roleLabel}</span>
                </div>
                <div className="space-y-2">
                  {landingText.preview.items.map((item) => (
                    <div
                      key={item}
                      className="flex items-center justify-between rounded-lg border border-[var(--color-border-subtle)] bg-white px-3 py-2 text-sm"
                    >
                      <span>{item}</span>
                      <span className="text-[var(--color-ink-soft)]">{landingText.preview.itemMessagesLabel}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-lg border border-[var(--color-border-subtle)] bg-white p-3">
                  <p className="text-xs text-[var(--color-ink-soft)] mb-1">{landingText.preview.quickConfigTitle}</p>
                  <div className="flex gap-2 text-xs">
                    <span className="rounded-full bg-[#e8ecf5] px-3 py-1 text-[var(--color-accent)]">
                      {landingText.preview.quickConfigChips[0]}
                    </span>
                    <span className="rounded-full bg-[#f2e9da] px-3 py-1 text-[#7b5a26]">
                      {landingText.preview.quickConfigChips[1]}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 px-4 pb-12 sm:gap-6 sm:px-6 sm:pb-16 md:grid-cols-3">
          {landingText.features.map((feature) => (
            <Card key={feature.title} title={feature.title}>
              <p className="text-sm leading-relaxed">{feature.body}</p>
            </Card>
          ))}
        </section>
      </main>
    </div>
  );
}
