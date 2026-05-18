/* eslint-disable no-console */
require('dotenv/config');
const bcrypt = require('bcrypt');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient, UserRole } = require('../dist/src/generated/prisma/client.js');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required to run prisma seed');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const SUPER_ADMINS = [
  {
    fullName: 'Maryem Ben Ali',
    email: 'bmaryem290@gmail.com',
    password: 'mimi1234',
  },
  {
    fullName: 'Emna Jawadi',
    email: 'jawadiamna18@gmail.com',
    password: 'emna1234',
  },
];

const FLAVONATION_COMPANY = {
  name: 'FlavoNation',
  legalName: 'FlavoNation Test Company',
  email: 'contact@flavonation.test',
  phone: '+216 00 000 000',
  website: 'https://flavonation.test',
  address: 'Grand Tunis, Tunisie',
};

const FLAVONATION_TODAY_ITEMS = [
  'couscous tunisien',
  'sushi',
  'tacos',
  'pizza',
  'burger',
  'salade healthy',
  'bowl healthy',
  'desserts',
  'boissons',
];

const FLAVONATION_AVAILABLE_ITEMS = [
  'couscous tunisien',
  'sushi',
  'tacos',
  'pizza',
  'burger',
  'salade healthy',
  'bowl healthy',
  'riz aux legumes',
  'soupe asiatique',
  'salade de fruits',
  'desserts',
  'boissons',
];

const FLAVONATION_MENU_GROUPS = [
  { label: 'Plats tunisiens', items: ['couscous tunisien'] },
  {
    label: 'Plats internationaux',
    items: ['sushi', 'tacos', 'pizza', 'burger'],
  },
  {
    label: 'Repas legers',
    items: ['salade healthy', 'bowl healthy'],
  },
  { label: 'Desserts et boissons', items: ['desserts', 'boissons'] },
];

