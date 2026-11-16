const INVOCATION_NAME = {
    LOGIN: "chat.login",
    GET_CURRENT_USER_PROPERTIES: "chat.getCurrentUserProperties",
    SET_CURRENT_USER_PROPERTIES: "chat.setCurrentUserProperties",
    GET_USER_PROPERTIES: "chat.getUserProperties",
    GET_CURRENT_USER_STATUS: "chat.getCurrentUserStatus",
    SET_CURRENT_USER_STATUS: "chat.setCurrentUserStatus",
    GET_USER_STATUS: "chat.getUserStatus",
    SUBSCRIBE_USER_STATUS: "chat.subscribeUserStatus",
    UNSUBSCRIBE_USER_STATUS: "chat.unsubscribeUserStatus",
    GET_ROOM: "chat.getRoom",
    GET_ROOM_MEMBERS: "chat.getRoomMembers",
    LEAVE_ROOM: "chat.leaveRoom",
    LIST_MESSAGES: "chat.queryMessageHistory",
    SEND_TEXT_MESSAGE: "chat.sendTextMessage",
    SEND_MESSAGE: "chat.sendMessage",
    DEREFERENCE: "chat.dereference",
    EDIT_MESSAGE: "chat.editMessage",
    CREATE_ROOM: "chat.createRoom",
    CREATE_CONVERSATION: "chat.createConversation",
    MANAGE_ROOM_MEMBER: "chat.manageRoomMember",
} as const;

const ERRORS = {
    RoomAlreadyExists: "RoomAlreadyExists",
    UserAlreadyInRoom: "UserAlreadyInRoom",
    NoPermissionInRoom: "NoPermissionInRoom",
    NotStarted: "NotStarted",
    UnknownRoom: "UnknownRoom",
    InvalidServerResponse: "InvalidServerResponse",
} as const;

export { INVOCATION_NAME, ERRORS };
