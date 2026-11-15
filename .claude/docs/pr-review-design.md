# pr-review — design

## Pourquoi

Je retape toujours les mêmes reviews à la main sur mes branches et celles des
collègues. Un seul appel doit les enchaîner et poster le résultat dans la PR.

## Ce que fait le skill

`/pr-review [PR|branche] [--ux] [--fix] [--effort low|medium|high|xhigh]`

1. **Cible** : la PR nommée, sinon celle de la branche courante (`gh pr view`),
   sinon la branche courante contre `master`/`main` (merge-base), sans PR.
2. **Ce qui était demandé** : la description de la PR, et le ticket JIRA s'il
   y en a un. La clé (`MERLIN-2321`) est cherchée dans le titre de la PR, puis
   le nom de la branche, puis les messages de commit. Le ticket est lu via le
   MCP Atlassian (`getJiraIssue`) depuis le contexte principal, et son texte
   est passé au sous-agent de conformité. Ni description ni ticket : pas de
   review de conformité, et le rapport le signale.
3. **Reviews en parallèle**, sans qu'aucune ne voie les autres. Un sous-agent ne
   peut pas en lancer un autre, d'où deux façons de faire :
   - **Contexte principal** (ces skills lancent eux-mêmes leurs sous-agents) :
     - `code-review` de Claude Code, à l'effort `--effort` (`medium` par
       défaut), sans `--comment` ni `--fix` ;
     - `impeccable critique`, seulement avec `--ux`. Sa question finale est
       sautée (`Questions skipped: pr-review`), pour ne pas bloquer la
       chaîne.
   - **Un sous-agent chacun** :
     - `ponytail:ponytail-review` ;
     - `impeccable audit`, si le diff touche un fichier front ;
     - **conformité** : il reçoit le diff, la description de la PR et le
       ticket. Il signale ce qui est demandé mais absent, ce qui est fait mais
       pas demandé, et ce qui fait autre chose que ce qui est décrit.
4. **Fusion** : une liste unique, gravité commune (bloquant / important /
   mineur), doublons fusionnés (même fichier, lignes proches, même problème).
   Une remarque `code-review` PLAUSIBLE (non confirmée) ne va jamais en
   inline : elle va dans le corps de la review, marquée comme à vérifier.
5. **Publication** : s'il y a une PR, une seule review GitHub
   (`gh api repos/{owner}/{repo}/pulls/N/reviews`, `event: COMMENT`) :
   - un commentaire inline par remarque ancrée sur une ligne du diff ;
   - le corps porte la synthèse, la conformité au ticket, les remarques hors
     diff et la critique `--ux` ;
   - chaque texte finit par une ligne vide puis `🤖 Jean-Claude`.
   Sans PR : le rapport fusionné dans le terminal, rien n'est posté.
   Postée sans relecture préalable, sur mes PR comme sur celles des collègues.
6. **`--fix`** : une fois la review postée, l'agent corrige tout ce qui est
   bloquant ou important, plus les remarques mineures qu'il juge utiles. Il
   suit `superpowers:receiving-code-review` : il vérifie chaque remarque avant
   de la corriger et écarte celles qui sont fausses. Ensuite :
   - il lance les vérifications que le projet documente (AGENTS.md /
     CLAUDE.md), sur les modules touchés ;
   - il fait un `git commit --fixup=<sha>` par commit corrigé, sans
     autosquash ;
   - il pousse sur la branche de tête de la PR, et seulement elle, avec un
     refspec explicite (`git push origin HEAD:refs/heads/<branche>`). Jamais
     de force-push : si le remote a avancé, il s'arrête et le dit ;
   - il répond dans le fil de chaque commentaire inline concerné : « corrigé
     dans <sha> », ou la raison pour laquelle la remarque est écartée.
     Chaque réponse est signée `🤖 Jean-Claude` ;
   - son rapport final liste les remarques corrigées (avec le sha de chaque
     fixup), celles qu'il a écartées et pourquoi, et celles qu'il a laissées.
   `--fix` ne fonctionne que si la branche de la PR est déjà extraite en
   local. Sinon, le skill refuse et l'indique. Sans PR, les fixups restent
   en local : il n'y a rien à pousser ni de commentaire auquel répondre.

## Non-objectifs

- Sans `--fix`, le skill ne modifie aucun fichier.
- Pas d'`APPROVE` ni de `REQUEST_CHANGES` : la décision reste humaine.
- Pas de nouvelle logique de review de code : on réutilise les skills
  existants. Seule la conformité au ticket est un prompt propre au skill,
  parce qu'aucun skill existant ne la fait.

## Approches considérées

- **A. Skill orchestrateur en Markdown (retenue)** : un `SKILL.md`, facile à
  retoucher quand les habitudes changent.
- B. Poster via `code-review --comment` : écartée, ce skill ne publie que sa
  propre review, pas une review fusionnée.
- C. Script Workflow : fusion plus fiable mais plus chère et plus lourde à
  modifier, pour un besoin qui est d'abord de ne plus retaper.

`code-review` remplace `superpowers:requesting-code-review`. Ce dernier est
fait pour vérifier son propre travail contre un plan pendant le
développement, et ses contrôles de qualité recoupent `ponytail-review`.
`code-review` est fait pour relire une PR et vérifie ses remarques
(CONFIRMED / PLAUSIBLE), ce qui compte quand rien n'est relu avant de poster.
La vérification par rapport au plan, seul vrai apport de
`requesting-code-review`, est reprise par la review de conformité.

## Mes choix (à corriger)

- **Emplacement** `~/.claude/skills/pr-review/`, nom aligné sur `pr-risk` et
  `pr-demo`. `/review` est évité, il existe déjà côté Claude Code.
- **Fichier front** : `*.ts`, `*.tsx`, `*.js`, `*.jsx`, `*.html`, `*.css`,
  `*.scss`, `*.vue`, `*.svelte`, hors fichiers de test et de config de build.
- **Langue** des commentaires : celle de la description de la PR.
- **Relance** : avant de poster, on lit les commentaires `🤖 Jean-Claude` déjà
  présents et on saute une remarque déjà postée sur le même fichier et la même
  ligne, pour qu'une deuxième passe ne double pas tout.
- **Effort** de `code-review` : `medium` par défaut.