const FLAVONATION_ARTICLES = [
  {
    title: 'Menu du jour FlavoNation',
    category: 'MENU_DU_JOUR',
    tags: ['menu', 'repas', 'flavonation'],
    content:
      "FlavoNation propose aujourd'hui plusieurs repas internationaux et tunisiens : couscous tunisien, sushi, tacos, pizza, burger, salade healthy, bowl healthy, desserts et boissons. La chorba n'est pas disponible actuellement. Le client peut demander les prix, les details d'un plat ou passer une commande directement via WhatsApp.",
    metadata: {
      customerFacing: true,
      availableItems: FLAVONATION_TODAY_ITEMS,
      unavailableItems: ['chorba'],
      menuGroups: FLAVONATION_MENU_GROUPS,
    },
  },
  {
    title: 'Plats disponibles FlavoNation',
    category: 'PLATS_DISPONIBLES',
    tags: ['plats', 'disponibilite', 'flavonation'],
    content:
      "Les plats actuellement disponibles chez FlavoNation sont : couscous tunisien, sushi, tacos, pizza, burger, salade healthy, bowl healthy, riz aux legumes, soupe asiatique, salade de fruits, desserts et boissons. Tout plat qui n'est pas mentionne dans cette liste doit etre considere comme non disponible.",
    metadata: {
      customerFacing: true,
      availableItems: FLAVONATION_AVAILABLE_ITEMS,
      unavailableItems: ['chorba'],
      menuGroups: FLAVONATION_MENU_GROUPS,
    },
  },
  {
    title: 'Plats non disponibles FlavoNation',
    category: 'PLATS_DISPONIBLES',
    tags: ['plats', 'indisponible', 'flavonation'],
    content:
      "Si un client demande un plat qui n'existe pas dans la liste des plats disponibles, l'agent IA doit repondre poliment que ce plat n'est pas disponible actuellement et proposer des alternatives presentes dans le menu FlavoNation. La chorba n'est pas disponible actuellement.",
    metadata: {
      customerFacing: false,
      availableItems: FLAVONATION_TODAY_ITEMS,
      unavailableItems: ['chorba'],
      menuGroups: FLAVONATION_MENU_GROUPS,
    },
  },
  {
    title: 'Prix FlavoNation',
    category: 'PRIX',
    tags: ['prix', 'tarifs', 'flavonation'],
    content:
      'Prix indicatifs FlavoNation : couscous tunisien 18 TND, sushi 24 TND, tacos 14 TND, pizza 20 TND, burger 16 TND, salade healthy 13 TND, bowl healthy 15 TND, dessert 8 TND et boisson 4 TND. Les prix peuvent varier selon les options et le stock disponible.',
    metadata: {
      customerFacing: true,
      pricedItems: {
        'couscous tunisien': '18 TND',
        sushi: '24 TND',
        tacos: '14 TND',
        pizza: '20 TND',
        burger: '16 TND',
        'salade healthy': '13 TND',
        'bowl healthy': '15 TND',
        dessert: '8 TND',
        boisson: '4 TND',
      },
    },
  },
  {
    title: 'Livraison FlavoNation',
    category: 'LIVRAISON',
    tags: ['livraison', 'adresse', 'grand tunis'],
    content:
      'FlavoNation assure la livraison principalement sur le Grand Tunis. Le client peut envoyer son nom, son numero de telephone, son adresse complete et le repas souhaite pour confirmer la commande. Le retrait sur place peut aussi etre propose selon l organisation du service.',
    metadata: {
      customerFacing: true,
      zones: ['Grand Tunis'],
    },
  },
  {
    title: 'Commande FlavoNation',
    category: 'COMMANDE',
    tags: ['commande', 'whatsapp', 'flavonation'],
    content:
      'Pour passer une commande chez FlavoNation, le client doit envoyer le repas souhaite, la quantite, son nom, son numero de telephone et son adresse de livraison. L agent confirme ensuite la disponibilite, le prix total et le mode de livraison.',
    metadata: {
      customerFacing: true,
    },
  },
  {
    title: 'Paiement FlavoNation',
    category: 'PAIEMENT',
    tags: ['paiement', 'cash', 'flavonation'],
    content:
      'FlavoNation accepte principalement le paiement a la livraison en especes. Selon le service disponible, un paiement par virement ou solution mobile peut etre confirme par un agent humain avant validation.',
    metadata: {
      customerFacing: true,
    },
  },
  {
    title: 'Horaires FlavoNation',
    category: 'HORAIRES',
    tags: ['horaires', 'ouverture', 'flavonation'],
    content:
      'FlavoNation traite les commandes WhatsApp tous les jours de 10h00 a 22h00. Les commandes tardives peuvent dependre du stock et de la zone de livraison.',
    metadata: {
      customerFacing: true,
    },
  },
  {
    title: 'Contact FlavoNation',
    category: 'CONTACT',
    tags: ['contact', 'whatsapp', 'flavonation'],
    content:
      'Le contact principal de FlavoNation se fait via WhatsApp. Le client peut envoyer sa question, sa commande ou son adresse directement dans la conversation en cours.',
    metadata: {
      customerFacing: true,
    },
  },
  {
    title: 'Reclamation client FlavoNation',
    category: 'RÉCLAMATION',
    tags: ['reclamation', 'support', 'flavonation'],
    content:
      'Si le client signale une reclamation generale sur une commande FlavoNation, l agent doit demander le nom, le numero de telephone, le detail de la commande et le probleme rencontre, puis escalader vers un agent humain si necessaire.',
    metadata: {
      customerFacing: false,
    },
  },
  {
    title: 'Reclamation alimentaire FlavoNation',
    category: 'SÉCURITÉ_ALIMENTAIRE',
    tags: ['securite alimentaire', 'reclamation', 'allergie'],
    content:
      "Cet article doit etre utilise uniquement si le client signale un probleme lie a la qualite ou la securite alimentaire : odeur anormale, gout etrange, produit abime, allergie, intoxication ou plainte sanitaire. Dans ce cas, l agent doit demander une photo, l heure de reception, le detail de la commande et escalader rapidement vers un agent humain.",
    metadata: {
      customerFacing: false,
      internalOnly: true,
      triggers: [
        'odeur anormale',
        'gout etrange',
        'produit abime',
        'allergie',
        'intoxication',
        'plainte sanitaire',
      ],
    },
  },
];

const FLAVONATION_CURATED_AVAILABLE_ITEMS = [
  'couscous tunisien',
  'pizza',
  'burger',
  'sushi',
  'plat japonais',
  'plat indien',
  'plat italien',
  'plat mexicain',
];

const FLAVONATION_CURATED_MENU_GROUPS = [
  { label: 'Cuisine tunisienne', items: ['couscous tunisien'] },
  { label: 'Cuisine italienne', items: ['pizza', 'plat italien'] },
  { label: 'Cuisine japonaise', items: ['sushi', 'plat japonais'] },
  { label: 'Cuisine indienne', items: ['plat indien'] },
  { label: 'Cuisine mexicaine', items: ['plat mexicain'] },
  { label: 'Cuisine américaine', items: ['burger'] },
  { label: 'Cuisine méditerranéenne', items: ['couscous tunisien', 'pizza'] },
];

const FLAVONATION_CURATED_PRICED_ITEMS = {
  pizza: '20 TND',
  'couscous tunisien': '18 TND',
  burger: '15 TND',
  sushi: 'à partir de 25 TND',
  'plat japonais': 'à partir de 25 TND',
  'plat indien': '22 TND',
  'plat italien': '20 TND',
  'plat mexicain': '21 TND',
};

