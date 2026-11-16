# Azure Web PubSub Chat Client SDK

A client SDK for building chat applications with Azure Web PubSub.

> ⚠️ **Internal Preview**: This package is currently for internal use only and is not ready for production.

## Installation

```bash
npm install @azure/web-pubsub-chat-client
```

## Quick Start

For complete applications, see the [browser chat app](./examples/chatapp) and the [serverless Azure Functions chat app](./examples/serverless-chatapp). For a minimal console example, see [examples/quickstart](./examples/quickstart).

```javascript
import { ChatClient } from '@azure/web-pubsub-chat-client';

// Get client access URL from your server
const url = await fetch('/negotiate?userId=alice').then(r => r.json()).then(d => d.url);

// Start directly with a client access URL...
const client = await ChatClient.start(url);

// ...or with a credential (a callback that returns a client access URL):
// const client = await ChatClient.start({ getClientAccessUrl: async () => url });

console.log(`Started as: ${client.userId}`);

// Listen for events
client.on('message', (event) => {
  const msg = event.message;
  console.log(`${msg.createdBy}: ${msg.content.text}`);
});

client.on('room-joined', (event) => {
  console.log(`Joined room: ${event.room.title}`);
});

// Create a room and send messages
const room = await client.createRoom('My Room', ['bob']);
await client.sendToRoom(room.roomId, 'Hello!');

// Get message history (auto-paginating async iterator)
for await (const msg of client.listRoomMessages(room.roomId)) {
  console.log(`${msg.createdBy}: ${msg.content.text}`);
}

// Manage room members
await client.addUserToRoom(room.roomId, 'charlie');
await client.removeUserFromRoom(room.roomId, 'charlie');

// Cleanup
await client.stop();
```

## API

### ChatClient

#### Constructor

```typescript
new ChatClient(credential: WebPubSubClientCredential)
```

`ChatClient` is constructed from a `WebPubSubClientCredential`. It builds and owns the underlying transport: `start()` connects and authenticates, `stop()` disconnects. The instance is constructed but not started — call `start()`, or use the static `ChatClient.start(...)` factory below (which also accepts a plain client-access URL) to construct-and-start in one step.

#### Static Methods

| Method | Description |
|--------|-------------|
| `ChatClient.start(clientAccessUrl, options?)` | Construct from a client-access URL and start (`options?: StartOptions`) |
| `ChatClient.start(credential, options?)` | Construct from a `WebPubSubClientCredential` and start (`options?: StartOptions`) |

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `userId` | `string` | Current user's ID (throws if not started). Read-only — set internally on `start()`. |
| `rooms` | `RoomInfo[]` | Snapshot of currently joined rooms (not live-updated) |

#### Methods

| Method | Description |
|--------|-------------|
| `start(options?)` | Connect and authenticate. Idempotent; concurrent calls share one in-flight promise. After `stop()` the client can be started again. Accepts `{ abortSignal }`. |
| `stop()` | Disconnect and reset client state. Returns `Promise<void>`. |
| `getCurrentUserProperties(options?)` | Fetch the current user's complete properties object. Returns `{}` when none are set. |
| `setCurrentUserProperties(properties, options?)` | Replace the current user's complete properties object. Requires `user.update_own_info`; pass `{}` to clear all properties. |
| `getUserProperties(userId, options?)` | Fetch another user's properties. No special user permission is required. |
| `getCurrentUserStatus(options?)` | Fetch the current user's status object, or `null` when unset. |
| `setCurrentUserStatus(status, options?)` | Replace the current user's complete status. Requires `user.update_own_info`; `null` clears it. |
| `getUserStatus(userId, options?)` | Fetch another user's status object, or `null` when unset. No special user permission is required. |
| `subscribeUserStatus(userId, options?)` | Subscribe this connection to an existing user's status updates. |
| `unsubscribeUserStatus(userId, options?)` | Idempotently remove this connection's status subscription for a user. |
| `createRoom(title, members, options?)` | Create a new room with initial members. The current user is automatically added to the members list. Options: `{ roomId?, abortSignal? }` — supply `roomId` to choose an explicit id, otherwise the service assigns one. |
| `getRoomDetail(roomId, options?)` | Get the detailed view of a room (`RoomDetail`). Options: `{ withMembers?, abortSignal? }` — pass `withMembers: true` to populate the `members` list (omitted otherwise). |
| `getRoomMembers(roomId, options?)` | Fetch the current `RoomMember[]`, including each member's `userId` and `role`. Options: `{ abortSignal? }`. |
| `createConversation(roomId, options?)` | Create a conversation in a room; returns `ChatConversation` with roomId, topicId and conversationId. Options: `{ title?, abortSignal? }`. Requires membership and `room.create_conversation`. |
| `addUserToRoom(roomId, userId, options?)` | Add user to room (admin operation) |
| `removeUserFromRoom(roomId, userId, options?)` | Remove user from room (admin operation) |
| `leaveRoom(roomId, options?)` | Leave as the current user through `chat.leaveRoom`. Options: `{ abortSignal? }`. |
| `sendToRoom(roomId, message, options?)` | Send text message to room, returns a `SendMessageResult` (`{ messageId }`). Options: `{ mentions?, replyTo?, abortSignal? }`. |
| `sendMessage(conversation, content, options?)` | Send text, base64 binary or ordered content items to a default or explicit conversation. Returns `{ messageId }`. Options: `{ mentions?, replyTo?, metadata?, abortSignal? }`. |
| `dereference(request, options?)` | Load a persisted message item's referenced text, base64 binary or download URI. Request: `{ conversation, messageId, type, reference }`; options: `{ abortSignal? }`. |
| `editMessage(request, options?)` | Edit an authored message using its exact current etag. Request: `{ conversation, messageId, etag, content, mentions?, replyTo?, metadata? }`; options: `{ abortSignal? }`. Returns `Promise<void>`. |
| `listRoomMessages(roomId, options?)` | Paged async iterator over room message history (auto-paginates). Use `for await` to stream every message, or `.byPage({ maxPageSize })` to load up to `maxPageSize` messages at a time. `options = { startId?, endId?, maxPageSize?, abortSignal? }` |

