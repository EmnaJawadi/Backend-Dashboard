export type ToskanaworldKnowledgeArticle = {
  title: string;
  category: string;
  tags: string[];
  content: string;
};

type TariffPeriod = {
  code: string;
  startDate: string;
  endDate: string;
};

type RoomTariff = {
  name: string;
  code: string;
  pricingMode: 'PAX' | 'ROOM';
  occupancyMin?: string;
  occupancyMax?: string;
  rates: Array<{ period: string; rate: number }>;
};

type ChildReduction = {
  occupancy: string;
  age: string;
  childNumber?: number;
  reduction: string;
};

export type Toskanaworld2026TariffData = {
  hotel: string;
  formerName: string;
  board: string;
  market: string;
  year: number;
  periods: TariffPeriod[];
  rooms: RoomTariff[];
  singleSupplement: string;
  seaView: Array<{ period: string; amount: number }>;
  minimumStay: Array<{ period: string; nights: number }>;
  childReductions: ChildReduction[];
  extraBedReduction: ChildReduction;
  rules: string[];
};

export const TOSKANAWORLD_2026_DATA: Toskanaworld2026TariffData = {
  hotel: 'ToskanaWorld Beach Resort Hammamet',
  formerName: 'Tanfous Beach Hammamet',
  board: 'All Inclusive Soft',
  market: 'B2C',
  year: 2026,
  periods: [
    { code: 'P1', startDate: '2026-06-01', endDate: '2026-06-30' },
    { code: 'P2', startDate: '2026-07-01', endDate: '2026-07-15' },
    { code: 'P3', startDate: '2026-07-16', endDate: '2026-08-31' },
    { code: 'P4', startDate: '2026-09-01', endDate: '2026-09-20' },
    { code: 'P5', startDate: '2026-09-21', endDate: '2026-10-31' },
  ],
  rooms: [
    {
      name: 'Standard Room',
      code: 'STR',
      pricingMode: 'PAX',
      occupancyMin: '0A+3E',
      occupancyMax: '3A+0E',
      rates: [
        { period: 'P1', rate: 115 },
        { period: 'P2', rate: 160 },
        { period: 'P3', rate: 200 },
        { period: 'P4', rate: 160 },
        { period: 'P5', rate: 115 },
      ],
    },
    {
      name: 'Prestige Room',
      code: 'PRR',
      pricingMode: 'PAX',
      rates: [
        { period: 'P1', rate: 147 },
        { period: 'P2', rate: 200 },
        { period: 'P3', rate: 253 },
        { period: 'P4', rate: 200 },
        { period: 'P5', rate: 147 },
      ],
    },
    {
      name: 'Promo Room',
      code: 'PROM',
      pricingMode: 'PAX',
      rates: [
        { period: 'P1', rate: 108 },
        { period: 'P2', rate: 152 },
        { period: 'P3', rate: 189 },
        { period: 'P4', rate: 152 },
        { period: 'P5', rate: 108 },
      ],
    },
    {
      name: 'Family Room',
      code: 'FAM',
      pricingMode: 'PAX',
      rates: [
        { period: 'P1', rate: 133 },
        { period: 'P2', rate: 180 },
        { period: 'P3', rate: 227 },
        { period: 'P4', rate: 180 },
        { period: 'P5', rate: 133 },
      ],
    },
    {
      name: 'Junior Suite',
      code: 'JSU',
      pricingMode: 'ROOM',
      rates: [
        { period: 'P1', rate: 700 },
        { period: 'P2', rate: 950 },
        { period: 'P3', rate: 1200 },
      ],
    },
    {
      name: 'Senior Suite',
      code: 'SSU',
      pricingMode: 'ROOM',
      rates: [
        { period: 'P1', rate: 980 },
        { period: 'P2', rate: 1330 },
        { period: 'P3', rate: 1680 },
      ],
    },
  ],
  singleSupplement: '50%',
  seaView: [
    { period: 'P1', amount: 17 },
    { period: 'P2', amount: 33 },
    { period: 'P3', amount: 48 },
  ],
  minimumStay: [
    { period: 'P1', nights: 3 },
    { period: 'P2', nights: 4 },
    { period: 'P3', nights: 5 },
  ],
  childReductions: [
    {
      occupancy: 'with_2_adults_or_more',
      age: '2-11.99',
      childNumber: 1,
      reduction: '50%',
    },
    {
      occupancy: 'with_2_adults_or_more',
      age: '2-11.99',
      childNumber: 2,
      reduction: '50%',
    },
    {
      occupancy: 'with_1_adult',
      age: '2-11.99',
      childNumber: 1,
      reduction: '30%',
    },
    {
      occupancy: 'with_1_adult',
      age: '2-11.99',
      childNumber: 2,
      reduction: '50%',
    },
    {
      occupancy: 'separate_room',
      age: '2-11.99',
      childNumber: 1,
      reduction: '30%',
    },
  ],
  extraBedReduction: {
    occupancy: 'extra_bed',
    age: '12+',
    reduction: '30%',
  },
  rules: [
    'Junior Suite and Senior Suite are charged per room',
    'Standard Room, Prestige Room, Promo Room and Family Room are charged per person',
    'Sea view supplement is applied per room',
    'Single supplement is 50 percent',
    'Baby age range is 0 to 1.99 years',
    'Child age range is 2 to 11.99 years',
  ],
};

