/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv/config');

import { randomUUID } from 'node:crypto';

const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../generated/prisma');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed the Tanfous knowledge base');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const COMPANY_NAME = process.argv[2] ?? 'Toskana World';

interface ArticleSeed {
  title: string;
  content: string;
  category: string;
  tags: string[];
}

const ARTICLES: ArticleSeed[] = [
  {
    title: 'Présentation générale de l\'hôtel',
    category: 'PRESENTATION',
    tags: ['hotel', 'tanfous', 'hammamet', 'aquapark', 'all-inclusive', 'tunisie'],
    content:
      "L'Hôtel Tanfous Beach et Aquapark est un établissement familial situé à Hammamet en Tunisie, Avenue de la Paix, Zone Touristique 8050. Il fonctionne en formule All Inclusive Soft et dispose de 360 chambres confortables ainsi que 360 chambres communicantes idéales pour les familles. L'hôtel possède un grand jardin paysager, une grande piscine extérieure et un parc aquatique avec toboggans.",
  },
  {
    title: 'Localisation et distances',
    category: 'LOCALISATION',
    tags: ['localisation', 'hammamet', 'aeroport', 'plage', 'yasmine'],
    content:
      "L'hôtel Tanfous Beach et Aquapark est situé en bord de mer face à une plage de sable d'or, à proximité du site archéologique de Pupput. Il se trouve à mi-chemin entre la Médina de Hammamet et la station balnéaire Yasmine Hammamet, à environ 10 minutes de chaque destination. L'aéroport international Enfidha-Hammamet est à environ 45 minutes et l'aéroport Tunis-Carthage est à environ 70 minutes de l'hôtel.",
  },
  {
    title: 'Types de chambres disponibles',
    category: 'CHAMBRES',
    tags: ['chambres', 'standard', 'prestige', 'suite', 'family', 'promo'],
    content:
      "L'hôtel Tanfous propose plusieurs types de chambres. La Chambre Standard code STR accueille entre 0 adulte et 3 enfants jusqu'à 3 adultes. La Chambre Prestige code PRR a la même capacité. La Junior Suite code JSU est une chambre avec salon pour 1 à 2 adultes et 1 enfant. La Senior Suite code SSU comprend 2 chambres et un salon pour 2 à 4 adultes et 1 enfant. La Promo Room code PROM est une quadruple sans balcon pour 2 adultes et 2 enfants jusqu'à 4 adultes. La Family Room code FAM accueille de 2 adultes et 2 enfants jusqu'à 4 adultes et 2 enfants.",
  },
  {
    title: 'Tarifs B2C 2026 période juin et octobre',
    category: 'TARIFS',
    tags: ['tarifs', 'juin', 'octobre', 'prix', '2026', 'standard', 'prestige'],
    content:
      "Pour la période du 1er juin au 30 juin et du 21 septembre au 31 octobre 2026, les tarifs par personne par nuit en dinar tunisien sont les suivants. La Chambre Standard est à 115 000 TND. La Chambre Prestige est à 147 000 TND. La Promo Room est à 108 000 TND. La Family Room est à 133 000 TND. La Junior Suite est à 700 000 TND par chambre. La Senior Suite est à 980 000 TND par chambre. Le séjour minimum est de 3 nuits.",
  },
  {
    title: 'Tarifs B2C 2026 période 1er au 15 juillet',
    category: 'TARIFS',
    tags: ['tarifs', 'juillet', 'prix', '2026', 'standard', 'prestige'],
    content:
      "Pour la période du 1er juillet au 15 juillet 2026, les tarifs par personne par nuit en dinar tunisien sont les suivants. La Chambre Standard est à 160 000 TND. La Chambre Prestige est à 200 000 TND. La Promo Room est à 152 000 TND. La Family Room est à 180 000 TND. La Junior Suite est à 950 000 TND par chambre. La Senior Suite est à 1 330 000 TND par chambre. Le séjour minimum est de 4 nuits.",
  },
  {
    title: 'Tarifs B2C 2026 haute saison juillet août',
    category: 'TARIFS',
    tags: ['tarifs', 'haute-saison', 'juillet', 'aout', 'prix', '2026'],
    content:
      "Pour la période du 16 juillet au 31 août 2026 qui est la haute saison, les tarifs par personne par nuit en dinar tunisien sont les suivants. La Chambre Standard est à 200 000 TND. La Chambre Prestige est à 253 000 TND. La Promo Room est à 189 000 TND. La Family Room est à 227 000 TND. La Junior Suite est à 1 200 000 TND par chambre. La Senior Suite est à 1 680 000 TND par chambre. Le séjour minimum obligatoire est de 5 nuits.",
  },
  {
    title: 'Tarifs B2C 2026 septembre',
    category: 'TARIFS',
    tags: ['tarifs', 'septembre', 'prix', '2026'],
    content:
      "Pour la période du 1er septembre au 20 septembre 2026, les tarifs par personne par nuit en dinar tunisien sont les suivants. La Chambre Standard est à 160 000 TND. La Chambre Prestige est à 200 000 TND. La Promo Room est à 152 000 TND. La Family Room est à 180 000 TND. La Junior Suite est à 950 000 TND par chambre. La Senior Suite est à 1 330 000 TND par chambre. Le séjour minimum est de 4 nuits.",
  },
  {
    title: 'Suppléments tarifaires single et vue mer',
    category: 'TARIFS',
    tags: ['supplement', 'single', 'vue-mer', 'tarif', 'chambre'],
    content:
      "Un supplément single de 50 pourcent s'applique sur le tarif de base pour toutes les périodes 2026. Un supplément vue mer est facturé par chambre. Ce supplément est de 17 000 TND pour juin et octobre, de 33 000 TND pour juillet jusqu'au 15 juillet et pour septembre, et de 48 000 TND pour la haute saison du 16 juillet au 31 août.",
  },
  {
    title: 'Réductions enfants et bébés',
    category: 'TARIFS',
    tags: ['enfants', 'bebes', 'reduction', 'tarif', 'famille'],
    content:
      "Les bébés de 0 à 1 an et 11 mois sont toujours gratuits quelle que soit l'occupation. Pour les enfants de 2 à 11 ans, dans une chambre séparée ils ont 30 pourcent de réduction. Avec un seul adulte le premier enfant paie le tarif single adulte et les suivants ont 30 à 50 pourcent de réduction. Avec deux adultes ou plus chaque enfant bénéficie de 50 pourcent de réduction. Les enfants de 12 ans et plus ont 30 pourcent de réduction sur le 3ème et 4ème lit supplémentaire.",
  },
  {
    title: 'Coefficients de calcul par occupation',
    category: 'TARIFS',
    tags: ['coefficient', 'occupation', 'calcul', 'tarif', 'adultes', 'enfants'],
    content:
      "Pour calculer le tarif total d'une chambre un coefficient est appliqué selon la composition. Single coefficient 1,50. Un adulte et un enfant 1,70. Un adulte et deux enfants 2,20. Un adulte et trois enfants 2,70. Deux adultes et un enfant 2,50. Deux adultes et deux enfants 3,00. Trois adultes 2,70. Trois adultes et un enfant 3,20. Quatre adultes 3,40. Quatre adultes et deux enfants 4,40. Deux enfants seuls 1,40. Trois enfants 2,10. Quatre enfants 2,80. Un adulte avec un bébé paie le tarif single.",
  },
  {
    title: 'Check-in check-out et formule All Inclusive',
    category: 'CONDITIONS',
    tags: ['check-in', 'check-out', 'all-inclusive', 'arrivee', 'depart'],
    content:
      "L'enregistrement à l'hôtel Tanfous est possible à partir de 15h00. Le départ doit se faire avant 12h00. L'hôtel fonctionne en formule All Inclusive Soft. Le premier service inclus à l'arrivée est le dîner. Le dernier service inclus au départ est le déjeuner. Un client qui arrive le soir bénéficie du dîner dès son arrivée et un client qui part en milieu de journée bénéficie du déjeuner avant son départ.",
  },
  {
    title: 'Restauration et bars de l\'hôtel',
    category: 'RESTAURATION',
    tags: ['restaurant', 'bar', 'buffet', 'boissons', 'snack', 'all-inclusive'],
    content:
      "L'hôtel Tanfous propose un restaurant principal avec buffet varié de spécialités locales et internationales. Un restaurant snack rénové offre une restauration légère dans un cadre moderne pour les pauses de la journée. Les boissons sont servies à volonté de 10h00 à 23h00 dans le cadre de la formule All Inclusive Soft. Le bar de la piscine et des toboggans est ouvert de 10h00 à 17h00 et propose uniquement des boissons sans alcool.",
  },
  {
    title: 'Sports animations et services enfants',
    category: 'ACTIVITES',
    tags: ['sports', 'animations', 'enfants', 'mini-club', 'activites', 'piscine'],
    content:
      "L'hôtel Tanfous propose de nombreuses activités sportives et d'animation. Parmi les activités on trouve l'aérobic, le football, le volley-ball, le mini-golf, le tennis de table, le tennis, la pétanque et des animations quotidiennes. Des aires de jeux sont disponibles mais certains jeux sont payants. Pour les enfants l'hôtel propose un mini-club pour les 4 à 12 ans. Des chaises bébé et lits bébé sont disponibles selon disponibilité.",
  },
  {
    title: 'Centre SPA et soins bien-être',
    category: 'SPA',
    tags: ['spa', 'hammam', 'massage', 'soin', 'bien-etre', 'payant'],
    content:
      "L'hôtel Tanfous dispose d'un centre de soins esthétiques et de bien-être qui est un service payant non inclus dans la formule All Inclusive. Ce centre propose un hammam, un bain maure, des cabines de massage, des soins du corps et de relaxation ainsi que des soins coiffure et esthétiques. Ces prestations sont disponibles sur place et doivent être réglées séparément du séjour.",
  },
  {
    title: 'Procédure de réservation',
    category: 'RESERVATION',
    tags: ['reservation', 'procedure', 'email', 'confirmation', 'disponibilite'],
    content:
      "Toutes les réservations à l'hôtel Tanfous doivent être transmises par écrit à reservation.hoteltanfous@toskanaworld.tn. Chaque réservation doit mentionner le nom du client principal, la date d'arrivée et de départ, le type de chambre, le nombre de personnes adultes et enfants ainsi que l'âge exact de chaque enfant. La réservation est confirmée sous réserve de disponibilité. En cas de discordance sur l'âge des enfants au check-in le client paie la différence au tarif rack.",
  },
  {
    title: 'Conditions d\'annulation et départ anticipé',
    category: 'CONDITIONS',
    tags: ['annulation', 'depart-anticipe', 'frais', 'conditions'],
    content:
      "Les annulations doivent être communiquées par écrit. Une annulation faite plus de 48 heures avant l'arrivée est sans frais. Une annulation moins de 48 heures avant l'arrivée entraîne la facturation de la première nuit. En cas de départ anticipé confirmé par email 24 heures à l'avance la nuit suivante est facturée. Sans confirmation de l'hôtel la facturation peut atteindre 100 pourcent du séjour total.",
  },
  {
    title: 'No-Show non-présentation du client',
    category: 'CONDITIONS',
    tags: ['no-show', 'non-presentation', 'facturation', 'nuitee'],
    content:
      "En cas de non-présentation d'un client sans annulation préalable l'hôtel Tanfous maintient la chambre jusqu'à 12h00 le lendemain de la date d'arrivée prévue. L'hôtel facture 100 pourcent de la première nuitée pour chaque chambre réservée non occupée. Aucune compensation ne peut être accordée pour les nuitées non utilisées suite à un no-show.",
  },
  {
    title: 'Taxe de séjour et conditions de paiement',
    category: 'PAIEMENT',
    tags: ['taxe', 'sejour', 'paiement', 'credit', 'garantie'],
    content:
      "Une taxe de séjour de 2 dinars tunisiens par personne et par nuit s'applique pour toute personne de plus de 12 ans pour un maximum de 10 nuits. Cette taxe est payable directement par le client à l'hôtel et n'est pas incluse dans les tarifs agence. Une réservation n'est confirmée qu'après réception du paiement avant l'arrivée du client. Une ligne de crédit peut être accordée sous réserve d'un dépôt de garantie.",
  },
  {
    title: 'Réclamations litiges et durée du contrat',
    category: 'CONDITIONS',
    tags: ['reclamation', 'litige', 'contrat', 'tribunal', 'validite'],
    content:
      "Les réclamations ne sont prises en compte que si elles sont déposées pendant le séjour du client par le client lui-même ou par le représentant du partenaire présent à l'hôtel. Tout litige sera réglé à l'amiable en priorité. En cas d'échec les tribunaux compétents du lieu du siège de l'hôtel sont seuls compétents. Le contrat est valable du 1er juin 2026 au 30 septembre 2026.",
  },
  {
    title: 'Engagements agence et hôtel et promotions',
    category: 'CONDITIONS',
    tags: ['engagement', 'agence', 'promotion', 'voucher', 'tarif-contractuel'],
    content:
      "L'agence s'engage à transmettre des informations exactes sur les réservations, informer ses clients des conditions d'annulation, garantir la conformité de la prestation avec le voucher et respecter les promotions. L'hôtel s'engage à respecter les tarifs contractuels, ne pas les divulguer au client direct et garantir les prestations confirmées. Toute action promotionnelle fait l'objet d'une communication par email du département réservation en précisant si elle est cumulable ou non.",
  },
];