Every asynchronous method accepts an optional final `options` argument
extending `OperationOptions` (`{ abortSignal?: AbortSignalLike }`) to
cancel in-flight invocations:

```ts
const ac = new AbortController();
setTimeout(() => ac.abort(), 5000);
await client.sendToRoom(roomId, "hi", { abortSignal: ac.signal });
```

Create an additional conversation with an optional title of at most 256 characters:

```typescript
const conversation = await client.createConversation(roomId, { title: "Discussion" });
console.log(conversation.roomId, conversation.topicId, conversation.conversationId);
```

The service generates the IDs. Creation does not change the room's default
conversation: `sendToRoom()` and `listRoomMessages()` still use that default.
Use `sendMessage()` to send to that conversation. Querying non-default
conversation history is not yet exposed by this SDK.

To read members with their roles instead of only the IDs in room detail:

```typescript
const members = await client.getRoomMembers(roomId);
for (const member of members) {
  console.log(member.userId, member.role);
}
```

This fetches the current list from the service. Roles are strings and may
include custom role names; the result is not maintained as a local member cache.

Use `await client.leaveRoom(roomId)` to leave voluntarily, rather than the
administrative `removeUserFromRoom()` operation. On success a cached room is
removed before the `"room-left"` listener runs; the event fires once even if
the service also sends a RoomLeft notification. If the room is not cached,
the request still goes to the service, but no local event is synthesized.
Invocation failure alone does not remove cached membership or emit an event.

User properties are free-form JSON objects (`UserProperties`, a
`Record<string, unknown>`) and are read from the service, not a local cache.
Setting properties replaces the entire object rather than merging fields:

```typescript
await client.setCurrentUserProperties({
  nickname: "Alice",
  preferences: { theme: "dark" },
});
const mine = await client.getCurrentUserProperties();
const other = await client.getUserProperties("bob");
await client.setCurrentUserProperties({}); // Clear all properties.
```

All three methods accept an optional final options object with `abortSignal`.
Service failures are reported through `ChatError`; a property named `code`
is ordinary application data, not an error indicator.

User status (`UserStatus`) is a free-form JSON object or `null`. Reads go to
the service, and writes replace the complete object. An empty object is a
valid status; only `null` clears it.

```typescript
import type { OnUserStatusUpdatedArgs } from "@azure/web-pubsub-chat-client";

const onStatus = (event: OnUserStatusUpdatedArgs) => {
  console.log(event.userId, event.status);
};
client.on("user-status-updated", onStatus);
await client.subscribeUserStatus("bob");
const status = await client.getUserStatus("bob");
await client.setCurrentUserStatus({ activity: "busy" });
await client.setCurrentUserStatus(null);
await client.unsubscribeUserStatus("bob");
client.off("user-status-updated", onStatus);
```

All five status methods accept optional `abortSignal` options. Registering a local listener
does not create a service subscription, and removing it does not unsubscribe.
Likewise, unsubscribing does not remove local listeners. Subscriptions belong
to the connection; subscribe again after stop/start. The connection performing
a status update is excluded from that update's notification, even if it is
subscribed to its own user. The SDK does not synthesize a local status event.