export const TOSKANAWORLD_2026_SUPPLEMENTARY_ARTICLES: ToskanaworldKnowledgeArticle[] = [
  {
    title: 'ToskanaWorld - Localisation et acces',
    category: 'Localisation',
    tags: ['ToskanaWorld', 'localisation', 'Hammamet', 'adresse', 'acces', 'aeroport'],
    content: `# Localisation de ToskanaWorld Beach Resort Hammamet

Adresse : ToskanaWorld Beach Resort Hammamet, Zone Touristique de Hammamet, Tunisie.
Ancien nom : Tanfous Beach Hammamet.

L'hotel est situe directement en bord de mer a Hammamet, face a une plage de sable fin.

# Distances principales
- Medina de Hammamet : environ 10 minutes.
- Yasmine Hammamet (station balneaire) : environ 10 minutes.
- Aeroport international Enfidha-Hammamet : environ 45 minutes.
- Aeroport Tunis-Carthage : environ 70 minutes.

# Acces
L'hotel est accessible en voiture, en taxi et en navette depuis les aeroports. Pour les transferts depuis l'aeroport, contacter directement l'hotel ou votre agence de voyage.`,
  },
  {
    title: 'ToskanaWorld - Services et equipements de l hotel',
    category: 'Services',
    tags: ['ToskanaWorld', 'services', 'piscine', 'restaurant', 'plage', 'activites', 'all inclusive'],
    content: `# Formule All Inclusive Soft
ToskanaWorld Beach Resort Hammamet fonctionne en formule All Inclusive Soft en 2026.
La formule All Inclusive Soft comprend generalement les repas (petit-dejeuner, dejeuner, diner), les boissons locales aux repas et les collations pendant les heures de service. Les boissons premium et les services a la carte peuvent etre en supplement. Verifier les inclusions exactes avec l'hotel avant la reservation.

# Equipements principaux
- Plage privee de sable fin directement accessible depuis l'hotel.
- Grande piscine exterieure.
- Jardin paysager.
- Parc aquatique avec toboggans (idee pour les familles).
- Plusieurs restaurants et bars (details a confirmer avec l'hotel).
- Animations et activites sur place (details a confirmer).
- Parking disponible.

# Chambres
L'hotel dispose de chambres de differents types adaptees aux couples, familles et groupes : Standard Room, Prestige Room, Promo Room, Family Room, Junior Suite et Senior Suite. Les details complets des tarifs 2026 sont disponibles dans les articles correspondants.`,
  },
  {
    title: 'ToskanaWorld - Spa et bien-etre',
    category: 'Spa',
    tags: ['ToskanaWorld', 'spa', 'bien-etre', 'hammam', 'massage', 'relaxation'],
    content: `# Spa et bien-etre a ToskanaWorld
ToskanaWorld Beach Resort Hammamet dispose d'un espace bien-etre et spa.
Les services de spa peuvent inclure hammam, massages, soins du visage et soins du corps.
Les tarifs et disponibilites du spa sont a confirmer directement avec l'hotel car ils peuvent etre en supplement de la formule All Inclusive.

Si le client pose des questions sur les soins disponibles, les prix du spa ou la reservation de soins, indiquer que ces informations doivent etre verifiees directement avec l'hotel ToskanaWorld.`,
  },
  {
    title: 'ToskanaWorld - Restaurant et restauration',
    category: 'Restaurant',
    tags: ['ToskanaWorld', 'restaurant', 'repas', 'buffet', 'cuisine', 'all inclusive'],
    content: `# Restauration a ToskanaWorld
ToskanaWorld Beach Resort Hammamet propose une restauration en formule All Inclusive Soft.

Les repas incluent generalement : petit-dejeuner, dejeuner et diner sous forme de buffet ou de menu. Les boissons locales sont generalement incluses aux repas.

Les restaurants a la carte, les bars et les services de restauration supplementaires sont a confirmer avec l'hotel car ils peuvent etre payants en dehors de la formule.

Si le client pose des questions sur les menus, les types de cuisine ou les horaires des repas, indiquer que les details exacts sont a confirmer avec l'hotel.`,
  },
  {
    title: 'ToskanaWorld - Comment reserver',
    category: 'Reservation',
    tags: ['ToskanaWorld', 'reservation', 'contact', 'booking', 'comment reserver', 'nhajez'],
    content: `# Comment reserver a ToskanaWorld Beach Resort Hammamet

Pour effectuer une reservation a ToskanaWorld :
1. Indiquer les dates de sejour souhaitees (date d'arrivee et de depart).
2. Preciser le nombre d'adultes et d'enfants (avec les ages des enfants).
3. Choisir le type de chambre souhaite.
4. Obtenir un devis base sur les tarifs 2026 disponibles dans la base de connaissance.
5. Contacter directement l'hotel ou votre agence de voyage pour finaliser la reservation et le paiement.

Les tarifs 2026 (par periode P1 a P5) sont disponibles dans les articles detailles de la base de connaissance. Une reservation definitive ne peut etre confirmee que par l'hotel directement.

Note importante : les tarifs affiches sont les tarifs officiels du document PDF 2026. La disponibilite reelle des chambres doit etre confirmee par l'hotel. Le PDF tarifaire ne constitue pas une preuve de disponibilite.`,
  },
  {
    title: 'ToskanaWorld - Contact et informations pratiques',
    category: 'Contact',
    tags: ['ToskanaWorld', 'contact', 'telephone', 'email', 'informations', 'pratiques'],
    content: `# Contact ToskanaWorld Beach Resort Hammamet

Pour contacter ToskanaWorld Beach Resort Hammamet directement pour une reservation, une question sur les disponibilites ou un renseignement, utiliser les coordonnees officielles de l'hotel.

Les coordonnees exactes (telephone, email, site web) doivent etre confirmees avec l'equipe ToskanaWorld car elles peuvent changer.

Pour les clients qui posent des questions sur la reservation, les disponibilites, un probleme ou une reclamation, transferer vers un agent humain ToskanaWorld qui pourra donner les informations a jour et finaliser les demarches.`,
  },
  {
    title: 'ToskanaWorld - Questions frequentes clients',
    category: 'FAQ',
    tags: ['ToskanaWorld', 'faq', 'questions', 'frequentes', 'clients', 'sejour'],
    content: `# Questions frequentes sur ToskanaWorld Beach Resort Hammamet

## Est-ce qu'il y a une plage ?
Oui. ToskanaWorld est un hotel balneare situe directement en bord de mer avec une plage privee de sable fin.

## Est-ce qu'il y a une piscine ?
Oui. L'hotel dispose d'une grande piscine exterieure et d'un parc aquatique avec toboggans.

## Est-ce qu'il y a un spa ?
ToskanaWorld dispose d'un espace bien-etre et spa. Les details et tarifs des soins sont a confirmer avec l'hotel.

## Quelle est la formule de l'hotel ?
All Inclusive Soft 2026.

## Est-ce adapte aux familles ?
Oui. L'hotel dispose de Family Rooms, d'un parc aquatique et de chambres communicantes adaptees aux familles.

## Qu'est-ce qui est inclu dans le All Inclusive Soft ?
Generalement : repas (petit-dejeuner, dejeuner, diner), boissons locales aux repas. Les extras et services premium peuvent etre en supplement. Verifier avec l'hotel les inclusions exactes.

## Quel est l'ancien nom de l'hotel ?
L'ancien nom est Tanfous Beach Hammamet.`,
  },
];

