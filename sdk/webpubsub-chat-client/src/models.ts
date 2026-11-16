/**
 * Public domain model types for the chat client.
 *
 * These are hand-curated, standalone shapes that make up the SDK's public
 * surface. They expose a curated *subset* of the wire schemas in
 * `generatedTypes.ts` — an internal, auto-generated file — declared
 * independently so the generated OpenAPI aggregates (`components`,
 * `Schemas`, `paths`, ...) never leak into the public API. Internal-only
 * fields are intentionally omitted from some models even though the wire
 * types still carry them.
 *
 * A compile-time guard in `modelGuards.ts` fails the build if any field
 * these models *do* expose drifts out of sync with the generated wire
 * types, so regenerating the schema (`npm run generate:types`) surfaces
 * shape changes here instead of silently diverging.
 */

/** Metadata associated with one message content item. */
export interface MessageContentItemMetadata {
  /** MIME type of the item. */
  contentType?: string | null;
  /** Suggested file name. */
  fileName?: string | null;
  /** Size of the content in bytes. */
  size?: number | null;
  custom?: Record<string, string> | null;
}

/** An opaque content storage location; copy it without parsing its URI. */
export interface ContentItemReference {
  /** Storage provider type. */
  storageType: string;
  /** Provider-owned opaque URI. */
  uri: string;
}

/** Inline item content or a reference to externally stored content. */
export interface MessageContentItemContentOrReference {
  /** Inline text. */
  text?: string | null;
  /** Inline binary data encoded as base64. */
  binary?: string | null;
  /** Storage reference; the containing item declares its Text or Binary type. */
  reference?: ContentItemReference | null;
}

/** One item in an item-backed message. */
export interface MessageContentItem {
  type?: string;
  content?: MessageContentItemContentOrReference;
  metadata?: MessageContentItemMetadata | null;
  isAttachment?: boolean;
}

/**
 * Message payload. Sends require exactly one of text, binary, or a non-empty
 * items array. Binary strings use base64 encoding, not raw bytes.
 */
export interface MessageContent {
  /** Plain text content. */
  text?: string | null;
  /** Binary content encoded as base64. */
  binary?: string | null;
  /** Ordered content items, including optional attachments. */
  items?: MessageContentItem[] | null;
}

/** A single chat message. */
export interface MessageInfo {
  /** Service-assigned message id, unique and monotonically increasing within a conversation. */
  messageId: string;
  /** User id of the sender. */
  createdBy?: string;
  /** Creation timestamp, as returned by the service. */
  createdAt?: string;
  /** Body type of the message (service-defined). */
  bodyType?: string;
  /** Concrete body type of the message, when provided. */
  messageBodyType?: string;
  /** Message payload. Text messages populate `text`; binary messages populate `binary`. */
  content: MessageContent;
  /** Message metadata, including the agent codec discriminator when present. */
  metadata?: Record<string, string> | null;
  /** Active group-stream identifier for this message. */
  streamId?: string | null;
  /** Latest persisted entity tag, including streaming checkpoints. */
  etag?: string | null;
  /** Id of the message this one replies to, when applicable. */
  replyTo?: string | null;
  /** Mentioned user ids. The list may be omitted or null; individual ids must be strings. */
  mentions?: string[] | null;
}

/**
 * Identifies a chat conversation. Service responses include all three fields.
 * Requests may use conversationId, roomId/topicId, or roomId for the default topic.
 */
export interface ChatConversation {
  /** The room containing this conversation. */
  roomId?: string | null;
  /** The topic within the room. */
  topicId?: string | null;
  /** Service-assigned identity in the form `c.<roomId>.<topicId>`. */
  conversationId?: string | null;
}

/** A message edit with a required current etag and complete replacement content. */
export interface EditMessageRequest {
  /** The conversation containing the message. */
  conversation: ChatConversation;
  /** The message to edit. */
  messageId: string;
  /** Exact current message version; stale values and the wildcard are rejected. */
  etag: string;
  /** Complete replacement content, using the same rules as sendMessage. */
  content: MessageContent;
  /** Omit to preserve mentions, or use null/an empty array to clear them. */
  mentions?: string[] | null;
  /** Omit to preserve the reply target, or use null to clear it. */
  replyTo?: string | null;
  /** Omit to preserve metadata; null clears it, and an object replaces it. */
  metadata?: Record<string, string> | null;
}

/** Identifies a persisted message item whose referenced content should be loaded. */
export interface DereferenceRequest {
  /** The conversation containing the message. */
  conversation: ChatConversation;
  /** The message containing the referenced item. */
  messageId: string;
  /** Content type copied from the containing item, not from its reference. */
  type: "Text" | "Binary";
  /** Storage location copied from the item's content.reference. */
  reference: ContentItemReference;
}

/** Content loaded from a message attachment, or a provider download location. */
export interface DereferenceResult {
  /** Decoded text content, when returned by the storage provider. */
  text?: string | null;
  /** Binary content encoded as base64, not raw bytes. */
  binary?: string | null;
  /** Download location, when returned instead of inline content. */
  downloadUri?: string | null;
}

/** A room member and the member's assigned role. */
export interface RoomMember {
  /** The member's user ID. */
  userId: string;
  /** Service-defined role name, including custom room roles. */
  role: string;
}

/** Metadata describing a room. */
export interface RoomInfo {
  /** Unique room id. */
  roomId: string;
  /** Display title of the room. */
  title: string;
  /** Free-form room properties, when set. */
  properties?: Record<string, unknown> | null;
}

/**
 * The detailed view of a room: a {@link RoomInfo} plus, optionally, its
 * member list. Returned by `createRoom()` and `getRoomDetail()`. Reserved
 * to grow with further room detail (e.g. conversations) over time.
 */
export interface RoomDetail extends RoomInfo {
  /**
   * User ids of the room's members. Populated when the members were
   * requested (e.g. `getRoomDetail(..., { withMembers: true })`) and
   * `undefined` otherwise.
   */
  members?: string[];
}

/** Free-form JSON properties associated with a chat user. */
export type UserProperties = Record<string, unknown>;

/** A user's complete JSON status object, or null when unset or cleared. */
export type UserStatus = Record<string, unknown> | null;

/** Profile of a chat user. */
export interface UserProfile {
  /** The user's id. */
  userId: string;
  /** Ids of rooms the user belongs to. */
  roomIds?: string[];
}

/** Result of sending a message, returned by `sendToRoom()` or `sendMessage()`. */
export interface SendMessageResult {
  /** Service-assigned id of the sent message. */
  messageId: string;
}
