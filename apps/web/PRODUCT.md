# Product

## Register

product

## Platform

web

## Users

The primary user is an individual note-taker — someone who opens Yapper to write for themselves and *occasionally* shares a single note with one or two other people. Real-time, multi-person collaboration is the exception, not the daily norm; most sessions are one person writing. When sharing does happen it's ad-hoc: hand someone a link, let them read or edit, pull it back when done. The design should make solo writing feel first-class and unhurried, and make sharing a low-ceremony action layered on top — never the other way around.

## Product Purpose

Yapper is a collaborative rich-text note app where every collaborator is a real, logged-in identity. It exists so a person can write quickly and, when they choose, invite specific people into the same note in real time — seeing live cursors and selections, knowing exactly who is reading and who is typing. The owner holds a single access switch (private → view → edit) and can pull any note private in one click, instantly disconnecting everyone else. Success is frictionless real-time writing: text appears the instant it's typed, no conflicts, no setup, no waiting on choreography — the tool disappears into the act of writing, whether one person is in the note or three.

## Positioning

Collaboration where the person is trusted, not the link. Every cursor carries a real Google/GitHub identity, collaborators are tracked from first open, and access is one owner-controlled switch that revokes instantly — the opposite of the anonymous "anyone with the link can edit" model.

## Brand Personality

Calm, focused, and trustworthy. The voice is plain and unhurried — it states what a thing does and gets out of the way, favoring quiet confidence over swagger or hype. Warmth comes from restraint and reliability, not from playfulness. The interface should feel like a dependable place to think, where the mechanics of who-can-do-what are legible and never anxiety-inducing.

## Anti-references

- **Anonymous / link-trust collaboration tools** — faceless colored cursors with no name or accountability, "anyone with the link can edit." This is the exact model Yapper is defined against.
- **Heavy enterprise / admin UI** — dense permission matrices, IT-console sprawl, config-heavy access panels. Access control here is one switch, not a policy engine, and must never *look* like one.
- **Generic AI-SaaS template** — gradient hero, cream/sand backgrounds, identical icon-card grids, an uppercase tracked eyebrow above every section. The interchangeable startup look.
- **Toy / consumer-cute** — over-rounded shapes, emoji-heavy, bouncy elastic motion. Too casual to trust with real work.

## Design Principles

- **Writing first, sharing second.** The solo writing surface is the hero. Collaboration and access controls are affordances layered on top, reachable but never crowding the page or slowing the blank-note-to-first-word path.
- **Trust the person, show the person.** Presence is always legible: real names, stable colors, clear who-can-do-what. Never an anonymous cursor, never ambiguity about access state.
- **Control without a control panel.** Access is one switch (private / view / edit) and one decisive "make private" action. Resist every pull toward matrices, role trees, or settings sprawl — power stays in a single legible gesture.
- **The tool disappears.** Calm, consistent, familiar affordances; motion only to convey state (typing, presence, connection, revocation), never decoration. If a component makes the user pause and study it, it's wrong.
- **The landing is a brand surface.** The logged-out marketing page (`app/_landing/`) is genuinely register=**brand** — dark, narrative, conversion-shaped — and should be treated that way per-task, even though the app default here is product. Keep the two coherent (same wordmark, palette, voice) without forcing the app to perform or the landing to go utilitarian.

## Accessibility & Inclusion

Target **WCAG 2.1 AA**: body text ≥4.5:1 contrast (large text ≥3:1), full keyboard operability, visible focus states on every interactive element, and honored `prefers-reduced-motion` (crossfade or instant fallbacks for the landing reveals and live-cursor motion). Presence relies on color, so never encode meaning in color alone — pair every color-coded cursor/selection with a name label so it survives color-vision differences.