export const TOSKANAWORLD_2026_ARTICLES = [
  ...buildToskanaworld2026Articles(TOSKANAWORLD_2026_DATA),
  ...TOSKANAWORLD_2026_SUPPLEMENTARY_ARTICLES,
];

export function buildToskanaworld2026Articles(
  data: Toskanaworld2026TariffData,
): ToskanaworldKnowledgeArticle[] {
  const periodByCode = new Map(
    data.periods.map((period) => [period.code, period]),
  );
  const roomArticle = (room: RoomTariff): ToskanaworldKnowledgeArticle => {
    const unit =
      room.pricingMode === 'ROOM'
        ? 'par chambre par nuit'
        : 'par personne (PAX) par nuit';
    const occupancy =
      room.occupancyMin && room.occupancyMax
        ? `\n\nOccupation indiquee dans le PDF: minimum ${room.occupancyMin}; maximum ${room.occupancyMax}.`
        : '';
    const rates = room.rates
      .map((item) => {
        const period = periodByCode.get(item.period);
        const dates = period
          ? `du ${formatDate(period.startDate)} au ${formatDate(period.endDate)}`
          : 'dates non precisees';
        return `## ${item.period}\nLe tarif officiel ${item.period} pour ${room.name} est de ${item.rate} TND ${unit}, ${dates}.`;
      })
      .join('\n\n');
    const missingPeriods = data.periods
      .map((period) => period.code)
      .filter((code) => !room.rates.some((rate) => rate.period === code));
    const missing = missingPeriods.length
      ? `\n\n## Periodes sans tarif\nLe PDF officiel ne fournit aucun tarif ${room.name} pour ${missingPeriods.join(' ou ')}. Aucun prix ne doit etre extrapole; une verification humaine est necessaire.`
      : '';

    return {
      title: `ToskanaWorld 2026 - Tarifs ${room.name}`,
      category: 'Tarifs chambres',
      tags: [
        'ToskanaWorld',
        'tarifs 2026',
        room.name,
        room.code,
        room.pricingMode,
      ],
      content: `# ${room.name}\nCode chambre: ${room.code}. Mode de facturation officiel: ${unit}.${occupancy}\n\n${rates}${missing}`,
    };
  };

  return [
    {
      title: 'ToskanaWorld 2026 - Informations generales de l hotel',
      category: 'Informations generales',
      tags: ['ToskanaWorld', 'hotel', 'Hammamet', 'B2C', '2026'],
      content: `# Identite de l hotel\nNom officiel: ${data.hotel}.\n\nAncien nom indique dans le PDF: ${data.formerName}.\n\nMarche tarifaire: ${data.market}. Annee tarifaire: ${data.year}.\n\nFormule indiquee: ${data.board}.\n\n# Limite des informations\nLe PDF tarifaire ne contient pas de calendrier de disponibilite des chambres. Une periode tarifaire ne prouve pas qu'une chambre est disponible.`,
    },
    {
      title: 'ToskanaWorld 2026 - Periodes tarifaires',
      category: 'Periodes tarifaires',
      tags: ['ToskanaWorld', 'periodes', 'tarifs 2026', 'P1 P2 P3 P4 P5'],
      content: [
        '# Periodes tarifaires officielles 2026',
        ...data.periods.map(
          (period) =>
            `## ${period.code}\nLa periode ${period.code} commence le ${formatDate(period.startDate)} et se termine le ${formatDate(period.endDate)} inclus.`,
        ),
      ].join('\n\n'),
    },
    ...data.rooms.map(roomArticle),
    {
      title: 'ToskanaWorld 2026 - Supplements',
      category: 'Supplements',
      tags: ['ToskanaWorld', 'supplements', 'single', 'vue mer', '2026'],
      content: [
        '# Supplement single',
        `Le supplement pour une chambre single est de ${data.singleSupplement}.`,
        '# Supplement vue mer',
        ...data.seaView.map((item) => {
          const period = periodByCode.get(item.period);
          return `## ${item.period}\nLe supplement vue mer en ${item.period} est de ${item.amount} TND par chambre, ${period ? `du ${formatDate(period.startDate)} au ${formatDate(period.endDate)}` : 'dates non precisees'}.`;
        }),
        '## Periodes sans montant',
        'Le PDF officiel ne fournit aucun montant de supplement vue mer pour P4 ou P5. Aucun montant ne doit etre extrapole; une verification humaine est necessaire.',
      ].join('\n\n'),
    },
    {
      title: 'ToskanaWorld 2026 - Sejour minimum',
      category: 'Minimum stay',
      tags: ['ToskanaWorld', 'minimum stay', 'sejour minimum', 'nuits', '2026'],
      content: [
        '# Sejour minimum officiel',
        ...data.minimumStay.map((item) => {
          const period = periodByCode.get(item.period);
          return `## ${item.period}\nLe sejour minimum en ${item.period} est de ${item.nights} nuits, ${period ? `du ${formatDate(period.startDate)} au ${formatDate(period.endDate)}` : 'dates non precisees'}.`;
        }),
        '## Periodes sans minimum indique',
        'Le PDF officiel ne precise aucun sejour minimum pour P4 ou P5. Aucune duree ne doit etre inventee; une verification humaine est necessaire.',
      ].join('\n\n'),
    },
    {
      title: 'ToskanaWorld 2026 - Reductions enfants',
      category: 'Reductions enfants',
      tags: ['ToskanaWorld', 'enfants', 'reductions', 'lit supplementaire', '2026'],
      content: `# Tranches d age\nUn bebe a entre 0 et 1,99 an. Le PDF ne precise pas de reduction tarifaire pour le bebe.\n\nUn enfant a entre 2 et 11,99 ans.\n\n# Enfant avec deux adultes ou plus\nAvec deux adultes ou plus, le premier enfant de 2 a 11,99 ans beneficie d'une reduction de 50 %.\n\nAvec deux adultes ou plus, le deuxieme enfant de 2 a 11,99 ans beneficie aussi d'une reduction de 50 %.\n\n# Enfants avec un adulte\nAvec un adulte, le premier enfant de 2 a 11,99 ans beneficie d'une reduction de 30 %.\n\nAvec un adulte, le deuxieme enfant de 2 a 11,99 ans beneficie d'une reduction de 50 %.\n\n# Chambre separee\nDans une chambre separee, le premier enfant de 2 a 11,99 ans beneficie d'une reduction de 30 %.\n\n# Lit supplementaire\nPour une personne de 12 ans ou plus en lit supplementaire, la reduction indiquee est de 30 %.`,
    },
    {
      title: 'ToskanaWorld 2026 - Regles de calcul des prix',
      category: 'Regles de calcul',
      tags: ['ToskanaWorld', 'calcul prix', 'PAX', 'par chambre', '2026'],
      content: `# Choix de la periode\nLe tarif a utiliser est celui de la periode correspondant a la date du sejour: P1, P2, P3, P4 ou P5.\n\n# Chambres facturees par personne\nStandard Room, Prestige Room, Promo Room et Family Room sont facturees par personne (PAX).\n\n# Suites facturees par chambre\nJunior Suite et Senior Suite sont facturees par chambre.\n\n# Supplements\nLe supplement vue mer est applique par chambre. Le supplement single est de 50 %.\n\n# Enfants\nLa tranche bebe est de 0 a 1,99 an. La tranche enfant est de 2 a 11,99 ans. Les reductions enfants doivent etre choisies selon le nombre d'adultes, le rang de l'enfant et son age.\n\n# Informations obligatoires avant un calcul\nPour calculer un prix, il faut connaitre les dates du sejour, le type de chambre, le nombre d'adultes, le nombre d'enfants et l'age de chaque enfant. Si une de ces informations manque, l'agent doit demander une precision.\n\n# Limites\nLe PDF ne fournit pas de regle pour un sejour qui traverse plusieurs periodes et ne fournit pas de calendrier de disponibilite. Dans ces cas, l'agent ne doit pas inventer: il doit demander une verification humaine.`,
    },
  ];
}

