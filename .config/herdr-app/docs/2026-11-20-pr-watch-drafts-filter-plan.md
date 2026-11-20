# Masquer les brouillons : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** une puce « Brouillons (N) » masque ou réaffiche les brouillons de la Surveillance.

**Architecture:** `isDraft(entry)` pur dans `pr/model.js` ; le panneau compte, filtre et écrit
`shared("pr-watch-view")`.

**Spec:** `.config/herdr-app/docs/2026-11-20-pr-watch-drafts-filter-design.md`

## Global Constraints

- Registre de la vue : `shared("pr-watch-view")` = `{ hideDrafts: boolean }`, absent = affichés.
- Libellé exact : `Brouillons (N)`.

## Review Focus

- Brouillon en pause (étiquette « en pause », `draft: true`) : masqué aussi.
- Registre d'avant la bande (pas de `draft`, étiquette « brouillon ») : masqué aussi.

---

### Task 1: la puce

**Files:** `mods/pr/model.js`, `mods/pr/model.test.mjs`, `mods/pr/main.js`, `mods/pr/README.md`

- [ ] Test `isDraft` : `{ draft: true, label: "en pause" }` → true ; `{ label: "brouillon" }` → true ;
  `{ draft: false, label: "ok" }` → false. Le voir échouer.
- [ ] `export function isDraft(entry) → boolean` dans `model.js` ; le test passe.
- [ ] Panneau : puce dans le bandeau, liste filtrée quand `hideDrafts`. `herdr-app check`, capture.
- [ ] README du mod ; commit `feat(herdr): hide the watch's drafts on demand`.
