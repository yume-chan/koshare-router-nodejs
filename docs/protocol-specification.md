
# Protocol Specification

## Basic

Each packet is a stringified JSON object which must be no longer than 65000 characters. It must at least contains there two fields:

| field   | type     | description                                               |
| ------- | -------- | --------------------------------------------------------- |
| `type`  | `number` | Type of the packet, see below                             |
| `topic` | `string` | Topic of the packet, must be no longer than 30 characters |

Packet types:

``` ts
export enum PacketType {
    Error = 0,
    Echo = 1,
    Subscribe = 2,
    Unsubscribe = 3,
    Message = 4,
    Info = 5,
    Broadcast = 6,
    Hello = 7,
}
```

Any extra fields will be echoed or forwarded to other subscribed peers according to packet's `type`.

## Error handling

When an error has occurred, the server will echo the packet with an extra `error` field to indicate the error message.

| field   | type   | description                                  |
| ------- | ------ | -------------------------------------------- |
| `error` | string | the error message, may not be human-readable |

## Subscribe

You must first subscribe to a topic to receive broadcasts/messages for that topic.

**client -> server**
``` json
{ "type": 2, "topic": "the-topic" }
```

**server -> client**
``` json
{ "type": 2, "topic": "the-topic", "peers": [33, 66] }
```

| field   | type       | description                                                   |
| ------- | ---------- | ------------------------------------------------------------- |
| `peers` | `number[]` | IDs of other peers who have already subscribed to the `topic` |

Extra fields will be echoed.

**server -> other subscribed peers**
``` json
{ "type": 7, "topic": "the-topic", src: 42 }
```

| field | type   | description        |
| ----- | ------ | ------------------ |
| `src` | number | ID of the new peer |

Extra fields will **not** be forwarded.

## Broadcast

**client -> server**
``` json
{ "type": 6, "topic": "the-topic" }
```

**server -> other subscribed peers**
``` json
{ "type": 6, "topic": "the-topic", "src": 42 }
```

| field | type   | description           |
| ----- | ------ | --------------------- |
| `dst` | number | ID of the sender peer |

Extra fields will be forwarded.

## Direct Message

If you know other peer's ID and the peer have already subscribed to the topic, you can send a direct message to it.

**client -> server**
``` json
{ "type": 4, "topic": "the-topic", "dst": 33 }
```

| field | type   | description                |
| ----- | ------ | -------------------------- |
| `dst` | number | ID of the destination peer |

**server -> peer with id `dst`**
``` json
{ "type": 4, "topic": "the-topic", "dst": 33, "src": 42 }
```

| field | type   | description           |
| ----- | ------ | --------------------- |
| `dst` | number | ID of the sender peer |

Extra fields will be forwarded.