**Known transport limitation:** the current `@azure/web-pubsub-client` dependency
omits top-level JSON `null` invocation payloads and discards JSON `null`
invocation responses. Until the upstream fix is available, clearing status
with `setCurrentUserStatus(null)` and reading an unset status cannot be relied
on to complete correctly. The Chat SDK retains the specified `null` API
contract without a protocol workaround. Nested `status: null` notification
fields are not affected by this top-level payload issue.

Include mentions or a reply target in the same options object:

```ts
await client.sendToRoom(roomId, "Hello @bob!", {
  mentions: ["bob"],
  replyTo: "previous-message-id",
});
```

These properties are included in both the sent message and the sender's local
`message` event. Each property can be omitted or set to `null`; mention entries
must be strings. `sendToRoom()` does not expose custom metadata; use
`sendMessage()` when metadata or richer content is needed.

#### Full messages and attachments

`sendMessage()` accepts `ChatConversation`: use `{ roomId }` for the default
topic, `{ roomId, topicId }`, or `{ conversationId }`. When multiple IDs are
supplied they must agree. Exactly one of `text`, `binary`, or a non-empty `items`
array must be set in `MessageContent`. Binary strings are base64-encoded bytes.
The service validates content, metadata, mentions, references and reply targets.

```typescript
await client.sendMessage({ roomId }, { text: "Hello" }, {
  mentions: ["bob"],
  metadata: { category: "greeting" },
});
await client.sendMessage(conversation, {
  items: [
    { type: "Text", isAttachment: false, content: { text: "A small attachment" } },
    {
      type: "Binary",
      isAttachment: true,
      content: { binary: "AAEC/w==" },
      metadata: { contentType: "application/octet-stream", fileName: "sample.bin", size: 4 },
    },
  ],
});
```

Each item declares `type: "Text" | "Binary"` and `isAttachment`, with inline
`content.text` / `content.binary` or `content.reference`. To send an existing
reference, copy its `storageType` and opaque `uri` without parsing the URI.
The service externalizes inline attachment items: recipient notifications and
history contain `content.reference` instead of the attachment bytes. Item
metadata supports `contentType`, `fileName`, `size`, and a `custom` string map.
Use `dereference()` to load a persisted item's referenced content. Agent image
replay remains a separate limitation.

As with `sendToRoom()`, the sender observes one locally synthesized `message`
event after a successful send. For `sendMessage()` this event contains the
submitted content, not a persisted snapshot: inline attachments remain inline,
and server-generated `etag` / `createdAt` are absent. Read history to obtain
stored references (currently available publicly only for default conversations).
Service notifications and `sendMessage()` local echoes include an optional
`event.conversation` so messages from different topics can be distinguished.
The existing `sendToRoom()` local echo remains unchanged.

The stored body is limited to 65536 bytes after attachment externalization.
Each externalized inline attachment is limited to 983025 bytes. Text sizes use
UTF-8; binary sizes use decoded bytes. Message and custom item metadata allow
at most 16 entries, keys at most 32 characters and values at most 64 characters.
Mentions allow at most 10 existing user IDs; `replyTo` must identify a message
in the same conversation. Service validation errors reject without a local echo.

#### Loading attachments

Pass the containing message's identity, the item's `"Text"` / `"Binary"` type
and its `content.reference` to `dereference()`. There is no `item` wrapper or
`itemIndex` parameter:

```typescript
const conversation = { roomId };
for await (const message of client.listRoomMessages(roomId)) {
  for (const item of message.content.items ?? []) {
    const reference = item.content?.reference;
    if (!reference || (item.type !== "Text" && item.type !== "Binary")) continue;
    const result = await client.dereference({
      conversation,
      messageId: message.messageId,
      type: item.type,
      reference,
    });
    console.log(result.text, result.binary, result.downloadUri);
  }
}
```

`DereferenceResult.binary` is base64, not a `Uint8Array`; decode it as needed
(for example `Buffer.from(result.binary, "base64")` in Node). Providers may
return `downloadUri` instead of inline content; the SDK returns that URI without
automatically downloading it. Text, binary and download fields may be absent
or `null`, so check which was returned.

The caller must currently be a room member with `room.history` permission.
The service checks that the type and reference belong to the same item in the
current persisted message; removed, replaced or unrelated references cannot be
used to read that message's attachments. Copy the reference unchanged, without
parsing its URI. For Agent streaming, wait for a subsequent checkpoint before
loading the persisted message and its references. This API does not add
automatic checkpoint recovery or fix missing Agent image items.

#### Editing messages

Use the current `etag` from history or a `message-updated` notification, not
the sender's synthetic `sendMessage()` echo (which has no server etag):