const FLAVONATION_LEGACY_ARTICLE_TITLES = [
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
];

const FLAVONATION_CURATED_ARTICLES = [
  {
    title: 'Présentation de FlavoNation',
    category: 'SERVICES',
    tags: ['presentation', 'repas internationaux', 'whatsapp', 'flavonation'],
    content:
      "FlavoNation est un service de commande de repas internationaux via WhatsApp. L'entreprise propose des plats inspirés de plusieurs cuisines du monde. Le client peut demander les plats disponibles, les prix, les modes de paiement et les informations de livraison. Toute commande est vérifiée avant confirmation finale.",
    metadata: {
      customerFacing: true,
    },
  },
  {
    title: 'Services proposés',
    category: 'SERVICES',
    tags: ['services', 'prestations', 'commande', 'livraison', 'flavonation'],
    content:
      'FlavoNation propose la commande de repas via WhatsApp, la consultation des plats disponibles, les informations sur les prix, la livraison selon la zone couverte, le paiement selon les modes acceptés, la confirmation de disponibilité avant validation, l’assistance client via WhatsApp et l’orientation vers un conseiller si une information nécessite vérification. Toute commande est vérifiée avant confirmation.',
    metadata: {
      customerFacing: true,
    },
  },
  {
    title: 'Processus de commande',
    category: 'COMMANDE',
    tags: ['commande', 'whatsapp', 'validation', 'flavonation'],
    content:
      'Pour passer une commande, le client doit envoyer le nom du plat souhaité, la quantité, son nom complet, son numéro de téléphone, son adresse de livraison ou sa localisation, et son mode de paiement. Le bot confirme ensuite la réception des informations et indique que la disponibilité, le total et le mode de paiement seront vérifiés avant confirmation.',
    metadata: {
      customerFacing: true,
    },
  },
  {
    title: 'Prix et tarifs',
    category: 'PRIX',
    tags: ['prix', 'tarifs', 'pizza', 'sushi', 'flavonation'],
    content:
      'Prix indicatifs FlavoNation : Pizza 20 TND, Couscous tunisien 18 TND, Burger 15 TND, Sushi ou plat japonais selon disponibilité à partir de 25 TND, Plat indien 22 TND, Plat italien 20 TND, Plat mexicain 21 TND. Les prix sont indicatifs et peuvent varier selon les options, la quantité et la disponibilité.',
    metadata: {
      customerFacing: true,
      pricedItems: FLAVONATION_CURATED_PRICED_ITEMS,
    },
  },
  {
    title: 'Plats internationaux disponibles',
    category: 'PLATS_DISPONIBLES',
    tags: ['plats', 'international', 'japonais', 'sushi', 'flavonation'],
    content:
      "FlavoNation propose des plats inspirés de cuisines internationales selon disponibilité : tunisienne, italienne, japonaise, indienne, mexicaine, américaine et méditerranéenne. Nous pouvons proposer des plats d’inspiration japonaise selon disponibilité, par exemple sushi ou plats similaires. La disponibilité doit être confirmée avant validation de la commande.",
    metadata: {
      customerFacing: true,
      availableItems: FLAVONATION_CURATED_AVAILABLE_ITEMS,
      menuGroups: FLAVONATION_CURATED_MENU_GROUPS,
    },
  },
  {
    title: 'Livraison et zones couvertes',
    category: 'LIVRAISON',
    tags: ['livraison', 'zone', 'sfax', 'japon', 'tunisie', 'flavonation'],
    content:
      'FlavoNation livre selon les zones disponibles. Pour les tests, la livraison est possible à Sfax selon disponibilité. Pour les autres villes ou zones, le client doit envoyer son adresse ou sa localisation. La livraison internationale depuis ou vers le Japon n’est pas confirmée par défaut. Si le client mentionne Japon, le bot doit demander s’il parle de plats japonais ou d’une zone de livraison.',
    metadata: {
      customerFacing: true,
      zones: ['Sfax'],
      requiresAddressForOtherZones: true,
      japanDeliveryConfirmedByDefault: false,
    },
  },
  {
    title: 'Modes de paiement',
    category: 'PAIEMENT',
    tags: ['paiement', 'paypal', 'especes', 'flavonation'],
    content:
      'FlavoNation peut accepter, selon disponibilité, le paiement en espèces à la livraison, le paiement PayPal, ou un autre mode à confirmer avec l’équipe. PayPal est un mode de paiement reconnu, mais le mode de paiement doit être vérifié avant confirmation finale.',
    metadata: {
      customerFacing: true,
      paymentMethods: ['espèces à la livraison', 'PayPal'],
    },
  },
  {
    title: 'Disponibilité et confirmation',
    category: 'COMMANDE',
    tags: ['disponibilite', 'confirmation', 'validation', 'flavonation'],
    content:
      'Toutes les commandes FlavoNation doivent être vérifiées avant confirmation finale : disponibilité du plat, quantité demandée, prix total, zone de livraison, mode de paiement et délai estimé. Le bot ne doit jamais confirmer définitivement une commande sans vérification.',
    metadata: {
      customerFacing: true,
    },
  },
  {
    title: 'Intervention humaine',
    category: 'SUPPORT',
    tags: ['verification', 'support', 'intervention', 'flavonation'],
    content:
      'Si l’IA ne trouve pas une information fiable dans les données de l’entreprise, ou si une commande nécessite validation, la conversation doit être marquée pour intervention humaine. Le client peut recevoir une réponse polie indiquant que la demande sera vérifiée rapidement.',
    metadata: {
      customerFacing: false,
      internalOnly: true,
    },
  },
];

