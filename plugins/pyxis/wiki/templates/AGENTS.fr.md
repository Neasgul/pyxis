# Wiki

Ce que l'on sait de nos projets et services, en pages courtes. Le LLM écrit et tient les
pages à jour ; l'utilisateur valide chaque changement.

Les pages sont écrites en : français.

## Folders

Une ligne par dossier de premier niveau : ce qu'il contient. À remplir au fil de la croissance du wiki.

- `shared/` : ce qui concerne plusieurs dossiers.

## Organisation

- `index.md` : une ligne par page, par dossier. Généré. À lire en premier pour trouver une page.
- `log.md` : ce qui a été fait au wiki, en ajout seulement.
- `inbox/` : faits en attente de validation par l'utilisateur. Ils ne sont pas validés : ne
  jamais les citer comme vrais.
- `raw/` : documents sources (PDF, exports, notes datées). Ne jamais les modifier.
- Un dossier par sujet (`billing/`, `auth/`…), listé dans Folders ci-dessus.

## Une page

```markdown
---
summary: Déploiement du service billing, pipeline qui le livre, écart connu du tag staging.
triggers: [deploy, rollout, pipeline]
sources:
  - ~/Projects/billing/Makefile
  - raw/billing/2026-10-23-note-quota.md
updated: 2026-11-13
---

# Billing : déploiement
…
```

- 2 500 caractères au plus, frontmatter compris. Découper une page qui dépasse.
- `summary` : une ligne qui dit ce que contient la page, pas son titre. C'est ce que l'index
  affiche et ce sur quoi on choisit une page.
- `triggers` : les mots que l'utilisateur emploierait pour ce sujet.
- `sources` : d'où viennent les faits (un fichier d'un dépôt, un fichier de `raw/`, un ticket).
- Les liens sont des liens markdown relatifs (`[Auth : tokens](../auth/tokens.md)`), jamais des `[[wikilinks]]`.
- Marquer un fait incertain `TODO(verify)` plutôt que de l'affirmer.
- Ne jamais écrire un secret (mot de passe, clé, token).

## Écriture

**Rien n'entre dans une page sans l'accord de l'utilisateur.** Ne pas modifier une page de sa
propre initiative. Quand une session établit un fait durable (architecture, endpoint, déploiement,
piège, décision), l'écrire dans `inbox/AAAA-MM-JJ-<sujet>.md` et le dire en une ligne :

```markdown
---
created: 2026-11-13
target: billing/deploy.md
origin: session dans ~/Projects/billing
---

Le fait, en quelques lignes, avec de quoi le vérifier (fichier, commit, ticket).
```

`target` est la page proposée, ou `new page`.

## Opérations

- `/pyxis:ingest [source]` : verser une source, ou les notes de `inbox/`, dans les pages.
  L'utilisateur la lance ; elle présente chaque changement et attend son accord.
- `/pyxis:lint` : contrôle de santé, un script puis une relecture. Elle signale et ne corrige
  rien d'elle-même (liens cassés, problèmes de page, index périmé, secrets, notes en attente).
- `/pyxis:graph` : dessine le wiki sous forme de graphe. Elle lit, n'écrit jamais dans le wiki.

Après tout changement de page accepté par l'utilisateur :

1. Régénérer `index.md` (`/pyxis:ingest` le fait). Il refuse quand une page a un problème (trop
   longue, sans `summary`, pas dans un dossier).
2. Lancer `/pyxis:lint` : pas de nouvelle erreur.
3. Ajouter une entrée à `log.md` : `## [AAAA-MM-JJ] <opération> | <titre>`, puis les pages touchées.
