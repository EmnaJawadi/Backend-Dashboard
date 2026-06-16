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
  // Old single-article titles replaced by new structured articles
  'Presentation et services - FlavoNation',
  'Menu disponible - FlavoNation',
  'Prix des plats - FlavoNation',
  'Couscous tunisien - disponibilite et prix',
  'Pizza - disponibilite, prix et variantes',
  'Boissons disponibles - FlavoNation',
  'Livraison et adresse - FlavoNation',
  'Commande WhatsApp et confirmation - FlavoNation',
  'Paiement - FlavoNation',
  'Information absente de la base - FlavoNation',
];

const ARTICLES = [
  {
    title: 'Presentation et services - FlavoNation',
    category: 'SERVICES',
    tags: ['presentation', 'services', 'whatsapp', 'flavonation', 'restaurant', 'livraison'],
    content:
      "FlavoNation est un restaurant qui prend les commandes de repas sur WhatsApp. Le client peut consulter le menu documente, demander les prix confirmes, transmettre une adresse de livraison et confirmer sa commande via WhatsApp. FlavoNation propose des plats tunisiens, pizzas, sushi et biryani. Les reponses doivent rester limitees aux informations confirmees dans la base FlavoNation. Pour toute question non documentee, l'equipe sera consultee.",
  },
  {
    title: 'Menu complet disponible - FlavoNation',
    category: 'PRODUITS',
    tags: ['menu', 'plats', 'couscous', 'pizza', 'sushi', 'biryani', 'flavonation'],
    content:
      "Menu FlavoNation confirme : couscous tunisien (18 TND), pizza (20 TND), sushi (prix a confirmer avec l'equipe), biryani (prix a confirmer avec l'equipe). Les plats confirmes disponibles sont le couscous tunisien et la pizza. Les plats sushi et biryani sont proposes mais leur disponibilite et leurs prix doivent etre confirmes avec l'equipe avant de les annoncer au client.",
  },
  {
    title: 'Prix des plats confirmes - FlavoNation',
    category: 'PRIX',
    tags: ['prix', 'tarifs', 'couscous', 'pizza', 'flavonation'],
    content:
      "Prix confirmes FlavoNation : couscous tunisien : 18 TND par portion. Pizza : 20 TND par pizza. Pour un total de commande, multiplier uniquement ces prix confirmes par les quantites demandees puis additionner les sous-totaux. Exemple : 2 couscous + 1 pizza = 2 x 18 + 1 x 20 = 56 TND. Les prix des autres plats (sushi, biryani, boissons) doivent etre confirmes avec l'equipe.",
  },
  {
    title: 'Couscous tunisien - disponibilite et prix',
    category: 'PRODUITS',
    tags: ['couscous', 'tunisien', 'disponibilite', 'prix', '18 tnd'],
    content:
      "Le couscous tunisien est disponible chez FlavoNation au prix confirme de 18 TND par portion. C'est un plat traditionnel tunisien confirme dans notre catalogue.",
  },
  {
    title: 'Pizza - disponibilite, prix et variantes',
    category: 'PRODUITS',
    tags: ['pizza', 'margherita', 'variante', 'prix', '20 tnd'],
    content:
      "La pizza est disponible chez FlavoNation au prix confirme de 20 TND par pizza. Aucune variante precise (Margherita, Pepperoni, etc.) n'est confirmee dans la base. Si le client demande une variante specifique, indiquer que cette variante doit etre verifiee avec l'equipe avant confirmation.",
  },
  {
    title: 'Sushi - disponibilite et prix',
    category: 'PRODUITS',
    tags: ['sushi', 'japonais', 'disponibilite', 'prix', 'flavonation'],
    content:
      "FlavoNation propose du sushi. La disponibilite et les prix du sushi doivent etre confirmes avec l'equipe avant de les annoncer au client. Si le client demande le prix ou les types de sushi disponibles, indiquer que l'equipe va confirmer la disponibilite et le tarif exact.",
  },
  {
    title: 'Biryani - disponibilite et prix',
    category: 'PRODUITS',
    tags: ['biryani', 'riz', 'indien', 'disponibilite', 'prix', 'flavonation'],
    content:
      "FlavoNation propose du biryani. La disponibilite et le prix du biryani doivent etre confirmes avec l'equipe avant de les annoncer au client. Si le client demande le biryani, indiquer que l'equipe va confirmer la disponibilite et le prix.",
  },
  {
    title: 'Boissons disponibles - FlavoNation',
    category: 'PRODUITS',
    tags: ['boissons', 'drink', 'jus', 'eau', 'coca', 'disponibilite', 'flavonation'],
    content:
      "Les boissons disponibles et leurs prix doivent etre confirmes avec l'equipe FlavoNation. Si le client demande une boisson (eau, jus, soda, coca, etc.), indiquer que l'equipe va confirmer les boissons disponibles et leurs prix. Ne proposer aucune boisson sans confirmation explicite.",
  },
  {
    title: 'Livraison et zones couvertes - FlavoNation',
    category: 'LIVRAISON',
    tags: ['livraison', 'adresse', 'tunis', 'aouina', 'grand-tunis', 'zone'],
    content:
      "Zone de livraison confirmee : Tunis Aouina, dans le Grand Tunis. Pour livrer, demander l'adresse complete si elle manque (rue, quartier, ville). Pour toute autre zone en dehors de Tunis Aouina, demander l'adresse et indiquer que la couverture sera verifiee avec l'equipe avant de confirmer la livraison. Ne pas confirmer de livraison hors zone sans verification.",
  },
  {
    title: 'Processus de commande WhatsApp - FlavoNation',
    category: 'COMMANDE',
    tags: ['commande', 'confirmation', 'whatsapp', 'total', 'processus'],
    content:
      "Pour finaliser une commande WhatsApp FlavoNation, collecter uniquement les elements manquants : nom du client, numero de telephone, adresse de livraison complete, plats souhaites et quantites. Si le client a deja transmis une information, ne pas la redemander. Une fois toutes les informations collectees, afficher le recapitulatif : liste des plats, quantites, sous-totaux, total, adresse, telephone, puis demander une confirmation explicite du client. Apres confirmation explicite, confirmer la commande et indiquer qu'un recapitulatif de confirmation suivra.",
  },
  {
    title: 'Paiement - FlavoNation',
    category: 'PAIEMENT',
    tags: ['paiement', 'reglement', 'especes', 'carte', 'verification', 'flavonation'],
    content:
      "Les modes de paiement acceptes chez FlavoNation doivent etre confirmes avec l'equipe. Si le client demande comment payer, indiquer que le mode de paiement sera verifie avec l'equipe avant confirmation. Ne pas annoncer especes, carte, virement ou paiement mobile sans information confirmee dans la base.",
  },
  {
    title: 'Horaires et disponibilite - FlavoNation',
    category: 'HORAIRES',
    tags: ['horaires', 'ouverture', 'fermeture', 'disponibilite', 'jours', 'flavonation'],
    content:
      "Les horaires d'ouverture et les jours de service de FlavoNation doivent etre confirmes avec l'equipe. Si le client demande les horaires ou si FlavoNation est ouvert, indiquer que les horaires exacts seront confirmes par l'equipe. Ne pas annoncer des horaires specifiques sans information confirmee dans la base.",
  },
  {
    title: 'Contact et support - FlavoNation',
    category: 'CONTACT',
    tags: ['contact', 'telephone', 'whatsapp', 'support', 'aide', 'flavonation'],
    content:
      "FlavoNation est joignable via WhatsApp pour les commandes, questions et support. Pour les problemes de commande, reclamations ou demandes specifiques, l'agent IA transfère automatiquement vers l'equipe humaine. Si le client a une reclamation ou un probleme, l'equipe FlavoNation prend en charge directement.",
  },
  {
    title: 'Information absente de la base - FlavoNation',
    category: 'SUPPORT',
    tags: ['verification', 'information', 'absente', 'confirmation', 'equipe', 'flavonation'],
    content:
      "Si un plat, un prix, une variante, une boisson, une zone de livraison, une disponibilite ou un mode de paiement demande n'est pas clairement documente dans la base FlavoNation, ne pas inventer de reponse. Indiquer au client que l'information sera verifiee avec l'equipe et qu'une reponse suivra rapidement.",
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
