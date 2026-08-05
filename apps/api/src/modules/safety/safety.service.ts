import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../../common/audit.service';
import type { Environment } from '../../config/environment';
import { PrismaService } from '../../database/prisma.service';
import { EmergencyStatus, NotificationType, type Prisma } from '../../generated/prisma/client';
import type { AuthPrincipal } from '../auth/auth.types';
import { EmergencyDeliveryService } from './emergency-delivery.service';
import type { CreateEmergencyContactDto, TriggerSosDto } from './safety.dto';

@Injectable()
export class SafetyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Environment, true>,
    private readonly delivery: EmergencyDeliveryService,
    private readonly audit: AuditService,
  ) {}

  async listContacts(userId: string): Promise<Array<Record<string, unknown>>> {
    return this.prisma.emergencyContact.findMany({
      where: { ownerId: userId, deletedAt: null },
      include: { contactUser: { include: { profile: true } } },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async addContact(
    userId: string,
    input: CreateEmergencyContactDto,
  ): Promise<Record<string, unknown>> {
    if (!input.contactUserId && !input.phone && !input.email) {
      throw new BadRequestException('A linked Atlas user, phone number, or email is required');
    }
    if (input.contactUserId === userId) throw new BadRequestException('You cannot add yourself');
    const external = !input.contactUserId;
    const contact = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.emergencyContact.create({
        data: {
          ownerId: userId,
          contactUserId: input.contactUserId,
          name: input.name.trim(),
          phone: input.phone,
          email: input.email?.toLowerCase(),
          relationship: input.relationship,
          notifyPush: input.notifyPush,
          notifySms: input.notifySms,
          notifyEmail: input.notifyEmail,
          isVerified: external,
          verifiedAt: external ? new Date() : null,
        },
      });
      if (input.contactUserId) {
        await transaction.notification.create({
          data: {
            userId: input.contactUserId,
            actorId: userId,
            type: NotificationType.SYSTEM,
            title: 'Emergency contact request',
            body: 'Someone you know would like to notify you if they trigger an SOS.',
            data: { emergencyContactId: created.id, action: 'ACCEPT_EMERGENCY_CONTACT' },
          },
        });
      }
      return created;
    });
    await this.audit.record({
      actorId: userId,
      action: 'EMERGENCY_CONTACT_ADDED',
      entityType: 'EmergencyContact',
      entityId: contact.id,
      metadata: { linkedUser: Boolean(input.contactUserId) },
    });
    return contact;
  }

  async acceptContact(userId: string, contactId: string): Promise<void> {
    const result = await this.prisma.emergencyContact.updateMany({
      where: { id: contactId, contactUserId: userId, deletedAt: null, isVerified: false },
      data: { isVerified: true, verifiedAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException('Emergency contact request not found');
    await this.audit.record({
      actorId: userId,
      action: 'EMERGENCY_CONTACT_ACCEPTED',
      entityType: 'EmergencyContact',
      entityId: contactId,
    });
  }

  async removeContact(userId: string, contactId: string): Promise<void> {
    const result = await this.prisma.emergencyContact.updateMany({
      where: {
        id: contactId,
        deletedAt: null,
        OR: [{ ownerId: userId }, { contactUserId: userId }],
      },
      data: { deletedAt: new Date(), isVerified: false },
    });
    if (result.count === 0) throw new NotFoundException('Emergency contact not found');
  }

  async trigger(principal: AuthPrincipal, input: TriggerSosDto): Promise<Record<string, unknown>> {
    const existing = await this.prisma.sosAlert.findUnique({
      where: { clientRequestId: input.clientRequestId },
    });
    if (existing) {
      if (existing.initiatorId !== principal.userId)
        throw new ConflictException('Request identifier already used');
      return { id: existing.id, status: existing.status, expiresAt: existing.publicExpiresAt };
    }

    const contacts = await this.prisma.emergencyContact.findMany({
      where: { ownerId: principal.userId, isVerified: true, deletedAt: null },
    });
    if (contacts.length === 0)
      throw new BadRequestException('Add a verified emergency contact first');
    const profile = await this.prisma.profile.findUnique({ where: { userId: principal.userId } });
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60_000);

    const alert = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.sosAlert.create({
        data: {
          initiatorId: principal.userId,
          clientRequestId: input.clientRequestId,
          latitude: input.latitude,
          longitude: input.longitude,
          accuracyM: input.accuracyM,
          message: input.message,
          publicTokenHash: tokenHash,
          publicExpiresAt: expiresAt,
          recipients: {
            create: contacts.map((contact) => ({
              userId: contact.contactUserId,
              destination: contact.phone ?? contact.email,
              channels: {
                push: contact.notifyPush,
                sms: contact.notifySms,
                email: contact.notifyEmail,
              },
            })),
          },
        },
        include: { recipients: true },
      });
      const linkedUsers = contacts.flatMap((contact) =>
        contact.contactUserId ? [contact.contactUserId] : [],
      );
      if (linkedUsers.length > 0) {
        await transaction.notification.createMany({
          data: linkedUsers.map((userId) => ({
            userId,
            actorId: principal.userId,
            type: NotificationType.SOS,
            title: `SOS from ${profile?.displayName ?? 'a trusted contact'}`,
            body: 'Open Atlas AI to view their time-limited safety alert.',
            data: { sosAlertId: created.id },
          })),
        });
      }
      return created;
    });

    const deliveryResults = await Promise.all(
      contacts.map(async (contact, index) => {
        const state = await this.delivery.deliver({
          recipientUserId: contact.contactUserId,
          phone: contact.phone,
          email: contact.email,
          notifyPush: contact.notifyPush,
          notifySms: contact.notifySms,
          notifyEmail: contact.notifyEmail,
          senderName: profile?.displayName ?? 'Your trusted contact',
          message: input.message,
          trackingToken: rawToken,
        });
        const recipient = alert.recipients[index];
        if (recipient) {
          await this.prisma.sosRecipient.update({
            where: { id: recipient.id },
            data: { deliveryState: state as Prisma.InputJsonValue },
          });
        }
        return state;
      }),
    );
    await this.audit.record({
      actorId: principal.userId,
      action: 'SOS_TRIGGERED',
      entityType: 'SosAlert',
      entityId: alert.id,
      severity: 'CRITICAL',
      metadata: { recipientCount: contacts.length },
    });
    return {
      id: alert.id,
      status: alert.status,
      trackingToken: rawToken,
      expiresAt,
      delivery: deliveryResults,
    };
  }

  async listAlerts(userId: string): Promise<Array<Record<string, unknown>>> {
    return this.prisma.sosAlert.findMany({
      where: {
        deletedAt: null,
        OR: [{ initiatorId: userId }, { recipients: { some: { userId, deletedAt: null } } }],
      },
      include: { initiator: { include: { profile: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async acknowledge(userId: string, alertId: string): Promise<void> {
    const recipient = await this.prisma.sosRecipient.findFirst({
      where: { sosAlertId: alertId, userId, deletedAt: null },
    });
    if (!recipient) throw new ForbiddenException('You are not an alert recipient');
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.sosRecipient.update({
        where: { id: recipient.id },
        data: { acknowledgedAt: now },
      }),
      this.prisma.sosAlert.updateMany({
        where: { id: alertId, status: EmergencyStatus.ACTIVE },
        data: { status: EmergencyStatus.ACKNOWLEDGED, acknowledgedAt: now },
      }),
    ]);
  }

  async resolve(userId: string, alertId: string, cancel = false): Promise<void> {
    const result = await this.prisma.sosAlert.updateMany({
      where: {
        id: alertId,
        initiatorId: userId,
        status: { in: [EmergencyStatus.ACTIVE, EmergencyStatus.ACKNOWLEDGED] },
        deletedAt: null,
      },
      data: {
        status: cancel ? EmergencyStatus.CANCELLED : EmergencyStatus.RESOLVED,
        resolvedAt: new Date(),
        publicExpiresAt: new Date(),
      },
    });
    if (result.count === 0) throw new NotFoundException('Active SOS alert not found');
    await this.audit.record({
      actorId: userId,
      action: cancel ? 'SOS_CANCELLED' : 'SOS_RESOLVED',
      entityType: 'SosAlert',
      entityId: alertId,
      severity: 'CRITICAL',
    });
  }

  async publicAlert(token: string): Promise<Record<string, unknown>> {
    const alert = await this.prisma.sosAlert.findFirst({
      where: {
        publicTokenHash: this.hashToken(token),
        publicExpiresAt: { gt: new Date() },
        deletedAt: null,
      },
      include: { initiator: { include: { profile: true } } },
    });
    if (!alert) throw new NotFoundException('Safety link is invalid or expired');
    return {
      id: alert.id,
      status: alert.status,
      person: alert.initiator.profile?.displayName ?? 'Atlas member',
      location: {
        latitude: Number(alert.latitude),
        longitude: Number(alert.longitude),
        accuracyM: Number(alert.accuracyM),
      },
      message: alert.message,
      startedAt: alert.createdAt,
      updatedAt: alert.updatedAt,
      expiresAt: alert.publicExpiresAt,
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256')
      .update(`${this.config.get('REFRESH_TOKEN_PEPPER', { infer: true })}:${token}`)
      .digest('hex');
  }
}