async function ensureCompany(): Promise<{ id: string }> {
  return prisma.company.upsert({
    where: { name: COMPANY_NAME },
    update: { status: 'ACTIVE', isActive: true },
    create: { name: COMPANY_NAME, status: 'ACTIVE', isActive: true },
  });
}

async function upsertArticle(companyId: string, article: ArticleSeed): Promise<void> {
  const now = new Date();

  const existing = await prisma.kbArticle.findFirst({
    where: { companyId, title: article.title },
    select: { id: true },
  });

  const baseData = {
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

  const saved: { id: string } = existing
    ? await prisma.kbArticle.update({
        where: { id: existing.id },
        data: { ...baseData, updatedAt: now },
      })
    : await prisma.kbArticle.create({
        data: { ...baseData, createdAt: now, updatedAt: now },
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
        language: 'fr',
        customerFacing: true,
        curatedForWhatsapp: true,
      },
      createdAt: now,
    },
  });

  const action = existing ? 'updated' : 'created';
  console.log(`  ✓ [${action}] [${article.category}] ${article.title}`);
}

async function main(): Promise<void> {
  console.log(`\nSeeding Tanfous KB articles for company: "${COMPANY_NAME}"`);
  console.log('─'.repeat(60));

  const company = await ensureCompany();
  console.log(`  → Company ID: ${company.id}`);

  console.log(`\nUpserting ${ARTICLES.length} articles...\n`);

  for (const article of ARTICLES) {
    await upsertArticle(company.id, article);
  }

  console.log('\n' + '─'.repeat(60));
  console.log(
    `Tanfous KB ready: ${ARTICLES.length} published articles for company "${COMPANY_NAME}" (${company.id})`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    await prisma.$disconnect();
    process.exit(1);
  });
