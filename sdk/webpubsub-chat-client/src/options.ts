/**
 * Options-object types for `ChatClient` methods.
 *
 * Every asynchronous method accepts an options bag extending
 * {@link OperationOptions} with at least an `abortSignal`. Future
 * per-operation knobs (custom headers, retry policy, ...) live on
 * these interfaces too.
 */

import type { AbortSignalLike } from "@azure/abort-controller";

/** Base options accepted by every asynchronous `ChatClient` operation. */
export interface OperationOptions {
  /**
   * Signal used to cancel the operation. Accepts either a browser
   * `AbortSignal` or `@azure/abort-controller`'s polyfill.
   */
  abortSignal?: AbortSignalLike;
}

/** Options for `ChatClient.start()`. */
export interface StartOptions extends OperationOptions {}

/** Options for `ChatClient.getCurrentUserProperties()`. */
export interface GetCurrentUserPropertiesOptions extends OperationOptions {}

/** Options for `ChatClient.setCurrentUserProperties()`. */
export interface SetCurrentUserPropertiesOptions extends OperationOptions {}

/** Options for `ChatClient.getUserProperties()`. */
export interface GetUserPropertiesOptions extends OperationOptions {}

/** Options for `ChatClient.getCurrentUserStatus()`. */
export interface GetCurrentUserStatusOptions extends OperationOptions {}

/** Options for `ChatClient.setCurrentUserStatus()`. */
export interface SetCurrentUserStatusOptions extends OperationOptions {}

/** Options for `ChatClient.getUserStatus()`. */
export interface GetUserStatusOptions extends OperationOptions {}

/** Options for `ChatClient.subscribeUserStatus()`. */
export interface SubscribeUserStatusOptions extends OperationOptions {}

/** Options for `ChatClient.unsubscribeUserStatus()`. */
export interface UnsubscribeUserStatusOptions extends OperationOptions {}

/** Options for `ChatClient.getRoomDetail()`. */
export interface GetRoomDetailOptions extends OperationOptions {
  /**
   * When `true`, the returned {@link RoomDetail}'s `members` array is
   * populated. Defaults to `false`, leaving `members` undefined.
   */
  withMembers?: boolean;
}

/** Options for `ChatClient.getRoomMembers()`. */
export interface GetRoomMembersOptions extends OperationOptions {}

/** Options for `ChatClient.leaveRoom()`. */
export interface LeaveRoomOptions extends OperationOptions {}

/** Options for `ChatClient.createRoom()`. */
export interface CreateRoomOptions extends OperationOptions {
  /**
   * Optional client-chosen room id. If omitted, the service assigns a
   * random id. The id must be unique within the hub; reusing an
   * existing id rejects with `KnownChatErrorCode.RoomAlreadyExists`.
   */
  roomId?: string;
}

/** Options for `ChatClient.createConversation()`. */
export interface CreateConversationOptions extends OperationOptions {
  /** Optional conversation title, at most 256 characters. */
  title?: string | null;
}

/** Options for `ChatClient.sendToRoom()`. */
export interface SendToRoomOptions extends OperationOptions {
  /** Mentioned user ids. Individual ids must be strings. */
  mentions?: string[] | null;
  /** Id of the message being replied to. */
  replyTo?: string | null;
}

/** Options for `ChatClient.sendMessage()`. */
export interface SendMessageOptions extends SendToRoomOptions {
  /** Message metadata: at most 16 entries, keys at most 32 characters and values at most 64. */
  metadata?: Record<string, string> | null;
}

/** Options for `ChatClient.dereference()`. */
export interface DereferenceOptions extends OperationOptions {}

/** Options for `ChatClient.editMessage()`. */
export interface EditMessageOptions extends OperationOptions {}

/** Options for `ChatClient.addUserToRoom()`. */
export interface AddUserToRoomOptions extends OperationOptions {}

/** Options for `ChatClient.removeUserFromRoom()`. */
export interface RemoveUserFromRoomOptions extends OperationOptions {}

/** Options for `ChatClient.listRoomMessages()`. */
export interface ListRoomMessagesOptions extends OperationOptions {
  /**
   * Inclusive lower bound on message id; omit to start from the earliest available message.
   */
  startId?: string;
  /**
   * Inclusive upper bound on message id; omit to read up to the latest message.
   */
  endId?: string;
  /**
   * Default maximum number of messages to request per service
   * round-trip when iterating with `for await`. Defaults to 100.
   * Callers using `byPage(...)` can override this per page via
   * `byPage({ maxPageSize })`; the name matches the
   * `@azure/core-paging` `PageSettings.maxPageSize` convention.
   */
  maxPageSize?: number;
}
