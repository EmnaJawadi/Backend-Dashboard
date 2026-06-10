/* eslint-disable no-console */
require('dotenv/config');
const { randomUUID } = require('crypto');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../dist/src/generated/prisma/client.js');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed the FlavoNation knowledge base');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const COMPANY_NAME = 'FlavoNation';
const LEGACY_CONFLICTING_TITLES = [
  'Menu du jour FlavoNation',
  'Plats disponibles FlavoNation',
  'Plats non disponibles FlavoNation',
  'Prix FlavoNation',
  'Livraison FlavoNation',
  'Commande FlavoNation',
  'Paiement FlavoNation',
  'Horaires FlavoNation',
  'Contact FlavoNation',
  'Reclamation client FlavoNation',
  'Reclamation alimentaire FlavoNation',
  'Presentation de FlavoNation',
  'Services proposes',
  'Processus de commande',
  'Prix et tarifs',
  'Plats internationaux disponibles',
  'Livraison et zones couvertes',
  'Modes de paiement',
  'Disponibilite et confirmation',
  'Intervention humaine',
  'Boissons FlavoNation',
  'Disponibilite FlavoNation',
  'Intervention interne FlavoNation',
  'Livraison et zones FlavoNation',
  'Modes de paiement FlavoNation',
  'Presentation FlavoNation',
  'Prix et tarifs FlavoNation',
  'Processus de commande FlavoNation',
  'Produits et plats disponibles FlavoNation',
  'Services proposes FlavoNation',
];

const ARTICLES = [
  {
    title: 'Presentation et services - FlavoNation',
    category: 'SERVICES',
    tags: ['presentation', 'services', 'whatsapp', 'flavonation'],
    content:
      'FlavoNation prend les commandes de repas sur WhatsApp. Le client peut consulter le menu documente, demander les prix documentes, transmettre une adresse de livraison et confirmer une commande. Les reponses doivent rester limitees aux informations confirmees dans la base FlavoNation.',
  },
  {
    title: 'Menu disponible - FlavoNation',
    category: 'PRODUITS',
    tags: ['menu', 'plats', 'couscous', 'pizza', 'flavonation'],
    content:
      'Menu actuellement confirme chez FlavoNation : couscous tunisien et pizza. Le couscous tunisien est disponible. La pizza est disponible. Aucun autre plat ni aucune variante de pizza ne doit etre annonce comme disponible sans une information publiee dans la base.',
  },
  {
    title: 'Prix des plats - FlavoNation',
    category: 'PRIX',
    tags: ['prix', 'tarifs', 'couscous', 'pizza', 'flavonation'],
    content:
      'Prix confirmes FlavoNation : couscous tunisien : 18 TND par portion. Pizza : 20 TND par pizza. Pour un total de commande, multiplier uniquement ces prix confirmes par les quantites demandees puis additionner les sous-totaux.',
  },
  {
    title: 'Couscous tunisien - disponibilite et prix',
    category: 'PRODUITS',
    tags: ['couscous', 'tunisien', 'disponibilite', 'prix'],
    content:
      'Le couscous tunisien est disponible chez FlavoNation au prix confirme de 18 TND par portion.',
  },
  {
    title: 'Pizza - disponibilite, prix et variantes',
    category: 'PRODUITS',
    tags: ['pizza', 'margherita', 'variante', 'prix'],
    content:
      "La pizza est disponible chez FlavoNation au prix confirme de 20 TND par pizza. Aucune variante precise n'est confirmee dans la base. Si le client demande une pizza Margherita ou une autre variante, indiquer que cette variante doit etre verifiee avec l'equipe avant confirmation.",
  },
  {
    title: 'Boissons disponibles - FlavoNation',
    category: 'PRODUITS',
    tags: ['boissons', 'drink', 'disponibilite', 'flavonation'],
    content:
      "La liste des boissons disponibles et leurs prix ne sont pas documentes actuellement dans la base FlavoNation. Si le client demande une boisson, indiquer que l'equipe va verifier les boissons disponibles et le prix; ne proposer aucune boisson sans confirmation.",
  },
  {
    title: 'Livraison et adresse - FlavoNation',
    category: 'LIVRAISON',
    tags: ['livraison', 'adresse', 'tunis', 'aouina', 'grand-tunis'],
    content:
      "Zone de livraison confirmee pour ce parcours : Tunis Aouina, dans le Grand Tunis. Pour livrer, demander l'adresse complete si elle manque. Pour toute autre zone, demander l'adresse et indiquer que la couverture sera verifiee avec l'equipe avant de confirmer la livraison.",
  },
  {
    title: 'Commande WhatsApp et confirmation - FlavoNation',
    category: 'COMMANDE',
    tags: ['commande', 'confirmation', 'whatsapp', 'total'],
    content:
      "Pour finaliser une commande WhatsApp FlavoNation, collecter uniquement les elements manquants : nom du client, telephone, adresse de livraison, plats et quantites. Si le client a deja transmis une information, ne pas la redemander. Quand les quantites, disponibilites et prix documentes sont connus, afficher chaque ligne, le total, l'adresse et le telephone, puis demander une confirmation explicite. Apres un oui explicite pour une commande complete et livrable, confirmer la commande et indiquer qu'un recapitulatif suivra.",
  },
  {
    title: 'Paiement - FlavoNation',
    category: 'PAIEMENT',
    tags: ['paiement', 'reglement', 'verification', 'flavonation'],
    content:
      "Aucun mode de paiement n'est confirme dans cette base FlavoNation. Si le client demande comment payer, indiquer que le mode de paiement sera verifie avec l'equipe avant confirmation; ne pas annoncer especes, carte, virement ou paiement mobile sans article publie.",
  },
  {
    title: 'Information absente de la base - FlavoNation',
    category: 'SUPPORT',
    tags: ['verification', 'information', 'absente', 'flavonation'],
    content:
      "Si un plat, un prix, une variante, une boisson, une zone de livraison, une disponibilite ou un mode de paiement demande n'est pas clairement present dans la base FlavoNation, ne pas inventer de reponse. Indiquer au client que l'information va etre verifiee avec l'equipe.",
  },
];

