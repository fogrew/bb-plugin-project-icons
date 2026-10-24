# Project Icons task checklist

Live status: [GitHub Project](https://github.com/users/fogrew/projects/8).
This checklist is a planning index. An unchecked item means it was not complete
when this plan was created; consult GitHub before starting a session.

## v0.2.0 — Workflow & image editor

- [ ] [#1](https://github.com/fogrew/bb-plugin-project-icons/issues/1) chore(workflow): define Git Flow and focused-session conventions
  Dependencies: none. Priority: P0.
- [ ] [#2](https://github.com/fogrew/bb-plugin-project-icons/issues/2) ci: validate builds and conventions in pull requests
  Dependencies: #1. Priority: P0.
- [ ] [#3](https://github.com/fogrew/bb-plugin-project-icons/issues/3) feat(settings): add a searchable project list with explicit states
  Dependencies: #2. Priority: P1.
- [ ] [#4](https://github.com/fogrew/bb-plugin-project-icons/issues/4) feat(editor): add image cropping and a 20 px icon preview
  Dependencies: #3. Priority: P1.
- [ ] [#5](https://github.com/fogrew/bb-plugin-project-icons/issues/5) feat(upload): add drag-and-drop, paste and undo removal
  Dependencies: #4. Priority: P1.
- [ ] [#6](https://github.com/fogrew/bb-plugin-project-icons/issues/6) chore(release): verify and prepare v0.2.0
  Dependencies: #1, #2, #3, #4, #5. Priority: P1.

## v0.3.0 — Icon chooser

- [ ] [#7](https://github.com/fogrew/bb-plugin-project-icons/issues/7) feat(icons): add emoji selection with search and recents
  Dependencies: #6. Priority: P1.
- [ ] [#8](https://github.com/fogrew/bb-plugin-project-icons/issues/8) feat(icons): add built-in glyphs and colored initials
  Dependencies: #7. Priority: P1.
- [ ] [#9](https://github.com/fogrew/bb-plugin-project-icons/issues/9) chore(release): verify and prepare v0.3.0
  Dependencies: #8. Priority: P1.

## v0.4.0 — Contextual setup

- [ ] [#10](https://github.com/fogrew/bb-plugin-project-icons/issues/10) feat(sidebar): open the icon editor from project context through the SDK
  Dependencies: #9. Priority: P1.
- [ ] [#11](https://github.com/fogrew/bb-plugin-project-icons/issues/11) feat(discovery): suggest icons from repository files
  Dependencies: #9. Priority: P2.
- [ ] [#12](https://github.com/fogrew/bb-plugin-project-icons/issues/12) chore(release): verify and prepare v0.4.0
  Dependencies: #10, #11. Priority: P2.

## v0.5.0 — Appearance & portability

- [ ] [#13](https://github.com/fogrew/bb-plugin-project-icons/issues/13) feat(appearance): add theme variants and Project Colors compatibility
  Dependencies: #12. Priority: P2.
- [ ] [#14](https://github.com/fogrew/bb-plugin-project-icons/issues/14) feat(portability): export and import icons with a preview
  Dependencies: #12. Priority: P2.
- [ ] [#15](https://github.com/fogrew/bb-plugin-project-icons/issues/15) chore(release): verify and prepare v0.5.0
  Dependencies: #13, #14. Priority: P2.

## v1.0.0 — Stable marketplace release

- [ ] [#16](https://github.com/fogrew/bb-plugin-project-icons/issues/16) test(stability): audit contracts and readiness for 1.0
  Dependencies: #15. Priority: P1.
- [ ] [#17](https://github.com/fogrew/bb-plugin-project-icons/issues/17) docs(marketplace): prepare the overview and authentic screenshots
  Dependencies: #16. Priority: P2.
- [ ] [#18](https://github.com/fogrew/bb-plugin-project-icons/issues/18) chore(release): release v1.0.0 and submit to the marketplace
  Dependencies: #16, #17. Priority: P2.

## Session coordination

Workflow [#1](https://github.com/fogrew/bb-plugin-project-icons/issues/1) and the
planning PR await explicit merge approval. Independent CI work in
[#2](https://github.com/fogrew/bb-plugin-project-icons/issues/2) and settings UI in
[#3](https://github.com/fogrew/bb-plugin-project-icons/issues/3) may proceed in
separate worktrees while those PRs are pending. Use the live Project for current status.

Dependencies listed above are integration/release gates, not a blanket prohibition
on independent development. Disclose actual code dependencies and stacked PR bases,
then revalidate and retarget after the dependencies are accepted. Every merge still
requires a fresh explicit user command; do not mark issues Done before acceptance.
