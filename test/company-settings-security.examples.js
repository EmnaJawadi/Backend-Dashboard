const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { UserRole } = require('../dist/src/common/enums/user-role.enum.js');
const {
  SettingsService,
} = require('../dist/src/modules/settings/settings.service.js');
const {
  WhatsappService,
} = require('../dist/src/modules/whatsapp/whatsapp.service.js');

const SAFE_VERIFICATION_MESSAGE =
  "Nous avons bien recu votre demande. Elle necessite une verification complementaire et notre equipe vous repondra des que possible.";

function actor(role, companyId) {
  return {
    sub: `${String(role).toLowerCase()}-user`,
    email: `${String(role).toLowerCase()}@example.test`,
    role,
    companyId,
  };
}

function buildCompanySettings(companyId = 'company-a') {
  return {
    id: 'settings-a',
    key: `company_settings_v2:${companyId}`,
    companyId,
    businessHours: {
      enabled: true,
      timezone: 'Africa/Lagos',
      days: [],
      autoReplyOutsideHours: true,
      outOfHoursMessage: 'Merci pour votre message.',
    },
    aiPolicy: {
      enabled: true,
      handoffEnabled: true,
      confidenceThreshold: 0.42,
      escalationDelayMinutes: 5,
      responseTone: 'professional',
      language: 'fr',
      botGuidelines:
        "Si la demande necessite une verification complementaire, informer le client que l'equipe traitera sa demande rapidement.",
    },
    workflow: {
      enabled: true,
      defaultAssigneeId: null,
      defaultAssignment: '',
      welcomeMessage: 'Bonjour. Merci de nous avoir contactes.',
      preHandoffMessage: SAFE_VERIFICATION_MESSAGE,
      primaryTag: 'SupportWhatsApp',
    },
    general: {
      officialName: 'Company A',
      companyName: 'Company A',
      displayName: 'Company A Support',
      supportEmail: 'support@company-a.test',
      supportPhone: '+21600000000',
      city: 'Tunis',
      country: 'Tunisia',
      defaultLanguage: 'fr',
      timezone: 'Africa/Lagos',
      emailNotificationsEnabled: true,
      emailNotifications: true,
      secureMode: true,
    },
    whatsappProfile: {
      businessPhoneNumber: '',
      displayName: 'Company A Support',
      connectionStatus: 'disconnected',
      phoneNumberId: 'sensitive-phone-id',
      businessAccountId: 'sensitive-business-id',
    },
    whatsappTechnicalSettings: {
      webhookUrl: 'https://internal.example.test/webhooks',
      verifyToken: 'secret-token',
      verifyWebhookSignature: true,
      notificationsEnabled: true,
      defaultCountryCode: '+216',
    },
    updatedAt: new Date(),
  };
}

class MockSettingsRepository {
  constructor() {
    this.current = buildCompanySettings();
    this.lastPartial = null;
  }

  async getCompanySettings(companyId) {
    return {
      ...this.current,
      companyId,
      key: `company_settings_v2:${companyId}`,
    };
  }

  async updateCompanySettings(companyId, partial) {
    this.lastPartial = partial;
    this.current = {
      ...this.current,
      ...partial,
      companyId,
      businessHours: {
        ...this.current.businessHours,
        ...(partial.businessHours ?? {}),
      },
      aiPolicy: {
        ...this.current.aiPolicy,
        ...(partial.aiPolicy ?? {}),
      },
      workflow: {
        ...this.current.workflow,
        ...(partial.workflow ?? {}),
      },
      general: {
        ...this.current.general,
        ...(partial.general ?? {}),
      },
      whatsappProfile: {
        ...this.current.whatsappProfile,
        ...(partial.whatsappProfile ?? {}),
      },
      whatsappTechnicalSettings: {
        ...this.current.whatsappTechnicalSettings,
        ...(partial.whatsappTechnicalSettings ?? {}),
      },
      updatedAt: new Date(),
    };

    return this.current;
  }
}

