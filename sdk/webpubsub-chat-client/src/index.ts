import { ChatClient, ChatError } from './chatClient.js';
import { ERRORS } from './constant.js';

export type {
  MessageInfo,
  MessageContent,
  MessageContentItem,
  MessageContentItemContentOrReference,
  MessageContentItemMetadata,
  ContentItemReference,
  DereferenceRequest,
  DereferenceResult,
  EditMessageRequest,
  RoomInfo,
  RoomDetail,
  RoomMember,
  ChatConversation,
  UserProfile,
  UserProperties,
  UserStatus,
  SendMessageResult,
} from './models.js';

export type {
  ChatMessage,
  ChatClientSnapshot,
  OnMessageArgs,
  OnMessageUpdatedArgs,
  OnUserStatusUpdatedArgs,
  OnRoomJoinedArgs,
  OnRoomLeftArgs,
  OnMemberJoinedArgs,
  OnMemberLeftArgs,
  OnStartedArgs,
  OnStoppedArgs,
} from './events.js';

export type {
  DecodedMessage,
  MessageCodec,
  MessageDecoder,
  MessageDecoderInput,
} from './messageCodec.js';

export type {
  AGUIEvent,
  AgUiDecodedMessage,
} from './agUiCodec.js';
export { AgUiMessageCodec } from './agUiCodec.js';

export type {
  OperationOptions,
  StartOptions,
  GetCurrentUserPropertiesOptions,
  SetCurrentUserPropertiesOptions,
  GetUserPropertiesOptions,
  GetCurrentUserStatusOptions,
  SetCurrentUserStatusOptions,
  GetUserStatusOptions,
  SubscribeUserStatusOptions,
  UnsubscribeUserStatusOptions,
  GetRoomDetailOptions,
  GetRoomMembersOptions,
  LeaveRoomOptions,
  CreateRoomOptions,
  CreateConversationOptions,
  SendToRoomOptions,
  SendMessageOptions,
  DereferenceOptions,
  EditMessageOptions,
  AddUserToRoomOptions,
  RemoveUserFromRoomOptions,
  ListRoomMessagesOptions,
} from './options.js';

/**
 * Known values of `ChatError.code`. Following the Azure SDK
 * `Known<Name>` convention, this is a runtime constants object whose
 * values are the wire codes returned by the chat service. Compare
 * `error.code` against members of this object rather than against
 * string literals.
 *
 * @example
 * ```ts
 * try {
 *   await client.sendToRoom(roomId, "hi");
 * } catch (err) {
 *   if (err instanceof ChatError && err.code === KnownChatErrorCode.UnknownRoom) {
 *     // ...
 *   }
 * }
 * ```
 *
 * The service may add codes in newer versions, so always handle the
 * unknown-code case as well.
 */
export const KnownChatErrorCode = ERRORS;

export { ChatClient, ChatError };
