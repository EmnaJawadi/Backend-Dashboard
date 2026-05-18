import { Injectable } from '@nestjs/common';

export const KB_CATEGORIES = {
  MENU_DU_JOUR: 'MENU_DU_JOUR',
  PLATS_DISPONIBLES: 'PLATS_DISPONIBLES',
  PRIX: 'PRIX',
  LIVRAISON: 'LIVRAISON',
  COMMANDE: 'COMMANDE',
  PAIEMENT: 'PAIEMENT',
  HORAIRES: 'HORAIRES',
  CONTACT: 'CONTACT',
  RECLAMATION: 'R\u00c9CLAMATION',
  SECURITE_ALIMENTAIRE: 'S\u00c9CURIT\u00c9_ALIMENTAIRE',
  SERVICES: 'SERVICES',
  PRODUITS: 'PRODUITS',
  TARIFS: 'TARIFS',
  SUPPORT: 'SUPPORT',
} as const;

export type CustomerIntent =
  | 'ASK_SERVICES'
  | 'ASK_MENU'
  | 'ASK_DISH_AVAILABILITY'
  | 'ASK_PRICE'
  | 'ASK_DELIVERY'
  | 'ASK_DELIVERY_OR_PRODUCT_AMBIGUOUS'
  | 'ASK_PAYMENT'
  | 'ASK_ORDER'
  | 'ASK_CONTACT'
  | 'FOOD_COMPLAINT'
  | 'GREETING'
  | 'CUSTOMER_DONE'
  | 'UNKNOWN';

export type CatalogKnowledge = {
  availableItems: string[];
  unavailableItems: string[];
  menuGroups: Array<{ label: string; items: string[] }>;
  pricedItems: Array<{ item: string; price: string }>;
};

const INTENT_CATEGORY_ALIASES: Record<CustomerIntent, string[]> = {
  ASK_SERVICES: [
    KB_CATEGORIES.SERVICES,
    KB_CATEGORIES.PRODUITS,
    KB_CATEGORIES.MENU_DU_JOUR,
    KB_CATEGORIES.PLATS_DISPONIBLES,
    KB_CATEGORIES.PRIX,
    KB_CATEGORIES.TARIFS,
    KB_CATEGORIES.COMMANDE,
    KB_CATEGORIES.LIVRAISON,
    KB_CATEGORIES.PAIEMENT,
    KB_CATEGORIES.HORAIRES,
    KB_CATEGORIES.CONTACT,
    'MENU',
    'CATALOGUE',
    'OFFRES',
    'FAQ',
  ],
  ASK_MENU: [
    KB_CATEGORIES.MENU_DU_JOUR,
    KB_CATEGORIES.PLATS_DISPONIBLES,
    'MENU',
    'MENUS',
    'CATALOGUE',
    'CATALOGUES',
    KB_CATEGORIES.PRODUITS,
    KB_CATEGORIES.SERVICES,
    'OFFRES',
    'REPAS',
    'PLATS',
    'PRODUCTS',
  ],
  ASK_DISH_AVAILABILITY: [
    KB_CATEGORIES.PLATS_DISPONIBLES,
    KB_CATEGORIES.MENU_DU_JOUR,
    KB_CATEGORIES.PRODUITS,
    KB_CATEGORIES.SERVICES,
    'DISPONIBILITE',
    'DISPONIBILITE_PRODUITS',
    'CATALOGUE',
    'CATALOGUES',
    'STOCK',
    'INVENTAIRE',
    'PRODUCTS',
  ],
  ASK_PRICE: [
    KB_CATEGORIES.PRIX,
    KB_CATEGORIES.TARIFS,
    'TARIF',
    'PRICING',
    'PRICE',
    'PRICES',
    'ABONNEMENTS',
    'PLANS',
  ],
  ASK_DELIVERY: [
    KB_CATEGORIES.LIVRAISON,
    'EXPEDITION',
    'SHIPPING',
    'DELIVERY',
    'RETRAIT',
    'TRANSPORT',
  ],
  ASK_DELIVERY_OR_PRODUCT_AMBIGUOUS: [
    KB_CATEGORIES.LIVRAISON,
    KB_CATEGORIES.PLATS_DISPONIBLES,
    KB_CATEGORIES.PRODUITS,
    KB_CATEGORIES.MENU_DU_JOUR,
    'JAPON',
    'JAPONAIS',
    'JAPONAISE',
    'SUSHI',
    'DELIVERY',
    'CATALOGUE',
  ],
  ASK_PAYMENT: [
    KB_CATEGORIES.PAIEMENT,
    KB_CATEGORIES.COMMANDE,
    'PAYMENT',
    'PAYPAL',
    'CASH',
    'ESPECES',
    'ESPECE',
  ],
  ASK_ORDER: [
    KB_CATEGORIES.COMMANDE,
    KB_CATEGORIES.PAIEMENT,
    KB_CATEGORIES.LIVRAISON,
    'COMMANDES',
    'ORDER',
    'ORDERS',
    'ACHAT',
    'ACHATS',
    'RESERVATION',
    'RESERVATIONS',
  ],
  ASK_CONTACT: [
    KB_CATEGORIES.CONTACT,
    KB_CATEGORIES.HORAIRES,
    KB_CATEGORIES.LIVRAISON,
    'ADRESSE',
    'LOCALISATION',
    'POSITION',
    'LOCATION',
    'WHATSAPP',
  ],
  FOOD_COMPLAINT: [
    KB_CATEGORIES.RECLAMATION,
    KB_CATEGORIES.SECURITE_ALIMENTAIRE,
    'RECLAMATIONS',
    'COMPLAINT',
    'COMPLAINTS',
    'QUALITE',
    'SECURITE',
    'SAFETY',
    KB_CATEGORIES.SUPPORT,
  ],
  GREETING: [
    KB_CATEGORIES.MENU_DU_JOUR,
    KB_CATEGORIES.PLATS_DISPONIBLES,
    KB_CATEGORIES.PRODUITS,
    KB_CATEGORIES.SERVICES,
    KB_CATEGORIES.LIVRAISON,
    KB_CATEGORIES.COMMANDE,
    KB_CATEGORIES.HORAIRES,
    KB_CATEGORIES.CONTACT,
    'CATALOGUE',
    'FAQ',
  ],
  CUSTOMER_DONE: [],
  UNKNOWN: [],
};

