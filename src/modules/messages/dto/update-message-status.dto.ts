import { MessageStatus } from '../entities/message.entity';

export class UpdateMessageStatusDto {
  status!: MessageStatus;
}