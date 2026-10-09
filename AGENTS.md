# Regulated appearance

The authoritative appearance spec is `docs/handoffs/261008_Regulated_Brief_Admiralty-Handoff_v1.md`. Admiralty is the approved app look. Follow its Rules for new screens for all future screens, including education.

- Use tokens for colours, type, radius and shadows.
- Reuse existing shared classes. Category colours come from `categoryOf`.
- Gold belongs to play and the single main action on a screen.
- Before opening a PR that changes a screen, check it at 390x844 with `?look=admiralty` and `?look=night`.
- Do not restyle one screen by changing `admiralty.css` or `night.css`. Add a token or class and describe it in the PR.
- Preserve the three-look script and both themes when resolving merges in `index.html`, `src/lib/categories.js`, `src/tokens.css` and `src/theme/night.css`.
