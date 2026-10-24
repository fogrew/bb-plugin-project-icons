# Project Icons task checklist

Live status: [GitHub Project](https://github.com/users/fogrew/projects/8).
This checklist is a planning index. An unchecked item means it was not complete
when this plan was created; consult GitHub before starting a session.

## v0.2.0 — Workflow & image editor

- [ ] [#1](https://github.com/fogrew/bb-plugin-project-icons/issues/1) chore(workflow): закрепить Git Flow и правила работы отдельных сессий
  Dependencies: none. Priority: P0.
- [ ] [#2](https://github.com/fogrew/bb-plugin-project-icons/issues/2) ci: проверять сборку и соглашения в pull request
  Dependencies: #1. Priority: P0.
- [ ] [#3](https://github.com/fogrew/bb-plugin-project-icons/issues/3) feat(settings): список проектов с поиском и состояниями
  Dependencies: #2. Priority: P1.
- [ ] [#4](https://github.com/fogrew/bb-plugin-project-icons/issues/4) feat(editor): кадрирование и предпросмотр иконки в 20 px
  Dependencies: #3. Priority: P1.
- [ ] [#5](https://github.com/fogrew/bb-plugin-project-icons/issues/5) feat(upload): drag-and-drop, вставка и отмена удаления
  Dependencies: #4. Priority: P1.
- [ ] [#6](https://github.com/fogrew/bb-plugin-project-icons/issues/6) chore(release): проверить и подготовить v0.2.0
  Dependencies: #1, #2, #3, #4, #5. Priority: P1.

## v0.3.0 — Icon chooser

- [ ] [#7](https://github.com/fogrew/bb-plugin-project-icons/issues/7) feat(icons): назначать emoji с поиском и недавними
  Dependencies: #6. Priority: P1.
- [ ] [#8](https://github.com/fogrew/bb-plugin-project-icons/issues/8) feat(icons): встроенные значки и инициалы с цветом
  Dependencies: #7. Priority: P1.
- [ ] [#9](https://github.com/fogrew/bb-plugin-project-icons/issues/9) chore(release): проверить и подготовить v0.3.0
  Dependencies: #8. Priority: P1.

## v0.4.0 — Contextual setup

- [ ] [#10](https://github.com/fogrew/bb-plugin-project-icons/issues/10) feat(sidebar): открыть редактор из контекста проекта через SDK
  Dependencies: #9. Priority: P1.
- [ ] [#11](https://github.com/fogrew/bb-plugin-project-icons/issues/11) feat(discovery): предлагать иконки из файлов репозитория
  Dependencies: #9. Priority: P2.
- [ ] [#12](https://github.com/fogrew/bb-plugin-project-icons/issues/12) chore(release): проверить и подготовить v0.4.0
  Dependencies: #10, #11. Priority: P2.

## v0.5.0 — Appearance & portability

- [ ] [#13](https://github.com/fogrew/bb-plugin-project-icons/issues/13) feat(appearance): варианты тем и совместимость с Project Colors
  Dependencies: #12. Priority: P2.
- [ ] [#14](https://github.com/fogrew/bb-plugin-project-icons/issues/14) feat(portability): экспорт и импорт иконок с предпросмотром
  Dependencies: #12. Priority: P2.
- [ ] [#15](https://github.com/fogrew/bb-plugin-project-icons/issues/15) chore(release): проверить и подготовить v0.5.0
  Dependencies: #13, #14. Priority: P2.

## v1.0.0 — Stable marketplace release

- [ ] [#16](https://github.com/fogrew/bb-plugin-project-icons/issues/16) test(stability): проверить контракты и готовность к 1.0
  Dependencies: #15. Priority: P1.
- [ ] [#17](https://github.com/fogrew/bb-plugin-project-icons/issues/17) docs(marketplace): подготовить описание и настоящие скриншоты
  Dependencies: #16. Priority: P2.
- [ ] [#18](https://github.com/fogrew/bb-plugin-project-icons/issues/18) chore(release): выпустить v1.0.0 и подать заявку в маркетплейс
  Dependencies: #16, #17. Priority: P2.

## Next session

Start with [#1](https://github.com/fogrew/bb-plugin-project-icons/issues/1):
establish the repository workflow and changelog. Review and merge the planning
PR only after the user's explicit command. Then use a fresh branch from develop.