async function ensureCompany() {
  return prisma.company.upsert({
    where: { name: COMPANY_NAME },
    update: {
      status: 'ACTIVE',
      isActive: true,
    },
    create: {
      name: COMPANY_NAME,
      status: 'ACTIVE',
      isActive: true,
    },
  });
}

async function archiveKnownConflicts(companyId) {
  await prisma.kbArticle.updateMany({
    where: {
      companyId,
      title: { in: LEGACY_CONFLICTING_TITLES },
    },
    data: {
      status: 'archived',
    },
  });
}

async function upsertArticle(companyId, article) {
  const now = new Date();
  const existing = await prisma.kbArticle.findFirst({
    where: {
      companyId,
      title: article.title,
    },
    select: { id: true },
  });
  const data = {
    companyId,
    title: article.title,
    body: article.content,
    category: article.category,
    tags: article.tags,
    language: 'fr',
    status: 'published',
    source: 'manual',
    sourceUrl: null,
    sourceConversationId: null,
    sourceContactId: null,
    createdBy: null,
    publishedAt: now,
  };
  const saved = existing
    ? await prisma.kbArticle.update({
        where: { id: existing.id },
        data: { ...data, updatedAt: now },
      })
    : await prisma.kbArticle.create({
        data: { ...data, createdAt: now, updatedAt: now },
      });

  await prisma.kbChunk.deleteMany({ where: { articleId: saved.id } });
  await prisma.kbChunk.create({
    data: {
      id: randomUUID(),
      companyId,
      articleId: saved.id,
      chunkIndex: 0,
      chunkText: article.content,
      metadataJson: {
        companyId,
        category: article.category,
        title: article.title,
        customerFacing: true,
        curatedForWhatsapp: true,
      },
      createdAt: now,
    },
  });
}

async function main() {
  const company = await ensureCompany();

  await archiveKnownConflicts(company.id);
  for (const article of ARTICLES) {
    await upsertArticle(company.id, article);
  }

  console.log(
    `FlavoNation KB ready: ${ARTICLES.length} published curated articles for company ${company.id}.`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
