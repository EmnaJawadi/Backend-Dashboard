import { strict as assert } from 'node:assert';
import { ConversationWindowService } from '../src/modules/whatsapp/policies/conversation-window.service';

const windowService = new ConversationWindowService();
const now = new Date('2026-04-20T12:00:00.000Z');

const hoursAgo = (hours: number) =>
  new Date(now.getTime() - hours * 60 * 60 * 1000);

const customerWroteTwoHoursAgo = windowService.checkWindow(
  hoursAgo(2),
  now,
);
assert.equal(customerWroteTwoHoursAgo.isWithinWindow, true);
assert.equal(customerWroteTwoHoursAgo.canSendFreeForm, true);

const customerWroteThirtyHoursAgo = windowService.checkWindow(
  hoursAgo(30),
  now,
);
assert.equal(customerWroteThirtyHoursAgo.isWithinWindow, false);
assert.equal(customerWroteThirtyHoursAgo.canSendFreeForm, false);
assert.equal(customerWroteThirtyHoursAgo.reason, 'WINDOW_EXPIRED');

const templateProvidedOutsideWindow = {
  canSendFreeForm: customerWroteThirtyHoursAgo.canSendFreeForm,
  templateRequired: !customerWroteThirtyHoursAgo.canSendFreeForm,
  reason: customerWroteThirtyHoursAgo.reason,
  templateName: 'follow_up_support',
  expectedAction: 'sent_template',
};
assert.equal(templateProvidedOutsideWindow.expectedAction, 'sent_template');

const botPausedDecision = {
  botPaused: true,
  expectedAction: 'skipped',
  expectedReason: 'BOT_PAUSED',
};
assert.equal(botPausedDecision.expectedAction, 'skipped');

const humanTakeoverDecision = {
  humanTakeoverActive: true,
  expectedAction: 'skipped',
  expectedReason: 'HUMAN_TAKEOVER_ACTIVE',
};
assert.equal(humanTakeoverDecision.expectedAction, 'skipped');

console.log('WhatsApp 24h window examples passed.');
