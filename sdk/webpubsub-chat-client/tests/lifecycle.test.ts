import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { InvocationError, type WebPubSubClientCredential, type WebPubSubDataType, type GroupStream, type GroupStreamMessage } from "@azure/web-pubsub-client";
import { ChatClient, ChatError } from "../src/chatClient.js";
import type { UserProperties, UserStatus, OnUserStatusUpdatedArgs, ChatConversation, CreateConversationOptions, RoomMember, MessageContent, SendMessageOptions, DereferenceRequest, DereferenceResult, EditMessageRequest, OnMessageUpdatedArgs } from "../src/index.js";
import { INVOCATION_NAME } from "../src/constant.js";
import type { OnMessageArgs, OnStoppedArgs, OnRoomLeftArgs } from "../src/events.js";
import type { RoomInfoWithMembers, UserProfile } from "../src/generatedTypes.js";
import type { OperationOptions, SendToRoomOptions } from "../src/options.js";

/**
 * `_isStarted` is private; accessor used by tests to assert the post-login
 * state-machine flag without re-exposing it on the public surface.
 */
const isStarted = (client: ChatClient): boolean =>
  (client as unknown as { _isStarted: boolean })._isStarted;

class Deferred<T> {
  public promise: Promise<T>;
  public resolve!: (value: T | PromiseLike<T>) => void;
  public reject!: (reason?: unknown) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

class FakeWebPubSubClient {
  public startCalls = 0;
  public stopCalls = 0;
  public loginResponse: UserProfile = { userId: "alice", roomIds: [], conversationIds: [] };
  public roomResponses = new Map<string, RoomInfoWithMembers>();
  public getRoomStarted?: Deferred<void>;
  public getRoomDelay?: Deferred<void>;
  public getRoomError?: Error;
  public roomMembers: RoomMember[] = [];
  public getRoomMembersError?: Error;
  public leaveRoomError?: Error;
  public notifyBeforeLeaveResponse = false;
  public leaveRoomCalls: Array<{
    payload: unknown;
    dataType: WebPubSubDataType;
    options?: OperationOptions;
  }> = [];
  public getRoomMembersCalls: Array<{
    payload: unknown;
    dataType: WebPubSubDataType;
    options?: OperationOptions;
  }> = [];
  public stopDelay?: Deferred<void>;
  public sendCalls: Array<{ payload: unknown; dataType: WebPubSubDataType; options?: OperationOptions }> = [];
  public sendMessageResponse: unknown = { id: "full-message-id" };
  public sendMessageError?: Error;
  public sendMessageCalls: Array<{ payload: unknown; dataType: WebPubSubDataType; options?: OperationOptions }> = [];
  public dereferenceResponse: DereferenceResult = {};
  public dereferenceError?: Error;
  public dereferenceCalls: Array<{ payload: unknown; dataType: WebPubSubDataType; options?: OperationOptions }> = [];
  public editMessageError?: Error;
  public editMessageCalls: Array<{ payload: unknown; dataType: WebPubSubDataType; options?: OperationOptions }> = [];
  public userPropertiesResponse: UserProperties = {};
  public userPropertiesError?: Error;
  public userPropertiesCalls: Array<{
    eventName: string;
    payload: unknown;
    dataType: WebPubSubDataType;
    options?: OperationOptions;
  }> = [];
  public userStatusResponse: UserStatus = null;
  public userStatusError?: Error;
  public createConversationResponse: ChatConversation = {
    roomId: "room1", topicId: "topic1", conversationId: "c.room1.topic1",
  };
  public createConversationError?: Error;
  public createConversationCalls: Array<{
    payload: unknown;
    dataType: WebPubSubDataType;
    options?: OperationOptions;
  }> = [];
  public userStatusCalls: Array<{
    eventName: string;
    payload: unknown;
    dataType: WebPubSubDataType;
    options?: OperationOptions;
  }> = [];

  private readonly emitter = new EventEmitter();
  private connectionStopped = true;
  private stopping = false;
  private groupStreamListener?: (stream: GroupStream) => Promise<void>;

  public async start(): Promise<void> {
    if (this.stopping) {
      throw new Error("Cannot start while stopping");
    }
    this.startCalls += 1;
    this.connectionStopped = false;
  }

  public stop(): void {
    this.stopCalls += 1;
    if (this.connectionStopped || this.stopping) {
      return;
    }

    this.stopping = true;
    if (this.stopDelay) {
      void this.stopDelay.promise.then(() => this.emitStopped());
    } else {
      queueMicrotask(() => this.emitStopped());
    }
  }

  public on(event: string, listener: (args: any) => void): void {
    this.emitter.on(event, listener);
  }

  public off(event: string, listener: (args: any) => void): void {
    this.emitter.off(event, listener);
  }

  public onGroupStream(listener: (stream: GroupStream) => Promise<void>): void {
    this.groupStreamListener = listener;
  }

  public async emitGroupStream(stream: GroupStream): Promise<void> {
    assert.ok(this.groupStreamListener);
    await this.groupStreamListener(stream);
  }

