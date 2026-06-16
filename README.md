# Backend WhatsApp Support

API NestJS multi-entreprise pour la messagerie WhatsApp, le support humain et l'agent IA avec RAG.

## Responsabilites

- authentification JWT par cookies HttpOnly;
- isolation des utilisateurs, contacts, conversations, messages, produits et KB par `companyId`;
- ingestion KB depuis texte, URL et fichiers controles;
- chunks et embeddings reels de 1536 dimensions dans pgvector;
- orchestration LLM, RAG, vision produit et handoff humain;
- integration Evolution API et n8n;
- imports PDF revus puis publies de facon idempotente.

## Installation

```bash
npm install
copy .env.example .env
npx prisma generate
npm run start:dev
```

Le backend ecoute par defaut sur `http://localhost:3001`. `DATABASE_URL`, les secrets JWT et les identifiants des fournisseurs externes doivent etre definis.

## Embeddings

Deux fournisseurs sont disponibles via `EMBEDDING_PROVIDER`:

- `gemini`: utilise `gemini-embedding-001` et une cle Gemini/Google;
- `openai-compatible`: utilise `EMBEDDING_API_URL`, `EMBEDDING_API_KEY` et `EMBEDDING_MODEL`.

Une ingestion echoue si le fournisseur ne renvoie pas exactement 1536 valeurs finies. Aucun faux vecteur local n'est utilise. La recherche peut conserver son repli lexical si le fournisseur vectoriel est momentanement indisponible.

## Base de connaissances

Un article n'est exploitable par l'agent qu'apres publication et creation reussie de ses chunks et embeddings. Tous les acces et toutes les requetes pgvector imposent le meme `companyId` a l'article et au chunk.

Reconstruction explicite:

```bash
npm run kb:rebuild
```

## Base de donnees

```bash
npx prisma generate
npx prisma migrate deploy
```

Inspecter les doublons avant d'appliquer la migration des index tenant. La migration echoue volontairement si elle detecte des contacts ou messages ambigus; elle ne supprime aucune donnee automatiquement.

## Verification

```bash
npm run build
npm run test:security
npm run test
```

Les tests KB nommes par entreprise peuvent necessiter une base locale et des donnees de demonstration. Ne pas les executer sur une base de production.