function getBcryptRounds() {
  const parsed = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);
  if (!Number.isFinite(parsed)) {
    return 12;
  }

  return Math.max(10, Math.trunc(parsed));
}

async function upsertSuperAdmin(input) {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(input.password, getBcryptRounds());

  await prisma.user.upsert({
    where: { email },
    update: {
      fullName: input.fullName,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      passwordHash,
      companyId: null,
    },
    create: {
      fullName: input.fullName,
      email,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      companyId: null,
    },
  });
}

async function upsertFlavoNationCompany() {
  return prisma.company.upsert({
    where: { name: FLAVONATION_COMPANY.name },
    update: {
      legalName: FLAVONATION_COMPANY.legalName,
      email: FLAVONATION_COMPANY.email,
      phone: FLAVONATION_COMPANY.phone,
      website: FLAVONATION_COMPANY.website,
      address: FLAVONATION_COMPANY.address,
      status: 'ACTIVE',
      isActive: true,
    },
    create: {
      ...FLAVONATION_COMPANY,
      status: 'ACTIVE',
      isActive: true,
    },
  });
}

async function upsertFlavoNationArticle(companyId, article) {
  const now = new Date();
  const existing = await prisma.kbArticle.findFirst({
    where: {
      companyId,
      title: article.title,
    },
    select: { id: true },
  });

  const articleData = {
    companyId,
    title: article.title,
    body: article.content,
    category: article.category,
    tags: article.tags,
    language: null,
    status: 'published',
    source: 'manual',
    sourceUrl: null,
    sourceConversationId: null,
    sourceContactId: null,
    createdBy: null,
    publishedAt: now,
  };

  const savedArticle = existing
    ? await prisma.kbArticle.update({
        where: { id: existing.id },
        data: {
          ...articleData,
          updatedAt: now,
        },
      })
    : await prisma.kbArticle.create({
        data: {
          ...articleData,
          createdAt: now,
          updatedAt: now,
        },
      });

  await prisma.kbChunk.deleteMany({
    where: { articleId: savedArticle.id },
  });

  await prisma.kbChunk.create({
    data: {
      companyId,
      articleId: savedArticle.id,
      chunkIndex: 0,
      chunkText: article.content,
      metadataJson: {
        category: article.category,
        title: article.title,
        ...(article.metadata ?? {}),
      },
      createdAt: now,
    },
  });

  return savedArticle;
}

async function deleteLegacyFlavoNationArticles(companyId) {
  const legacyArticles = await prisma.kbArticle.findMany({
    where: {
      companyId,
      title: { in: FLAVONATION_LEGACY_ARTICLE_TITLES },
    },
    select: { id: true },
  });

  const legacyArticleIds = legacyArticles.map((article) => article.id);

  if (legacyArticleIds.length === 0) {
    return;
  }

  await prisma.kbChunk.deleteMany({
    where: { articleId: { in: legacyArticleIds } },
  });
  await prisma.kbArticle.deleteMany({
    where: { id: { in: legacyArticleIds } },
  });
}

async function seedFlavoNationKnowledgeBase() {
  const company = await upsertFlavoNationCompany();

  await deleteLegacyFlavoNationArticles(company.id);

  for (const article of FLAVONATION_CURATED_ARTICLES) {
    await upsertFlavoNationArticle(company.id, article);
  }
}

async function main() {
  const allowedEmails = SUPER_ADMINS.map((item) => item.email.toLowerCase());

  await Promise.all(SUPER_ADMINS.map((input) => upsertSuperAdmin(input)));

  await seedFlavoNationKnowledgeBase();

  await prisma.user.updateMany({
    where: {
      role: UserRole.SUPER_ADMIN,
      email: {
        notIn: allowedEmails,
      },
    },
    data: {
      role: UserRole.EMPLOYEE,
      isActive: false,
      companyId: null,
    },
  });
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
