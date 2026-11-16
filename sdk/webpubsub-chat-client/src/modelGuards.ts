/**
 * Compile-time guards that keep the curated public models in {@link ./models.js}
 * in sync with the auto-generated wire schemas in {@link ./generatedTypes.js}.
 *
 * The check is one-directional: each wire type must be assignable to its
 * curated public model. This lets the public models intentionally *omit*
 * internal-only fields (e.g. conversation ids) while still catching real
 * drift — if the OpenAPI spec changes a field the public model *does*
 * expose (renamed, retyped, or removed), `npm run generate:types` makes the
 * corresponding alias below stop resolving to `true` and the build fails,
 * signalling that `models.ts` needs updating.
 *
 * This file is intentionally NOT re-exported from `index.ts`, so the
 * generated `Schemas`/`components` aggregates never reach the public API.
 * It has no runtime effect (type-only).
 */
import type { Schemas } from "./generatedTypes.js";
import type { MessageInfo, RoomInfo, RoomDetail, UserProfile, UserProperties, UserStatus, ChatConversation, RoomMember, MessageContent, DereferenceRequest, DereferenceResult, EditMessageRequest } from "./models.js";

type Assert<T extends true> = T;
/** `true` when wire type `W` structurally satisfies (is assignable to) the curated model `M`. */
type WireSatisfies<M, W> = [W] extends [M] ? true : false;

type _GuardMessageInfo = Assert<WireSatisfies<MessageInfo, Schemas["MessageInfo"]>>;
type _GuardRoomInfo = Assert<WireSatisfies<RoomInfo, Schemas["RoomInfo"]>>;
type _GuardRoomDetail = Assert<WireSatisfies<RoomDetail, Schemas["RoomInfoWithMembers"]>>;
type _GuardUserProfile = Assert<WireSatisfies<UserProfile, Schemas["UserProfile"]>>;
type _GuardUserProperties = Assert<WireSatisfies<UserProperties, Schemas["JsonObject"]>>;
type _GuardUserStatus = Assert<WireSatisfies<UserStatus, Schemas["NullableJsonObject"]>>;
type _GuardChatConversation = Assert<WireSatisfies<ChatConversation, Schemas["ChatConversation"]>>;
type _GuardRoomMember = Assert<WireSatisfies<RoomMember, Schemas["RoomMember"]>>;
type _GuardMessageContent = Assert<WireSatisfies<MessageContent, Schemas["MessageContent"]>>;
type _GuardDereferenceRequest = Assert<WireSatisfies<DereferenceRequest, Schemas["DereferenceRequest"]>>;
type _GuardDereferenceResult = Assert<WireSatisfies<DereferenceResult, Schemas["DereferenceResult"]>>;
type _GuardEditMessageRequest = Assert<WireSatisfies<EditMessageRequest, Schemas["EditMessageRequest"]>>;
