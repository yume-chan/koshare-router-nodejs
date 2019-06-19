export enum PacketType {
    Error,

    Echo,

    Subscribe,

    Unsubscribe,

    Message,

    Info,

    Broadcast,

    Hello,
}

export interface ClientPacketBase {
    type: PacketType;

    topic: string;
}

export interface ClientCommonPacket extends ClientPacketBase {
    type: PacketType.Broadcast | PacketType.Echo | PacketType.Info | PacketType.Subscribe | PacketType.Unsubscribe;
}

export interface ClientMessagePacket extends ClientPacketBase {
    type: PacketType.Message;

    dst: number;
}

export interface ResponsePacketBase {
    error?: string;
}

export interface ResponseCommonPacket extends ClientPacketBase, ResponsePacketBase {
    type: PacketType.Broadcast | PacketType.Echo | PacketType.Info | PacketType.Unsubscribe;
}

export interface SubscribeErrorResponsePacket extends ClientPacketBase {
    type: PacketType.Subscribe;

    error: string;
}

export interface SubscribeSuccessResponsePacket extends ClientPacketBase {
    type: PacketType.Subscribe;

    peers: number[];
}

export type SubscribeResponsePacket<T> = T & (SubscribeErrorResponsePacket | SubscribeSuccessResponsePacket);

export interface ServerBroadcastPacket extends ClientPacketBase {
    type: PacketType.Broadcast;

    src: number;
}

export interface ServerMessagePacket extends ClientMessagePacket {
    src: number;
}

export type ClientPacket<T> = T & (ClientCommonPacket | ClientMessagePacket);

export type ResponsePacket<T> = T & (ResponseCommonPacket | SubscribeResponsePacket<T>);

export type ForwardPacket<T> = T & (ServerBroadcastPacket | ServerMessagePacket);

export type ServerPacket<T> = ResponsePacket<T> | ForwardPacket<T>;
