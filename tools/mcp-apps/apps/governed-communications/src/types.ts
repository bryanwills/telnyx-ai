export interface TelnyxClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export interface TelnyxEnvelope<T = unknown> {
  data?: T;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PageInput {
  pageNumber?: number;
  pageSize?: number;
  page_number?: number;
  page_size?: number;
}

export interface GovernedCommunicationsClient {
  listPhoneNumbers(input?: PageInput): Promise<TelnyxEnvelope<Record<string, unknown>[]>>;
  listMessagingProfiles(input?: PageInput): Promise<TelnyxEnvelope<Record<string, unknown>[]>>;
  listCallControlApplications(input?: PageInput): Promise<TelnyxEnvelope<Record<string, unknown>[]>>;
  sendMessage(payload: Record<string, unknown>, idempotencyKey: string): Promise<TelnyxEnvelope>;
  getMessageStatus(messageId: string): Promise<TelnyxEnvelope>;
  startCall(payload: Record<string, unknown>, idempotencyKey: string): Promise<TelnyxEnvelope>;
  getCallStatus(callControlId: string): Promise<TelnyxEnvelope>;
  getCallTimeline(filters: Record<string, unknown>): Promise<TelnyxEnvelope>;
  startVerification(channel: VerifyChannel, payload: Record<string, unknown>, idempotencyKey: string): Promise<TelnyxEnvelope>;
  getVerificationStatus(verificationId: string): Promise<TelnyxEnvelope>;
}

export type VerifyChannel = "sms" | "call" | "flashcall";

export interface PolicyConfig {
  messageSenders: Set<string>;
  messagingProfiles: Set<string>;
  callFromNumbers: Set<string>;
  callConnections: Set<string>;
  verifyProfiles: Set<string>;
  verifyChannels: Set<VerifyChannel>;
  defaultPolicyTag: string;
  maxMediaUrls: number;
  maxPageSize: number;
  maxTimelineWindowHours: number;
  idempotencyTtlMs: number;
}

export interface SendMessageInput {
  sender: string;
  destination: string;
  text: string;
  messaging_profile_id?: string;
  media_urls?: string[];
  idempotency_key: string;
  policy_tag?: string;
}

export interface StartCallInput {
  from: string;
  to: string;
  connection_id: string;
  webhook_url: string;
  timeout_secs?: number;
  idempotency_key: string;
  policy_tag?: string;
}

export interface StartVerificationInput {
  destination: string;
  channel: VerifyChannel;
  verify_profile_id: string;
  timeout_secs?: number;
  locale?: string;
  custom_code?: string;
  idempotency_key: string;
  policy_tag?: string;
}

export interface MessageStatusInput {
  message_id: string;
}

export interface CallStatusInput {
  call_control_id: string;
}

export interface CallTimelineInput extends PageInput {
  call_leg_id?: string;
  call_session_id?: string;
  application_session_id?: string;
  connection_id?: string;
  occurred_at_gte?: string;
  occurred_at_lte?: string;
}

export interface VerificationStatusInput {
  verification_id: string;
}

export type NormalizedErrorClass =
  | "validation"
  | "auth"
  | "policy_denied"
  | "rate_limited"
  | "upstream_transient"
  | "upstream_terminal";

export interface NormalizedErrorPayload {
  tool_invocation_id: string;
  error_class: NormalizedErrorClass;
  retriable: boolean;
  message: string;
  details?: unknown;
}

export interface NormalizedOutcome {
  status: "ok" | "executed" | "replayed";
  replayed: boolean;
  retriable: boolean;
}