@Injectable()
export class CustomerIntentService {
  detectIntent(message: string): CustomerIntent {
    const text = this.normalize(message);

    if (this.isCustomerDone(text)) return 'CUSTOMER_DONE';
    if (this.isFoodComplaint(text)) return 'FOOD_COMPLAINT';
    if (this.isPriceQuestion(text)) return 'ASK_PRICE';
    if (this.isDeliveryOrProductAmbiguousQuestion(text)) {
      return 'ASK_DELIVERY_OR_PRODUCT_AMBIGUOUS';
    }
    if (this.isPaymentQuestion(text)) return 'ASK_PAYMENT';
    if (this.isOrderQuestion(text)) return 'ASK_ORDER';
    if (this.isMenuQuestion(text)) return 'ASK_MENU';
    if (this.isServiceQuestion(text)) return 'ASK_SERVICES';
    if (this.isContactQuestion(text)) return 'ASK_CONTACT';
    if (this.isDeliveryQuestion(text)) return 'ASK_DELIVERY';
    if (this.isItemAvailabilityQuestion(text)) return 'ASK_DISH_AVAILABILITY';
    if (/(^|\s)(bonjour|bonsoir|salut|salam|hello|hi|hey)(\s|$)/i.test(text)) {
      return 'GREETING';
    }
    if (this.looksLikeItemOnly(text)) return 'ASK_DISH_AVAILABILITY';

    return 'UNKNOWN';
  }

  getCompatibleCategories(intent: CustomerIntent): string[] {
    return this.expandCategoryAliases(INTENT_CATEGORY_ALIASES[intent]);
  }

  shouldUseKnowledgeBase(intent: CustomerIntent): boolean {
    return this.getCompatibleCategories(intent).length > 0;
  }

  extractRequestedDish(
    message: string,
    knowledge?: CatalogKnowledge,
  ): string | null {
    return this.extractRequestedItem(message, knowledge);
  }

