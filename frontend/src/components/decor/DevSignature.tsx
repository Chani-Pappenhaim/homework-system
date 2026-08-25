const DEVELOPERS = [
  { name: 'Chani Pappenheim', role: 'Backend Engineer', email: 'c0556741517@gmail.com' },
  { name: 'Tehila Aizental', role: 'Frontend Engineer', email: 't0556742276@gmail.com' },
] as const;

/** A small typewriter-style credit line — light register only, no dark card. */
export function DevSignature() {
  return (
    <div dir="ltr" className="flex items-center gap-4 font-mono text-[10px] leading-none">
      {DEVELOPERS.map((dev, i) => (
        <a
          key={dev.name}
          href={`mailto:${dev.email}`}
          title={dev.email}
          className="group flex items-center gap-1.5"
        >
          <span className="text-clay">✳</span>
          <span className="flex flex-col">
            <span
              className="dev-signature-text text-ink-soft transition-colors group-hover:text-clay"
              style={{ animationDelay: `${i * 0.85}s` }}
            >
              {dev.name}
            </span>
            <span className="text-[9px] tracking-wide text-ink-soft/50">{dev.role}</span>
          </span>
        </a>
      ))}
    </div>
  );
}