```typescript
client.on("message-updated", ({ conversation, message }) => {
  // Replace the stored message in your UI and retain its new etag.
  console.log(conversation, message.messageId, message.etag, message.content);
});
await client.editMessage({
  conversation: { roomId },
  messageId,
  etag: currentEtag,
  content: { text: "Updated text" },
  metadata: null,
});
```

Content is required and replaces the whole body using `sendMessage()`'s
content and storage-size rules. For `mentions`, `replyTo`, and `metadata`,
omission preserves the existing field, `null` clears it, and supplied values
replace it. An empty mentions array clears mentions; an empty metadata object
replaces metadata with `{}`. Editing mentions does not trigger an Agent run.

The caller must be the author, a current room member, and have
`room.publish_message` permission. A stale etag or `*` is rejected with
`MessageETagMismatch`; reload before retrying instead of overwriting newer edits.
The response contains no updated snapshot. The service sends `MessageUpdated`
to all room connections, including the editor; the SDK exposes it as
`message-updated` with complete content and the new etag, without a local echo.
Update events may arrive before the invocation resolves.

Edits may reorder, repeat or remove references already present anywhere in
the original message. A reference not in that message is rejected with
`InvalidMessageReference`; use inline content for a new/replacement attachment.
The service compares storage types case-insensitively and URIs exactly.
Replaced attachment references are not automatically deleted from storage.
After an unsuccessful edit, reload the message to determine its persisted state.

`message-updated` also exposes complete service snapshots for Agent messages
and stream announcements, without codec reconstruction, so stored attachment
references are preserved. Agent live deltas still use the existing `message`
event. This does not fix the separately documented Agent history/image replay
or checkpoint recovery limitations.

#### Errors

Operations reject with a `ChatError` (extends `Error`) carrying a
service-defined `code`. Known codes are exposed as `KnownChatErrorCode`;
the service may return additional codes in newer versions, so always
handle the unknown-code case.

```ts
import { ChatError, KnownChatErrorCode } from "@azure/web-pubsub-chat-client";

try {
  await client.sendToRoom(roomId, "hi");
} catch (err) {
  if (err instanceof ChatError && err.code === KnownChatErrorCode.UnknownRoom) {
    // re-join or refresh local state
  } else {
    throw err;
  }
}
```

| Code | Meaning |
|------|---------|
| `KnownChatErrorCode.RoomAlreadyExists` | Tried to create a room whose `roomId` is already in use. |
| `KnownChatErrorCode.UserAlreadyInRoom` | Adding a user that is already a member. |
| `KnownChatErrorCode.NoPermissionInRoom` | Caller lacks permission to perform the operation. |
| `KnownChatErrorCode.NotStarted` | An API was called before `start()` resolved. |
| `KnownChatErrorCode.UnknownRoom` | The room is not in the client's local cache (joined or created). |
| `KnownChatErrorCode.InvalidServerResponse` | The service returned a malformed response. |

#### Event Listeners

Chat events use the same shape as the underlying `WebPubSubClient`:
one `on(event, listener)` overload per event, returning `void`, paired
with `off(event, listener)` for removal. Pass the same callback
reference to `off()` to unregister.

```ts
const onMsg = (event) => {
  console.log(event.message.content.text);
};
client.on('message', onMsg);
// later
client.off('message', onMsg);
```

| Event name | Listener argument | Description |
|------------|-------------------|-------------|
| `started` | `OnStartedArgs` | `start()` completed successfully — `userId` and `rooms` are populated. |
| `stopped` | `OnStoppedArgs` | The client transitioned to not-started (explicit `stop()` or transport-driven); `previousState` snapshots its `userId` and `rooms` before it stopped. |
| `message` | `OnMessageArgs` | New message received (or sent by this client). |
| `message-updated` | `OnMessageUpdatedArgs` | Complete service message snapshot after an update, including the editor's connection and Agent stream announcements. |
| `user-status-updated` | `OnUserStatusUpdatedArgs` | A subscribed user's complete status changed; `status` is `null` when cleared. |
| `room-joined` | `OnRoomJoinedArgs` | This client joined a room. |
| `room-left` | `OnRoomLeftArgs` | This client left a room. |
| `member-joined` | `OnMemberJoinedArgs` | Another user joined a room this client is in. |
| `member-left` | `OnMemberLeftArgs` | Another user left a room this client is in. |

The underlying connection is managed internally and is not exposed. Use the
chat-level `started` / `stopped` events for lifecycle notifications;
lower-level connection events (`connected`, `disconnected`) are not
currently surfaced.

## Examples

See the [examples](./examples) directory for complete working examples.

## License

MIT