function createSettingsService(repository = new MockSettingsRepository()) {
  const prisma = {
    auditLog: {
      create: async () => ({}),
    },
    user: {
      findFirst: async () => null,
      findMany: async () => [],
    },
  };

  return {
    repository,
    service: new SettingsService(repository, prisma),
  };
}

async function testCompanyIsolation() {
  const { service } = createSettingsService();

  await assert.rejects(
    async () =>
      service.getCompanySettings(actor(UserRole.COMPANY_ADMIN, 'company-a'), 'company-b'),
    /companyId must be resolved from the authenticated user/,
  );
}

async function testHumanAgentCannotModifySettings() {
  const { service } = createSettingsService();

  await assert.rejects(
    async () =>
      service.updateCompanyAiSettings(actor(UserRole.AGENT, 'company-a'), {
        enabled: false,
      }),
    /managed by the platform/,
  );
}

async function testCompanyAdminCanUpdateDynamicPreferences() {
  const { repository, service } = createSettingsService();

  const updated = await service.updateCompanyPreferences(
    actor(UserRole.COMPANY_ADMIN, 'company-a'),
    {
      displayName: 'Company A Desk',
      supportEmail: 'help@company-a.test',
      supportPhone: '+21611111111',
      city: 'Sousse',
      country: 'Tunisia',
      defaultLanguage: 'en',
      timezone: 'Europe/Paris',
      emailNotificationsEnabled: false,
    },
  );

  assert.equal(updated.displayName, 'Company A Desk');
  assert.equal(updated.supportEmail, 'help@company-a.test');
  assert.equal(updated.emailNotificationsEnabled, false);
  assert.equal(repository.current.general.emailNotificationsEnabled, false);
  assert.equal(repository.current.general.emailNotifications, false);
}

async function testAgentCannotUpdateCompanyPreferences() {
  const { service } = createSettingsService();

  await assert.rejects(
    async () =>
      service.updateCompanyPreferences(actor(UserRole.AGENT, 'company-a'), {
        emailNotificationsEnabled: false,
      }),
    /Only a company admin/,
  );
}

async function testCompanyAdminCannotModifyAiSettings() {
  const { service } = createSettingsService();

  await assert.rejects(
    async () =>
      service.updateCompanyAiSettings(actor(UserRole.COMPANY_ADMIN, 'company-a'), {
        enabled: false,
      }),
    /managed by the platform/,
  );
}

async function testCompanyAdminCannotModifyWorkflowSettings() {
  const { service } = createSettingsService();

  await assert.rejects(
    async () =>
      service.updateCompanyWorkflowSettings(
        actor(UserRole.COMPANY_ADMIN, 'company-a'),
        {
          enabled: false,
        },
      ),
    /managed by the platform/,
  );
}

async function testCompanySettingsRejectsTechnicalPatchesForCompanyAdmin() {
  const { service } = createSettingsService();

  await assert.rejects(
    async () =>
      service.updateCompanySettings(actor(UserRole.COMPANY_ADMIN, 'company-a'), {
        aiPolicy: {
          enabled: false,
        },
      }),
    /managed by the platform/,
  );

  await assert.rejects(
    async () =>
      service.updateCompanySettings(actor(UserRole.COMPANY_ADMIN, 'company-a'), {
        workflow: {
          enabled: false,
        },
      }),
    /managed by the platform/,
  );

  await assert.rejects(
    async () =>
      service.updateCompanySettings(actor(UserRole.COMPANY_ADMIN, 'company-a'), {
        whatsappProfile: {
          displayName: 'Company A',
        },
      }),
    /managed by the platform/,
  );
}

async function testConfidenceThresholdIsPlatformManaged() {
  const { repository, service } = createSettingsService();

  await service.updateCompanyAiSettings(actor(UserRole.SUPER_ADMIN, 'company-a'), {
    enabled: false,
    responseTone: 'friendly',
  });

  assert.equal(repository.current.aiPolicy.confidenceThreshold, 0.42);
  assert.equal(repository.current.aiPolicy.enabled, false);
  assert.equal(repository.current.aiPolicy.responseTone, 'friendly');
}