  public async invokeEvent(
    eventName: string,
    payload: any,
    dataType: WebPubSubDataType,
    options?: OperationOptions,
  ): Promise<{ data: unknown }> {
    void dataType;
    if (eventName === INVOCATION_NAME.LOGIN) {
      return { data: this.loginResponse };
    }

    if (eventName === INVOCATION_NAME.EDIT_MESSAGE) {
      this.editMessageCalls.push({ payload, dataType, options });
      if (this.editMessageError) throw this.editMessageError;
      return { data: {} };
    }

    if (eventName === INVOCATION_NAME.DEREFERENCE) {
      this.dereferenceCalls.push({ payload, dataType, options });
      if (this.dereferenceError) throw this.dereferenceError;
      return { data: this.dereferenceResponse };
    }

    if (eventName === INVOCATION_NAME.SEND_MESSAGE) {
      this.sendMessageCalls.push({ payload, dataType, options });
      if (this.sendMessageError) throw this.sendMessageError;
      return { data: this.sendMessageResponse };
    }

    if (eventName === INVOCATION_NAME.LEAVE_ROOM) {
      this.leaveRoomCalls.push({ payload, dataType, options });
      if (this.leaveRoomError) throw this.leaveRoomError;
      if (this.notifyBeforeLeaveResponse) this.emitRoomLeft(payload.roomId);
      return { data: {} };
    }

    if (eventName === INVOCATION_NAME.GET_ROOM_MEMBERS) {
      this.getRoomMembersCalls.push({ payload, dataType, options });
      if (this.getRoomMembersError) throw this.getRoomMembersError;
      return { data: { members: this.roomMembers } };
    }

    if (eventName === INVOCATION_NAME.CREATE_CONVERSATION) {
      this.createConversationCalls.push({ payload, dataType, options });
      if (this.createConversationError) throw this.createConversationError;
      return { data: this.createConversationResponse };
    }

    if (eventName === INVOCATION_NAME.GET_CURRENT_USER_PROPERTIES
      || eventName === INVOCATION_NAME.SET_CURRENT_USER_PROPERTIES
      || eventName === INVOCATION_NAME.GET_USER_PROPERTIES) {
      this.userPropertiesCalls.push({ eventName, payload, dataType, options });
      if (this.userPropertiesError) throw this.userPropertiesError;
      return {
        data: eventName === INVOCATION_NAME.SET_CURRENT_USER_PROPERTIES ? {} : this.userPropertiesResponse,
      };
    }

    if (eventName === INVOCATION_NAME.GET_CURRENT_USER_STATUS
      || eventName === INVOCATION_NAME.SET_CURRENT_USER_STATUS
      || eventName === INVOCATION_NAME.GET_USER_STATUS
      || eventName === INVOCATION_NAME.SUBSCRIBE_USER_STATUS
      || eventName === INVOCATION_NAME.UNSUBSCRIBE_USER_STATUS) {
      this.userStatusCalls.push({ eventName, payload, dataType, options });
      if (this.userStatusError) throw this.userStatusError;
      return {
        data: eventName === INVOCATION_NAME.GET_CURRENT_USER_STATUS || eventName === INVOCATION_NAME.GET_USER_STATUS
          ? this.userStatusResponse : {},
      };
    }

    if (eventName === INVOCATION_NAME.GET_ROOM) {
      this.getRoomStarted?.resolve();
      if (this.getRoomDelay) {
        await this.getRoomDelay.promise;
      }
      if (this.getRoomError) {
        throw this.getRoomError;
      }

      const roomId = payload.id as string;
      const roomInfo = this.roomResponses.get(roomId) ?? {
        roomId,
        title: roomId,
        defaultConversationId: `conversation-${roomId}`,
        members: [],
      };
      return { data: roomInfo };
    }

    if (eventName === INVOCATION_NAME.SEND_TEXT_MESSAGE) {
      this.sendCalls.push({ payload, dataType, options });
      return { data: { id: "sent-message-id" } };
    }

    throw new Error(`Unexpected invocation: ${eventName}`);
  }

  public emitRoomJoined(roomId: string): void {
    this.emitter.emit("group-message", {
      message: {
        data: {
          notificationType: "RoomJoined",
          body: {
            roomId,
            title: roomId,
            defaultConversationId: `conversation-${roomId}`,
            notificationType: "RoomJoined",
          },
        },
      },
    });
  }

  public emitUserStatusUpdated(
    userId: string,
    status: UserStatus,
    route: "server-message" | "group-message" = "server-message",
  ): void {
    this.emitter.emit(route, {
      message: { data: { notificationType: "UserStatusUpdated", body: { userId, status } } },
    });
  }

  public emitRoomLeft(roomId: string): void {
    this.emitter.emit("server-message", {
      message: { data: { notificationType: "RoomLeft", body: { roomId, title: roomId } } },
    });
  }

  public emitMessageCreated(conversation: ChatConversation, content: MessageContent): void {
    this.emitter.emit("group-message", {
      message: { data: {
        notificationType: "MessageCreated",
        body: { conversation, message: { messageId: "remote-message", createdBy: "bob", content } },
      } },
    });
  }

  public emitMessageUpdated(
    conversation: ChatConversation,
    message: OnMessageUpdatedArgs["message"],
    route: "server-message" | "group-message" = "group-message",
  ): void {
    this.emitter.emit(route, {
      message: { data: { notificationType: "MessageUpdated", body: { conversation, message } } },
    });
  }