  extractRequestedItem(
    message: string,
    knowledge?: CatalogKnowledge,
  ): string | null {
    const normalizedMessage = this.normalize(message);
    const knownItems = [
      ...(knowledge?.availableItems ?? []),
      ...(knowledge?.unavailableItems ?? []),
    ];

    const directKnownItem = knownItems.find((item) =>
      normalizedMessage.includes(this.normalize(item)),
    );

    if (directKnownItem) {
      return directKnownItem;
    }

    const patterns = [
      /(?:y\s*a\s*t\s*il|ya\s*t\s*il|est\s*ce\s*qu\s*il\s*y\s*a|avez\s*vous|vous\s*avez|il\s*y\s*a|disponible|dispo|fama|andkom|3andkom|\u0639\u0646\u062f\u0643\u0645|\u0641\u0645\u0627|\u0647\u0644\s+\u064a\u0648\u062c\u062f)\s+(?:du|de\s+la|de\s+l|des|le|la|les|un|une)?\s*([\p{L}\p{N}\s'-]{2,80})/iu,
      /(?:je\s+veux|je\s+voudrais|j'ai\s+besoin\s+de|besoin\s+de|want|need|nheb|\u0646\u062d\u0628|\u0646\u062d\u0628\s+\u0646\u0627\u0643\u0644|\u0627\u0631\u064a\u062f)\s+(?:du|de\s+la|de\s+l|des|le|la|les|un|une)?\s*([\p{L}\p{N}\s'-]{2,80})/iu,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      const item = this.cleanItemCandidate(match?.[1] ?? '');

      if (item) {
        return item;
      }
    }

    if (this.looksLikeItemOnly(normalizedMessage)) {
      return this.cleanItemCandidate(message);
    }

    return null;
  }

  isFoodComplaintIntent(intent: CustomerIntent): boolean {
    return intent === 'FOOD_COMPLAINT';
  }

  looksLikeOrderDetails(message: string): boolean {
    const text = this.normalize(message);
    const hasPhone = /(?:\+?\d[\s.-]*){8,}/.test(message);
    const hasPayment = this.hasPaymentMethod(text);
    const hasLocation = this.hasOrderLocation(text);
    const hasName = this.hasLikelyCustomerName(text);
    const hasQuantityOrProduct =
      /\b\d+\s*(?:plat|plats|piece|pieces|pi[eè]ce|pi[eè]ces|x)\b/i.test(
        text,
      ) || this.looksLikeItemOnly(text);

    return hasPhone && (hasPayment || hasLocation) && (hasName || hasQuantityOrProduct);
  }

  normalize(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/[’`]/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  private expandCategoryAliases(categories: string[]): string[] {
    const expanded = categories.flatMap((category) => {
      const trimmed = category.trim();
      const spaced = trimmed.replace(/_/g, ' ');
      const titleCase = spaced
        .toLowerCase()
        .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());

      return [
        trimmed,
        trimmed.toUpperCase(),
        trimmed.toLowerCase(),
        spaced,
        titleCase,
        this.normalize(trimmed).toUpperCase(),
      ];
    });

    return Array.from(new Set(expanded.filter(Boolean)));
  }

  private isCustomerDone(text: string): boolean {
    return /^(c'?est\s+)?(tout|bon|ok|merci(?:\s+(?:d'avance|pour|beaucoup|bien|a vous|à vous|votre reponse|votre réponse).*)?|thx|thanks|baraka|barra|ca\s+va|c\s+tout)[!.?\s]*$/i.test(
      text,
    );
  }

  private isFoodComplaint(text: string): boolean {
    return [
      /odeur\s+(?:bizarre|anormale|mauvaise|etrange)/i,
      /gout\s+(?:bizarre|anormal|etrange|mauvais)/i,
      /intoxication|malade|vomir|diarrhee|sanitaire|poison|poisonne|empoisonne/i,
      /allergie|allergique/i,
      /produit\s+(?:abime|pourri|perime|defectueux)/i,
      /plat\s+(?:abime|pourri|perime)/i,
      /commande\s+(?:incorrecte|fausse|mauvaise)|mauvaise\s+commande/i,
      /reclamation|plainte|cass[ée]?[e]?|casse/i,
      /\u0631\u064a\u062d\u0629|\u0637\u0639\u0645|\u0645\u0633\u0645\u0648\u0645|\u062a\u0633\u0645\u0645|\u062d\u0633\u0627\u0633\u064a\u0629|\u062e\u0627\u064a\u0628|\u0641\u0627\u0633\u062f|\u0645\u0639\u0641\u0646/i,
    ].some((pattern) => pattern.test(text));
  }

  private isMenuQuestion(text: string): boolean {
    return [
      /\b(?:menu|carte|catalogue|offres?|produits?)\b/i,
      /quels?\s+sont\s+(?:vos|les|des)?\s*(?:plats?|repas|menus?|produits?|offres?)\b/i,
      /(?:je\s+veux|je\s+voudrais|j'aimerais|jaimerais).{0,40}(?:connaitre|connaÃ®tre|savoir).{0,40}(?:vos\s+)?(?:plats?|repas|menus?|carte)/i,
      /(?:plats?|repas)\s+disponibles?/i,
      /autres?\s+plats?.*(?:disponible|dispo|propose|avez)/i,
      /(?:il\s*y\s*a|ya|y\s*a).*(?:autres?\s+)?plats?.*(?:disponible|dispo)/i,
      /repas\s+(?:du\s+jour|d'?aujourd'?hui|disponibles?)/i,
      /plats?\s+(?:du\s+jour|d'?aujourd'?hui|disponibles?)/i,
      /que\s+(?:sont|proposez|avez).*(?:repas|plats|menu|produits|offres)/i,
      /quoi\s+(?:manger|comme\s+repas|comme\s+plats|comme\s+produits)/i,
      /\u0634\u0646\u0648\u0629?.*(?:\u0639\u0646\u062f\u0643\u0645|\u0627\u0644\u0645\u0627\u0643\u0644\u0629|\u0645\u0627\u0643\u0644\u0629|\u0627\u0643\u0644|\u0627\u0644\u0623\u0643\u0644|\u0627\u0644\u0627\u0643\u0644|plats?|menu)/i,
      /(?:\u0627\u0644\u0645\u0627\u0643\u0644\u0629|\u0645\u0627\u0643\u0644\u0629|\u0627\u0643\u0644|\u0627\u0644\u0623\u0643\u0644|\u0627\u0644\u0627\u0643\u0644).*(?:\u0627\u0644\u064a\u0648\u0645|\u0645\u0648\u062c\u0648\u062f\u0629|\u0645\u062a\u0648\u0641\u0631\u0629)/i,
      /\u0634\u0646\u0648.*(?:\u0645\u062a\u0648\u0641\u0631|\u0645\u0648\u062c\u0648\u062f)/i,
    ].some((pattern) => pattern.test(text));
  }

  private isServiceQuestion(text: string): boolean {
    return [
      /(?:vos|votre|les|des|quels?|connaitre|connaître|presentez|présentez).{0,30}services?/i,
      /(?:que|quoi|qu'est-ce que).{0,30}(?:vous\s+)?(?:proposez|faites|offrez)/i,
      /vous\s+(?:proposez|faites|offrez)\s+quoi/i,
      /(?:je\s+veux|je\s+voudrais|j'aimerais|jaimerais).{0,30}(?:connaitre|connaître|savoir).{0,30}(?:services?|offres?)/i,
    ].some((pattern) => pattern.test(text));
  }

  private isContactQuestion(text: string): boolean {
    return [
      /(?:ou|où)\s+(?:est|etes|êtes)\s+(?:tu|vous)/i,
      /(?:adresse|localisation|position|emplacement|contact|telephone|téléphone|numero|numéro)/i,
    ].some((pattern) => pattern.test(text));
  }

  private isItemAvailabilityQuestion(text: string): boolean {
    return [
      /(?:y\s*a\s*t\s*il|ya\s*t\s*il|avez\s*vous|vous\s*avez|il\s*y\s*a|disponible|dispo)\s+/i,
      /(?:fama|andkom|3andkom)\s+/i,
      /(?:\u0639\u0646\u062f\u0643\u0645|\u0641\u0645\u0627|\u0647\u0644\s+\u064a\u0648\u062c\u062f|\u0645\u062a\u0648\u0641\u0631|\u0645\u0648\u062c\u0648\u062f)\s+/i,
    ].some((pattern) => pattern.test(text));
  }

  private isPriceQuestion(text: string): boolean {
    return [
      /prix|tarif|tarifs|combien|soum|somme|abonnement|plan|pricing|\u0642\u062f\u0627\u0634|\u0633\u0648\u0645|\u062b\u0645\u0646|\u0627\u0644\u0633\u0639\u0631/i,
    ].some((pattern) => pattern.test(text));
  }

  private isDeliveryOrProductAmbiguousQuestion(text: string): boolean {
    const mentionsDelivery =
      /livraison|livrer|livrez|livre|deliver|delivery|expedition|shipping/i.test(
        text,
      ) ||
      /\u062a\u0648\u0635\u0644|\u062a\u0648\u0635\u064a\u0644|\u062f\u0644\u064a\u0641\u0631\u064a/i.test(
        text,
      );
    const mentionsJapan =
      /\bjapon(?:ais|aise|aises)?\b|\bjapan(?:ese)?\b|sushi/i.test(text);

    return mentionsDelivery && mentionsJapan;
  }

  private isPaymentQuestion(text: string): boolean {
    return [
      /(?:mode|moyen|moyens|option|options)\s+de\s+paiement/i,
      /paiement|payer|paypal|cash|espece|especes|carte|visa|mastercard|virement|mobile\s*money|d17|e-dinar|edinar/i,
      /\u062f\u0641\u0639|\u062e\u0644\u0627\u0635|\u0627\u0644\u062f\u0641\u0639/i,
    ].some((pattern) => pattern.test(text));
  }

  private isDeliveryQuestion(text: string): boolean {
    return [
      /livraison|livrer|deliver|delivery|adresse|expedition|shipping|retrait|transport/i,
      /\u062a\u0648\u0635\u0644|\u062a\u0648\u0635\u064a\u0644|\u062f\u0644\u064a\u0641\u0631\u064a|\u0639\u0646\u0648\u0627\u0646/i,
    ].some((pattern) => pattern.test(text));
  }

  private isOrderQuestion(text: string): boolean {
    return [
      /commande|commander|reserver|reservation|acheter|achat|passer\s+commande/i,
      /(?:je\s+veux|je\s+voudrais|j'aimerais|jaimerais)\s+(?:commander|acheter|prendre|reserver|réserver|passer\s+commande)/i,
      /(?:\b\d+\s*(?:plat|plats|piece|pieces|pi[eè]ce|pi[eè]ces|x)\b).*(?:paiement|adresse|telephone|t[eé]l[eé]phone|nom|prenom|pr[eé]nom)/i,
      /(?:paiement|adresse|telephone|t[eé]l[eé]phone|nom|prenom|pr[eé]nom).*(?:\b\d+\s*(?:plat|plats|piece|pieces|pi[eè]ce|pi[eè]ces|x)\b)/i,
      /\u0646\u062d\u0628|\u0646\u0637\u0644\u0628|\u0637\u0644\u0628|\u0643\u0648\u0645\u0648\u0646\u062f/i,
    ].some((pattern) => pattern.test(text));
  }

  private hasPaymentMethod(text: string): boolean {
    return /\b(?:paiement|cash|espece|especes|carte|visa|mastercard|master\s*card|virement|paypal|mobile\s*money|mobile|d17|e-dinar|edinar|cheque|ch[eè]que)\b/i.test(
      text,
    );
  }

  private hasOrderLocation(text: string): boolean {
    return /\b(?:adresse|livraison|localisation|position|rue|avenue|cite|cité|sfax|tunis|ariana|sousse|monastir|nabeul|bizerte|gabes|gabès|kairouan|tunisia|tunisie)\b/i.test(
      text,
    );
  }

  private hasLikelyCustomerName(text: string): boolean {
    const stopwords = new Set([
      'adresse',
      'livraison',
      'paiement',
      'paypal',
      'cash',
      'carte',
      'visa',
      'mastercard',
      'mobile',
      'money',
      'sfax',
      'tunis',
      'tunisia',
      'tunisie',
      'commande',
      'plat',
      'plats',
    ]);
    const words = text
      .split(/[^\p{L}]+/u)
      .map((word) => word.trim())
      .filter((word) => word.length >= 3 && !stopwords.has(word));

    return words.length >= 2;
  }

  private cleanItemCandidate(value: string): string | null {
    const cleaned = value
      .replace(/[?.!,;:]+$/g, '')
      .replace(/\b(?:svp|s'il vous plait|please|brabi|\u0628\u0627\u0644\u0644\u0647)\b/gi, '')
      .trim();

    if (!cleaned || cleaned.length < 2) {
      return null;
    }

    return cleaned.slice(0, 80);
  }

  private looksLikeItemOnly(text: string): boolean {
    const words = text
      .split(/[^\p{L}\p{N}]+/u)
      .map((word) => word.trim())
      .filter(Boolean);

    if (words.length === 0 || words.length > 3) {
      return false;
    }

    const excluded = new Set([
      'oui',
      'non',
      'ok',
      'merci',
      'prix',
      'tarif',
      'livraison',
      'commande',
      'service',
      'services',
      'bonjour',
      'salut',
      'hello',
    ]);

    return words.every((word) => word.length >= 3 && !excluded.has(word));
  }
}