export function parseToskanaworld2026PdfData(
  rawText: string,
): Toskanaworld2026TariffData | null {
  if (
    !rawText.includes('toskana_2026_meta_001') ||
    !rawText.includes('toskana_2026_rule_006')
  ) {
    return null;
  }

  const repaired = rawText
    .replace(/"end_\s+date"/g, '"end_date"')
    .replace(
      /("(?:rate|amount|nights|year|child_number)"\s*:\s*)(\d+)\s+(\d+)(?=\s*[,}])/g,
      '$1$2$3',
    );
  const records = (repaired.match(/\{[^{}]+\}/g) ?? [])
    .map((value) => {
      try {
        const parsed = JSON.parse(value) as Record<string, unknown>;
        return Object.fromEntries(
          Object.entries(parsed).map(([key, item]) => [
            key.trim(),
            typeof item === 'string'
              ? item.replace(/\s+/g, ' ').replace(/\s*-\s*/g, '-').trim()
              : item,
          ]),
        );
      } catch {
        return null;
      }
    })
    .filter((record): record is Record<string, unknown> => Boolean(record));

  const meta = records.find((record) => record.id === 'toskana_2026_meta_001');
  if (!meta) {
    return null;
  }

  const periods = records
    .filter((record) => record.type === 'period')
    .map((record) => ({
      code: text(record.period),
      startDate: text(record.start_date),
      endDate: text(record.end_date),
    }))
    .filter((period) => period.code && period.startDate && period.endDate)
    .sort((left, right) => left.code.localeCompare(right.code));
  const roomDefinitions: Array<Pick<RoomTariff, 'name' | 'code' | 'pricingMode'>> = [
    { name: 'Standard Room', code: 'STR', pricingMode: 'PAX' },
    { name: 'Prestige Room', code: 'PRR', pricingMode: 'PAX' },
    { name: 'Promo Room', code: 'PROM', pricingMode: 'PAX' },
    { name: 'Family Room', code: 'FAM', pricingMode: 'PAX' },
    { name: 'Junior Suite', code: 'JSU', pricingMode: 'ROOM' },
    { name: 'Senior Suite', code: 'SSU', pricingMode: 'ROOM' },
  ];
  const rooms = roomDefinitions.map((definition) => {
    const rateRecords = records.filter(
      (record) => record.room_code === definition.code,
    );
    return {
      ...definition,
      occupancyMin: text(rateRecords[0]?.occupancy_min) || undefined,
      occupancyMax: text(rateRecords[0]?.occupancy_max) || undefined,
      rates: rateRecords
        .map((record) => ({
          period: text(record.period),
          rate: number(record.rate),
        }))
        .filter((rate) => rate.period && Number.isFinite(rate.rate))
        .sort((left, right) => left.period.localeCompare(right.period)),
    };
  });
  const single = records.find(
    (record) => record.type === 'supplement' && record.name === 'single_room',
  );
  const seaView = records
    .filter(
      (record) => record.type === 'supplement' && record.name === 'sea_view',
    )
    .map((record) => ({ period: text(record.period), amount: number(record.amount) }))
    .filter((item) => item.period && Number.isFinite(item.amount));
  const minimumStay = records
    .filter((record) => record.type === 'minimum_stay')
    .map((record) => ({ period: text(record.period), nights: number(record.nights) }))
    .filter((item) => item.period && Number.isFinite(item.nights));
  const childReductions = records
    .filter((record) => record.type === 'child_reduction')
    .map((record) => ({
      occupancy: text(record.occupancy),
      age: text(record.age),
      childNumber: number(record.child_number),
      reduction: text(record.reduction),
    }));
  const extraBed = records.find((record) => record.type === 'extra_bed_reduction');
  const rules = records
    .filter((record) => record.type === 'business_rule')
    .map((record) => text(record.rule))
    .filter(Boolean);

  if (
    periods.length !== 5 ||
    rooms.some((room, index) => room.rates.length !== (index < 4 ? 5 : 3)) ||
    !single ||
    seaView.length !== 3 ||
    minimumStay.length !== 3 ||
    childReductions.length !== 5 ||
    !extraBed ||
    rules.length !== 6
  ) {
    return null;
  }

  return {
    hotel: text(meta.hotel),
    formerName: text(meta.former_name),
    board: text(meta.board),
    market: text(meta.market),
    year: number(meta.year),
    periods,
    rooms,
    singleSupplement: text(single.value),
    seaView,
    minimumStay,
    childReductions,
    extraBedReduction: {
      occupancy: 'extra_bed',
      age: text(extraBed.age),
      reduction: text(extraBed.reduction),
    },
    rules,
  };
}

function formatDate(value: string): string {
  const [year, month, day] = value.split('-');
  const monthNames: Record<string, string> = {
    '01': 'janvier',
    '02': 'fevrier',
    '03': 'mars',
    '04': 'avril',
    '05': 'mai',
    '06': 'juin',
    '07': 'juillet',
    '08': 'aout',
    '09': 'septembre',
    '10': 'octobre',
    '11': 'novembre',
    '12': 'decembre',
  };
  return `${day}/${month}/${year} (${Number(day)} ${monthNames[month] ?? month} ${year})`;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function number(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}