  private emitStopped(): void {
    this.stopping = false;
    this.connectionStopped = true;
    this.emitter.emit("stopped", {});
  }
}

function createClient(fakeClient: FakeWebPubSubClient): ChatClient {
  return new ChatClient(fakeClient as unknown as WebPubSubClientCredential);
}

const propertiesGetters = [
  {
    name: "getCurrentUserProperties",
    eventName: "chat.getCurrentUserProperties",
    payload: {},
    read: (client: ChatClient, options?: OperationOptions) => client.getCurrentUserProperties(options),
  },
  {
    name: "getUserProperties",
    eventName: "chat.getUserProperties",
    payload: { userId: "bob" },
    read: (client: ChatClient, options?: OperationOptions) => client.getUserProperties("bob", options),
  },
];

for (const { name, eventName, payload, read } of propertiesGetters) {
  test(`${name} reads arbitrary properties, including code, and empty properties`, async () => {
    const fakeClient = new FakeWebPubSubClient();
    const client = createClient(fakeClient);
    await client.start();
    const options = { abortSignal: new AbortController().signal };
    const properties: UserProperties = {
      code: "UserNotFound",
      message: "Application data, not an invocation error",
      preferences: { theme: "dark", values: [1, true, null] },
    };
    fakeClient.userPropertiesResponse = properties;

    assert.deepEqual(await read(client, options), properties);
    fakeClient.userPropertiesResponse = {};
    assert.deepEqual(await read(client), {});
    assert.deepEqual(fakeClient.userPropertiesCalls.map((call) => ({
      eventName: call.eventName, payload: call.payload, dataType: call.dataType,
    })), [
      { eventName, payload, dataType: "json" },
      { eventName, payload, dataType: "json" },
    ]);
    assert.equal(fakeClient.userPropertiesCalls[0]?.options?.abortSignal, options.abortSignal);
    await client.stop();
  });
}

test("setCurrentUserProperties sends the complete replacement object, including an empty object", async () => {
  const fakeClient = new FakeWebPubSubClient();
  const client = createClient(fakeClient);
  await client.start();
  const options = { abortSignal: new AbortController().signal };
  const properties: UserProperties = { code: "custom", preferences: { tags: ["chat"], enabled: false } };

  assert.equal(await client.setCurrentUserProperties(properties, options), undefined);
  assert.equal(await client.setCurrentUserProperties({}), undefined);
  assert.deepEqual(fakeClient.userPropertiesCalls.map((call) => ({
    eventName: call.eventName, payload: call.payload, dataType: call.dataType,
  })), [
    { eventName: "chat.setCurrentUserProperties", payload: properties, dataType: "json" },
    { eventName: "chat.setCurrentUserProperties", payload: {}, dataType: "json" },
  ]);
  assert.equal(fakeClient.userPropertiesCalls[0]?.options?.abortSignal, options.abortSignal);
  await client.stop();
});

const propertiesOperations = [
  (client: ChatClient) => client.getCurrentUserProperties(),
  (client: ChatClient) => client.setCurrentUserProperties({ nickname: "Alice" }),
  (client: ChatClient) => client.getUserProperties("bob"),
];

test("user properties operations require a started client", async () => {
  const fakeClient = new FakeWebPubSubClient();
  const client = createClient(fakeClient);

  for (const operation of propertiesOperations) {
    await assert.rejects(() => operation(client),
      (error: unknown) => error instanceof ChatError && error.code === "NotStarted");
  }
  assert.equal(fakeClient.userPropertiesCalls.length, 0);
});

test("user properties operations preserve service error codes and transport failures", async () => {
  const fakeClient = new FakeWebPubSubClient();
  const client = createClient(fakeClient);
  await client.start();
  fakeClient.userPropertiesError = new InvocationError("User does not exist", {
    invocationId: "user-properties-test",
    errorDetail: { name: "UserNotFound", message: "User does not exist" },
  });
  for (const operation of propertiesOperations) {
    await assert.rejects(() => operation(client),
      (error: unknown) => error instanceof ChatError && error.code === "UserNotFound");
  }

  const transportError = new Error("Connection failed");
  fakeClient.userPropertiesError = transportError;
  for (const operation of propertiesOperations) {
    await assert.rejects(() => operation(client), (error: unknown) => error === transportError);
  }
  await client.stop();
});

const statusGetters = [
  {
    name: "getCurrentUserStatus",
    eventName: "chat.getCurrentUserStatus",
    payload: {},
    read: (client: ChatClient, options?: OperationOptions) => client.getCurrentUserStatus(options),
  },
  {
    name: "getUserStatus",
    eventName: "chat.getUserStatus",
    payload: { userId: "bob" },
    read: (client: ChatClient, options?: OperationOptions) => client.getUserStatus("bob", options),
  },
];

for (const { name, eventName, payload, read } of statusGetters) {
  test(`${name} preserves null, empty objects, and arbitrary status fields`, async () => {
    const fakeClient = new FakeWebPubSubClient();
    const client = createClient(fakeClient);
    await client.start();
    const options = { abortSignal: new AbortController().signal };
    const statuses: UserStatus[] = [null, {}, { code: "busy", details: { values: [true, null, 1] } }];
    for (const status of statuses) {
      fakeClient.userStatusResponse = status;
      assert.deepEqual(await read(client, options), status);
    }
    assert.deepEqual(fakeClient.userStatusCalls.map((call) => ({
      eventName: call.eventName, payload: call.payload, dataType: call.dataType,
    })), statuses.map(() => ({ eventName, payload, dataType: "json" })));
    for (const call of fakeClient.userStatusCalls) assert.equal(call.options?.abortSignal, options.abortSignal);
    await client.stop();
  });
}

test("setCurrentUserStatus sends the replacement object or null without a local echo", async () => {
  const fakeClient = new FakeWebPubSubClient();
  const client = createClient(fakeClient);
  await client.start();
  const received: OnUserStatusUpdatedArgs[] = [];
  client.on("user-status-updated", (event) => received.push(event));
  const options = { abortSignal: new AbortController().signal };
  const statuses: UserStatus[] = [{ code: "busy", nested: { active: true } }, {}, null];
  for (const status of statuses) {
    assert.equal(await client.setCurrentUserStatus(status, options), undefined);
  }
  assert.deepEqual(fakeClient.userStatusCalls.map((call) => ({
    eventName: call.eventName, payload: call.payload, dataType: call.dataType,
  })), statuses.map((payload) => ({ eventName: "chat.setCurrentUserStatus", payload, dataType: "json" })));
  for (const call of fakeClient.userStatusCalls) assert.equal(call.options?.abortSignal, options.abortSignal);
  assert.deepEqual(received, []);
  await client.stop();
});

test("status subscriptions send user IDs and do not remove local listeners", async () => {
  const fakeClient = new FakeWebPubSubClient();
  const client = createClient(fakeClient);
  await client.start();
  const received: OnUserStatusUpdatedArgs[] = [];
  client.on("user-status-updated", (event) => received.push(event));
  const options = { abortSignal: new AbortController().signal };

  assert.equal(await client.subscribeUserStatus("bob", options), undefined);
  assert.equal(await client.unsubscribeUserStatus("bob", options), undefined);
  assert.equal(await client.unsubscribeUserStatus("bob"), undefined);
  assert.deepEqual(fakeClient.userStatusCalls.map((call) => ({
    eventName: call.eventName, payload: call.payload, dataType: call.dataType,
  })), [
    { eventName: "chat.subscribeUserStatus", payload: { userId: "bob" }, dataType: "json" },
    { eventName: "chat.unsubscribeUserStatus", payload: { userId: "bob" }, dataType: "json" },
    { eventName: "chat.unsubscribeUserStatus", payload: { userId: "bob" }, dataType: "json" },
  ]);
  assert.equal(fakeClient.userStatusCalls[0]?.options?.abortSignal, options.abortSignal);
  assert.equal(fakeClient.userStatusCalls[1]?.options?.abortSignal, options.abortSignal);
  fakeClient.emitUserStatusUpdated("charlie", { active: true });
  assert.deepEqual(received, [{ userId: "charlie", status: { active: true } }]);
  await client.stop();
});

test("status notifications preserve payloads and respect listener and client lifecycles", async () => {
  const fakeClient = new FakeWebPubSubClient();
  const client = createClient(fakeClient);
  const received: OnUserStatusUpdatedArgs[] = [];
  const listener = (event: OnUserStatusUpdatedArgs) => received.push(event);
  client.on("user-status-updated", listener);
  fakeClient.emitUserStatusUpdated("bob", { beforeStart: true });
  assert.deepEqual(received, []);

  await client.start();
  const status = { code: "ready", details: { active: true } };
  fakeClient.emitUserStatusUpdated("bob", status);
  fakeClient.emitUserStatusUpdated("bob", null, "group-message");
  assert.deepEqual(received, [{ userId: "bob", status }, { userId: "bob", status: null }]);
  client.off("user-status-updated", listener);
  fakeClient.emitUserStatusUpdated("bob", {});
  assert.equal(received.length, 2);

  client.on("user-status-updated", listener);
  await client.stop();
  fakeClient.emitUserStatusUpdated("bob", { afterStop: true });
  assert.equal(received.length, 2);
});

const statusOperations = [
  (client: ChatClient) => client.getCurrentUserStatus(),
  (client: ChatClient) => client.setCurrentUserStatus(null),
  (client: ChatClient) => client.getUserStatus("bob"),
  (client: ChatClient) => client.subscribeUserStatus("bob"),
  (client: ChatClient) => client.unsubscribeUserStatus("bob"),
];

test("user status operations require a started client", async () => {
  const fakeClient = new FakeWebPubSubClient();
  const client = createClient(fakeClient);
  for (const operation of statusOperations) {
    await assert.rejects(() => operation(client),
      (error: unknown) => error instanceof ChatError && error.code === "NotStarted");
  }
  assert.equal(fakeClient.userStatusCalls.length, 0);
});

test("user status operations preserve service error codes and transport failures", async () => {
  const fakeClient = new FakeWebPubSubClient();
  const client = createClient(fakeClient);
  await client.start();
  fakeClient.userStatusError = new InvocationError("User does not exist", {
    invocationId: "user-status-test",
    errorDetail: { name: "UserNotFound", message: "User does not exist" },
  });
  for (const operation of statusOperations) {
    await assert.rejects(() => operation(client),
      (error: unknown) => error instanceof ChatError && error.code === "UserNotFound");
  }
  const transportError = new Error("Connection failed");
  fakeClient.userStatusError = transportError;
  for (const operation of statusOperations) {
    await assert.rejects(() => operation(client), (error: unknown) => error === transportError);
  }
  await client.stop();
});

test("createConversation forwards optional titles and cancellation without changing the default conversation", async () => {
  const fakeClient = new FakeWebPubSubClient();
  fakeClient.loginResponse = { userId: "alice", roomIds: ["room1"] };
  const client = createClient(fakeClient);
  await client.start();
  const signal = new AbortController().signal;
  const cases: Array<CreateConversationOptions | undefined> = [
    undefined, {}, { title: "Discussion", abortSignal: signal }, { title: "" }, { title: null },
  ];
  try {
    for (const options of cases) {
      assert.deepEqual(await client.createConversation("room1", options), fakeClient.createConversationResponse);
    }
    assert.deepEqual(fakeClient.createConversationCalls.map((call) => ({
      payload: call.payload, dataType: call.dataType,
    })), [
      { payload: { roomId: "room1" }, dataType: "json" },
      { payload: { roomId: "room1" }, dataType: "json" },
      { payload: { roomId: "room1", title: "Discussion" }, dataType: "json" },
      { payload: { roomId: "room1", title: "" }, dataType: "json" },
      { payload: { roomId: "room1", title: null }, dataType: "json" },
    ]);
    assert.equal(fakeClient.createConversationCalls[2]?.options?.abortSignal, signal);
    await client.sendToRoom("room1", "Still the default");
    assert.deepEqual(fakeClient.sendCalls[0]?.payload, {
      conversation: { conversationId: "conversation-room1" }, content: "Still the default",
    });
  } finally {
    await client.stop();
  }
});

test("createConversation requires start and lets the service authorize rooms absent from the local cache", async () => {
  const fakeClient = new FakeWebPubSubClient();
  const client = createClient(fakeClient);
  await assert.rejects(() => client.createConversation("room1"),
    (error: unknown) => error instanceof ChatError && error.code === "NotStarted");
  assert.equal(fakeClient.createConversationCalls.length, 0);
  await client.start();
  try {
    assert.deepEqual(await client.createConversation("room1"), fakeClient.createConversationResponse);
    for (const code of ["RoomNotFound", "NoPermissionInRoom"]) {
      fakeClient.createConversationError = new InvocationError("Cannot create conversation", {
        invocationId: "create-conversation-test", errorDetail: { name: code, message: "Cannot create conversation" },
      });
      await assert.rejects(() => client.createConversation("room1"),
        (error: unknown) => error instanceof ChatError && error.code === code);
    }
    const transportError = new Error("Connection failed");
    fakeClient.createConversationError = transportError;
    await assert.rejects(() => client.createConversation("room1"), (error: unknown) => error === transportError);
  } finally {
    await client.stop();
  }
});

test("getRoomMembers fetches current IDs and roles, including custom roles and an empty list", async () => {
  const fakeClient = new FakeWebPubSubClient();
  const client = createClient(fakeClient);
  await client.start();
  const options = { abortSignal: new AbortController().signal };
  try {
    fakeClient.roomMembers = [
      { userId: "alice", role: "room.operator" },
      { userId: "bob", role: "room.member" },
      { userId: "charlie", role: "custom.moderator" },
    ];
    assert.deepEqual(await client.getRoomMembers("room1", options), fakeClient.roomMembers);
    fakeClient.roomMembers = [];
    assert.deepEqual(await client.getRoomMembers("room1"), []);
    assert.deepEqual(fakeClient.getRoomMembersCalls.map((call) => ({
      payload: call.payload, dataType: call.dataType,
    })), [
      { payload: { roomId: "room1" }, dataType: "json" },
      { payload: { roomId: "room1" }, dataType: "json" },
    ]);
    assert.equal(fakeClient.getRoomMembersCalls[0]?.options?.abortSignal, options.abortSignal);
    assert.equal(client.hasJoinedRoom("room1"), false, "Reading members must not change the joined-room cache");
  } finally {
    await client.stop();
  }
});

test("getRoomMembers requires start and preserves service and transport errors", async () => {
  const fakeClient = new FakeWebPubSubClient();
  const client = createClient(fakeClient);
  await assert.rejects(() => client.getRoomMembers("room1"),
    (error: unknown) => error instanceof ChatError && error.code === "NotStarted");
  assert.equal(fakeClient.getRoomMembersCalls.length, 0);
  await client.start();
  try {
    for (const code of ["RoomNotFound", "NoPermissionInRoom"]) {
      fakeClient.getRoomMembersError = new InvocationError("Cannot read members", {
        invocationId: "get-room-members-test", errorDetail: { name: code, message: "Cannot read members" },
      });
      await assert.rejects(() => client.getRoomMembers("room1"),
        (error: unknown) => error instanceof ChatError && error.code === code);
    }
    const transportError = new Error("Connection failed");
    fakeClient.getRoomMembersError = transportError;
    await assert.rejects(() => client.getRoomMembers("room1"), (error: unknown) => error === transportError);
  } finally {
    await client.stop();
  }
});

for (const timing of ["before", "after", "absent"] as const) {
  test(`leaveRoom removes cached membership and emits once with ${timing} notification`, async () => {
    const fakeClient = new FakeWebPubSubClient();
    fakeClient.loginResponse = { userId: "alice", roomIds: ["room1", "room2"] };
    fakeClient.notifyBeforeLeaveResponse = timing === "before";
    const client = createClient(fakeClient);
    await client.start();
    const events: OnRoomLeftArgs[] = [];
    client.on("room-left", (event) => {
      assert.equal(client.hasJoinedRoom(event.roomId), false, "Listeners must see updated membership");
      events.push(event);
    });
    const options = { abortSignal: new AbortController().signal };
    try {
      assert.equal(await client.leaveRoom("room1", options), undefined);
      if (timing === "after") fakeClient.emitRoomLeft("room1");
      assert.deepEqual(events, [{ roomId: "room1", title: "room1" }]);
      assert.deepEqual(client.rooms.map((room) => room.roomId), ["room2"]);
      assert.deepEqual(fakeClient.leaveRoomCalls[0]?.payload, { roomId: "room1" });
      assert.equal(fakeClient.leaveRoomCalls[0]?.dataType, "json");
      assert.equal(fakeClient.leaveRoomCalls[0]?.options?.abortSignal, options.abortSignal);
      await assert.rejects(() => client.sendToRoom("room1", "Must not send"),
        (error: unknown) => error instanceof ChatError && error.code === "UnknownRoom");
      assert.throws(() => client.listRoomMessages("room1"),
        (error: unknown) => error instanceof ChatError && error.code === "UnknownRoom");
    } finally {
      await client.stop();
    }
  });
}

test("leaveRoom requires start and preserves membership on invocation failure", async () => {
  const fakeClient = new FakeWebPubSubClient();
  fakeClient.loginResponse = { userId: "alice", roomIds: ["room1"] };
  const client = createClient(fakeClient);
  await assert.rejects(() => client.leaveRoom("room1"),
    (error: unknown) => error instanceof ChatError && error.code === "NotStarted");
  assert.equal(fakeClient.leaveRoomCalls.length, 0);
  await client.start();
  const events: OnRoomLeftArgs[] = [];
  client.on("room-left", (event) => events.push(event));
  try {
    fakeClient.leaveRoomError = new InvocationError("Cannot leave room", {
      invocationId: "leave-room-test", errorDetail: { name: "RoomNotFound", message: "Cannot leave room" },
    });
    await assert.rejects(() => client.leaveRoom("room1"),
      (error: unknown) => error instanceof ChatError && error.code === "RoomNotFound");
    const transportError = new Error("Connection failed");
    fakeClient.leaveRoomError = transportError;
    await assert.rejects(() => client.leaveRoom("room1"), (error: unknown) => error === transportError);
    assert.ok(client.hasJoinedRoom("room1"));
    assert.deepEqual(events, []);
    fakeClient.leaveRoomError = undefined;
    await client.leaveRoom("not-cached");
    assert.ok(client.hasJoinedRoom("room1"));
    assert.deepEqual(events, [], "Do not invent an event for an unknown room title");
    assert.deepEqual(fakeClient.leaveRoomCalls.at(-1)?.payload, { roomId: "not-cached" });
  } finally {
    await client.stop();
  }
});

const fullMessageCases: Array<{
  name: string;
  conversation: ChatConversation;
  content: MessageContent;
  options?: SendMessageOptions;
}> = [
  { name: "text to a default room", conversation: { roomId: "room1" }, content: { text: "Hello" } },
  { name: "binary to a room/topic", conversation: { roomId: "room1", topicId: "topic1" }, content: { binary: "AAEC/w==" } },
  {
    name: "mixed items to a conversation ID",
    conversation: { conversationId: "c.room1.topic1" },
    content: { items: [
      { type: "Text", isAttachment: false, content: { text: "Caption" } },
      {
        type: "Binary", isAttachment: true, content: { binary: "AAEC/w==" },
        metadata: { contentType: "application/octet-stream", fileName: "file.bin", size: 4, custom: { key: "value" } },
      },
      { type: "Text", isAttachment: true, content: { text: "Externalized text" } },
      {
        type: "Binary", isAttachment: true,
        content: { reference: { storageType: "table", uri: "opaque-reference" } },
      },
    ] },
    options: { mentions: ["bob"], replyTo: "previous", metadata: { code: "application-data" }, abortSignal: new AbortController().signal },
  },
  {
    name: "null optional fields",
    conversation: { roomId: "room1", topicId: "topic1", conversationId: "c.room1.topic1" },
    content: { text: "Hello" },
    options: { mentions: null, replyTo: null, metadata: null },
  },
];

for (const { name, conversation, content, options } of fullMessageCases) {
  test(`sendMessage sends and echoes ${name}`, async () => {
    const fakeClient = new FakeWebPubSubClient();
    const client = createClient(fakeClient);
    await client.start();
    const events: OnMessageArgs[] = [];
    client.on("message", (event) => events.push(event));
    const properties = {
      ...(options?.mentions !== undefined ? { mentions: options.mentions } : {}),
      ...(options?.replyTo !== undefined ? { replyTo: options.replyTo } : {}),
      ...(options?.metadata !== undefined ? { metadata: options.metadata } : {}),
    };
    try {
      assert.deepEqual(await client.sendMessage(conversation, content, options), { messageId: "full-message-id" });
      assert.equal(fakeClient.sendMessageCalls.length, 1);
      assert.deepEqual(fakeClient.sendMessageCalls[0]?.payload, { conversation, content, ...properties });
      assert.equal(fakeClient.sendMessageCalls[0]?.dataType, "json");
      assert.equal(fakeClient.sendMessageCalls[0]?.options?.abortSignal, options?.abortSignal);
      assert.deepEqual(events, [{
        roomId: "room1", conversation: { ...conversation, roomId: "room1" },
        message: { messageId: "full-message-id", createdBy: "alice", content, ...properties },
      }]);
      assert.equal(fakeClient.sendCalls.length, 0, "Full messages must not use SendTextMessage");
    } finally {
      await client.stop();
    }
  });
}

test("sendMessage requires start and does not echo rejected or invalid responses", async () => {
  const fakeClient = new FakeWebPubSubClient();
  const client = createClient(fakeClient);
  const conversation = { roomId: "room1" };
  const content = { text: "Hello" };
  await assert.rejects(() => client.sendMessage(conversation, content),
    (error: unknown) => error instanceof ChatError && error.code === "NotStarted");
  assert.equal(fakeClient.sendMessageCalls.length, 0);
  await client.start();
  const events: OnMessageArgs[] = [];
  client.on("message", (event) => events.push(event));
  try {
    for (const code of ["MessageNotFound", "InvalidRequest", "MessageContentTooLarge", "ContentItemTooLarge"]) {
      fakeClient.sendMessageError = new InvocationError("Send rejected", {
        invocationId: "send-message-test", errorDetail: { name: code, message: "Send rejected" },
      });
      await assert.rejects(() => client.sendMessage(conversation, content),
        (error: unknown) => error instanceof ChatError && error.code === code);
    }
    const transportError = new Error("Connection failed");
    fakeClient.sendMessageError = transportError;
    await assert.rejects(() => client.sendMessage(conversation, content), (error: unknown) => error === transportError);
    fakeClient.sendMessageError = undefined;
    for (const response of [null, {}, { id: "" }, { id: 123 }]) {
      fakeClient.sendMessageResponse = response;
      await assert.rejects(() => client.sendMessage(conversation, content),
        (error: unknown) => error instanceof ChatError && error.code === "InvalidServerResponse");
    }
    assert.deepEqual(events, []);
  } finally {
    await client.stop();
  }
});

test("message notifications preserve conversation identity and stored attachment references", async () => {
  const fakeClient = new FakeWebPubSubClient();
  const client = createClient(fakeClient);
  await client.start();
  const events: OnMessageArgs[] = [];
  client.on("message", (event) => events.push(event));
  const conversation = { roomId: "room1", topicId: "topic2", conversationId: "c.room1.topic2" };
  const content: MessageContent = { items: [{
    type: "Binary", isAttachment: true,
    content: { reference: { storageType: "table", uri: "opaque-reference" } },
    metadata: { contentType: "image/png", fileName: "image.png", size: 68, custom: { label: "picture" } },
  }] };
  try {
    fakeClient.emitMessageCreated(conversation, content);
    assert.deepEqual(events, [{
      roomId: "room1", conversation,
      message: { messageId: "remote-message", createdBy: "bob", content },
    }]);
  } finally {
    await client.stop();
  }
});

test("dereference forwards the flat request and preserves text, base64 and download responses", async () => {
  const fakeClient = new FakeWebPubSubClient();
  const client = createClient(fakeClient);
  await client.start();
  const options = { abortSignal: new AbortController().signal };
  const cases: Array<{ request: DereferenceRequest; response: DereferenceResult }> = [
    {
      request: { conversation: { roomId: "room1" }, messageId: "42", type: "Text",
        reference: { storageType: "TABLE", uri: "opaque/%2F/KeepCase?index=not-an-item-index" } },
      response: { text: "" },
    },
    {
      request: { conversation: { roomId: "room1", topicId: "topic2" }, messageId: "43", type: "Binary",
        reference: { storageType: "table", uri: "opaque-binary-location" } },
      response: { binary: "AAEC/w==", text: null },
    },
    {
      request: { conversation: { conversationId: "c.room1.topic2" }, messageId: "44", type: "Binary",
        reference: { storageType: "blob", uri: "opaque-blob-location" } },
      response: { downloadUri: "https://example.invalid/attachment", binary: null },
    },
  ];
  try {
    for (const { request, response } of cases) {
      fakeClient.dereferenceResponse = response;
      assert.deepEqual(await client.dereference(request, options), response);
    }
    assert.deepEqual(fakeClient.dereferenceCalls.map((call) => call.payload), cases.map((item) => item.request));
    for (const call of fakeClient.dereferenceCalls) {
      assert.equal(call.dataType, "json");
      assert.equal(call.options?.abortSignal, options.abortSignal);
    }
    assert.equal(client.hasJoinedRoom("room1"), false, "Dereference must defer authorization to the service");
  } finally {
    await client.stop();
  }
});

test("dereference requires start and preserves service and transport errors", async () => {
  const fakeClient = new FakeWebPubSubClient();
  const client = createClient(fakeClient);
  const request: DereferenceRequest = {
    conversation: { roomId: "room1" }, messageId: "42", type: "Text",
    reference: { storageType: "table", uri: "opaque" },
  };
  await assert.rejects(() => client.dereference(request),
    (error: unknown) => error instanceof ChatError && error.code === "NotStarted");
  assert.equal(fakeClient.dereferenceCalls.length, 0);
  await client.start();
  try {
    for (const code of ["MessageNotFound", "NoPermissionInRoom", "InvalidMessageReference"]) {
      fakeClient.dereferenceError = new InvocationError("Cannot load attachment", {
        invocationId: "dereference-test", errorDetail: { name: code, message: "Cannot load attachment" },
      });
      await assert.rejects(() => client.dereference(request),
        (error: unknown) => error instanceof ChatError && error.code === code);
    }
    const transportError = new Error("Connection failed");
    fakeClient.dereferenceError = transportError;
    await assert.rejects(() => client.dereference(request), (error: unknown) => error === transportError);
  } finally {
    await client.stop();
  }
});

test("editMessage preserves omitted, null and explicitly supplied fields without local echo", async () => {
  const fakeClient = new FakeWebPubSubClient();
  const client = createClient(fakeClient);
  await client.start();
  const messageEvents: OnMessageArgs[] = [];
  const updateEvents: OnMessageUpdatedArgs[] = [];
  client.on("message", (event) => messageEvents.push(event));
  client.on("message-updated", (event) => updateEvents.push(event));
  const options = { abortSignal: new AbortController().signal };
  const requests: EditMessageRequest[] = [
    { conversation: { roomId: "room1" }, messageId: "42", etag: "v1", content: { text: "Replacement" } },
    {
      conversation: { roomId: "room1", topicId: "topic2" }, messageId: "42", etag: "v2",
      content: { binary: "AAEC/w==" }, mentions: null, replyTo: null, metadata: null,
    },
    {
      conversation: { conversationId: "c.room1.topic2" }, messageId: "42", etag: "v3",
      content: { items: [{
        type: "Binary", isAttachment: true,
        content: { reference: { storageType: "TABLE", uri: "opaque-reference" } },
      }] }, mentions: [], replyTo: "41", metadata: {},
    },
  ];
  try {
    for (const request of requests) assert.equal(await client.editMessage(request, options), undefined);
    assert.deepEqual(fakeClient.editMessageCalls.map((call) => call.payload), requests);
    for (const call of fakeClient.editMessageCalls) {
      assert.equal(call.dataType, "json");
      assert.equal(call.options?.abortSignal, options.abortSignal);
    }
    assert.deepEqual(messageEvents, []);
    assert.deepEqual(updateEvents, [], "Only service notifications may announce the new etag");
  } finally {
    await client.stop();
  }
});

test("editMessage requires start and preserves etag, validation and transport errors", async () => {
  const fakeClient = new FakeWebPubSubClient();
  const client = createClient(fakeClient);
  const request: EditMessageRequest = {
    conversation: { roomId: "room1" }, messageId: "42", etag: "v1", content: { text: "Replacement" },
  };
  await assert.rejects(() => client.editMessage(request),
    (error: unknown) => error instanceof ChatError && error.code === "NotStarted");
  assert.equal(fakeClient.editMessageCalls.length, 0);
  await client.start();
  try {
    for (const code of ["MessageETagMismatch", "InvalidMessageReference", "MessageNotFound", "NoPermissionInRoom", "InvalidRequest"]) {
      fakeClient.editMessageError = new InvocationError("Cannot edit message", {
        invocationId: "edit-message-test", errorDetail: { name: code, message: "Cannot edit message" },
      });
      await assert.rejects(() => client.editMessage(request),
        (error: unknown) => error instanceof ChatError && error.code === code);
    }
    const transportError = new Error("Connection failed");
    fakeClient.editMessageError = transportError;
    await assert.rejects(() => client.editMessage(request), (error: unknown) => error === transportError);
  } finally {
    await client.stop();
  }
});

test("message-updated exposes complete plain and completed Agent snapshots with listener lifecycle", async () => {
  const fakeClient = new FakeWebPubSubClient();
  const client = createClient(fakeClient);
  const updates: OnMessageUpdatedArgs[] = [];
  const newMessages: OnMessageArgs[] = [];
  const listener = (event: OnMessageUpdatedArgs) => updates.push(event);
  client.on("message-updated", listener);
  client.on("message", (event) => newMessages.push(event));
  const conversation = { roomId: "room1", topicId: "topic2", conversationId: "c.room1.topic2" };
  const message: OnMessageUpdatedArgs["message"] = {
    messageId: "42", createdBy: "alice", etag: "v2",
    content: { items: [{
      type: "Binary", isAttachment: true,
      content: { reference: { storageType: "table", uri: "opaque" } },
      metadata: { contentType: "image/png", size: 68 },
    }] },
    mentions: null, replyTo: null, metadata: null,
  };
  fakeClient.emitMessageUpdated(conversation, message);
  assert.deepEqual(updates, []);
  await client.start();
  try {
    fakeClient.emitMessageUpdated(conversation, message);
    const agent = { ...message, metadata: { codecKind: "ag-ui-codec-v1" }, etag: "v3" };
    fakeClient.emitMessageUpdated(conversation, agent, "server-message");
    assert.deepEqual(updates, [
      { roomId: "room1", conversation, message },
      { roomId: "room1", conversation, message: agent },
    ]);
    assert.deepEqual(newMessages, [], "An edit must not look like a new message or a synthetic Agent delta");
    client.off("message-updated", listener);
    fakeClient.emitMessageUpdated(conversation, message);
    assert.equal(updates.length, 2);
    client.on("message-updated", listener);
  } finally {
    await client.stop();
  }
  fakeClient.emitMessageUpdated(conversation, message);
  assert.equal(updates.length, 2);
});

test("message-updated announcements preserve the existing Agent stream message path", async () => {
  const fakeClient = new FakeWebPubSubClient();
  const client = createClient(fakeClient);
  await client.start();
  const updates: OnMessageUpdatedArgs[] = [];
  const messages: OnMessageArgs[] = [];
  client.on("message-updated", (event) => updates.push(event));
  client.on("message", (event) => messages.push(event));
  const conversation = { roomId: "room1", topicId: "topic2", conversationId: "c.room1.topic2" };
  const message = {
    messageId: "42", streamId: "stream1", etag: "v1",
    content: { items: [] }, metadata: { codecKind: "ag-ui-codec-v1" },
  };
  try {
    fakeClient.emitMessageUpdated(conversation, message);
    await fakeClient.emitGroupStream({
      groupName: "room1", streamId: "stream1", abortSignal: new AbortController().signal,
      async *[Symbol.asyncIterator](): AsyncGenerator<GroupStreamMessage> {
        yield {
          groupName: "room1", fromUserId: "agent", dataType: "json",
          stream: { streamId: "stream1", streamSequenceId: 1 },
          data: { operation: "MessageItem", body: {
            itemId: 0, data: "Hello",
            metadata: { "ag-ui.eventType": "text_message", "x-ms-agent-streaming-status": "completed" },
          } },
        };
      },
    });
    assert.deepEqual(updates, [{ roomId: "room1", conversation, message }]);
    assert.ok(messages.length > 0);
    assert.equal(messages.at(-1)?.message.content.items?.[0].content?.text, "Hello");
    assert.deepEqual(messages.at(-1)?.conversation, conversation);
  } finally {
    await client.stop();
  }
});

const sendCases: Array<{
  name: string;
  options?: SendToRoomOptions;
  properties: Pick<SendToRoomOptions, "mentions" | "replyTo">;
}> = [
  { name: "without options", properties: {} },
  { name: "with empty options", options: {}, properties: {} },
  {
    name: "with message properties and cancellation",
    options: {
      mentions: ["bob", "charlie"],
      replyTo: "previous-message-id",
      abortSignal: new AbortController().signal,
    },
    properties: {
      mentions: ["bob", "charlie"],
      replyTo: "previous-message-id",
    },
  },
  {
    name: "with null properties",
    options: { mentions: null, replyTo: null },
    properties: { mentions: null, replyTo: null },
  },
  {
    name: "with empty mentions",
    options: { mentions: [] },
    properties: { mentions: [] },
  },
  {
    name: "with unsupported metadata from an untyped caller",
    options: Object.assign({ mentions: ["bob"] }, { metadata: { category: "greeting" } }),
    properties: { mentions: ["bob"] },
  },
];

for (const { name, options, properties } of sendCases) {
  test(`sendToRoom sends and echoes message properties ${name}`, async () => {
    const fakeClient = new FakeWebPubSubClient();
    fakeClient.loginResponse = {
      userId: "alice",
      roomIds: ["room1"],
      conversationIds: ["conversation-room1"],
    };
    const client = createClient(fakeClient);
    await client.start();
    const events: OnMessageArgs[] = [];
    client.on("message", (event) => events.push(event));

    const result = await client.sendToRoom("room1", "Hello!", options);

    assert.deepEqual(result, { messageId: "sent-message-id" });
    assert.equal(fakeClient.sendCalls.length, 1);
    assert.deepEqual(fakeClient.sendCalls[0]?.payload, {
      conversation: { conversationId: "conversation-room1" },
      content: "Hello!",
      ...properties,
    });
    assert.equal(fakeClient.sendCalls[0]?.dataType, "json");
    assert.equal(fakeClient.sendCalls[0]?.options?.abortSignal, options?.abortSignal);
    assert.deepEqual(events, [{
      roomId: "room1",
      message: {
        messageId: "sent-message-id",
        createdBy: "alice",
        messageBodyType: "Inline",
        content: { text: "Hello!", binary: null },
        ...properties,
      },
    }]);
    await client.stop();
  });
}

test("stop before start is a no-op", async () => {
  const fakeClient = new FakeWebPubSubClient();
  const client = createClient(fakeClient);

  await client.stop();

  assert.equal(isStarted(client), false);
  assert.equal(fakeClient.stopCalls, 0);
});

test("concurrent start calls wait for room hydration", async () => {
  const fakeClient = new FakeWebPubSubClient();
  fakeClient.loginResponse = {
    userId: "alice",
    roomIds: ["room1"],
    conversationIds: ["conversation-room1"],
  };
  fakeClient.getRoomStarted = new Deferred<void>();
  fakeClient.getRoomDelay = new Deferred<void>();
  const client = createClient(fakeClient);

  const firstStart = client.start();
  await fakeClient.getRoomStarted.promise;

  let secondStartResolved = false;
  const secondStart = client.start().then(() => {
    secondStartResolved = true;
  });
  await Promise.resolve();

  assert.equal(isStarted(client), false, "client should not be marked started until room hydration completes");
  assert.equal(secondStartResolved, false, "second start should wait for the in-flight start promise");

  fakeClient.getRoomDelay.resolve();
  await Promise.all([firstStart, secondStart]);

  assert.equal(isStarted(client), true);
  assert.deepEqual(client.rooms.map((roomInfo) => roomInfo.roomId), ["room1"]);
  assert.equal(fakeClient.startCalls, 1);
});

test("failed start rolls back chat state and stops the connection", async () => {
  const fakeClient = new FakeWebPubSubClient();
  fakeClient.loginResponse = { userId: "alice", roomIds: ["room1"], conversationIds: [] };
  fakeClient.getRoomError = new Error("get room failed");
  const client = createClient(fakeClient);

  await assert.rejects(client.start(), /get room failed/);

  assert.equal(isStarted(client), false);
  assert.throws(() => client.userId, /start\(\)/);
  assert.deepEqual(client.rooms, []);
  assert.equal(fakeClient.stopCalls, 1);
});

test("stop waits for stopped event before allowing restart", async () => {
  const fakeClient = new FakeWebPubSubClient();
  fakeClient.stopDelay = new Deferred<void>();
  const client = createClient(fakeClient);
  await client.start();

  let stopResolved = false;
  const stopPromise = client.stop().then(() => {
    stopResolved = true;
  });
  const restartPromise = client.start();
  await Promise.resolve();

  fakeClient.emitRoomJoined("late-room");
  assert.equal(client.hasJoinedRoom("late-room"), false, "late notifications after stop starts should be ignored");
  assert.equal(stopResolved, false, "stop should not resolve before the underlying stopped event");
  assert.equal(fakeClient.startCalls, 1, "restart should wait for stop to finish");

  fakeClient.stopDelay.resolve();
  await Promise.all([stopPromise, restartPromise]);

  assert.equal(stopResolved, true);
  assert.equal(isStarted(client), true);
  assert.equal(fakeClient.startCalls, 2);
  assert.equal(fakeClient.stopCalls, 1);
});

test("concurrent stop calls wait for the same stopped event", async () => {
  const fakeClient = new FakeWebPubSubClient();
  fakeClient.stopDelay = new Deferred<void>();
  const client = createClient(fakeClient);
  await client.start();

  let firstStopResolved = false;
  let secondStopResolved = false;
  const firstStop = client.stop().then(() => {
    firstStopResolved = true;
  });
  const secondStop = client.stop().then(() => {
    secondStopResolved = true;
  });
  await Promise.resolve();

  assert.equal(fakeClient.stopCalls, 1);
  assert.equal(firstStopResolved, false);
  assert.equal(secondStopResolved, false);

  fakeClient.stopDelay.resolve();
  await Promise.all([firstStop, secondStop]);

  assert.equal(firstStopResolved, true);
  assert.equal(secondStopResolved, true);
  assert.equal(isStarted(client), false);
});

test("concurrent start calls during stop share a single restart", async () => {
  const fakeClient = new FakeWebPubSubClient();
  fakeClient.stopDelay = new Deferred<void>();
  const client = createClient(fakeClient);
  await client.start();
  assert.equal(fakeClient.startCalls, 1);

  const stopPromise = client.stop();
  // Both restart attempts should wait for the same stop and share one new start.
  const firstRestart = client.start();
  const secondRestart = client.start();
  await Promise.resolve();

  assert.equal(fakeClient.startCalls, 1, "no new connection start until stop completes");

  fakeClient.stopDelay.resolve();
  await Promise.all([stopPromise, firstRestart, secondRestart]);

  assert.equal(isStarted(client), true);
  assert.equal(fakeClient.startCalls, 2, "restart should call connection.start() exactly once");
  assert.equal(fakeClient.stopCalls, 1);
});

test("started event fires once after start() completes with userId payload", async () => {
  const fakeClient = new FakeWebPubSubClient();
  fakeClient.loginResponse = { userId: "alice", roomIds: [], conversationIds: [] };
  const client = createClient(fakeClient);

  const startedEvents: Array<{ userId: string }> = [];
  client.on("started", (e) => startedEvents.push(e));

  await client.start();
  assert.equal(startedEvents.length, 1, "started should fire exactly once on successful start");
  assert.deepEqual(startedEvents[0], { userId: "alice" }, "started payload should carry the chat-domain userId");
  assert.equal(client.userId, "alice", "userId getter should be live by the time started fires");

  // Re-starting an already-started client must not re-emit.
  await client.start();
  assert.equal(startedEvents.length, 1, "started should not fire when start() is a no-op on an already-started client");
});

test("stopped event fires on started→not-started transitions only", async () => {
  const fakeClient = new FakeWebPubSubClient();
  fakeClient.loginResponse = {
    userId: "alice",
    roomIds: ["room1"],
    conversationIds: ["conversation-room1"],
  };
  const roomInfo: RoomInfoWithMembers = {
    roomId: "room1",
    title: "Room 1",
    defaultConversationId: "conversation-room1",
    members: [],
  };
  fakeClient.roomResponses.set("room1", roomInfo);
  const client = createClient(fakeClient);

  const stoppedEvents: OnStoppedArgs[] = [];
  client.on("stopped", (e) => stoppedEvents.push(e));

  // stop() before start() must not emit (no transition).
  await client.stop();
  assert.equal(stoppedEvents.length, 0, "stopped should not fire when stop() runs on a never-started client");

  // start → stop fires exactly once.
  await client.start();
  await client.stop();
  assert.equal(stoppedEvents.length, 1, "stopped should fire exactly once per explicit stop()");
  assert.deepEqual(
    stoppedEvents[0],
    {
      previousState: {
        userId: "alice",
        rooms: [{ roomId: "room1", title: "Room 1", properties: undefined }],
      },
    },
    "stopped should carry a snapshot of the previous client state",
  );
  roomInfo.title = "Updated Room";
  assert.equal(stoppedEvents[0]?.previousState.rooms[0]?.title, "Room 1", "stopped room state should be copied");

  // Restart with another identity → network-driven stop also fires once with the new identity.
  fakeClient.loginResponse = { userId: "bob", roomIds: [], conversationIds: [] };
  await client.start();
  fakeClient.stop();
  // Allow the queued microtask that emits the underlying "stopped" to flush.
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(stoppedEvents.length, 2, "stopped should fire when the transport terminates after a successful start");
  assert.deepEqual(
    stoppedEvents[1],
    { previousState: { userId: "bob", rooms: [] } },
    "transport-driven stopped should carry the state from the current lifecycle",
  );
});