async function testWorkflowRejectsExternalAssignee() {
  const { service } = createSettingsService();

  await assert.rejects(
    async () =>
      service.updateCompanyWorkflowSettings(
        actor(UserRole.SUPER_ADMIN, 'company-a'),
        {
          defaultAssigneeId: '00000000-0000-4000-8000-000000000999',
        },
      ),
    /defaultAssigneeId must belong/,
  );
}

async function testCompanyAdminCannotAccessWhatsappConfig() {
  const service = new WhatsappService({}, {}, {}, {}, {});

  await assert.rejects(
    async () =>
      service.getCompanyWhatsappConfig(actor(UserRole.COMPANY_ADMIN, 'company-a')),
    /managed by the platform/,
  );
}

async function testWhatsappConfigDoesNotReturnSecrets() {
  const prisma = {
    companyWhatsappInstance: {
      findFirst: async () => ({
        id: 'wa-a',
        companyId: 'company-a',
        evolutionInstanceName: 'company-a-wa',
        whatsappNumber: '+21600000000',
        displayName: 'Company A Support',
        phoneNumberId: 'sensitive-phone-id',
        businessAccountId: 'sensitive-business-id',
        apiBaseUrl: 'https://evolution.internal',
        apiKey: 'EVOLUTION_API_KEY_SHOULD_NOT_LEAK',
        connectionStatus: 'CONNECTED',
        lastConnectionError: null,
        connectedAt: new Date(),
        lastSyncAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    },
  };
  const service = new WhatsappService(prisma, {}, {}, {}, {});

  const config = await service.getCompanyWhatsappConfig(
    actor(UserRole.SUPER_ADMIN, 'company-a'),
  );
  const serialized = JSON.stringify(config);

  assert.doesNotMatch(serialized, /EVOLUTION_API_KEY/i);
  assert.doesNotMatch(serialized, /apiKey|apiBaseUrl|phoneNumberId|businessAccountId/);
  assert.equal(config.sensitiveFieldsExposed, false);
}

function testFrontendSettingsPageDoesNotExposeTechnicalFields() {
  const pagePath = path.resolve(
    process.cwd(),
    '..',
    'whatsapp-support-dashboard',
    'src',
    'app',
    '(dashboard)',
    'settings',
    'page.tsx',
  );
  const source = readFileSync(pagePath, 'utf8');

  assert.doesNotMatch(source, /URL Evolution API/i);
  assert.doesNotMatch(source, /API key|token Evolution|Phone Number ID|Business Account ID/i);
  assert.doesNotMatch(source, /apiBaseUrl|apiKey|phoneNumberId|businessAccountId/);
  assert.doesNotMatch(source, /agent humain va prendre le relais/i);
  assert.match(source, /emailNotificationsEnabled/);
  assert.doesNotMatch(source, /support@company\.com|\+216 00 000 000|My Support Company/);
}

async function main() {
  await testCompanyIsolation();
  await testHumanAgentCannotModifySettings();
  await testCompanyAdminCanUpdateDynamicPreferences();
  await testAgentCannotUpdateCompanyPreferences();
  await testCompanyAdminCannotModifyAiSettings();
  await testCompanyAdminCannotModifyWorkflowSettings();
  await testCompanySettingsRejectsTechnicalPatchesForCompanyAdmin();
  await testConfidenceThresholdIsPlatformManaged();
  await testWorkflowRejectsExternalAssignee();
  await testCompanyAdminCannotAccessWhatsappConfig();
  await testWhatsappConfigDoesNotReturnSecrets();
  testFrontendSettingsPageDoesNotExposeTechnicalFields();

  console.log('Company settings security scenarios passed.');
}

void main();
